// OBS는 읽기 전용 방 주소를 사용하며 조작 키는 브라우저에만 저장한다.
export async function connectRoom({ isObs, applyRemote }) {
  const status = (text) => { document.getElementById('syncStatus').textContent = text; };
  let secret;
  let room = new URLSearchParams(location.search).get('room');
  if (!isObs) {
    try {
      secret = localStorage.getItem('penguin-control-key');
      if (!secret) {
        secret = crypto.randomUUID() + crypto.randomUUID();
        localStorage.setItem('penguin-control-key', secret);
      }
    } catch {
      status('브라우저 저장소를 허용한 뒤 새로고침하세요.');
      return { publish() {}, offset: 0 };
    }
    room = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))), n => n.toString(16).padStart(2, '0')).join('');
  }
  const sync = { offset: 0, publish: () => {} };
  if (!/^[a-f0-9]{64}$/.test(room || '')) {
    status('조작 화면에서 복사한 OBS 전용 주소를 사용하세요.');
    if (isObs) {
      const message = document.createElement('div');
      message.textContent = '조작 화면의 OBS 전용 주소를 사용하세요.';
      message.style.cssText = 'position:fixed;top:20px;left:20px;color:white;background:#111827;padding:16px;z-index:10';
      document.body.append(message);
    }
    return sync;
  }
  const url = new URL(location.href);
  url.search = new URLSearchParams({ obs: '1', room }).toString();
  url.hash = '';
  document.getElementById('obsUrl').value = url.href;
  document.getElementById('copyObs').onclick = async () => {
    try { await navigator.clipboard.writeText(url.href); status('OBS 주소를 복사했습니다.'); }
    catch { document.getElementById('obsUrl').select(); status('주소를 선택했습니다. Ctrl+C로 복사하세요.'); }
  };
  let pending = null;
  let sending = false;
  async function request(method, state) {
    const started = Date.now();
    const response = await fetch('/api/room?room=' + room, {
      method, cache: 'no-store', signal: AbortSignal.timeout(8000),
      ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret }, body: JSON.stringify({ state }) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '동기화 연결 실패');
    sync.offset = data.serverTime - (started + Date.now()) / 2;
    status(data.state || method === 'POST' ? '서버 동기화 연결됨' : '조작 화면의 연결을 기다리는 중');
    return data;
  }
  async function flush() {
    if (sending || !pending) return;
    sending = true;
    const next = pending;
    pending = null;
    try { await request('POST', next); }
    catch (e) { pending ||= next; status(e.message); }
    finally { sending = false; if (pending) setTimeout(flush, 1000); }
  }
  if (!isObs) sync.publish = (state) => { pending = structuredClone(state); flush(); };
  let lastRev = -1;
  async function poll() {
    try {
      const data = await request('GET');
      if (isObs && data.state && data.state.rev !== lastRev) {
        lastRev = data.state.rev;
        applyRemote(data.state);
      }
    } catch (e) { status(e.message); }
    setTimeout(poll, isObs ? 1000 : 30000);
  }
  await request('GET').then(data => {
    if (isObs && data.state) { lastRev = data.state.rev; applyRemote(data.state); }
  }).catch(e => status(e.message));
  setTimeout(poll, isObs ? 1000 : 30000);
  return sync;
}
