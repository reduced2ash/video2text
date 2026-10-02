set -eu
stage=/home/ubuntu/qtheory-dev-gate-stage
python3 - <<'PY'
from pathlib import Path
stage=Path('/home/ubuntu/qtheory-dev-gate-stage')
proxy=(stage/'deploy/qtheory-dev-proxy.conf').read_text().replace('https://100.112.106.74:8443','https://127.0.0.1:9')
(stage/'offline-proxy.conf').write_text(proxy)
locations=(stage/'deploy/qtheory-dev.conf').read_text().replace('/etc/nginx/snippets/qtheory-dev-proxy.conf',str(stage/'offline-proxy.conf'))
config=f'pid {stage}/offline-nginx.pid;\nerror_log {stage}/offline-nginx-error.log;\nevents {{}}\nhttp {{ access_log off; server {{ listen 127.0.0.1:49174;\n{locations}\n}} }}\n'
(stage/'offline-nginx.conf').write_text(config)
PY
sudo -n nginx -t -c "$stage/offline-nginx.conf" -p "$stage"
sudo -n nginx -c "$stage/offline-nginx.conf" -p "$stage"
trap 'sudo -n nginx -s quit -c "$stage/offline-nginx.conf" -p "$stage"' EXIT
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import dotenv from '/home/ubuntu/video2text/node_modules/dotenv/lib/main.js';
const {APP_GATE_SECRET:secret}=dotenv.parse(readFileSync('/home/ubuntu/video2text/.env'));
const payload=`apps.${Math.floor(Date.now()/1000)+60}`;
const cookie=`video2text_apps=${payload}.${createHmac('sha256',secret).update(payload).digest('hex')}`;
for (const path of ['/apps/quizcraft/library','/api/quizcraft/auth/config']) {
 const denied=await fetch(`http://127.0.0.1:49174${path}`);
 assert.equal(denied.status,401); console.log(`Offline upstream still gated ${path}: 401`);
 const response=await fetch(`http://127.0.0.1:49174${path}`,{headers:{Cookie:cookie}});
 assert.equal(response.status,503); assert.equal(response.headers.get('retry-after'),'30');
 const body=await response.text(); assert.match(body,/Qtheory Dev is offline/);
 if(path.startsWith('/api/'))assert.ok(JSON.parse(body).error);
 else assert.match(body,/Try again/);
 console.log(`Authenticated offline ${path}: 503 with recovery message`);
}
JS
