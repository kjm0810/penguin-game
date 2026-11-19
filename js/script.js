// 펭귄 빙판 레이스 — 펭귄들이 빙판 위에서 덥석 붙잡아 뒤로 당기고, 배로 슬라이딩하며 결승선까지 달린다.
// 게임 규칙·그림은 앱(apps/web)의 펭귄 빙판 레이스 엔진을 묶은 ./engine.js를 그대로 쓴다.
//
// 동기화(race-game과 같은 방식): 관리자 화면이 시작할 때 무작위 씨앗(seed)과 출발 시각(startAt)만 정해 저장한다.
// 관리자·OBS 화면은 같은 씨앗으로 같은 경주를 각자 계산한다. 경주는 1/60초 고정 간격으로만 진행하고,
// 막판 슬로우 모션도 같은 계산으로 실제 시간에 맞추므로 위치를 주고받지 않아도 두 화면이 똑같이 보인다.
import { ICE_DURATIONS, ICE_STAGE, PenguinIceRaceEngine, loadSprites, randomIceSeed, standings } from './engine.js';
import { connectRoom } from './sync.js';

const GAME_ID = 'penguin-race-game';
const STORAGE_KEY = 'penguin-race-game-settings';
const isObs = new URLSearchParams(location.search).get('obs') === '1';
const launcher = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '';
if (isObs) {
  document.body.classList.add('obs');
  document.documentElement.classList.add('obs');
}
let roomSync = null;
const now = () => Date.now() + (roomSync?.offset || 0);

const STEP = 1 / 60;
const COUNTDOWN_SEC = 3; // 엔진은 경주 시각 -3초부터 카운트다운을 그린다
const MIN_RACERS = 2;
const MAX_RACERS = 50;
const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let state = {
  names: Array.from({ length: 10 }, (_, i) => '펭귄' + (i + 1)),
  duration: 45,
  winnerText: '{이름} 우승!',
  soundEnabled: true,
  hidden: false,
  race: null, // { seed, startAt, names, duration, skipped }
  rev: 0,
};

// ---- 공통 레이아웃(런처의 /_game_core가 있으면 그것을, 없으면 자체 계산) -------------
let core = null;
try {
  if (launcher) core = await import('/_game_core/layout.js');
} catch {
  core = null;
}
function stageSize() {
  try {
    if (core?.stageSize) return core.stageSize('landscape');
  } catch {}
  return { width: 1920, height: 1080 };
}
function fitStage() {
  const preview = $('preview');
  const stage = $('stage');
  if (core?.fitStagePreview) {
    try {
      core.fitStagePreview(preview, stage, 'landscape');
      return;
    } catch {}
  }
  const { width, height } = stageSize();
  const scale = Math.min(preview.clientWidth / width, preview.clientHeight / height);
  stage.style.width = width + 'px';
  stage.style.height = height + 'px';
  stage.style.transform = `translate(${(preview.clientWidth - width * scale) / 2}px, ${(preview.clientHeight - height * scale) / 2}px) scale(${scale})`;
}

// ---- 설정 저장·동기화 ---------------------------------------------------------------
function parseNames(text) {
  return String(text)
    .split(/[\n,]/)
    .map((name) => name.trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, MAX_RACERS);
}

function sanitize(s) {
  s = s && typeof s === 'object' ? s : {};
  const durations = ICE_DURATIONS.map((option) => option.value);
  const r = s.race;
  return {
    names: Array.isArray(s.names) ? s.names.map(String).slice(0, MAX_RACERS) : state.names,
    duration: durations.includes(Number(s.duration)) ? Number(s.duration) : 45,
    winnerText: typeof s.winnerText === 'string' ? s.winnerText.slice(0, 60) : '{이름} 우승!',
    soundEnabled: s.soundEnabled !== false,
    hidden: s.hidden === true,
    race:
      r && Array.isArray(r.names) && r.names.length >= MIN_RACERS
        ? {
            seed: Number(r.seed) >>> 0,
            startAt: Number(r.startAt) || 0,
            names: r.names.map(String).slice(0, MAX_RACERS),
            duration: durations.includes(Number(r.duration)) ? Number(r.duration) : 45,
            skipped: r.skipped === true,
          }
        : null,
    rev: Number(s.rev) || 0,
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  roomSync?.publish(state);
  if (!launcher) return;
  fetch('/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'settings-change', game: GAME_ID, settings: state }),
  }).catch(() => {});
}

// 상태를 바꾸고 저장한다. OBS 화면은 저장하지 않는다(관리자 화면이 저장해 전파한다).
function commit() {
  if (isObs) return render();
  state.rev = Math.max(Date.now(), state.rev + 1);
  save();
  render();
}

function applyRemote(raw) {
  const next = sanitize(raw);
  // 늦게 도착한 옛 저장본(내가 보낸 것의 메아리 포함)이 새 내용을 덮지 않게 한다.
  if (next.rev && next.rev < state.rev) return;
  state = next;
  render();
}

async function loadLauncher() {
  try {
    const res = await fetch('/settings?game=' + GAME_ID, { cache: 'no-store' });
    const data = res.ok ? await res.json() : null;
    if (data && data.ok && data.settings) applyRemote(data.settings);
  } catch {}
}

function connectEvents() {
  const es = new EventSource('/events?game=' + GAME_ID);
  es.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.type === 'settings-change' && m.game === GAME_ID && m.settings) applyRemote(m.settings);
    } catch {}
  };
}

// ---- 효과음 (OBS 화면에서만 — 방송에 나가는 소리) --------------------------------
// 넣어 둔 효과음 파일 — 필요한 구간만 잘라 쓴다(from·dur 초, gain 크기, fade 끝 줄이는 길이)
const SND = {
  beep: { file: 'beep', from: 0.03, dur: 0.4, gain: 0.35 }, // 카운트다운 3·2·1
  pistol: { file: 'starting-pistol', from: 0.12, dur: 1.2, gain: 0.85 }, // 출발!
  slide: { file: 'slide', from: 0, dur: 1.6, gain: 0.5, fade: 0.4 }, // 배로 슬라이딩 — 쭈욱(소리가 끝나는 1.6초까지)
  fall: { file: 'cartoon-slip', from: 0.05, dur: 0.6, gain: 0.6 }, // 넘어짐
  grab: { file: 'cartoon-pop', from: 0.12, dur: 0.35, gain: 0.4 }, // 덥석 붙잡기
  fanfare: { file: 'fanfare', from: 0.05, dur: 1.5, gain: 1.4 }, // 1등 도착
  cheer: { file: 'crowd-cheer', from: 0, dur: 4.3, gain: 0.7 }, // 1등 도착 환호
};
// 배경음악 — 경주 중(chase) / 막판 슬로우 모션(suspense)
const BGM = { chase: { file: 'bgm-chase', gain: 0.22, loopEnd: 64.0 }, suspense: { file: 'bgm-suspense', gain: 0.28 } }; // loopEnd: 반복 지점(곡 끝 무음 잘라냄 — 곡을 바꾸면 다시 맞출 것)
// 같은 소리가 한꺼번에 겹치지 않게 최소 간격(초)
const SND_GAP = { grab: 0.6 }; // 슬라이딩·넘어짐은 간격 없이 한 번 한 번 다 낸다

let audioCtx = null;
const sndBuf = {};
const sndLast = {};
function audio() {
  if (!isObs || !state.soundEnabled) return null;
  try {
    audioCtx ??= new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}
async function loadSounds() {
  const a = audio();
  if (!a) return;
  const files = [...new Set([...Object.values(SND), ...Object.values(BGM)].map((x) => x.file))];
  for (const f of files) {
    if (sndBuf[f]) continue;
    sndBuf[f] = 'loading';
    try {
      sndBuf[f] = await a.decodeAudioData(await (await fetch('./assets/' + f + '.mp3')).arrayBuffer());
    } catch {
      delete sndBuf[f];
    }
  }
}
const bufReady = (f) => sndBuf[f] && sndBuf[f] !== 'loading';
function sfx(name) {
  const a = audio();
  const s = SND[name];
  if (!a || !s || !bufReady(s.file)) return;
  const gap = SND_GAP[name] || 0;
  if (gap && a.currentTime - (sndLast[name] ?? -9) < gap) return;
  sndLast[name] = a.currentTime;
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = sndBuf[s.file];
  const dur = Math.min(s.dur, src.buffer.duration - s.from);
  g.gain.setValueAtTime(s.gain, a.currentTime);
  g.gain.setValueAtTime(s.gain, a.currentTime + Math.max(0, dur - (s.fade || 0.08)));
  g.gain.linearRampToValueAtTime(0, a.currentTime + dur);
  src.connect(g).connect(a.destination);
  src.start(0, s.from, dur);
}
let bgmNow = { name: null, src: null, gain: null };
function stopBgm(fade = 0.6) {
  const a = audioCtx;
  const cur = bgmNow;
  bgmNow = { name: null, src: null, gain: null };
  if (!a || !cur.src) return;
  try {
    cur.gain.gain.cancelScheduledValues(a.currentTime);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, a.currentTime);
    cur.gain.gain.linearRampToValueAtTime(0, a.currentTime + fade);
    cur.src.stop(a.currentTime + fade + 0.05);
  } catch {}
}
function setBgm(name, offset = 0) {
  if (bgmNow.name === name) return;
  const a = audio();
  if (!name || !a) return stopBgm();
  const b = BGM[name];
  if (!bufReady(b.file)) return; // 아직 못 읽었으면 다음 프레임에 다시
  stopBgm(0.5);
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = sndBuf[b.file];
  src.loop = true;
  // 반복 지점이 곡 길이보다 길면(곡을 바꾼 경우) 곡 끝에서 반복한다
  const loopEnd = b.loopEnd && b.loopEnd < src.buffer.duration ? b.loopEnd : src.buffer.duration;
  src.loopStart = 0;
  src.loopEnd = loopEnd;
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(b.gain, a.currentTime + 0.4);
  src.connect(g).connect(a.destination);
  src.start(0, Math.max(0, offset) % loopEnd);
  bgmNow = { name, src, gain: g };
}
if (isObs) loadSounds();

// ---- 경주 계산 ------------------------------------------------------------------
// 지금 경주(씨앗·출발 시각)에 맞는 엔진. 실제로 흐른 시간(wall)만큼 1/60초씩 진행한다.
// 슬로우 모션 중에는 한 걸음이 실제 시간으로 더 길다(1/60 ÷ 배속).
let sim = null; // { key, engine, wall }
let preview = null; // { key, engine } 출발 전 줄 선 모습

function raceKey(race) {
  return `${race.seed}:${race.startAt}:${race.duration}:${race.names.join('\n')}`;
}

function currentSim() {
  const race = state.race;
  if (!race) {
    sim = null;
    return null;
  }
  const key = raceKey(race);
  if (!sim || sim.key !== key) sim = { key, engine: new PenguinIceRaceEngine(race.seed, race.names, race.duration), wall: 0 };
  const engine = sim.engine;
  if (race.skipped) {
    engine.advanceTo(1e9);
    return sim;
  }
  const elapsed = (now() - race.startAt) / 1000;
  let guard = 0;
  while (!engine.finished && guard++ < 200000) {
    const wallStep = STEP / engine.rate;
    if (sim.wall + wallStep > elapsed) break;
    sim.wall += wallStep;
    engine.advanceTo(engine.time + STEP);
  }
  return sim;
}

function previewEngine() {
  const key = state.names.join('\n');
  if (!preview || preview.key !== key) {
    const engine = new PenguinIceRaceEngine(1, state.names.length ? state.names : ['펭귄'], 45);
    engine.showCountdown = false;
    preview = { key, engine };
  }
  return preview.engine;
}

// ---- 그리기 -------------------------------------------------------------------
const canvas = $('scene');
const ctx = canvas.getContext('2d');
let sprites = null;
loadSprites('./assets/')
  .then((loaded) => {
    sprites = loaded;
  })
  .catch(() => {
    // 그림을 못 읽으면 엔진이 코드로 그린 펭귄·배경을 쓴다.
  });

function drawScene(engine) {
  const { width, height } = stageSize();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(width / ICE_STAGE.width, 0, 0, height / ICE_STAGE.height, 0, 0);
  ctx.clearRect(0, 0, ICE_STAGE.width, ICE_STAGE.height);
  engine.draw(ctx, FONT, sprites, isObs);
}

// ---- 화면 갱신 -------------------------------------------------------------------
let lastPhase = '';
let lastCount = null;
let lastResultsKey = '';
let lastPodiumKey = '';

function phaseOf(current) {
  if (!state.race || !current) return 'idle';
  if (current.engine.finished) return 'done';
  return current.engine.time < 0 ? 'countdown' : 'running';
}

function renderStatus(phase, current) {
  const el = $('raceStatus');
  if (phase === 'idle') el.textContent = `대기 중 · ${state.names.length}명 준비`;
  else if (phase === 'countdown') el.textContent = '출발 준비!';
  else if (phase === 'running')
    el.textContent = `경주 중 · ${Math.floor(current.engine.time)}초 · 남은 펭귄 ${current.engine.remaining}명`;
  else el.textContent = '경주 끝';
}

function renderResults(phase, current) {
  const el = $('results');
  if (phase !== 'done') {
    if (lastResultsKey !== 'empty') {
      el.innerHTML = '<li class="empty">경주가 끝나면 순위가 나옵니다.</li>';
      lastResultsKey = 'empty';
    }
    return;
  }
  const key = current.key;
  if (lastResultsKey === key) return;
  lastResultsKey = key;
  el.innerHTML = standings(current.engine)
    .map(
      (p, index) =>
        `<li><b>${index + 1}</b><span><i style="background:${p.color}"></i>${esc(p.name)}</span><em>${
          p.place && !state.race.skipped ? p.finishTime.toFixed(2) + '초' : ''
        }</em></li>`
    )
    .join('');
}

function renderPodium(phase, current) {
  const el = $('podium');
  if (phase !== 'done') {
    el.hidden = true;
    lastPodiumKey = '';
    return;
  }
  if (lastPodiumKey === current.key) return;
  lastPodiumKey = current.key;
  const order = standings(current.engine);
  const [a, b, c] = order;
  const place = (p, cls, label) =>
    p
      ? `<div class="place ${cls}"><span class="place-dot" style="background:${p.color}"></span><div class="place-name">${esc(
          p.name
        )}</div><div class="place-block">${label}</div></div>`
      : '';
  const last = order.length > 3 ? order[order.length - 1] : null;
  el.innerHTML =
    `<div class="podium-title">${esc(state.winnerText.split('{이름}').join(a ? a.name : ''))}</div>` +
    `<div class="places">${place(b, 'p2', '2')}${place(a, 'p1', '1')}${place(c, 'p3', '3')}</div>` +
    (last ? `<div class="podium-last">꼴찌 ${esc(last.name)}</div>` : '');
  el.hidden = false;
}

// 펭귄 동작이 바뀌는 순간(슬라이딩 시작·넘어짐·붙잡기)을 찾아 소리를 낸다.
// 화면을 늦게 열어 한꺼번에 따라잡은 프레임에서는 소리를 내지 않는다.
let soundSim = null; // { key, states, wall, firstPlaced }
function renderSounds(phase, current) {
  if (!isObs) return;
  // 배경음악
  if (phase === 'running' && state.soundEnabled) setBgm(current.engine.rate < 1 ? 'suspense' : 'chase', current.engine.rate < 1 ? 0 : current.engine.time);
  else if (bgmNow.name) stopBgm(phase === 'done' ? 1.5 : 0.4);

  if (phase === 'countdown') {
    const count = Math.ceil(-current.engine.time);
    if (count !== lastCount && count >= 1 && count <= COUNTDOWN_SEC) sfx('beep');
    lastCount = count;
  } else if (phase !== 'running') lastCount = null;
  if (phase === 'running' && lastPhase === 'countdown') sfx('pistol');

  if (!current || phase === 'idle') {
    soundSim = null;
    return;
  }
  const engine = current.engine;
  const fresh = !soundSim || soundSim.key !== current.key;
  // 지난 프레임보다 한참(0.5초 넘게) 건너뛰었으면 따라잡기 중 — 상태만 기록한다
  const jumped = !fresh && current.wall - soundSim.wall > 0.5;
  const quiet = fresh || jumped || state.race.skipped;
  if (fresh) soundSim = { key: current.key, states: new Map(), wall: current.wall, firstPlaced: false };
  for (const p of engine.penguins) {
    const before = soundSim.states.get(p.id);
    // 화면에 보이는 펭귄만(화면 밖에서 넘어지는 소리까지 내면 너무 시끄럽다)
    const onScreen = Math.abs(p.x - engine.cam) < 760;
    if (!quiet && onScreen && before !== undefined && before !== p.state) {
      if (p.state === 'slide') sfx('slide');
      else if (p.state === 'fallen') sfx('fall');
      else if (p.state === 'grab') sfx('grab');
    }
    soundSim.states.set(p.id, p.state);
  }
  const placed = engine.penguins.some((p) => p.place === 1);
  if (placed && !soundSim.firstPlaced) {
    soundSim.firstPlaced = true;
    if (!quiet) {
      sfx('fanfare');
      sfx('cheer');
    }
  }
  soundSim.wall = current.wall;
}

function render() {
  const current = currentSim();
  const phase = phaseOf(current);
  if (current) drawScene(current.engine);
  else {
    const idle = previewEngine();
    idle.idleClock = performance.now() / 1000; // 출발 전 대기 모션
    drawScene(idle);
  }
  $('stage').classList.toggle('hidden', isObs && state.hidden);
  renderPodium(phase, current);
  renderSounds(phase, current);
  if (!isObs) {
    if (document.activeElement !== $('names')) $('names').value = state.names.join('\n');
    $('racerCount').textContent = `(${state.names.length}명)`;
    if (document.activeElement !== $('winnerText')) $('winnerText').value = state.winnerText;
    $('duration').value = String(state.duration);
    $('soundEnabled').checked = state.soundEnabled;
    $('visibility').textContent = state.hidden ? 'OBS 화면 보이기' : 'OBS 화면 숨기기';
    const racing = phase === 'countdown' || phase === 'running';
    $('btnStart').disabled = racing || state.names.length < MIN_RACERS;
    $('btnSkip').disabled = !racing;
    $('btnReset').disabled = phase === 'idle';
    $('btnDropWinner').disabled = phase !== 'done' || state.race.names.length <= MIN_RACERS;
    $('names').disabled = racing;
    renderStatus(phase, current);
    renderResults(phase, current);
  }
  lastPhase = phase;
}

function loop() {
  render();
  requestAnimationFrame(loop);
}

// ---- 조작판 ---------------------------------------------------------------------
if (!isObs) {
  $('duration').innerHTML = ICE_DURATIONS.map(
    (option) => `<option value="${option.value}">${option.label} (약 ${option.value}초)</option>`
  ).join('');

  $('btnStart').addEventListener('click', () => {
    if (state.names.length < MIN_RACERS) return;
    state.race = {
      seed: randomIceSeed(),
      startAt: now() + 2000,
      names: [...state.names],
      duration: state.duration,
      skipped: false,
    };
    commit();
  });
  $('btnSkip').addEventListener('click', () => {
    if (!state.race) return;
    state.race = { ...state.race, skipped: true };
    commit();
  });
  $('btnReset').addEventListener('click', () => {
    state.race = null;
    commit();
  });
  $('btnDropWinner').addEventListener('click', () => {
    if (!sim || !sim.engine.finished) return;
    const winner = standings(sim.engine)[0];
    if (!winner) return;
    // 같은 이름이 여럿이어도 우승한 한 명만 뺀다(참가 순서 = 엔진 id).
    state.names = state.race.names.filter((_, index) => index !== winner.id);
    state.race = null;
    commit();
  });

  let namesTimer = null;
  $('names').addEventListener('input', (e) => {
    state.names = parseNames(e.target.value);
    $('racerCount').textContent = `(${state.names.length}명)`;
    clearTimeout(namesTimer);
    namesTimer = setTimeout(commit, 300);
  });
  $('names').addEventListener('blur', () => commit());
  $('btnFill').addEventListener('click', () => {
    const prefix = $('fillPrefix').value.trim() || '펭귄';
    const count = Number($('fillCount').value) || 10;
    state.names = Array.from({ length: count }, (_, i) => prefix + (i + 1));
    commit();
  });
  $('duration').addEventListener('change', (e) => {
    state.duration = Number(e.target.value);
    commit();
  });
  $('winnerText').addEventListener('input', (e) => {
    state.winnerText = e.target.value.slice(0, 60);
    commit();
  });
  $('soundEnabled').addEventListener('change', (e) => {
    state.soundEnabled = e.target.checked;
    commit();
  });
  $('visibility').addEventListener('click', () => {
    state.hidden = !state.hidden;
    commit();
  });
}

// ---- 시작 ---------------------------------------------------------------------
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && (!isObs || launcher)) state = sanitize(saved);
} catch {}

if (launcher) {
  await loadLauncher();
  connectEvents();
} else {
  roomSync = await connectRoom({ isObs, applyRemote });
  if (!isObs) roomSync.publish(state);
}
// 같은 브라우저의 다른 탭(OBS 미리보기 등)과는 localStorage로도 맞춘다(런처 없이 열었을 때 대비).
window.addEventListener('storage', (e) => {
  if (isObs && !launcher) return;
  if (e.key !== STORAGE_KEY || !e.newValue) return;
  try {
    applyRemote(JSON.parse(e.newValue));
  } catch {}
});

new ResizeObserver(fitStage).observe($('preview'));
fitStage();
loop();
