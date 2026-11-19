const { createHash } = require('node:crypto');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const room = req.query.room;
  if (typeof room !== 'string' || !/^[a-f0-9]{64}$/.test(room)) return res.status(400).json({ error: 'Invalid room' });
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'Vercel에 Upstash Redis를 연결하고 재배포하세요.' });
  let command = ['GET', 'penguin:room:' + room];
  if (req.method === 'POST') {
    const secret = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (createHash('sha256').update(secret).digest('hex') !== room) return res.status(403).json({ error: 'Forbidden' });
    const state = req.body?.state;
    if (!state || !Number.isSafeInteger(state.rev) || !Array.isArray(state.names) || state.names.length > 50 || JSON.stringify(state).length > 20000) {
      return res.status(400).json({ error: 'Invalid state' });
    }
    // 지연된 요청이 최신 경주를 덮지 않게 원자적으로 revision을 비교한다.
    const script = "local old=redis.call('GET',KEYS[1]); if old and cjson.decode(old).rev > tonumber(ARGV[2]) then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',604800); return 1";
    command = ['EVAL', script, '1', 'penguin:room:' + room, JSON.stringify(state), String(state.rev)];
  }
  try {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    if (!response.ok || data.error) throw Error('Redis request failed');
    return res.status(200).json({ state: req.method === 'GET' && data.result ? JSON.parse(data.result) : null, serverTime: Date.now() });
  } catch {
    return res.status(502).json({ error: '동기화 서버 연결 실패. Redis 설정을 확인하세요.' });
  }
};
