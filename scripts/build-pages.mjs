import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=path.join(root,'dist');
// Explicit allowlist: no environment files, recordings, server code or local notes.
export const publicFiles=[
 'index.html','style.css','voice.css','landing.css','mobile-tray.css','app.js','learning-guide.js','learning-phrases.js','learning-progress.js','review-store.js','mobile-tray.js','immersive-hud.js','immersive-hud.css','ui-language.js','controller.js','scene.js','scene-viewport.js','scene-motion.js','weather-layers.js','outdoor-weather.js','dining-actions.js',
 'voice.js','voice-bridge.js','voice-capture.js','voice-endpoint.js','npc-speech.js','practice-audio.js','practice-recorder.js','music.js','ambient.js','sound-priority.js',
 'teahouse-scene/index.js','teahouse-scene/menu.js','teahouse-scene/session.js',
 ...['interior-furnished.png','exterior.png','waiter-poses.png','table.png','food-sheet.png','food-empty-ux3.png','drinks.png','drinks-empty-ux3.png','waiter-gait-v2.png','service-hands.png','takeaway-bun.png','hongkong-evening.wav','hongkong-arrival.png'].map(n=>'assets/'+n)
];
await mkdir(target,{recursive:true});
// Refuse stale/unexpected output rather than risk publishing local private files.
async function inspect(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())await inspect(path.join(dir,e.name),name+'/');else if(!publicFiles.includes(name)&&name!=='.nojekyll')throw Error('Unexpected build file: '+name);}}
await inspect(target);
for(const name of publicFiles){const dest=path.join(target,name);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,name),dest);}
const voiceOrigin=process.env.VOICE_API_ORIGIN||'';
if(voiceOrigin&&(!/^https:\/\/[a-z0-9.-]+$/.test(voiceOrigin)))throw Error('VOICE_API_ORIGIN must be an HTTPS origin');
let html=await readFile(path.join(target,'index.html'),'utf8');html=html.replace('<html lang="zh-Hans">',voiceOrigin?`<html lang="zh-Hans" data-voice-api="${voiceOrigin}">`:'<html lang="zh-Hans" data-preview="true">');await writeFile(path.join(target,'index.html'),html);await writeFile(path.join(target,'.nojekyll'),'');
console.log(`Built ${publicFiles.length} public files in dist/ (${voiceOrigin?'cloud voice enabled':'voice backend disabled'}).`);
