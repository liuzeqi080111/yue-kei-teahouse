import {chapters} from './story-chapters.js';
import {rehearsalCast} from './rehearsal-cast.js';
export const storyFiles=[
 'face-review.html','face-review.js','cast-review.html','rehearsal-cast.js','story-chapters.js','story-preview.html','story-preview.js','story-preview.css','story-scene.js','assets/story-poses.json','assets/street/aming-service.glb','assets/street/held-coat.glb','story-reunion.js','reunion-scene.js','reunion-wall.js','nanyin-practice.js',
 'assets/nanyin-wusong-riddle.wav','assets/nanyin-wusong-gather.wav',
 ...Object.keys(rehearsalCast).map(id=>'assets/rehearsal-'+id+'.mp4'),
 ...Object.entries(chapters).flatMap(([chapter,book])=>Object.keys(book.nodes).filter(id=>book.nodes[id][0]!=='master').flatMap(id=>(id==='morning'?['-tea','-lemon']:['']).map(suffix=>'assets/story-'+chapter+'-'+id+suffix+'.wav')))
];
