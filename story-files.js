import {chapterRecordings} from './story-chapters.js';
import {rehearsalCast} from './rehearsal-cast.js';
export const storyFiles=[
 'street-coats.js','street-fitting.js','assets/street/original-coat.glb','assets/street/loan-coat.glb',
 'face-review.html','face-review.js','cast-review.html','rehearsal-cast.js','story-chapters.js','campaign.js','story-preview.html','story-preview.js','story-preview.css','story-scene.js','assets/story-poses.json','assets/street/aming-service.glb','assets/street/held-coat.glb','story-reunion.js','reunion-scene.js','reunion-wall.js','nanyin-practice.js',
 'reunion-player-meal.js','reunion-hand-poses.js','reunion-boards.js','assets/nanyin-wusong-gather.wav',
 'assets/reunion-portrait-tidy.jpg','assets/reunion-portrait-laugh.jpg',
 ...Object.keys(rehearsalCast).map(id=>'assets/rehearsal-'+id+'.mp4'),
 ...Array.from(chapterRecordings(),recording=>recording.file)
];
