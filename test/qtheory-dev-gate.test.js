import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerQtheoryDevAccess, qtheoryDevCard } from '../qtheory-dev-gate.js';

function request({ authorized = true, throws = false, ...headers } = {}) {
  let handler;
  registerQtheoryDevAccess({ get(path, callback) {
    assert.equal(path, '/api/apps/qtheory-dev/access'); handler = callback;
  } }, { isAuthorized() { if (throws) throw new URIError('Bad cookie'); return authorized; } });
  const response = { headers: {}, set(key, value) { this.headers[key] = value; }, sendStatus(code) { this.status = code; } };
  handler({ get: name => headers[name] }, response);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  return response.status;
}

test('signed gate session is required before request origin is considered', () => {
  assert.equal(request({ authorized: false }), 401);
  assert.equal(request({ throws: true }), 401);
  assert.equal(request({ authorized: false, 'X-Qtheory-Original-Method': 'GET', Origin: 'https://video2text.org' }), 401);
});

test('authenticated navigation is allowed; missing original method fails closed', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(request({ 'X-Qtheory-Original-Method': method }), 204);
  assert.equal(request(), 403);
  assert.equal(request({ 'X-Qtheory-Original-Method': 'get' }), 403);
});

test('all writes require an explicitly permitted HTTPS origin', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const Origin of ['https://video2text.org', 'https://www.video2text.org'])
      assert.equal(request({ 'X-Qtheory-Original-Method': method, Origin }), 204);
    for (const Origin of [undefined, 'null', 'https://evil.test', 'https://video2text.org.evil.test', 'http://video2text.org'])
      assert.equal(request({ 'X-Qtheory-Original-Method': method, Origin }), 403);
  }
});

test('WebSocket upgrades require a gate session and the same trusted origin', () => {
  const headers = { 'X-Qtheory-Original-Method': 'GET', 'X-Qtheory-Upgrade': 'websocket' };
  assert.equal(request(headers), 403);
  assert.equal(request({ ...headers, Origin: 'https://evil.test' }), 403);
  assert.equal(request({ ...headers, Origin: 'https://video2text.org' }), 204);
  assert.equal(request({ ...headers, Origin: 'https://video2text.org', authorized: false }), 401);
});

test('cross-site reads and spoofed browser fetch metadata are denied', () => {
  assert.equal(request({ 'X-Qtheory-Original-Method': 'GET', Origin: 'https://evil.test' }), 403);
  assert.equal(request({ 'X-Qtheory-Original-Method': 'GET', 'Sec-Fetch-Site': 'cross-site' }), 403);
});

test('all proxy routes share authentication, verified upstream TLS, and no caching', () => {
  const config = readFileSync(new URL('../deploy/qtheory-dev.conf', import.meta.url), 'utf8');
  const proxy = readFileSync(new URL('../deploy/qtheory-dev-proxy.conf', import.meta.url), 'utf8');
  assert.equal((config.match(/include \/etc\/nginx\/snippets\/qtheory-dev-proxy.conf;/g) || []).length, 2);
  assert.match(proxy, /auth_request \/_qtheory_dev_auth;/);
  assert.match(proxy, /proxy_ssl_verify on;/);
  assert.match(proxy, /proxy_set_header Upgrade \$http_upgrade;/);
  assert.match(proxy, /proxy_buffering off;/);
  assert.match(proxy, /Cache-Control "no-store" always/);
  assert.match(config, /location = \/_qtheory_dev_auth \{\s+internal;/);
  assert.match(config, /return 401/);
  assert.match(config, /return 503/);
});

test('dev entry and offline recovery stay on their own routes', () => {
  assert.match(qtheoryDevCard, /href="\/apps\/quizcraft\/library"/);
  assert.match(qtheoryDevCard, /Qtheory Dev/);
  for (const name of ['offline', 'signin']) {
    const html = readFileSync(new URL(`../deploy/qtheory-dev-${name}.html`, import.meta.url), 'utf8');
    assert.match(html, /name="viewport"/);
    assert.match(html, /noindex,nofollow/);
    assert.doesNotMatch(html, /<script/);
  }
});
