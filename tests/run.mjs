import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['teahouse-scene/verify.js','tests/controller.test.mjs','tests/motion.test.mjs']){
 const result=spawnSync(process.execPath,[file],{cwd,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
