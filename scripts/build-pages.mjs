import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=path.join(root,'dist');
// Explicit allowlist: no environment files, recordings, server code or local notes.
export const publicFiles=[
 'index.html','style.css','voice.css','app.js','controller.js','scene.js',
 'voice.js','voice-bridge.js','voice-capture.js','npc-speech.js','music.js','ambient.js',
 'teahouse-scene/index.js','teahouse-scene/menu.js','teahouse-scene/session.js',
 ...['interior-furnished.png','exterior.png','waiter-poses.png','table.png','food-sheet.png','drinks.png','waiter-gait-v2.png','service-hands.png','takeaway-bun.png','hongkong-evening.wav'].map(n=>'assets/'+n)
];
await mkdir(target,{recursive:true});
// Refuse stale/unexpected output rather than risk publishing local private files.
async function inspect(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())await inspect(path.join(dir,e.name),name+'/');else if(!publicFiles.includes(name)&&name!=='.nojekyll')throw Error('Unexpected build file: '+name);}}
await inspect(target);
for(const name of publicFiles){const dest=path.join(target,name);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,name),dest);}
let html=await readFile(path.join(target,'index.html'),'utf8');html=html.replace('<html lang="zh-Hant">','<html lang="zh-Hant" data-preview="true">');await writeFile(path.join(target,'index.html'),html);await writeFile(path.join(target,'.nojekyll'),'');
console.log(`Built ${publicFiles.length} public files in dist/ (voice backend disabled).`);
