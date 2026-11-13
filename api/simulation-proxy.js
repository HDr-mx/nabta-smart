const upstreamOrigin = 'https://nabta-smart.haydardouraid2006.chatgpt.site';

module.exports = async function simulationProxy(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const room = req.query.room;
  if (room !== undefined && (typeof room !== 'string' || !/^[a-f0-9]{32}$/.test(room))) {
    return res.status(404).json({ error: 'Invalid room' });
  }

  const headers = { Accept: 'application/json' };
  let body;
  if (req.method === 'POST') {
    if (req.headers.origin !== 'https://' + req.headers.host) {
      return res.status(403).json({ error: 'Origin mismatch' });
    }
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (body.length > 300) return res.status(400).json({ error: 'Invalid command' });
    headers['Content-Type'] = 'application/json';
    headers.Origin = upstreamOrigin;
  }

  const url = upstreamOrigin + '/api/simulation' + (room ? '/' + room : '');
  try {
    const response = await fetch(url, { method: req.method, headers, body, redirect: 'error',
      signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    return res.status(response.status).json(payload);
  } catch {
    return res.status(502).json({ error: 'Simulation service unavailable' });
  }
};
