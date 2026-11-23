import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {storyFiles} from '../story-files.js';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {NPC_VOICE_CLIPS} from '../npc-voice-manifest.js';
import {FP1_CLIPS,ROLE_CLIPS} from '../fp1-clips.js';
import {SHOPKEEPER_CAST} from '../street-space.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=path.join(root,'dist');
// Explicit allowlist: no environment files, recordings, server code or local notes.
export const publicFiles=[
 ...storyFiles,
 'index.html','style.css','voice.css','landing.css','mobile-tray.css','app.js','learning-guide.js','learning-phrases.js','learning-progress.js','review-store.js','mobile-tray.js','immersive-hud.js','immersive-hud.css','ui-language.js','controller.js','scene.js','scene-viewport.js','scene-motion.js','weather-layers.js','outdoor-weather.js','dining-actions.js','dining-room.js','street-space.js',
 'voice.js','voice-bridge.js','voice-capture.js','voice-endpoint.js','npc-speech.js','voice-clips.js','npc-voice-manifest.js','practice-audio.js','practice-recorder.js','music.js','ambient.js','sound-priority.js','neighborhood.js','neighborhood-map.js','neighborhood-state.js','neighborhood-voice.js','neighborhood.css',
 'teahouse-scene/index.js','teahouse-scene/menu.js','teahouse-scene/session.js',
 'street-game.js','street-companions.js','street-game.css','street-fang.js','street-quests.js','street-fixtures.js','street-gomoku.js','street-render.js','fp1-clips.js','fp1-travel.js','fp1-follow.js',
 'assets/vinyl-title.png','assets/street/walk.json','assets/street/district.glb',
 ...['ale','aming','aqing','buyer','fang','friend','lin','ling','regular','vendor'].map(id=>'assets/street/'+id+'-styled-v3.glb'),
 ...Object.keys(SHOPKEEPER_CAST).filter(id=>id!=='juiceCart').map(id=>'assets/street/shopkeepers/'+id+'.glb'),
 ...new Set([...Object.values(FP1_CLIPS),...Object.values(ROLE_CLIPS)]),
 'assets/street/three/build/three.module.min.js','assets/street/three/build/three.core.min.js',
 'assets/street/three/examples/jsm/loaders/GLTFLoader.js','assets/street/three/examples/jsm/utils/BufferGeometryUtils.js',
 ...Object.values(NPC_VOICE_CLIPS),
 ...['interior-furnished.png','window-street-clean-ux5.png','window-tram-ux5.png','window-walkers-ux6.png','exterior.png','waiter-poses.png','table.png','food-sheet.png','food-empty-ux3.png','drinks.png','drinks-empty-ux3.png','waiter-gait-v2.png','service-hands.png','takeaway-bun.png','hongkong-evening.wav','hongkong-arrival.png','hongkong-street-opening.png','ow-world.png','ow-player.png','ow-npcs.png','ow-home.png','ow-laundry.png','ow-qing-coats.png','ow-world-day.png','ow-world-night.png'].map(n=>'assets/'+n)
];
await mkdir(target,{recursive:true});
// Refuse stale/unexpected output rather than risk publishing local private files.
async function inspect(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())await inspect(path.join(dir,e.name),name+'/');else if(!publicFiles.includes(name)&&!['.nojekyll','version.json'].includes(name))throw Error('Unexpected build file: '+name);}}
await inspect(target);
for(const name of publicFiles){const dest=path.join(target,name);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,name),dest);}
const voiceOrigin=process.env.VOICE_API_ORIGIN||'';
if(voiceOrigin&&(!/^https:\/\/[a-z0-9.-]+$/.test(voiceOrigin)))throw Error('VOICE_API_ORIGIN must be an HTTPS origin');
for (const name of ['index.html','story-preview.html']) {
 const page = path.join(target,name);
 const html = await readFile(page,'utf8');
 const openingTag = voiceOrigin ? `<html lang="zh-Hans" data-voice-api="${voiceOrigin}">` : '<html lang="zh-Hans" data-preview="true">';
 await writeFile(page,html.replace('<html lang="zh-Hans">',openingTag));
}
await writeFile(path.join(target,'.nojekyll'),'');
console.log(`Built ${publicFiles.length} public files in dist/ (${voiceOrigin?'cloud voice enabled':'voice backend disabled'}).`);
await writeFile(path.join(target,'version.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),builtAt:new Date().toISOString(),voiceEnabled:Boolean(voiceOrigin)},null,2));
