import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const files=[
 'tests/run.mjs','tests/run-voice.mjs','tests/voice-capture.test.mjs','tests/voice-endpoint.test.mjs',
 'tests/learning-phrases.test.mjs','tests/learning-progress.test.mjs','tests/review-store.test.mjs','tests/ux3-dialogue-memory.test.mjs',
 'tests/ux3-voice-contract-browser.cjs','tests/ux3-help-errors-browser.cjs','tests/ux3-journey-browser.cjs',
 'tests/ux3-review-progress-browser.cjs','tests/ux4-hud-browser.cjs','tests/ux7-actions-browser.cjs',
 'tests/ux8-menu-hotspot-browser.cjs','tests/ux9-browser.cjs','tests/ux10-local-voice.cjs','tests/acceptance-corrections-browser.cjs'
];
const selected=process.argv.slice(2);const checks=selected.length?selected:files;
await mkdir('output/acceptance/tests',{recursive:true});
const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),source:'Automated browser, fixtures and synthetic audio; not human speech or real phones',checks:[]};
for(const file of checks){
 const start=Date.now(),r=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:240000,env:process.env});
 const log=`tests/${file.split('/').at(-1)}.log`;await writeFile('output/acceptance/'+log,(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));
 report.checks.push({file,passed:r.status===0,seconds:(Date.now()-start)/1000,log});
 await writeFile('output/acceptance/verification.json',JSON.stringify(report,null,2));console.log(`${r.status===0?'PASS':'FAIL'} ${file}`);
}
process.exitCode=report.checks.some(r=>!r.passed)?1:0;
