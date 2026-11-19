// 자동 생성 파일 — apps/web/src/widgets/penguin-ice-race 엔진을 묶은 것. 직접 고치지 말고 엔진을 고친 뒤 다시 묶는다.

// apps/web/src/widgets/penguin-ice-race/penguin-ice-race-sprites.ts
var ICE_SPRITE_URLS = {
  sheet: "/games/penguin-ice-race/penguin.webp",
  scarf: "/games/penguin-ice-race/penguin-scarf.webp",
  sky: "/games/penguin-ice-race/bg-sky.webp",
  sea: "/games/penguin-ice-race/bg-sea.webp",
  ice: "/games/penguin-ice-race/bg-ice.webp",
  props: "/games/penguin-ice-race/props.webp",
  gates: "/games/penguin-ice-race/gates.webp"
};
var ICE_SPRITE = { cellW: 202, cellH: 217, anchorX: 101, anchorY: 172, bodyHeight: 150 };
var ICE_EVENT_SPRITE = {
  // 배경 소품 5×2: 눈더미, 삽 꽂힌 눈더미, 이글루, 얼음 블록, 나무 표지판 / 체크 깃발, 삼각 깃발 줄, 생선 상자, 눈사람, 얼음 바위
  props: { cellW: 259, cellH: 174, anchorX: 129, anchorY: 171 },
  // 출발(빨간 리본) · 결승(체크무늬) 얼음 문
  gates: { cellW: 438, cellH: 329, anchorX: 219, anchorY: 327 }
};
var SCARF_LEVEL = 238;
function createIceSprites(images) {
  const sheet = tinter(images.sheet, images.scarf);
  const { sky, sea, ice, props, gates } = images;
  return { sheet, scene: { sky, sea, ice, props, gates } };
}
function tinter(sheet, scarf) {
  const width = sheet.naturalWidth;
  const height = sheet.naturalHeight;
  const read = (image) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return { canvas, data: ctx.getImageData(0, 0, width, height) };
  };
  const base = read(sheet);
  const mask = read(scarf).data.data;
  const cache = /* @__PURE__ */ new Map();
  return (color) => {
    const found = cache.get(color);
    if (found) return found;
    const [r, g, b] = parseHex(color);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image = new ImageData(new Uint8ClampedArray(base.data.data), width, height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const m = mask[i] / 255;
      if (m < 0.02) continue;
      const level = Math.min(1.15, Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) / SCARF_LEVEL);
      pixels[i] = pixels[i] * (1 - m) + r * level * m;
      pixels[i + 1] = pixels[i + 1] * (1 - m) + g * level * m;
      pixels[i + 2] = pixels[i + 2] * (1 - m) + b * level * m;
    }
    ctx.putImageData(image, 0, 0);
    cache.set(color, canvas);
    return canvas;
  };
}
function parseHex(color) {
  const value = Number.parseInt(color.replace("#", ""), 16);
  return [value >> 16 & 255, value >> 8 & 255, value & 255];
}

// apps/web/src/widgets/penguin-ice-race/penguin-ice-race-engine.ts
var ICE_STAGE = { width: 1600, height: 900 };
var ICE_DURATIONS = [
  // 2026-11-13 사용자 요청: 거리 3배·속도 2배 → 경주 시간이 1.5배(20/30/45초 → 30/45/68초).
  { value: 30, label: "\uC9E7\uAC8C" },
  { value: 45, label: "\uBCF4\uD1B5" },
  { value: 68, label: "\uAE38\uAC8C" }
];
var STEP = 1 / 60;
var COUNTDOWN = 3;
var LENGTH = 18e3;
var LANE_SPAN = 260;
var SEGMENTS = 30;
var SLOW_FROM = 0.94;
var SLOW_RATE = 0.35;
var SLIDE_TIME = 2.2;
var FINAL_STRETCH = 0.85;
var ZC = 400;
var Z_MIN = 35;
var Z_MAX = LANE_SPAN - 35;
var NEAR = 1;
var START_X = -78; // 출발선(x=-14) 뒤에서 출발 — 몸 앞쪽이 선에 닿지 않게
var COLORS = [
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#84cc16",
  "#f43f5e",
  "#06b6d4"
];
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var hash = (a, b) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function randomIceSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
var PenguinIceRaceEngine = class {
  constructor(seed, names, duration) {
    this.simTime = -COUNTDOWN;
    this.cam = 0;
    this.firstFinish = Infinity;
    this.finishedCount = 0;
    this.endAt = Infinity;
    // 시작 전 미리보기에서는 카운트다운을 띄우지 않는다.
    this.showCountdown = true;
    // 출발 전 미리보기(경주 시각이 멈춰 있음)에서 대기 모션에 쓸 시계. 비어 있으면 경주 시각을 쓴다.
    this.idleClock = null;
    this.result = null;
    this.seed = seed >>> 0;
    this.names = names;
    this.duration = duration;
    this.rng = mulberry(this.seed);
    const base = LENGTH / (duration * 0.82);
    this.penguins = names.map((name, index) => {
      const z = names.length > 1 ? Z_MIN + index / (names.length - 1) * (Z_MAX - Z_MIN) : LANE_SPAN / 2;
      return {
        id: index,
        name,
        color: COLORS[index % COLORS.length],
        x: START_X,
        z,
        tz: z,
        v: 0,
        base: base * (0.97 + this.rng() * 0.06),
        pace: Array.from({ length: SEGMENTS }, () => 0.86 + this.rng() * 0.28),
        state: "run",
        timer: 0,
        target: null,
        aimVz: null,
        cooldown: 3.5 + this.rng() * 3.5,
        think: this.rng() * 0.3,
        boost: 0,
        spin: 0,
        phase: this.rng() * 10,
        place: 0,
        finishTime: 0
      };
    });
    this.cam = this.cameraGoal();
  }
  get time() {
    return this.simTime;
  }
  get finished() {
    return this.result !== null;
  }
  get remaining() {
    return this.penguins.length - this.finishedCount;
  }
  // 막판(누군가 94% 지점을 지난 뒤 첫 도착 0.6초 뒤까지)은 느리게 보여 준다.
  get rate() {
    if (this.simTime > this.firstFinish + 0.6) return 1;
    const lead = Math.max(...this.penguins.map((penguin) => penguin.x));
    return lead > LENGTH * SLOW_FROM && this.simTime < this.firstFinish + 0.6 ? SLOW_RATE : 1;
  }
  frame() {
    return {
      seed: this.seed,
      names: this.names,
      duration: this.duration,
      time: Math.round(this.simTime * 1e3) / 1e3,
      rate: this.rate
    };
  }
  static fromFrame(data) {
    const { seed, names, duration, time, rate } = data;
    if (typeof seed !== "number" || !Array.isArray(names) || !names.every((name) => typeof name === "string") || typeof duration !== "number" || typeof time !== "number" || typeof rate !== "number")
      return null;
    return { frame: { seed, names, duration, time, rate } };
  }
  // 경주 시각을 target까지 고정 간격으로 진행한다(되감기는 없다. 되돌아가야 하면 새 엔진을 만든다).
  advanceTo(target) {
    let guard = 0;
    while (this.simTime + STEP <= target && !this.result && guard++ < 2e4) this.step();
  }
  step() {
    const dt = STEP;
    this.simTime += dt;
    const t = this.simTime;
    for (const penguin of this.penguins) penguin.phase += dt * (penguin.state === "run" ? 2 + penguin.v / 40 : 4);
    if (t < 0) return;
    const ranked = this.ranking();
    const rankOf = new Map(ranked.map((penguin, index) => [penguin.id, index]));
    const lead = ranked.find((penguin) => !penguin.place)?.x ?? LENGTH;
    for (const penguin of this.penguins) this.think(penguin, rankOf.get(penguin.id) ?? 0, dt);
    for (const penguin of this.penguins) this.move(penguin, lead, dt);
    this.collide();
    this.cam += (this.cameraGoal() - this.cam) * Math.min(1, dt * 4);
    if (this.endAt === Infinity && (this.finishedCount === this.penguins.length || t > this.firstFinish + 6))
      this.endAt = t + 1.2;
    if (t >= this.endAt) {
      const order = this.ranking();
      this.result = {
        podium: order.slice(0, 3).map((penguin) => penguin.name),
        last: order.length > 3 ? order[order.length - 1].name : null
      };
    }
  }
  ranking() {
    return [...this.penguins].sort((a, b) => {
      if (a.place && b.place) return a.place - b.place;
      if (a.place) return -1;
      if (b.place) return 1;
      return b.x - a.x || a.id - b.id;
    });
  }
  setState(penguin, state, timer) {
    penguin.state = state;
    penguin.timer = timer;
    if (state !== "grab") penguin.target = null;
    if (state !== "slide") penguin.aimVz = null;
  }
  // 넘어지면 이 펭귄을 붙잡고 있던 펭귄은 놓친다.
  knockDown(penguin, timer, v) {
    this.setState(penguin, "fallen", timer);
    penguin.v = v;
    penguin.spin = this.rng() < 0.5 ? -1 : 1;
    for (const other of this.penguins)
      if (other.state === "grab" && other.target === penguin.id) this.setState(other, "run", 0);
  }
  // 다른 펭귄이 잡거나 부딪힐 수 있는 상태인지(결승한 펭귄은 빠진다)
  onIce(penguin) {
    return penguin.state !== "finished";
  }
  think(penguin, rank, dt) {
    penguin.timer -= dt;
    penguin.cooldown -= dt;
    penguin.boost = Math.max(0, penguin.boost - dt);
    const byId = (id) => id === null ? void 0 : this.penguins[id];
    switch (penguin.state) {
      case "finished":
        return;
      case "fallen":
        if (penguin.timer <= 0) this.setState(penguin, "getup", 0.5);
        return;
      case "getup":
        if (penguin.timer <= 0) this.setState(penguin, "run", 0);
        return;
      case "slide":
        if (penguin.timer <= 0) this.setState(penguin, "getup", 0.55);
        return;
      case "grab": {
        const front = byId(penguin.target);
        if (!front || front.state === "fallen" || !this.onIce(front)) {
          this.setState(penguin, "run", 0);
          return;
        }
        if (penguin.timer > 0) return;
        this.knockDown(front, 1.2 + this.rng() * 0.5, -front.base * 0.8);
        this.setState(penguin, "run", 0);
        penguin.v = penguin.base * 2;
        penguin.boost = 0.9;
        penguin.cooldown = 1.5 + this.rng() * 1.5;
        return;
      }
    }
    const backRatio = rank / Math.max(1, this.penguins.length - 1);
    if (this.rng() < dt * (rank === 0 ? 1.35 : 0.63 - backRatio * 0.54)) {
      this.knockDown(penguin, 0.9, penguin.v * 0.3);
      return;
    }
    penguin.think -= dt;
    if (penguin.think > 0) return;
    penguin.think = 0.2 + this.rng() * 0.2;
    const count = this.penguins.length;
    const ahead = this.penguins.filter(
      (other) => other !== penguin && this.onIce(other) && other.state !== "fallen" && other.x > penguin.x && Math.abs(other.z - penguin.z) < 30
    ).sort((a, b) => a.x - b.x);
    const close = ahead.find((other) => other.x - penguin.x < 50);
    const inRange = ahead.filter((other) => other.x - penguin.x > 40 && other.x - penguin.x < 480);
    const roll = this.rng();
    if (penguin.cooldown <= 0 && close) {
      this.setState(penguin, "grab", 0.45);
      penguin.target = close.id;
      return;
    }
    const behindRatio = rank / Math.max(1, count - 1);
    const slideChance = (inRange.length > 1 ? 0.5 : inRange.length ? 0.25 : behindRatio >= 0.5 ? 0.08 : 0) * (0.25 + behindRatio * 1.75) * // 2026-11-13 사용자 요청: 결승 직전(마지막 15%)에서는 4배.
    (penguin.x > LENGTH * FINAL_STRETCH ? 4 : 1);
    if (penguin.cooldown <= 0 && roll < slideChance) {
      this.setState(penguin, "slide", SLIDE_TIME);
      penguin.v = penguin.base * 3.4;
      penguin.cooldown = (2 + this.rng() * 1.5) * (1.3 - behindRatio * 0.7);
      if (behindRatio >= 0.5) {
        const leader = this.ranking().find((other) => !other.place);
        if (leader && leader !== penguin) {
          const reach = Math.max(0.25, Math.max(60, leader.x - penguin.x) / (penguin.base * 2.6));
          const aimZ = clamp(leader.z, LANE_SPAN * 0.25, LANE_SPAN * 0.75);
          penguin.aimVz = clamp((aimZ - penguin.z) / reach, -260, 260);
        }
      }
      return;
    }
    const edge = penguin.z < LANE_SPAN * 0.25 || penguin.z > LANE_SPAN * 0.75;
    if (close) penguin.tz = clamp(penguin.z + (this.rng() < 0.5 ? -40 : 40), Z_MIN, Z_MAX);
    else if (edge && this.rng() < 0.6)
      penguin.tz = clamp(penguin.z + Math.sign(LANE_SPAN / 2 - penguin.z) * (40 + this.rng() * 50), Z_MIN, Z_MAX);
    else if (this.rng() < 0.15) {
      const other = this.penguins[Math.floor(this.rng() * count)];
      if (other.x > penguin.x) penguin.tz = clamp(other.z, LANE_SPAN * 0.25, LANE_SPAN * 0.75);
    } else if (this.rng() < 0.35)
      penguin.tz = clamp(
        penguin.z + (this.rng() < 0.5 + (LANE_SPAN / 2 - penguin.z) / LANE_SPAN ? 1 : -1) * (30 + this.rng() * 70),
        Z_MIN,
        Z_MAX
      );
  }
  move(penguin, lead, dt) {
    let target = 0;
    let accel = 3;
    switch (penguin.state) {
      case "run": {
        const segment = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(penguin.x / LENGTH * SEGMENTS)));
        const rubber = 1 + clamp((lead - penguin.x) / 2400, 0, 1) * 0.15;
        const grabbed = this.penguins.some((other) => other.state === "grab" && other.target === penguin.id);
        target = penguin.base * penguin.pace[segment] * rubber * (penguin.boost > 0 ? 1.5 : 1) * (grabbed ? 0.4 : 1);
        break;
      }
      case "grab": {
        const front = penguin.target === null ? void 0 : this.penguins[penguin.target];
        if (front) {
          penguin.x += (front.x - 44 - penguin.x) * Math.min(1, dt * 10);
          penguin.v = front.v;
          penguin.tz = front.z;
        }
        break;
      }
      case "slide": {
        target = penguin.base * 0.9;
        accel = 0.9;
        break;
      }
      case "getup":
        target = penguin.base * 0.2;
        break;
      case "fallen":
        target = 0;
        accel = 2.2;
        break;
      case "finished":
        target = penguin.x > LENGTH + 140 ? 0 : penguin.base * 0.4;
        break;
    }
    if (penguin.state !== "grab") {
      penguin.v += (target - penguin.v) * Math.min(1, accel * dt);
      penguin.x = Math.max(START_X, penguin.x + penguin.v * dt);
    }
    if (penguin.aimVz !== null) {
      penguin.z += penguin.aimVz * dt;
      penguin.tz = clamp(penguin.z, Z_MIN, Z_MAX);
    } else penguin.z += clamp(penguin.tz - penguin.z, -120 * dt, 120 * dt);
    penguin.z = clamp(penguin.z, Z_MIN, Z_MAX);
    if (!penguin.place && penguin.x >= LENGTH) {
      this.finishedCount += 1;
      penguin.place = this.finishedCount;
      penguin.finishTime = this.simTime;
      if (penguin.place === 1) this.firstFinish = this.simTime;
      for (const other of this.penguins)
        if (other.state === "grab" && other.target === penguin.id) this.setState(other, "run", 0);
      this.setState(penguin, "finished", 0);
    }
  }
  // 슬라이딩 중인 펭귄 앞에 있는 펭귄은 볼링 핀처럼 넘어진다. 나머지는 겹치지 않게 옆으로 비킨다.
  // 앞에서 슬라이딩 중이던 펭귄도 뒤에서 슬라이딩해 온 펭귄에게 부딪히면 넘어진다(뒤에서 온 쪽이 이김, 2026-11-13 사용자 요청).
  collide() {
    for (const slider of this.penguins) {
      if (slider.state !== "slide") continue;
      for (const other of this.penguins) {
        if (other === slider || other.state === "fallen" || !this.onIce(other)) continue;
        const dx = other.x - slider.x;
        if (dx < 0 || dx > 60 || Math.abs(other.z - slider.z) > 26) continue;
        this.knockDown(other, 1.1 + this.rng() * 0.5, slider.v * 0.35);
        other.tz = clamp(other.z + (other.z >= slider.z ? 18 : -18), Z_MIN, Z_MAX);
      }
    }
    for (let i = 0; i < this.penguins.length; i++)
      for (let j = i + 1; j < this.penguins.length; j++) {
        const a = this.penguins[i];
        const b = this.penguins[j];
        if (a.target === b.id || b.target === a.id) continue;
        const dx = Math.abs(a.x - b.x);
        const dz = b.z - a.z;
        if (dx > 22 || Math.abs(dz) > 14) continue;
        const push = (14 - Math.abs(dz)) * 0.5 * (dz >= 0 ? 1 : -1);
        a.z = clamp(a.z - push * 0.5, Z_MIN, Z_MAX);
        b.z = clamp(b.z + push * 0.5, Z_MIN, Z_MAX);
      }
  }
  // 선두를 따라가되 뒤처진 펭귄이 있으면 선두를 오른쪽으로 밀어 최대한 함께 보이게 한다(race-game 방식).
  cameraGoal() {
    const { width } = ICE_STAGE;
    const winner = this.penguins.find((penguin) => penguin.place === 1);
    if (winner) return winner.x;
    const xs = this.penguins.filter((penguin) => !penguin.place).map((penguin) => penguin.x);
    const lead = xs.length ? Math.max(...xs) : LENGTH;
    const last = xs.length ? Math.min(...xs) : LENGTH;
    const leadPos = clamp(0.08 + (lead - last) * NEAR / width, 0.62, 0.82);
    const cam = lead - (leadPos - 0.5) * width / NEAR;
    return clamp(cam, 0.3 * width / NEAR, LENGTH + 260 - 0.2 * width / NEAR);
  }
  // --- 그리기 (ICE_STAGE 크기 기준) ---
  // sprites가 없으면(이미지를 아직 못 읽음) 코드로 그린 펭귄을 쓴다.
  draw(ctx, font, sprites = null) {
    const { width: W, height: H } = ICE_STAGE;
    const F = NEAR * ZC;
    const sFar = F / (LANE_SPAN + ZC);
    const Hc = 0.69 * H / (NEAR - sFar);
    const horizon = 1.04 * H - Hc * NEAR;
    const cam = this.cam;
    const scaleAt = (z) => F / (z + ZC);
    const project = (x, z) => {
      const s = scaleAt(z);
      return { x: W / 2 + (x - cam) * s, y: horizon + Hc * s, s };
    };
    const time = this.simTime;
    if (sprites) this.drawSceneryImages(ctx, project, W, H, { F, Hc, horizon }, sprites.scene);
    else this.drawScenery(ctx, project, scaleAt, W, H);
    const order = [...this.penguins].sort((a, b) => b.z - a.z || a.id - b.id);
    for (const penguin of order) {
      const p = project(penguin.x, penguin.z);
      if (p.x < -200 || p.x > W + 200) continue;
      const h = 130 * p.s;
      const paint = (y, frame, shadow = true) => {
        if (sprites) drawSprite(ctx, sprites, penguin, p.x, y, h, time, frame, shadow);
        else drawPenguin(ctx, penguin, p.x, y, h, time);
      };
      if (time < 0 && penguin.state === "run" && sprites) {
        // 출발 전 대기 — 펭귄마다 박자를 다르게
        const c = (this.idleClock ?? time) + hash(penguin.id, 7) * 10;
        const u = (c * 0.55 % 3.2 + 3.2) % 3.2;
        const hopping = u < 0.42;
        const lift = hopping ? Math.sin(u / 0.42 * Math.PI) * h * 0.16 : 0;
        const breathe = hopping ? 1 : 1 + Math.sin(c * 3.2) * 0.035;
        const sway = Math.sin(c * 1.4) * 2.5 * p.s;
        ctx.fillStyle = "rgba(30, 64, 175, 0.16)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, h * 0.42 * (1 - lift / h), h * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(p.x + sway, p.y);
        ctx.scale(1 / Math.sqrt(breathe), breathe);
        ctx.translate(-(p.x + sway), -p.y);
        drawSprite(ctx, sprites, penguin, p.x + sway, p.y - lift, h, time, hopping ? [4, 1] : [4, 0], false);
        ctx.restore();
        continue;
      }
      paint(p.y);
    }
    for (const penguin of order) {
      const p = project(penguin.x, penguin.z);
      if (p.x < -200 || p.x > W + 200) continue;
      const low = penguin.state === "fallen" || penguin.state === "slide";
      drawLabel(ctx, penguin, p.x, p.y - (low ? 92 : 162) * p.s, p.s, font);
    }
    this.drawBoard(ctx, font, W);
    this.drawMinimap(ctx, W, H, cam, scaleAt);
    if (this.showCountdown && time < 0.8) {
      const text = time < 0 ? String(Math.ceil(-time)) : "\uCD9C\uBC1C!";
      ctx.save();
      ctx.font = `900 ${Math.round(H * 0.2)}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 14;
      ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
      ctx.strokeText(text, W / 2, H * 0.45);
      ctx.fillStyle = time < 0 ? "#ffffff" : "#fde047";
      ctx.fillText(text, W / 2, H * 0.45);
      ctx.restore();
    }
  }
  drawScenery(ctx, project, scaleAt, W, H) {
    const cam = this.cam;
    const shoreY = project(0, LANE_SPAN + 120).y;
    const sky = ctx.createLinearGradient(0, 0, 0, shoreY);
    sky.addColorStop(0, "#93c5fd");
    sky.addColorStop(1, "#e0f2fe");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, shoreY);
    for (const [depth, color] of [
      [0.12, "#dbeafe"],
      [0.25, "#eff6ff"]
    ]) {
      ctx.fillStyle = color;
      ctx.strokeStyle = "#bfdbfe";
      ctx.lineWidth = 2;
      const offset = cam * depth;
      for (let cell = Math.floor(offset / 260) - 1; cell < (offset + W) / 260 + 1; cell++) {
        const x = cell * 260 - offset;
        const peak = shoreY - 70 - hash(cell, depth * 10) * 120 - (depth > 0.2 ? 0 : 60);
        ctx.beginPath();
        ctx.moveTo(x - 60, shoreY);
        ctx.lineTo(x + 70 + hash(cell, 3) * 60, peak);
        ctx.lineTo(x + 230, shoreY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    const seaTop = shoreY - 26;
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(0, seaTop, W, 30);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 30; i++) {
      const x = ((hash(i, 9) * W * 2 - cam * 0.4) % W + W) % W;
      ctx.fillRect(x, seaTop + 6 + hash(i, 4) * 18, 24, 2);
    }
    const ice = ctx.createLinearGradient(0, shoreY, 0, H);
    ice.addColorStop(0, "#f8fafc");
    ice.addColorStop(1, "#e2f2fd");
    ctx.fillStyle = ice;
    ctx.fillRect(0, shoreY, W, H - shoreY);
    const trackTop = project(0, LANE_SPAN + 40).y;
    const trackBottom = project(0, -40).y;
    const track = ctx.createLinearGradient(0, trackTop, 0, trackBottom);
    track.addColorStop(0, "#cfe8fb");
    track.addColorStop(1, "#a5d8f5");
    ctx.fillStyle = track;
    ctx.fillRect(0, trackTop, W, trackBottom - trackTop);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    for (let z = 0; z <= LANE_SPAN; z += 52) {
      const y = project(0, z).y;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let cell = Math.floor((cam - W) / 140); cell < (cam + W) / 140; cell++) {
      const z = hash(cell, 1) * LANE_SPAN;
      const s = scaleAt(z);
      const a = project(cell * 140 + hash(cell, 2) * 100, z);
      if (a.x < -100 || a.x > W + 100) continue;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + 46 * s, a.y - 3 * s);
      ctx.moveTo(a.x + 12 * s, a.y + 4 * s);
      ctx.lineTo(a.x + 34 * s, a.y + 2 * s);
      ctx.stroke();
    }
    for (const [z, side] of [
      [LANE_SPAN + 52, -1],
      [-52, 1]
    ]) {
      for (let cell = Math.floor((cam - W * 1.2) / 90); cell < (cam + W * 1.2) / 90; cell++) {
        const p = project(cell * 90 + hash(cell, z) * 40, z + hash(cell, z + 1) * 14 * side);
        if (p.x < -120 || p.x > W + 120) continue;
        const r = (34 + hash(cell, z + 2) * 22) * p.s;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 1.5, r * 0.6, 0, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = "#dbeafe";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    this.drawFloorLines(ctx, project);
    const pole = project(LENGTH + 6, LANE_SPAN + 56);
    if (pole.x > -200 && pole.x < W + 200) {
      const tall = 300 * pole.s;
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 8 * pole.s;
      ctx.beginPath();
      ctx.moveTo(pole.x, pole.y);
      ctx.lineTo(pole.x, pole.y - tall);
      ctx.stroke();
      const cell = 18 * pole.s;
      for (let col = 0; col < 6; col++)
        for (let row = 0; row < 4; row++) {
          const wave = Math.sin(this.simTime * 6 - col * 0.8) * 5 * pole.s * (col / 6);
          ctx.fillStyle = (col + row) % 2 ? "#111827" : "#ffffff";
          ctx.fillRect(pole.x + col * cell, pole.y - tall + row * cell + wave, cell + 0.5, cell + 0.5);
        }
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.roundRect(pole.x - 70 * pole.s, pole.y - tall * 0.55, 140 * pole.s, 50 * pole.s, 10 * pole.s);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 ${Math.round(32 * pole.s)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\uACB0\uC2B9", pole.x, pole.y - tall * 0.55 + 25 * pole.s);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }
  // 출발선(빨강)·결승선(체크무늬)을 원근에 맞춰 바닥에 그린다.
  drawFloorLines(ctx, project) {
    const line = (x, colorA, colorB) => {
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const z0 = -40 + (LANE_SPAN + 80) * i / steps;
        const z1 = -40 + (LANE_SPAN + 80) * (i + 1) / steps;
        for (let k = 0; k < (colorB ? 2 : 1); k++) {
          const a0 = project(x + k * 12, z0);
          const a1 = project(x + k * 12 + 12, z0);
          const b0 = project(x + k * 12, z1);
          const b1 = project(x + k * 12 + 12, z1);
          ctx.fillStyle = colorB && (i + k) % 2 ? colorB : colorA;
          ctx.beginPath();
          ctx.moveTo(a0.x, a0.y);
          ctx.lineTo(a1.x, a1.y);
          ctx.lineTo(b1.x, b1.y);
          ctx.lineTo(b0.x, b0.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    };
    line(-14, "#ef4444", null);
    line(LENGTH, "#111827", "#ffffff");
  }
  // 이미지 배경: 하늘·설산(아주 느리게) → 바다·빙산(조금 느리게) → 빙판 무늬(원근 줄마다) → 먼 쪽 소품·출발/결승 문.
  drawSceneryImages(ctx, project, W, H, view, scene) {
    const cam = this.cam;
    const trackTop = project(0, LANE_SPAN + 40).y;
    const band = (image, top, height, offset) => {
      const width = image.naturalWidth * height / image.naturalHeight;
      const start = -((offset % width + width) % width);
      for (let x = start; x < W; x += width) ctx.drawImage(image, x, top, width + 1, height);
    };
    const seaH = 150;
    const seaTop = trackTop - 34 - seaH;
    const skyH = (seaTop + seaH * 0.2) / 0.94;
    ctx.fillStyle = "#5cb6f2";
    ctx.fillRect(0, 0, W, skyH);
    band(scene.sky, 0, skyH, cam * 0.06);
    ctx.fillStyle = "#f4f9fe";
    ctx.fillRect(0, seaTop + seaH - 8, W, H - seaTop - seaH + 8);
    band(scene.sea, seaTop, seaH, cam * 0.22);
    const ice = scene.ice;
    const tw = ice.naturalWidth;
    const th = ice.naturalHeight;
    const TEX = 0.7;
    for (let y = Math.floor(trackTop); y < H; y += 1) {
      const s = (y - view.horizon) / view.Hc;
      if (s <= 0) continue;
      const z = view.F / s - ZC;
      const row = Math.floor((z / TEX % th + th) % th);
      const tile = tw * TEX * s;
      const u = ((cam - W / (2 * s)) / TEX % tw + tw) % tw;
      for (let x = Math.floor(-u * TEX * s); x < W; x += tile) ctx.drawImage(ice, 0, row, tw, 1, Math.floor(x), y, Math.ceil(tile) + 1, 2);
    }
    ctx.fillStyle = "rgba(236, 246, 253, 0.5)";
    ctx.fillRect(0, trackTop, W, H - trackTop);
    const haze = ctx.createLinearGradient(0, trackTop, 0, trackTop + 160);
    haze.addColorStop(0, "rgba(240, 248, 255, 0.55)");
    haze.addColorStop(1, "rgba(240, 248, 255, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, trackTop, W, 160);
    ctx.lineDashOffset = 0;
    this.drawFloorLines(ctx, project);
    const items = [];
    for (let cell = Math.floor((cam - 1800) / 240); cell < (cam + 1800) / 240; cell++) {
      if (hash(cell, 41) < 0.3) continue;
      const x = cell * 240 + hash(cell, 42) * 120;
      if (Math.abs(x) < 280 || Math.abs(x - LENGTH) < 320) continue;
      const kind = Math.floor(hash(cell, 44) * 10);
      items.push({
        x,
        // 2026-11-13 사용자 요청: 소품이 바다 위에 떠 보이지 않게 코스 바로 뒤 눈밭에 세우고 크기를 줄였다.
        z: LANE_SPAN + 50 + hash(cell, 43) * 18,
        row: kind < 5 ? 0 : 1,
        col: kind % 5,
        zoom: 0.95,
        image: scene.props,
        spec: ICE_EVENT_SPRITE.props
      });
    }
    items.push({
      x: -14,
      z: LANE_SPAN + 56,
      row: 0,
      col: 0,
      zoom: 1.05,
      image: scene.gates,
      spec: ICE_EVENT_SPRITE.gates
    });
    items.push({
      x: LENGTH + 6,
      z: LANE_SPAN + 56,
      row: 0,
      col: 1,
      zoom: 1.05,
      image: scene.gates,
      spec: ICE_EVENT_SPRITE.gates
    });
    items.sort((a, b) => b.z - a.z);
    for (const item of items) {
      const p = project(item.x, item.z);
      if (p.x < -400 || p.x > W + 400) continue;
      drawEvent(ctx, item.image, item.spec, item.row, item.col, p.x, p.y, p.s, item.zoom);
    }
    for (let cell = Math.floor((cam - 1800) / 70); cell < (cam + 1800) / 70; cell++) {
      const p = project(cell * 70 + hash(cell, 61) * 30, LANE_SPAN + 40 + hash(cell, 62) * 6);
      if (p.x < -100 || p.x > W + 100) continue;
      const r = (24 + hash(cell, 63) * 18) * p.s;
      ctx.fillStyle = "#f8fbff";
      ctx.strokeStyle = "#cfe4f5";
      ctx.lineWidth = Math.max(1, 2 * p.s);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4 * p.s, r * 1.6, r * 0.55, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }
  }
  // 미니맵(2026-11-13 사용자 요청): 화면 오른쪽 위에 작게, 트랙 전체를 위에서 본 모양으로 그린다.
  // 가로는 출발 → 결승, 세로는 줄 위치(먼 줄이 위). 지금 화면에 보이는 구간을 밝은 칸으로 표시한다.
  drawMinimap(ctx, W, H, cam, scaleAt) {
    const width = 360;
    const height = 44;
    const left = W - width - 22;
    const top = 22;
    const pad = 10;
    const mapX = (x) => left + pad + clamp(x, 0, LENGTH) / LENGTH * (width - pad * 2);
    const mapY = (z) => top + 7 + (1 - clamp(z, 0, LANE_SPAN) / LANE_SPAN) * (height - 14);
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.62)";
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(191, 227, 248, 0.35)";
    ctx.fillRect(mapX(0), top + 6, mapX(LENGTH) - mapX(0), height - 12);
    const halfView = W / (2 * scaleAt(LANE_SPAN / 2));
    const viewLeft = mapX(cam - halfView);
    const viewRight = mapX(cam + halfView);
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(viewLeft, top + 4, Math.max(6, viewRight - viewLeft), height - 8, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(mapX(0) - 2, top + 6, 4, height - 12);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#111827" : "#ffffff";
      ctx.fillRect(mapX(LENGTH) - 3, top + 6 + (height - 12) * i / 6, 6, (height - 12) / 6 + 0.5);
    }
    const leader = this.ranking()[0];
    const order = [...this.penguins].sort((a, b) => a === leader ? 1 : b === leader ? -1 : a.x - b.x);
    for (const penguin of order) {
      const lead = penguin === leader;
      ctx.fillStyle = penguin.color;
      ctx.strokeStyle = lead ? "#fde047" : "rgba(15, 23, 42, 0.9)";
      ctx.lineWidth = lead ? 2 : 1;
      ctx.beginPath();
      ctx.arc(mapX(penguin.x), mapY(penguin.z), lead ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  drawBoard(ctx, font, W) {
    const ranked = this.ranking().slice(0, 3);
    ctx.save();
    ctx.font = `800 26px ${font}`;
    const parts = ranked.map((penguin, index) => `${index + 1} ${penguin.name}`);
    const widths = parts.map((text) => ctx.measureText(text).width + 40);
    const titleW = 140;
    const total = titleW + widths.reduce((sum, width) => sum + width, 0) + 30;
    let x = W / 2 - total / 2;
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    ctx.beginPath();
    ctx.roundRect(x, 22, total, 56, 18);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#93c5fd";
    ctx.font = `700 22px ${font}`;
    ctx.fillText("\uC2E4\uC2DC\uAC04 \uC21C\uC704", x + 22, 50);
    x += titleW + 10;
    ctx.font = `800 26px ${font}`;
    ranked.forEach((penguin, index) => {
      ctx.fillStyle = "#fde047";
      ctx.fillText(String(index + 1), x, 50);
      ctx.fillStyle = penguin.color;
      ctx.beginPath();
      ctx.arc(x + 26, 50, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(penguin.name, x + 40, 50);
      x += widths[index];
    });
    ctx.restore();
  }
};
function spriteFrame(penguin, time) {
  const cycle = (from, count, speed, base) => from + (Math.floor(base * speed) % count + count) % count;
  switch (penguin.state) {
    case "run":
      if (time < 0) return [4, 0];
      if (penguin.boost > 0.7) return [1, 4];
      if (penguin.boost > 0) return [1, 5];
      return [0, cycle(0, 6, 1.9, penguin.phase)];
    case "grab":
      return [1, Math.min(3, Math.floor((0.45 - penguin.timer) / 0.45 * 4))];
    case "fallen":
      if (Math.abs(penguin.v) > penguin.base * 0.3) return [2, cycle(0, 3, 9, time)];
      if (penguin.timer < 0.45) return [2, 5];
      return [2, cycle(3, 2, 7, time)];
    case "slide":
      if (penguin.timer > SLIDE_TIME - 0.15) return [3, 0];
      return [3, cycle(1, 4, 8, time)];
    case "getup":
      return [3, 5];
    case "finished":
      return [4, cycle(1, 5, 5, time + penguin.id * 0.37)];
  }
}
function drawSprite(ctx, sprites, penguin, x, y, h, time, frame, shadow = true) {
  const scale = h / ICE_SPRITE.bodyHeight;
  if (shadow) {
    ctx.fillStyle = "rgba(30, 64, 175, 0.16)";
    ctx.beginPath();
    ctx.ellipse(x, y, h * 0.42, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const [row, col] = frame ?? spriteFrame(penguin, time);
  const { cellW, cellH, anchorX, anchorY } = ICE_SPRITE;
  ctx.drawImage(
    sprites.sheet(penguin.color),
    col * cellW,
    row * cellH,
    cellW,
    cellH,
    x - anchorX * scale,
    y - anchorY * scale,
    cellW * scale,
    cellH * scale
  );
}
function drawEvent(ctx, image, spec, row, col, x, y, s, zoom = 1) {
  const scale = 130 * s / ICE_SPRITE.bodyHeight * zoom;
  ctx.drawImage(
    image,
    col * spec.cellW,
    row * spec.cellH,
    spec.cellW,
    spec.cellH,
    x - spec.anchorX * scale,
    y - spec.anchorY * scale,
    spec.cellW * scale,
    spec.cellH * scale
  );
}
function drawLabel(ctx, penguin, x, y, s, font) {
  const text = penguin.place ? `${penguin.place}\uB4F1 ${penguin.name}` : penguin.name;
  const size = Math.max(12, Math.round(22 * s));
  ctx.save();
  ctx.font = `800 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + size;
  ctx.fillStyle = penguin.place === 1 ? "rgba(202, 138, 4, 0.92)" : "rgba(15, 23, 42, 0.78)";
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - size * 0.75, width, size * 1.5, size * 0.75);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}
function drawPenguin(ctx, penguin, x, y, h, time) {
  const s = h / 2;
  ctx.save();
  ctx.fillStyle = "rgba(30, 64, 175, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.85, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  const state = penguin.state;
  if (state === "slide") {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    for (let i = 0; i < 4; i++) {
      const len = s * (0.8 + (penguin.phase * 3 + i) % 1 * 0.6);
      ctx.beginPath();
      ctx.moveTo(-s * 1.1 - i * s * 0.1, -s * 0.12 * i);
      ctx.lineTo(-s * 1.1 - len, -s * 0.12 * i);
      ctx.stroke();
    }
    ctx.translate(0, -s * 0.38);
    ctx.rotate(Math.PI / 2);
    drawBody(ctx, s, penguin.color, { flap: -1.2, eyes: "focus", feet: "tuck", phase: penguin.phase });
    ctx.restore();
    return;
  }
  if (state === "fallen") {
    const rolling = Math.abs(penguin.v) > penguin.base * 0.3;
    ctx.translate(0, -s * 0.42);
    ctx.rotate(rolling ? penguin.spin * time * 9 : -Math.PI / 2 + Math.sin(time * 20) * 0.08);
    drawBody(ctx, s, penguin.color, { flap: Math.sin(time * 25), eyes: "dizzy", feet: "kick", phase: time * 20 });
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "#facc15";
    for (let i = 0; i < 3; i++) {
      const angle = time * 5 + i * Math.PI * 2 / 3;
      drawStar(ctx, x + Math.cos(angle) * s * 0.6, y - s * 1.25 + Math.sin(angle) * s * 0.18, s * 0.14);
    }
    ctx.restore();
    return;
  }
  const running = state === "run" || state === "finished";
  const waddle = running ? Math.sin(penguin.phase * 2) * 0.16 : 0;
  const hop = running ? Math.abs(Math.sin(penguin.phase * 2)) * s * 0.12 : 0;
  const cheer = state === "finished" ? Math.abs(Math.sin(time * 7 + penguin.id)) * s * 0.5 : 0;
  ctx.translate(0, -s * 0.95 - hop - cheer);
  let lean = waddle + (penguin.boost > 0 ? 0.25 : 0);
  if (state === "grab") lean = 0.45 + Math.sin(time * 40) * 0.04;
  else if (state === "getup") lean = -0.3;
  ctx.rotate(lean);
  drawBody(ctx, s, penguin.color, {
    flap: state === "grab" ? 2 : state === "finished" ? -1.6 + Math.sin(time * 12) * 0.4 : -0.4 + Math.sin(penguin.phase * 2) * 0.5,
    eyes: state === "grab" ? "strain" : penguin.boost > 0 ? "focus" : "normal",
    feet: running ? "step" : "stand",
    phase: penguin.phase * 2
  });
  if (state === "grab" || penguin.boost > 0) {
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.ellipse(-s * 0.7, -s * 0.8 + Math.sin(time * 10) * 2, s * 0.07, s * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function drawStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5 - Math.PI / 2;
    const radius = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}
function drawBody(ctx, s, scarf, look) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.fillStyle = "#fb923c";
  if (look.feet === "kick") {
    const kick = Math.sin(look.phase) * s * 0.15;
    ctx.beginPath();
    ctx.ellipse(-s * 0.22, s * 0.95 + kick, s * 0.26, s * 0.11, 0.3, 0, Math.PI * 2);
    ctx.ellipse(s * 0.22, s * 0.95 - kick, s * 0.26, s * 0.11, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.feet !== "tuck") {
    const stepA = look.feet === "step" ? Math.max(0, Math.sin(look.phase)) * s * 0.2 : 0;
    const stepB = look.feet === "step" ? Math.max(0, -Math.sin(look.phase)) * s * 0.2 : 0;
    ctx.beginPath();
    ctx.ellipse(-s * 0.12, s * 0.9 - stepA, s * 0.28, s * 0.11, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.28, s * 0.9 - stepB, s * 0.28, s * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1e2433";
  ctx.strokeStyle = "#0b0f19";
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, s * 0.05, s * 0.78, s * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(s * 0.2, s * 0.25, s * 0.52, s * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = scarf;
  ctx.beginPath();
  ctx.roundRect(-s * 0.74, -s * 0.36, s * 1.48, s * 0.24, s * 0.12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.2);
  ctx.lineTo(-s * 1.05, -s * 0.08 + Math.sin(look.phase * 1.3) * s * 0.12);
  ctx.lineTo(-s * 1, s * 0.12 + Math.sin(look.phase * 1.3) * s * 0.12);
  ctx.lineTo(-s * 0.5, -s * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1e2433";
  ctx.save();
  ctx.translate(-s * 0.15, -s * 0.02);
  ctx.rotate(look.flap * 0.6);
  ctx.beginPath();
  if (look.flap >= 2) ctx.ellipse(s * 0.85, 0, s * 0.62, s * 0.15, 0, 0, Math.PI * 2);
  else ctx.ellipse(-s * 0.05, s * 0.42, s * 0.16, s * 0.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.moveTo(s * 0.62, -s * 0.52);
  ctx.quadraticCurveTo(s * 0.98, -s * 0.47, s * 0.62, -s * 0.38);
  ctx.closePath();
  ctx.fill();
  const ex = s * 0.36;
  const ey = -s * 0.58;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ex, ey, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b0f19";
  ctx.strokeStyle = "#0b0f19";
  ctx.lineWidth = Math.max(1.2, s * 0.06);
  if (look.eyes === "dizzy") {
    ctx.beginPath();
    ctx.arc(ex, ey, s * 0.08, 0, Math.PI * 1.6);
    ctx.stroke();
  } else if (look.eyes === "strain") {
    ctx.beginPath();
    ctx.moveTo(ex - s * 0.1, ey - s * 0.06);
    ctx.lineTo(ex + s * 0.08, ey);
    ctx.lineTo(ex - s * 0.1, ey + s * 0.06);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(ex + s * 0.03, ey, s * 0.065, 0, Math.PI * 2);
    ctx.fill();
    if (look.eyes === "focus") {
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.16, ey - s * 0.2);
      ctx.lineTo(ex + s * 0.14, ey - s * 0.12);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(251, 113, 133, 0.45)";
  ctx.beginPath();
  ctx.ellipse(s * 0.42, -s * 0.36, s * 0.09, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
}

// apps/web/.penguin-standalone.ts
async function loadSprites(base) {
  const entries = await Promise.all(
    Object.entries(ICE_SPRITE_URLS).map(async ([key, src]) => {
      const image = new Image();
      image.src = base + src.slice(src.lastIndexOf("/") + 1);
      await image.decode();
      return [key, image];
    })
  );
  return createIceSprites(Object.fromEntries(entries));
}
function standings(engine) {
  return engine.ranking().map(({ id, name, place, finishTime, color }) => ({ id, name, place, finishTime, color }));
}
export {
  ICE_DURATIONS,
  ICE_STAGE,
  PenguinIceRaceEngine,
  loadSprites,
  randomIceSeed,
  standings
};
