# Qtheory Dev gateway

Tracks [issue #1](https://github.com/reduced2ash/video2text/issues/1).

Public entry: `https://video2text.org/apps/quizcraft/library`, also linked from the protected apps hub. The existing VideoToText session gates HTTP, APIs and WebSocket handshakes. There is no second password or public dev listener.

Route: browser → VideoToText nginx → gate authorization subrequest → `https://cachyos-x8664.tail4124e4.ts.net:8443` over Tailscale → CachyOS loopback port 4174. nginx connects to its tailnet IP with the correct TLS SNI and certificate verification, avoiding reliance on the workstation's currently unreliable MagicDNS resolver. The existing tailnet URL continues to work. Only the workstation's running development code/data is accessed; qtheory.net remains independent.

`qtheory-dev-gate.js` registers the narrowly scoped authorization endpoint using the existing gate session verifier and supplies the hub card. Mutation requests and WebSocket upgrades also require an approved HTTPS Origin. Malformed/missing/expired sessions fail closed. nginx proxies original paths, bodies and query strings, permits uploads up to 50 MB, disables buffering for streamed responses, authenticates upgrades and sends no-store headers. Authorization is checked at each request/handshake, not on every frame of an already open WebSocket.

CachyOS, its dev server, and both hosts' Tailscale connections must remain up. API failures return a structured 503; page failures offer a retry and a link back to apps. Browsers need no Tailscale installation. Anyone who can use the existing app gate can use this dev workspace.

## Deployment

The live Ubuntu checkout has pre-existing, uncommitted integrations. Do **not** replace apps-gate.js or deploy the entire repository over it.

1. Back up `/home/ubuntu/video2text/apps-gate.js` and `/etc/nginx/sites-available/videototext`, with private permissions. Record the current Qtheory production PID/release for comparison.
2. Copy `qtheory-dev-gate.js` beside the live gate. Dry-run `python3 scripts/install-qtheory-dev-gate.py LIVE_GATE`, then apply with `--write`. It adds only an import, one card, and endpoint registration; it preserves unrelated customizations. Confirm the live gate retains its runtime `APP_GATE_SECRET` lookup with no fallback secret.
3. Install the four `deploy/qtheory-dev*` files in `/etc/nginx/snippets/`, readable by nginx. Add `include /etc/nginx/snippets/qtheory-dev.conf;` only to the existing VideoToText HTTPS server.
4. Check JavaScript syntax and `sudo nginx -t`. Restart only PM2's `videototext` process, confirm gate health, then reload nginx. Do not restart Qtheory or Course Compass.
5. Verify unauthenticated/expired/malformed sessions are denied for pages, assets, APIs and upgrades; authenticated page/assets/read APIs load; same-origin writes reach the dev app; cross-origin requests fail; and Vite HMR returns 101 and its connected message. Test offline responses using an isolated nginx listener with an unreachable upstream, not by stopping the user's dev session.

Rollback: remove the include and validate/reload nginx first. Restore the backed-up gate only if it has not gained other changes since the backup; otherwise reverse the installer's three additions. Restart only `videototext`. No database rollback is needed.

## Verification

Run `node --test test/qtheory-dev-gate.test.js`, `python3 test/qtheory-dev-installer_test.py`, `node --check apps-gate.js`, and `git diff --check`. The project has no build script. Live proxy verification is required in addition to unit tests.

Before: live route returned 404, confirmed in the browser. The initial browser screenshot request timed out; no before image was fabricated.

## Deployed 2026-10-02

- Public route active; Qtheory Dev appears in the existing protected apps hub.
- Backup: `/home/ubuntu/video2text-backups/qtheory-dev-20261002T164928Z/`.
- Seven Node tests and two Python installer tests passed on CachyOS and Ubuntu. JS syntax, nginx configuration and diff checks passed.
- Live public HTTPS: anonymous, expired and malformed sessions denied (401); authenticated page, React entry, Vite client, static assets and read API succeeded (200). A same-origin POST to an intentionally nonexistent API route reached the dev backend (404) without mutating any quiz data. Cross-origin/source requests and Origin-less writes were denied (403).
- WebSocket handshake: unauthorized 401, cross-origin 403, authenticated 101 with Vite's connected message. Scripts in `scripts/verify-qtheory-dev-live.mjs` and `scripts/verify-qtheory-dev-offline.sh` reproduce the Ubuntu checks using a short-lived signed test session without logging credentials.
- Offline tests used an isolated nginx listener on loopback 49174 with an unreachable upstream. Unauthenticated access still returned 401; authenticated page/API requests returned 503 with recovery text and Retry-After. The temporary listener was stopped.
- The original Tailscale HTTPS route remains available. Qtheory production retained PID 508450 and release `c23d74c474a9a60c4c2584a314bbfb421bb4af63`; no production or dev database was altered.
- Browser observation confirmed the live unauthenticated sign-in screen. Both before and after screenshot capture attempts timed out in the browser backend, so screenshot evidence and authenticated visual browser verification remain unavailable. HTTP/WebSocket checks above exercised the actual public proxy independently.

The tracked gate now also uses the runtime `APP_GATE_SECRET` lookup without a fallback. Ubuntu already had this correction; its authentication code was preserved during deployment. Existing remote modifications to apps-gate.js/server.js and unrelated untracked OU assistant tools were intentionally retained, not swept into this change. The deployment installs the exact versioned gateway module and nginx snippets and applies only the three integration additions to the customized gate.
