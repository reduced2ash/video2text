// nginx calls this endpoint before forwarding HTTP requests or HMR upgrades.
// It reuses the gate's session verifier; it never forwards or duplicates secrets.
const origins = new Set(['https://video2text.org', 'https://www.video2text.org']);
const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const qtheoryDevCard = `
            <article class="card">
              <h2>Qtheory Dev</h2>
              <p>The live development workspace on CachyOS. Changes use dev data; this computer must be online.</p>
              <a class="open" href="/apps/quizcraft/library">Open dev workspace</a>
            </article>`;

export function registerQtheoryDevAccess(app, { isAuthorized }) {
  app.get('/api/apps/qtheory-dev/access', (req, res) => {
    res.set('Cache-Control', 'no-store');
    let authorized = false;
    try { authorized = isAuthorized(req); } catch { /* Bad cookies fail closed. */ }
    if (!authorized) return res.sendStatus(401);

    const method = req.get('X-Qtheory-Original-Method');
    const origin = req.get('Origin');
    const upgrade = req.get('X-Qtheory-Upgrade');
    if (!method || !/^[A-Z]+$/.test(method)) return res.sendStatus(403);
    // Browsers send Origin on writes and WebSocket handshakes. Require it there,
    // and reject explicit cross-origin requests even for ordinary reads.
    if ((origin && !origins.has(origin))
        || ((!readMethods.has(method) || upgrade) && !origins.has(origin))
        || req.get('Sec-Fetch-Site') === 'cross-site') return res.sendStatus(403);

    return res.sendStatus(204);
  });
}
