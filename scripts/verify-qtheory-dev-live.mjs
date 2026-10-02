import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import dotenv from '/home/ubuntu/video2text/node_modules/dotenv/lib/main.js';
const env = dotenv.parse(readFileSync('/home/ubuntu/video2text/.env'));
assert.ok(env.APP_GATE_SECRET?.length >= 32);
function cookie(offset = 300) {
  const payload = `apps.${Math.floor(Date.now()/1000)+offset}`;
  return `video2text_apps=${payload}.${createHmac('sha256',env.APP_GATE_SECRET).update(payload).digest('hex')}`;
}
const session = cookie();
function request(path, { method = 'GET', auth = session, origin, body, headers = {} } = {}) {
  return new Promise((resolve,reject) => {
    const req = https.request({ hostname: 'video2text.org', path, method, timeout: 20000,
      headers: { Accept: 'text/html', ...(auth ? { Cookie: auth } : {}), ...(origin ? {Origin: origin}:{}), ...headers } }, res => {
      const parts=[]; res.on('data',part=>parts.push(part));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}));
    });
    req.on('error',reject); req.on('timeout',()=>req.destroy(new Error('HTTP timeout')));
    req.end(body);
  });
}
function expect(response, status, label) {
  assert.equal(response.status,status,label);
  console.log(`${label}: ${status}`);
}
for(const path of ['/apps/quizcraft/library','/apps/quizcraft/@vite/client','/apps/quizcraft/src/main.jsx','/api/quizcraft/auth/config']) {
  expect(await request(path,{auth:null}),401,`Unauthenticated ${path}`);
  expect(await request(path,{auth:cookie(-5)}),401,`Expired session ${path}`);
}
expect(await request('/apps/quizcraft/library',{auth:'video2text_apps=%invalid'}),401,'Malformed cookie');
const page=await request('/apps/quizcraft/library');expect(page,200,'Authenticated dev page');
assert.match(page.body,/@vite\/client/); assert.equal(page.headers['cache-control'],'no-store');
const client=await request('/apps/quizcraft/@vite/client',{headers:{Accept:'*/*'}});expect(client,200,'Vite client');
expect(await request('/apps/quizcraft/src/main.jsx'),200,'React entry');
expect(await request('/apps/quizcraft/assets/brand/quizcraft-favicon.svg'),200,'Static asset');
expect(await request('/api/quizcraft/auth/config'),200,'Read API');
const hub=await request('/apps');expect(hub,200,'Existing app hub'); assert.match(hub.body,/Qtheory Dev/);
for(const app of ['OUTC Assistant','Course Compass','EGR 1400'])assert.ok(hub.body.includes(app),`Preserve ${app}`);
writeFileSync('/home/ubuntu/qtheory-dev-gate-stage/hub-after.html',hub.body);
expect(await request('/api/quizcraft/__gateway_probe__',{method:'POST',origin:'https://video2text.org',body:'{}',headers:{'Content-Type':'application/json'}}),404,'Same-origin write reaches unknown dev route without mutating data');
expect(await request('/api/quizcraft/__gateway_probe__',{method:'POST',origin:'https://evil.example',body:'{}',headers:{'Content-Type':'application/json'}}),403,'Cross-origin write blocked');
expect(await request('/api/quizcraft/__gateway_probe__',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}}),403,'Origin-less write blocked');
expect(await request('/apps/quizcraft/src/main.jsx',{origin:'https://evil.example'}),403,'Cross-origin source request blocked');
expect(await request('/_qtheory_dev_auth'),404,'Internal authorization route inaccessible');
expect(await request('/_qtheory_dev_offline'),404,'Internal error route inaccessible');
expect(await request('/'),200,'VideoToText home');
expect(await request('/apps/moodle/',{auth:null}),401,'Course Compass still gated');
const token=client.body.match(/(?:wsToken|webSocketToken)\s*=\s*["']([^"']+)["']/)?.[1];
assert.ok(token,'Vite WebSocket token exists');
async function websocket({auth=session,origin='https://video2text.org',expected=101}={}) {
  return new Promise((resolve,reject)=>{
    const socket=tls.connect({host:'video2text.org',port:443,servername:'video2text.org'},()=>{
      socket.write(`GET /apps/quizcraft/?token=${encodeURIComponent(token)} HTTP/1.1\r\nHost: video2text.org\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: vite-hmr\r\nOrigin: ${origin}\r\n${auth?`Cookie: ${auth}\r\n`:''}\r\n`);
    });
    let all=Buffer.alloc(0);
    socket.setTimeout(10000,()=>socket.destroy(new Error('WebSocket timeout')));
    socket.on('error',reject);
    socket.on('data',data=>{
      all=Buffer.concat([all,data]);
      const text=all.toString(); const split=text.indexOf('\r\n\r\n');
      if(split<0)return;
      const status=Number(text.match(/^HTTP\/1\.1 (\d+)/)?.[1]);
      if(status!==expected){socket.destroy();reject(new Error(`WebSocket expected ${expected}, got ${status}`));return;}
      if(status!==101 || text.includes('"type":"connected"')) {
        console.log(`WebSocket ${!auth?'unauthenticated':origin==='https://video2text.org'?'authenticated + Vite connected':'cross-origin'}: ${status}`);
        socket.destroy();resolve();
      }
    });
  });
}
await websocket({auth:null,expected:401});
await websocket({origin:'https://evil.example',expected:403});
await websocket();
console.log('Live gate proxy checks passed. No quiz data was modified.');
