import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=[
 'tests/run.mjs','tests/run-voice.mjs','tests/voice-capture.test.mjs','tests/voice-endpoint.test.mjs',
 'tests/learning-phrases.test.mjs','tests/learning-progress.test.mjs','tests/review-store.test.mjs','tests/ux3-dialogue-memory.test.mjs',
 'scripts/build-pages.mjs','tests/ux3-voice-contract-browser.cjs','tests/ux3-help-errors-browser.cjs',
 'tests/ux3-hud-layout-browser.cjs','tests/ux3-review-progress-browser.cjs','tests/ux3-copy-browser.cjs',
 'tests/ux3-long-caption-browser.cjs','tests/ux3-exploration-browser.cjs','tests/ux3-browser.cjs',
 'tests/ux3-journey-browser.cjs','tests/ux3-static-browser.cjs','tests/music-browser.cjs','tests/ambient-browser.cjs',
 'tests/ux4-motion-browser.cjs','tests/ux4-dining-browser.cjs','tests/ux4-hud-browser.cjs',
];
const report={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 started:new Date().toISOString(),workingTree:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),
 source:'local automated checks; not human microphone/phone or live pronunciation scoring',checks:[]};
await mkdir(new URL('../output/ux3/tests/',import.meta.url),{recursive:true});
for(const file of files){
 const started=Date.now();const result=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8',timeout:180000});
 const log=(result.stdout||'')+(result.stderr||'')+(result.error?.message||'');
 const name=file.split('/').at(-1)+'.log';await writeFile(new URL('../output/ux3/tests/'+name,import.meta.url),log);
 report.checks.push({file,passed:result.status===0,seconds:Math.round((Date.now()-started)/100)/10,log:'tests/'+name});
 report.finished=new Date().toISOString();await writeFile(new URL('../output/ux3/verification.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(`${result.status===0?'PASS':'FAIL'} ${file} (${report.checks.at(-1).seconds}s)`);
 if(result.status!==0){console.error(log);process.exit(result.status||1);}
}
console.log(`PASS all ${files.length} UX3 check groups at ${report.commit}`);
