import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['tests/bailian.test.mjs','tests/voice-server.test.mjs','tests/voice-bridge.test.mjs']){
 const r=spawnSync(process.execPath,[file],{cwd,stdio:'inherit'});
 if(r.status!==0)process.exit(r.status||1);
}
