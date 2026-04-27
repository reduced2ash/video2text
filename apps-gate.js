import crypto from 'crypto';
import express from 'express';
import path from 'path';
import fetch from 'node-fetch';

const COOKIE_NAME = 'video2text_apps';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 6;
const PASSWORD_HASH = '4d72990af17cc63c8240b1c28a62e9012799624639db07b5335b9d1cdafd6aac';
const SESSION_SECRET = process.env.APP_GATE_SECRET || 'video2text-app-gate-secret-change-me';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signValue(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function buildCookieToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `apps.${expiresAt}`;
  const signature = signValue(payload);
  return `${payload}.${signature}`;
}

function verifyCookieToken(token) {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const signature = parts[2];
  const expectedSignature = signValue(payload);
  const actual = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  if (actual.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(actual, expected)) return false;

  const [scope, expiresAtRaw] = payload.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (scope !== 'apps' || !Number.isFinite(expiresAt)) return false;

  return expiresAt > Math.floor(Date.now() / 1000);
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, entry) => {
    const [name, ...rest] = entry.trim().split('=');
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function setAuthCookie(res) {
  const token = buildCookieToken();
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
}

function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
}

function isAuthorized(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifyCookieToken(cookies[COOKIE_NAME]);
}

function requireAuth(req, res, next) {
  if (isAuthorized(req)) {
    next();
    return;
  }

  res.status(401).send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Protected Apps</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #0f0f0f;
            color: #faf8f5;
            font-family: Inter, Arial, sans-serif;
          }
          .card {
            width: min(520px, calc(100% - 32px));
            padding: 32px;
            border-radius: 20px;
            background: #191919;
            border: 1px solid rgba(255,255,255,.08);
            box-shadow: 0 24px 70px rgba(0,0,0,.35);
          }
          a {
            color: #f59e0b;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Protected apps</h1>
          <p>This area requires the app password. Go back to <a href="/">video2text.org</a> and use the Apps entry point to continue.</p>
        </div>
      </body>
    </html>
  `);
}

function renderAppsHub() {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>VideoToText Apps</title>
        <style>
          :root {
            --bg: #0f0f0f;
            --panel: #191919;
            --panel-2: #202020;
            --text: #faf8f5;
            --muted: #b4aca2;
            --accent: #f59e0b;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            font-family: Inter, Arial, sans-serif;
            color: var(--text);
            background:
              radial-gradient(circle at top left, rgba(245, 158, 11, 0.14), transparent 28rem),
              linear-gradient(180deg, #111111 0%, #0b0b0b 100%);
          }
          .shell {
            width: min(1100px, calc(100% - 32px));
            margin: 0 auto;
            padding: 32px 0 56px;
          }
          .topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 32px;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .brand img {
            width: 48px;
            height: 48px;
          }
          h1 {
            margin: 0;
            font-size: clamp(2rem, 5vw, 3.5rem);
            line-height: 1;
          }
          .sub {
            margin: 10px 0 0;
            color: var(--muted);
            max-width: 640px;
          }
          .logout {
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 999px;
            background: transparent;
            color: var(--text);
            padding: 12px 18px;
            font: inherit;
            cursor: pointer;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
          }
          .card {
            background: linear-gradient(180deg, var(--panel) 0%, var(--panel-2) 100%);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 24px;
            padding: 24px;
            box-shadow: 0 22px 60px rgba(0,0,0,.28);
          }
          .eyebrow {
            color: var(--accent);
            font-size: .78rem;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
          }
          .card h2 {
            margin: 10px 0 8px;
            font-size: 1.45rem;
          }
          .card p {
            margin: 0 0 20px;
            color: var(--muted);
            line-height: 1.6;
          }
          .open {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: var(--accent);
            color: #111;
            padding: 12px 18px;
            font-weight: 700;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="topbar">
            <div>
              <div class="brand">
                <img src="/logo.svg" alt="VideoToText" />
                <div>
                  <h1>Protected apps</h1>
                  <p class="sub">Private tools behind your VideoToText password gate.</p>
                </div>
              </div>
            </div>
            <button class="logout" id="logoutButton" type="button">Log out</button>
          </div>

          <div class="grid">
            <article class="card">
              <div class="eyebrow">Study tools</div>
              <h2>EGR 1400 Final Practice Exam</h2>
              <p>Interactive practice final covering C#, MATLAB, interpolation, circuits, image filters, statistics, and more.</p>
              <a class="open" href="/apps/egr1400/">Open app</a>
            </article>
          </div>
        </div>

        <script>
          document.getElementById('logoutButton').addEventListener('click', async () => {
            await fetch('/api/apps/logout', { method: 'POST' });
            window.location.href = '/';
          });
        </script>
      </body>
    </html>
  `;
}

export function registerProtectedApps(app, rootDir) {
  const protectedAppsDir = path.join(rootDir, 'protected-apps');
  const egrDir = path.join(protectedAppsDir, 'egr1400');

  app.post('/api/apps/login', (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const passwordHash = sha256(password);
    const actual = Buffer.from(passwordHash, 'utf8');
    const expected = Buffer.from(PASSWORD_HASH, 'utf8');

    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      res.status(401).json({ ok: false, error: 'Incorrect password.' });
      return;
    }

    setAuthCookie(res);
    res.json({ ok: true, redirectTo: '/apps' });
  });

  app.post('/api/apps/ask-ai', requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Server is missing GROQ_API_KEY.' });
      }

      const { userQuestion, context } = req.body;
      if (!userQuestion || !context) {
        return res.status(400).json({ error: 'Missing question or context.' });
      }

      const systemPrompt = "You are an expert, encouraging engineering and coding tutor. The user is practicing for their final exam. Use the provided context (the question prompt, the choices, the correct answer, and the provided step-by-step logic) to answer their specific question briefly and concisely. Do NOT just give them the answer if they don't know it, walk them through the logic. Output your response in markdown format.";

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `CONTEXT:\n${context}\n\nUSER QUESTION:\n${userQuestion}` }
          ],
          temperature: 0.7,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      res.json({ reply: data.choices[0].message.content });
    } catch (err) {
      console.error('LLM API Error:', err);
      res.status(500).json({ error: 'Failed to communicate with AI tutor.' });
    }
  });

  app.post('/api/apps/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/apps/session', (req, res) => {
    res.json({ ok: isAuthorized(req) });
  });

  app.get('/apps', requireAuth, (req, res) => {
    res.type('html').send(renderAppsHub());
  });

  app.use('/apps/egr1400', requireAuth, express.static(egrDir, { index: 'index.html' }));
}
