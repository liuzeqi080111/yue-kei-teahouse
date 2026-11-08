const STATIC_PREVIEW = document.documentElement.dataset.preview === 'true';
import {MENU,PHASES as P} from './teahouse-scene/index.js';
import {createGame,diningOutcome} from './controller.js';
import {createMobileTray,compactMobileActions} from './mobile-tray.js';
import {createImmersiveHud} from './immersive-hud.js';
import {localizeUi,systemText} from './ui-language.js';
import {fitScene} from './scene-viewport.js';
import {draw,food,ready,tableFoodLayout,SCENE_WIDTH,SCENE_HEIGHT} from './scene.js';
import {createDining} from './dining-actions.js';
import {mountVoice} from './voice.js';
import {createAmbience} from './ambient.js';
import {mountMusic} from './music.js';
import {createSoundscape} from './sound-priority.js';
import {createLearningGuide} from './learning-guide.js';
import {createPracticeAudio} from './practice-audio.js';
import {createPracticeLog} from './learning-progress.js';
import {createReviewStore} from './review-store.js';
import {getPhrase,buildOrderPhrase} from './learning-phrases.js';
import {createPracticeRecorder} from './practice-recorder.js';
import {voiceUrl} from './voice-endpoint.js';
const $=s=>document.querySelector(s),money=n=>'$'+(n/100).toFixed(2),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={temperature:'溫度',sweetness:'甜度',serving:'享用方式',rice:'飯量',noodle:'麵條',soup:'湯量',bread:'麵包',syrup:'糖漿',spicy:'辣度'};
const roman={'food-pineapple-bun':'BO LO YAU','food-charsiu-rice':'CHAR SIU RICE','food-wonton-noodle':'WONTON NOODLES','food-egg-sandwich':'EGG SANDWICH','food-french-toast':'FRENCH TOAST','food-curry-fishball':'CURRY FISHBALLS','drink-lemon-tea':'LEMON TEA','drink-milk-tea':'SILK STOCKING MILK TEA','drink-yuanyang':'YUANYANG','drink-horlicks':'HORLICKS'};
const diningMeanings={'food-pineapple-bun':'菠蘿包夾牛油','food-charsiu-rice':'叉燒配白飯','food-wonton-noodle':'雲吞配竹昇麵','food-egg-sandwich':'雞蛋三文治','food-french-toast':'港式西多士','food-curry-fishball':'咖喱魚蛋','drink-lemon-tea':'檸檬紅茶','drink-milk-tea':'港式濃滑奶茶','drink-yuanyang':'咖啡混合奶茶','drink-horlicks':'麥芽奶飲品'};
const diningFoodPhrases={'food-pineapple-bun':['菠蘿油，趁熱食，外脆內軟。','菠萝油要趁热吃，外脆内软。'],'food-charsiu-rice':['叉燒飯，叉燒配飯，慢慢食。','叉烧饭有叉烧和米饭，慢慢吃。'],'food-wonton-noodle':['雲吞麵，湯香麵爽，趁熱食。','云吞面汤香面爽，要趁热吃。'],'food-egg-sandwich':['蛋治，蛋香軟滑，啱啱好。','蛋治的鸡蛋香滑，刚刚好。'],'food-french-toast':['西多士，外脆內軟，加少少糖漿。','西多士外脆内软，配一点糖浆。'],'food-curry-fishball':['咖喱魚蛋，香辣彈牙，慢慢食。','咖喱鱼蛋香辣弹牙，慢慢吃。']};
function diningPhrase(item,remaining=3){
 if(remaining===0||remaining<3&&item.itemId.startsWith('food-')){
  const phrase=getPhrase(remaining===0?(item.itemId.startsWith('drink-')?'finished-drinking':'finished-eating'):'delicious');
  return {text:phrase.cantonese,meaning:phrase.meaning,jyutping:phrase.jyutping};
 }
 if(remaining<3&&item.options.temperature==='熱')return {text:'有啲熱，我慢慢飲。',meaning:'有点烫，我慢慢喝。',jyutping:'jau5 di1 jit6, ngo5 maan6 maan6 jam2.'};
 const foodJyutping={
  'food-pineapple-bun':'bo1 lo4 jau4, can3 jit6 sik6, ngoi6 ceoi3 noi6 jyun5.',
  'food-charsiu-rice':'caa1 siu1 faan6, caa1 siu1 pui3 faan6, maan6 maan6 sik6.',
  'food-wonton-noodle':'wan4 tan1 min6, tong1 hoeng1 min6 song2, can3 jit6 sik6.',
  'food-egg-sandwich':'daan2 zi6, daan2 hoeng1 jyun5 waat6, aam1 aam1 hou2.',
  'food-french-toast':'sai1 do1 si6, ngoi6 ceoi3 noi6 jyun5, gaa1 siu2 siu2 tong4 zoeng1.',
  'food-curry-fishball':'gaa3 lei1 jyu4 daan2, hoeng1 laat6 daan6 ngaa4, maan6 maan6 sik6.'
 };
 if(diningFoodPhrases[item.itemId]){const [text,meaning]=diningFoodPhrases[item.itemId];return {text,meaning,jyutping:foodJyutping[item.itemId]};}
 const cold=item.options.temperature==='凍',base={'drink-lemon-tea':'檸茶','drink-milk-tea':'奶茶','drink-yuanyang':'鴛鴦','drink-horlicks':'好立克'}[item.itemId]||item.name;
 const name=`${cold?'凍':'熱'}${base}`,sweet=item.options.sweetness?`，${item.options.sweetness}`:'';
 const baseJyutping={'drink-lemon-tea':'ning4 caa4','drink-milk-tea':'naai5 caa4','drink-yuanyang':'jyun1 joeng1','drink-horlicks':'hou2 lap6 hak1'}[item.itemId];
 const sweetJyutping={'正常甜':'zing3 soeng4 tim4','少甜':'siu2 tim4','走甜':'zau2 tim4'}[item.options.sweetness];
 return {text:`${name}${sweet}，${cold?'冰涼解渴':'小心熱，慢慢飲'}。`,meaning:`${cold?'冰':'热'}${base}${sweet}，${cold?'冰凉解渴':'小心烫，慢慢喝'}。`,jyutping:`${cold?'dung3':'jit6'} ${baseJyutping}${sweetJyutping?', '+sweetJyutping:''}, ${cold?'bing1 loeng4 gaai2 hot3':'siu2 sam1 jit6, maan6 maan6 jam2'}.`};
}
const stageNames={[P.OUTSIDE]:'01 / 抵達',[P.GREETING]:'02 / 迎接',[P.SEATING]:'03 / 帶位',[P.SEATED]:'04 / 落座',[P.ORDERING]:'05 / 點餐',[P.DINING]:'06 / 用餐',[P.BILLING]:'07 / 埋單',[P.FINISHED]:'08 / 再會'};
const locationNames={outside:'街邊 · 粵記門外',entrance:'門口 · 侍應迎接',walk:'走道 · 跟隨帶位',room:'窗邊卡座 · 03 號枱',table:'03 號枱 · 桌面',menu:'03 號枱 · 餐牌',bill:'03 號枱 · 帳單',window:'窗边',cashier:'收银处'};
let tab='food',editing=null,showMeaning=true,lastCamera=null,tablePage=0,lastRound=null,selectedDining=null;
let lookCamera='room',panelKey='',panelMarkup='',previousPanel=false;
const panelScroll=new Map();
let frame=0, lastMotionTime=0;
let weather = 'dusk';
const weatherChoices = new Set(['afternoon', 'dusk', 'rain']);
try {
 const saved = localStorage.getItem('yue-kei-weather');
 if (weatherChoices.has(saved)) weather = saved;
} catch {}
document.body.dataset.weather = weather;
$('#scene-weather').value = weather;
let hud=null,voice=null,learningGuide=null,practiceAudio=null,diningAudio=null,diningSoundGeneration=0,dining=null;
const game=createGame({changed:render,inspectDining:id=>dining?.inspect(id)});
const practiceLog=createPracticeLog();
let practiceRound=null,practiceAttemptSerial=0;
function loadReviewStorage(){try{return globalThis.localStorage||null;}catch{return null;}}
function createPageSessionId(){
 try{const id=globalThis.crypto?.randomUUID?.();if(id)return `page-${id}`;}catch{}
 return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
}
const pageSessionId=createPageSessionId(),reviewStore=createReviewStore({storage:loadReviewStorage()});
const settledPracticeRounds=new Set();
let dynamicReviewPhrases=null,reviewChallenges=[],clearReviewArmed=false;
let reviewIndex=0,reviewReady=false,reviewMessage='',reviewState='',reviewSession=0,reviewPlayback=null,reviewProgress={seconds:0,level:0};
const reviewRecorder=createPracticeRecorder(recording=>{
 window.dispatchEvent(new CustomEvent('voice-activity',{detail:{source:'review-recording',recording}}));
});
function reviewRoundId(round){return `round:${pageSessionId}:${round}`;}
function settlePracticeReview(state){
 if(state.phase!==P.FINISHED)return;
 const id=reviewRoundId(state.round);if(settledPracticeRounds.has(id))return;
 settledPracticeRounds.add(id);reviewStore.saveRound(id,practiceLog.snapshot(state.round));
}
function dynamicReviewPhraseMap(){
 if(dynamicReviewPhrases)return dynamicReviewPhrases;
 dynamicReviewPhrases=new Map();
 for(const item of MENU){
  if(!item.available)continue;
  let combinations=[{}];
  for(const [key,values] of Object.entries(item.options||{}))combinations=combinations.flatMap(current=>values.map(value=>({...current,[key]:value})));
  for(const options of combinations){
   const phrase=buildOrderPhrase(item,options);if(phrase?.id)dynamicReviewPhrases.set(phrase.id,phrase);
  }
 }
 return dynamicReviewPhrases;
}
function resolveReviewPhrase(id){return getPhrase(id)||dynamicReviewPhraseMap().get(id)||null;}
function challengeCandidates(state){
 const snapshot=practiceLog.snapshot(state.round),stored=reviewStore.snapshot().phrases;
 const ids=[...snapshot.reviewPhraseIds,...snapshot.phrases.map(phrase=>phrase.phraseId),...reviewStore.recommend(100),...stored.map(phrase=>phrase.phraseId),'one-person','request-bill'];
 const seen=new Set(),phrases=[];
 for(const id of ids){
  if(seen.has(id))continue;seen.add(id);
  const phrase=resolveReviewPhrase(id);if(!phrase)continue;
  phrases.push(phrase);if(phrases.length===2)break;
 }
 return phrases;
}
function syncPracticeRound(round){
 if(practiceRound===round)return;
 practiceLog.begin(round);practiceRound=round;practiceAttemptSerial=0;
}
function currentPracticeTarget(){
 const {state}=game.snapshot();syncPracticeRound(state.round);
 const practice=learningGuide?.getPractice();
 if(!practice?.phraseId||!practice.intents.length)return null;
 return {round:state.round,key:practice.key,phraseId:practice.phraseId,intents:practice.intents};
}
function markPracticeHint(kind,phraseId){
 const {state}=game.snapshot();syncPracticeRound(state.round);
 practiceLog.markHint(state.round,phraseId,kind);updatePracticeSummary(state.round);
}
function canonicalIntent(type,extra,state){
 if(type==='ADD_ITEM'){
  const line=state?.items?.find(item=>item.itemId===extra.itemId);
  return line?{type,itemId:line.itemId,options:{...line.options}}:{type,itemId:extra.itemId};
 }
 if(type==='UPDATE_ITEM'){
  const line=state?.items?.find(item=>item.id===extra.orderItemId);
  return line?{type,orderItemId:line.id,options:{...line.options}}:{type,orderItemId:extra.orderItemId};
 }
 return {type};
}
function intentMatches(expected,actual){
 if(!expected||!actual||expected.type!==actual.type)return false;
 if(expected.itemId&&expected.itemId!==actual.itemId)return false;
 if(expected.orderItemId&&expected.orderItemId!==actual.orderItemId)return false;
 if(expected.options){
  if(!actual.options)return false;
  for(const [key,value] of Object.entries(expected.options))if(actual.options[key]!==value)return false;
 }
 return true;
}
function updatePracticeSummary(round=game.snapshot().state.round){
 const {totals}=practiceLog.snapshot(round);
  const text=totals.attemptCount||totals.phraseCount
   ?`本局：语音 ${totals.byMode.voice} 次（独立 ${totals.independentAttemptCount}）· 文字 ${totals.byMode.text} 次 · 点击 ${totals.byMode.click} 次 · 目标匹配 ${totals.matchedAttemptCount} 次 · 待复习 ${totals.reviewPhraseCount} 句。只核对意思，不评发音。`
   :'未用提示的语音在目标动作成功后，才记为独立表达；文字与点击另计，不评发音。';
 document.querySelectorAll('[data-practice-progress]').forEach(el=>updateText(el,text));
}
function roundReviewMarkup(state){
 const snapshot=practiceLog.snapshot(state.round);
 const completed=snapshot.attempts.find(attempt=>attempt.mode==='voice'&&attempt.matched);
 const phrase=resolveReviewPhrase(completed?.phraseId)||challengeCandidates(state)[0];
 const source=completed?'本次用语音完成了一项粤语任务。':'你完成了这次茶餐厅体验。';
 const practice=phrase?`<p><strong>记住一句</strong> <span lang="yue">${esc(phrase.cantonese)}</span><br><small>${esc(phrase.meaning)}</small></p>`:'';
 return `<h3>本次成果小票</h3><p>${source}</p>${practice}<p><strong>下次试试</strong> 先开口说一句，再用选项继续。</p>`;
}
function renderRoundReview(state){
 const host=$('#round-review');if(!host)return;
 const markup=roundReviewMarkup(state);if(host.dataset.markup!==markup){host.innerHTML=markup;host.dataset.markup=markup;}
 const challengeButton=$('#ending [data-open-review]');if(challengeButton)challengeButton.disabled=challengeCandidates(state).length===0;
}
function referenceJyutpingMarkup(phrase){
 const symbols=Array.from(phrase.cantonese),isHan=char=>/\p{Script=Han}/u.test(char);
 const syllables=phrase.jyutping.match(/[a-z]+[1-6]/gi)||[];
 if(symbols.filter(isHan).length!==syllables.length)return `<strong>${esc(phrase.cantonese)}</strong><span>参考粤拼：${esc(phrase.jyutping)}</span>`;
 let index=0;
 const aligned=symbols.map(char=>isHan(char)?`<ruby>${esc(char)}<rt>${esc(syllables[index++])}</rt></ruby>`:esc(char)).join('');
 return `<span>参考粤拼</span><div class="review-jyutping" lang="yue">${aligned}</div>`;
}
function renderReview(focusSelector=''){
 const dialog=$('#review-dialog');if(!dialog)return;
 const item=reviewChallenges[reviewIndex];
 updateText($('#review-context'),'跟读粤语句子，核对参考粤拼。你可以跳过任意一句。');
 updateText($('#review-challenge-progress'),item?`第 ${reviewIndex+1} / ${reviewChallenges.length} 句`:`已评分 ${reviewChallenges.filter(entry=>entry.result).length} 句`);
 let markup='<p>短复习结束。你可以回到游戏，继续下一次茶餐厅体验。</p>';
 if(item){
  const {phrase,result}=item,revealed=item.revealed||result;
  const working=['opening','preparing','scoring'].includes(reviewState);
  const recording=reviewState==='recording';
  const label=recording?(reviewReady?'停止并评分':'停止录音'):working?({opening:'正在打开麦克风',preparing:'正在处理录音',scoring:'正在评测'}[reviewState]):(item.audio?'再录一次':'开始录音');
  const metrics=result?Object.entries({accuracy:'发音准确度',fluency:'流利度',completeness:'跟读完整度'})
   .filter(([key])=>Number.isFinite(result.scores[key]))
   .map(([key,name])=>`<span>${name} <strong>${Math.round(result.scores[key])}</strong>/100</span>`).join(''):'';
  const omission=result?.words.find(word=>word.error==='Omission');
  const mispronounced=result?.words.find(word=>word.error==='Mispronunciation');
  const feedback=omission?`试着补上「${omission.text}」。`:mispronounced?`可以先重练「${mispronounced.text}」，再读整句。`:'可以再听一次示范，和自己的录音对照。';
  markup=`<article class="review-challenge"><p class="review-challenge-meaning">普通话提示：${esc(phrase.meaning)}</p>
    ${revealed?`<div class="review-challenge-answer">${referenceJyutpingMarkup(phrase)}</div>`:''}
    ${result?`<div class="review-score">${metrics}</div><p class="review-score-note">评分仅供参考，不评声调或实际粤拼。</p><p class="review-challenge-hint">${esc(feedback)}</p>`:''}
    <p class="review-challenge-hint" role="status">${esc(reviewMessage)}</p>
    <div class="review-recording-monitor" ${recording?'':'hidden'}><span data-review-recording-time>录音 ${reviewProgress.seconds.toFixed(1)} / 15 秒</span><meter data-review-recording-level min="0" max="1" value="${reviewProgress.level}" aria-label="录音声音强弱"></meter></div>
    <div class="review-challenge-actions">
      <button type="button" data-challenge-reveal="${reviewIndex}" ${result||recording||working?'disabled':''}>${item.revealed?'收起答案':'看答案'}</button>
      ${revealed&&practiceAudio?`<button type="button" data-challenge-listen="${reviewIndex}" ${recording||working?'disabled':''}>听示范</button>`:''}
      ${item.audio?`<button type="button" data-review-playback ${recording||working?'disabled':''}>听我的录音</button>`:''}
      <button type="button" class="primary" data-challenge-record ${working?'disabled':''}>${label}</button>
      ${item.audio&&!result&&reviewReady?`<button type="button" data-review-retry ${working||recording?'disabled':''}>重试评分</button>`:''}
      <button type="button" data-challenge-next>${item.audio?(reviewIndex+1===reviewChallenges.length?'完成':'下一句'):'跳过这句'}</button>
    </div></article>`;
 }
 const list=$('#review-challenge-list');
 if(list.dataset.markup!==markup){list.innerHTML=markup;list.dataset.markup=markup;}
 if(focusSelector)dialog.querySelector(focusSelector)?.focus({preventScroll:true});
}
function updateReviewProgress({seconds=0,level=0}={}){
 reviewProgress={seconds,level};
 const dialog=$('#review-dialog');
 if(!dialog?.open||document.hidden||reviewState!=='recording')return;
 const time=dialog.querySelector('[data-review-recording-time]');
 if(time)updateText(time,`录音 ${seconds.toFixed(1)} / 15 秒`);
 const meter=dialog.querySelector('[data-review-recording-level]');
 if(meter)meter.value=Math.max(0,Math.min(1,level));
}
function openReview(){
 const snapshot=game.snapshot();settlePracticeReview(snapshot.state);practiceAudio?.stop();voice?.suspend(true);
 reviewChallenges=challengeCandidates(snapshot.state).map(phrase=>({phrase,revealed:false,hinted:false,result:null,audio:null}));
 const session=++reviewSession;reviewIndex=0;reviewReady=false;reviewState='';
 reviewMessage=STATIC_PREVIEW?'可以录音并回听。发音评分需要连接评测服务。':'可以先录音；正在检查评分服务…';
 renderReview();const dialog=$('#review-dialog');if(!dialog.open)dialog.showModal();
 dialog.querySelector('[data-dismiss]')?.focus({preventScroll:true});
 if(STATIC_PREVIEW)return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 fetch(voiceUrl('/api/practice/status'),{signal:controller.signal})
  .then(async response=>response.ok&&(await response.json()).configured===true)
  .catch(()=>false).then(available=>{
   if(session!==reviewSession||!dialog.open)return;
   reviewReady=available;if(!reviewState){reviewMessage=available?'录音会提交给粤语发音评测服务。':'评分暂不可用。仍可录音、回听并核对参考粤拼。';renderReview();}
  }).finally(()=>clearTimeout(timer));
}

function stopReviewPlayback(){
 if(!reviewPlayback)return;
 reviewPlayback.player.pause();URL.revokeObjectURL(reviewPlayback.url);reviewPlayback=null;
}
function resetClearReview(){
 clearReviewArmed=false;const button=$('#clear-review');if(button)button.textContent='清除學習記錄';
 const status=$('#clear-review-status');if(status)status.textContent='';
}
function recordPracticeAttempt({target,mode,editedTranscript=false,ok=false,executedIntents=[]}){
 if(!target||game.snapshot().state.round!==target.round)return {accepted:false,reason:'stale-target'};
 syncPracticeRound(target.round);
 const matched=ok===true&&executedIntents.some(actual=>target.intents.some(expected=>intentMatches(expected,actual)));
 const result=practiceLog.record({round:target.round,attemptId:`practice-${target.round}-${++practiceAttemptSerial}`,phraseId:target.phraseId,mode,matched,editedTranscript});
 updatePracticeSummary(target.round);return result;
}
function recordVoicePractice({target,mode,editedTranscript,result,targetCurrent}){
 if(!targetCurrent)return;
 recordPracticeAttempt({target,mode,editedTranscript,ok:result?.ok===true,executedIntents:result?.executedIntents||[]});
}
function performClickAction(type,extra={},target){
 if(target===undefined)target=['ENTER','RESTART'].includes(type)?null:currentPracticeTarget();
 const result=game.action(type,extra);
 if(target){
  const changed=!result?.events?.some(event=>event.type.endsWith('_NOOP'));
  recordPracticeAttempt({target,mode:'click',ok:result?.ok===true,executedIntents:result?.ok&&changed?[canonicalIntent(type,extra,result.state)]:[]});
 }
 return result;
}
function performCamera(value){
 const before=game.snapshot();
 if(value==='menu'&&before.state.phase===P.SEATED)return performClickAction('OPEN_MENU');
 const target=value==='menu'&&before.state.phase===P.ORDERING&&before.view.camera!=='menu'?currentPracticeTarget():null;
 game.camera(value);
 if(target){
  const opened=game.snapshot().view.camera==='menu';
  recordPracticeAttempt({target,mode:'click',ok:opened,executedIntents:opened?[{type:'OPEN_MENU'}]:[]});
 }
}
dining=createDining({getSnapshot:()=>game.snapshot()});
function syncMeaning(){
 $('#translation').setAttribute('aria-pressed',String(showMeaning));
 $('#meaning').hidden=!showMeaning;
}
learningGuide=createLearningGuide({
 getSnapshot:()=>game.snapshot(),
 getMenuContext:()=>({tab,editing,dining:selectedDining?dining.inspect(selectedDining):null}),
 onMeaningChange:value=>{showMeaning=value;syncMeaning();hud?.sync(game.snapshot());},
 onHint:markPracticeHint
});
showMeaning=learningGuide.showMeaning;syncMeaning();
practiceAudio=STATIC_PREVIEW?null:createPracticeAudio({
 getSnapshot:()=>game.snapshot(),
 getPractice:()=>learningGuide.getPractice()
});
const sound = createSoundscape({musicButton: $('#music-toggle'), volumeControl: $('#music-volume')});
createAmbience({button: $('#ambience'), sound});
mountMusic($('#music-settings'), {sound});
if(STATIC_PREVIEW){
 $('#voice-dock').hidden=true;$('#voice-dock').removeAttribute('open');
 $('#welcome > small').textContent='公開試玩版 · 用場景內選項點餐、加水和埋單；語音稍後開放。';
 const notes=$('#settings').querySelectorAll(':scope > p, :scope > small');
 if(notes[0])notes[0].textContent='本版本可測試完整點餐流程與背景音樂，語音及文字理解尚未開放。';
 if(notes[2])notes[2].textContent='结账为游戏模拟，不会收款，无需账号。短复习可在本机录音回听；此版本不提供在线评分。';
}else voice=mountVoice({game,host:$('#voice-host'),getPracticeTarget:currentPracticeTarget,onPracticeAttempt:recordVoicePractice});
const mobileTray=createMobileTray({
 conversation:$('.conversation'),guide:$('#learning-guide'),voiceDock:$('#voice-dock'),staticPreview:STATIC_PREVIEW,
 onLayout:()=>render(game.snapshot()),onCloseVoice:()=>voice?.cancelPending(),onCompact:value=>voice?.setCompact(value),
});
hud=createImmersiveHud({game,guide:learningGuide,voice,preview:text=>practiceAudio?.preview(text)});
function feedback(s){
 if(s.includes('售罄'))return s.replace(/今日售罄.*/, '今天已经售完，请选另一款。');
 if(s.includes('未确认的商品'))return '还有餐品未确认，下单或取消这些餐品后就可以结账。';
 if(s.includes('已经上菜'))return '这份餐品已经上桌，无法再修改数量、规格或取消。';
 if(s.includes('尚未完成虚拟结账'))return '请先完成虚拟结账，再离开餐厅。';
 if(s.includes('数量必须'))return '每款餐品本局限一份。';
 if(/选项|取值/.test(s))return '该规格不可选，请使用菜单提供的选项。';
 return systemText(s);
}
function updateText(el,value){if(el.textContent!==value)el.textContent=value;}
function focusToken(el){
 const attr=['data-action','data-practice-choice','data-camera','data-tab','data-item','data-edit','data-close','data-back','data-cancel','data-table-page','data-dining-select','data-dining-preview','data-dining-consume','data-dining-hot','data-dining-close','name','type'].find(a=>el?.hasAttribute(a));
 return attr?[attr,el.getAttribute(attr)]:null;
}
function restoreFocus(root,token){
 const target=token&&[...root.querySelectorAll('button:not(:disabled), input, select')].find(el=>el.getAttribute(token[0])===token[1]);
 target?.focus({preventScroll:true});
 return !!target;
}
function closePanel(){
 const from=game.snapshot().view.camera;
 game.camera(game.snapshot().view.near?'room':lookCamera);
 $('#hotspots button')?.focus({preventScroll:true});
}
function button(type,label,primary=false,disabled=false){return `<button data-action="${type}" class="${primary?'primary':''}" ${disabled?'disabled':''}>${label}</button>`;}
const replyText=Object.freeze({
 START_SEATING:'一位呀，唔該。', OPEN_MENU:'唔該，睇吓餐牌。',
 CONTINUE_ORDER:'仲想加啲嘢。', FINISH_ORDER:'夠喇，唔該落單。',
 REQUEST_WATER:'唔該，加水。', REQUEST_UTENSILS:'唔該，畀副餐具我。',
 REQUEST_BILL:'唔該，埋單。', WAITER_LEAVE:'唔使住，唔該。'
});
function replyButton(type,label,primary=false,disabled=false){
 const choice=button(type,label,primary,disabled),line=replyText[type];
 if(!practiceAudio||!line)return choice;
 return `<span class="reply-choice">${choice}<button type="button" data-practice-choice="${type}" aria-label="试听：${esc(line)}" ${disabled?'disabled':''}>试听</button></span>`;
}
function noteModelAudio(choiceType='',text=''){
 const practice=learningGuide?.getPractice();if(!practice)return;
 if(choiceType||text){
  const matchesType=choiceType&&practice.intents.some(intent=>intent.type===choiceType);
  if(!matchesType&&text!==practice.example)return;
 }
 learningGuide?.noteHint('audio');
}
function stopDiningSound(){
 diningSoundGeneration++;
 const context=diningAudio;diningAudio=null;
 if(context)try{context.close().catch(()=>{});}catch{}
}
function playDiningSound(isDrink){
 stopDiningSound();
 const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)return;
 let context;
 try{
  context=new AudioContext();if(context.state!=='running'){context.close().catch(()=>{});return;}
  diningAudio=context;const token=diningSoundGeneration,now=context.currentTime;
  const oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.type='sine';oscillator.frequency.setValueAtTime(isDrink?740:430,now);
  gain.gain.setValueAtTime(.025,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.09);
  oscillator.connect(gain);gain.connect(context.destination);
  oscillator.onended=()=>{if(token!==diningSoundGeneration)return;if(diningAudio===context)diningAudio=null;context.close().catch(()=>{});};
  oscillator.start(now);oscillator.stop(now+.09);
 }catch{if(diningAudio===context)diningAudio=null;try{context?.close().catch(()=>{});}catch{}}
}
function diningReason(details){
 if(details.reason==='empty')return details.isDrink?'这杯饮品已经喝完了。':'这份餐品已经吃完了。';
 if(details.reason==='takeaway')return '外带餐品已经打包，不能在店内吃喝。';
 if(details.reason==='busy')return '阿明正在服务，请稍等。';
 if(details.reason==='stale_round')return '这是上一局的操作，已经忽略。';
 if(['not_dining','paid'].includes(details.reason))return '当前不在用餐阶段，无法吃喝。';
 return '这份餐品还未上桌，或已经不存在。';
}
function endingSummary(state){
 const outcome=diningOutcome(state,id=>dining?.inspect(id)),parts=[];
 for(const item of outcome.completed)parts.push(`${systemText(item.name)}已${item.isDrink?'喝完':'吃完'}`);
 for(const item of outcome.leftover)parts.push(`${systemText(item.name)}还剩一些`);
 for(const item of outcome.untouched)parts.push(`${systemText(item.name)}尚未品尝`);
 if(outcome.packed.length)parts.push(`已打包：${outcome.packed.map(item=>systemText(item.name)).join('、')}`);
 return `${parts.join('；')}。合计 ${money(state.bill?.totalCents??0)}，虚拟结账已完成。阿明向你道别，欢迎下次再来。`;
}
function diningInventoryItem(item,state){
 if(state.phase!==P.DINING)return `<span>${esc(item.name)} · ${itemStatus(item)} · ${Object.values(item.options).map(esc).join(' / ')}</span>`;
 const details=dining.inspect(item.id),options=Object.values(item.options).map(esc).join(' / ');
 if(details.isPacked)return `<span class="dining-takeaway">${esc(item.name)} · 外賣已打包 · 不可堂食</span>`;
 return `<button type="button" class="dining-text-entry" data-dining-select="${esc(item.id)}" aria-pressed="${selectedDining===item.id}">${esc(item.name)} · ${options} · ${details.remaining?`剩 ${details.remaining} 啖`:'已用完'}</button>`;
}
function diningService(item,details,view){
 if(details.isPacked||!details.remaining)return '';
 const hot=details.isDrink&&item.options.temperature==='熱';
 const choices=replyButton('REQUEST_WATER','唔該，加水。',false,view.busy)
  +(details.isFood?replyButton('REQUEST_UTENSILS','唔該，畀副餐具我。',false,view.busy):'')
  +(hot?`<button type="button" data-dining-hot="${esc(item.id)}" ${view.busy?'disabled':''}>有啲熱，等陣先飲。</button>`:'');
 return `<div class="dining-service"><small>可選小情境 · 可以略過，唔影響埋單。</small><div class="dining-detail-actions">${choices}</div>${hot?'<p class="note">熱飲小心燙，可以等涼少少先飲；唔會改變你落單嘅溫度。</p>':''}</div>`;
}
function diningDetail(item,view){
 const details=dining.inspect(item.id),phrase=diningPhrase(item,details.remaining),verb=details.isDrink?'飲':'食';
 return `<section class="dining-detail" aria-label="${esc(item.name)}詳情"><button class="dining-detail-close" data-dining-close aria-label="關閉餐點詳情">✕</button><strong>${esc(item.name)}</strong><small>${roman[item.itemId]||''}</small><p>${esc(diningMeanings[item.itemId]||item.name)} · ${Object.values(item.options).map(esc).join(' / ')}</p><div class="dining-phrase"><span class="dining-cantonese" lang="yue">${esc(phrase.text)}</span><span class="dining-jyutping">粤拼：${esc(phrase.jyutping)}</span><span>普通话：${esc(phrase.meaning)}</span></div><p class="dining-remaining${details.remaining<3?' changed':''}" role="status">剩餘 ${details.remaining} / 3 啖</p><div class="dining-detail-actions"><button data-dining-preview="${esc(item.id)}" ${practiceAudio?'':'hidden'}>听这句</button><button type="button" data-dining-preview="${esc(item.id)}" data-dining-name ${practiceAudio?'':'hidden'}>听名称</button><button class="primary" data-dining-consume="${esc(item.id)}" ${details.canConsume?'':'disabled'}>${details.remaining?`${verb}一啖`:`已${verb}晒`}</button></div>${diningService(item,details,view)}${practiceAudio?'':'<small>靜態試玩版未開放語音試聽。</small>'}</section>`;
}
let measuredScene;
function measureScene(view){
 const canvas=$('#scene'),host=$('#hotspots');
 const width=canvas.clientWidth,height=canvas.clientHeight,dpr=window.devicePixelRatio||1;
 const originX=canvas.offsetLeft-host.offsetLeft,originY=canvas.offsetTop-host.offsetTop;
 const key=[width,height,dpr,originX,originY,view.camera,mobileTray.mobile].join(':');
 if(measuredScene?.key!==key){
  const fit=fitScene({width,height,dpr,fit:getComputedStyle(canvas).objectFit,worldWidth:SCENE_WIDTH,worldHeight:SCENE_HEIGHT});
  measuredScene={key,fit,originX,originY};
 }
 return measuredScene;
}
function foodHotspotStyle(slot,geometry){
 const {fit:{scaleX:sx,scaleY:sy,offsetX,offsetY},originX,originY}=geometry;
 const left=originX+offsetX+slot.x*sx,top=originY+offsetY+(slot.y-slot.size*42)*sy;
 const width=Math.max(44,slot.size*86*sx),height=Math.max(44,slot.size*90*sy);
 return `left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${width.toFixed(1)}px;height:${height.toFixed(1)}px`;
}
function diningHotspots(state,view){
 if(state.phase!==P.DINING||view.camera!=='table')return '';
 const geometry=measureScene(view);
 return tableFoodLayout($('#scene'),state,{...view,tablePage,sceneFit:geometry.fit}).filter(slot=>!dining.inspect(slot.item.id).isPacked).map(slot=>{
  const details=dining.inspect(slot.item.id),name=esc(slot.item.name);
  return `<button class="dining-food-spot${selectedDining===slot.item.id?' selected':''}" data-dining-select="${esc(slot.item.id)}" style="${foodHotspotStyle(slot,geometry)}" aria-label="查看${name}，剩 ${details.remaining} 啖" title="查看${name}"></button>`;
 }).join('');
}
const itemStatus=i=>i.options.serving==='外賣'?({pending:'待落單 · 外賣',confirmed:'已落單 · 待打包',served:'已打包'})[i.status]:({pending:'待落單',confirmed:'已落單 · 等上枱',served:'已上枱'})[i.status];
function actionChoices(state,view){const busy=view.busy;if(view.orderReview)return replyButton('CONTINUE_ORDER','仲想加啲嘢',false,busy)+replyButton('FINISH_ORDER','夠喇，唔該落單。',true,busy);switch(state.phase){case P.OUTSIDE:return '';case P.GREETING:return replyButton('START_SEATING','一位',true,busy)+`<button data-action="START_SEATING" data-party-size="2" ${busy?'disabled':''}>两位</button>`;case P.SEATING:return '<span class="note busy">跟住阿明，行去窗口位…</span>';case P.SEATED:return replyButton('OPEN_MENU','唔該，睇吓餐牌。',true,busy)+replyButton('REQUEST_WATER','唔該，加水。',false,busy)+replyButton('WAITER_LEAVE','唔使住，唔該。',false,busy);case P.ORDERING:case P.DINING:return `<button data-camera="${view.camera==='table'?'room':'table'}">${view.camera==='table'?'抬頭傾偈':'睇吓枱面'}</button>`+`<button data-camera="menu">${state.phase===P.DINING?'想加啲嘢':'睇餐牌'}</button>`+replyButton('REQUEST_WATER','唔該，加水。',false,busy)+replyButton('REQUEST_UTENSILS','唔該，畀副餐具我。',false,busy)+(state.phase===P.DINING?replyButton('REQUEST_BILL','唔該，埋單。',true,busy):'')+replyButton('WAITER_LEAVE','唔使住，唔該。',false,busy);case P.BILLING:return state.isPaid?'<span>已結帳 · 正在道別…</span>':`<button data-camera="bill">查看帳單</button>`+replyButton('PAY_BILL','虛擬結帳',true,busy);case P.FINISHED:return '';}}
function actions(state,view){
 if(['window','cashier'].includes(view.camera))return '<button type="button" class="primary" data-camera="room">回到座位</button>';
 return actionChoices(state,view);
}
function panel(state,view){const el=$('#panel');const visible=['menu','bill'].includes(view.camera);
 if(previousPanel&&panelKey)panelScroll.set(panelKey,el.querySelector('.paper-body')?.scrollTop||0);
 el.hidden=!visible;if(!visible){previousPanel=false;return;}
 const key=view.camera==='bill'?'bill':editing?`form:${editing.lineId||editing.itemId}`:tab;
 const hadFocus=el.contains(document.activeElement),token=focusToken(document.activeElement);
 let title='粵記餐牌',body='',foot='',tabs='';
 if(view.camera==='bill'){
  title='埋單 · 多謝';const bill=state.bill;
  body=bill?`<div class="receipt"><h3>粵記茶餐廳</h3><p class="note" style="text-align:center">03 號枱 · HKD · 虛擬帳單</p>${bill.lines.map(l=>`<div class="bill-line"><span>${esc(l.name)} × ${l.qty}<small>${Object.values(l.options).map(esc).join(' · ')}</small></span><span>${money(l.lineTotal)}</span></div>`).join('')}<div class="total"><span>合計</span><strong>${money(bill.totalCents)}</strong></div>${state.isPaid?'<div class="paid">已完成虛擬結帳</div>':''}<p class="note">所有金額均為演示數據，不會扣取任何款項。</p></div>`:'<p>帳單尚未準備好。</p>';
  foot=state.isPaid?'<span>已結帳 · 即將完成這一局</span>':`<span>只作練習，不會收款</span>${button('PAY_BILL',view.busy?'帳單送緊嚟…':'確認虛擬結帳',true,view.busy)}`;
 }else if(editing){
  const line=editing.lineId?state.items.find(i=>i.id===editing.lineId):null;
  const item=MENU.find(i=>i.id===(line?.itemId||editing.itemId));
  if(!item){editing=null;return panel(state,view);}
  const options=editing.values||line?.options||item.defaults;
  body=`<button class="back" data-back>← 返回餐牌</button><div class="menu-row"><canvas class="food-icon" data-food="${item.id}" width="100" height="80"></canvas><div class="menu-info"><strong>${esc(item.name)}</strong><small>${roman[item.id]}</small></div><span>${money(item.price)}</span></div><form id="item-form" novalidate><div class="options">${Object.entries(item.options).map(([key,values])=>`<label>${names[key]}<select name="${key}">${values.map(v=>`<option value="${v}" ${options[key]===v?'selected':''}>${v}</option>`).join('')}</select></label>`).join('')}<input type="hidden" name="qty" value="1"><span>數量：一份</span></div><p class="note" id="form-quantity-note">每款餐點本局限一份；已選餐點可修改規格。${item.options.serving?'外賣會用紙袋打包。':''}</p><button class="primary" type="submit" ${view.busy?'disabled':''}>${line?'保存修改':'加入訂單'}</button>${line?` <button type="button" data-cancel="${line.id}" ${view.busy?'disabled':''}>取消此項</button>`:''}</form>`;
  foot='<span>港幣標價 · 即點即製</span>';
 }else{
  tabs=`<div class="paper-tabs"><button data-tab="food" aria-pressed="${tab==='food'}">招牌美食</button><button data-tab="drink" aria-pressed="${tab==='drink'}">茶啡飲品</button><button data-tab="order" aria-pressed="${tab==='order'}">我的訂單 · ${state.items.length}</button></div>`;
  if(tab==='order')body=state.items.length?state.items.map(i=>`<div class="order-line"><div><p>${esc(i.name)} <span class="tag tag-${i.status}">${itemStatus(i)}</span></p><small>${Object.values(i.options).map(esc).join(' · ')} · 單價 ${money(i.unitPrice)}</small></div><button data-edit="${i.id}" aria-label="${i.status==='served'?'點解唔可以改':'修改'}${esc(i.name)} · ${Object.values(i.options).map(esc).join('、')}" ${view.busy&&i.status!=='served'?'disabled':''}>${i.status==='served'?'修改說明':'修改'}</button></div>`).join(''):'<p class="empty">仲未揀好？<br>去餐牌睇吓，菠蘿油配奶茶就啱晒。</p>';
  else body=MENU.filter(i=>i.category===tab).map(i=>`<div class="menu-row"><canvas class="food-icon" data-food="${i.id}" width="100" height="80"></canvas><div class="menu-info"><strong>${i.name}</strong><small>${roman[i.id]}</small></div><span class="price">${money(i.price)}</span><button data-item="${i.id}" aria-label="${i.name} ${i.available?'選擇':'今日售罄'}" ${view.busy&&i.available?'disabled':''}>${!i.available?'售罄':state.items.some(l=>l.itemId===i.id)?'已選 · 查看':'選擇 ＋'}</button></div>`).join('');
  const pending=state.items.filter(i=>i.status==='pending').length;
  foot=`<span>${view.busy?'侍應忙緊，請稍等':pending?`${pending} 項待確認`:'即點即製 · 慢慢揀'}</span>${button('CONFIRM_ORDER','確認落單 →',true,view.busy||!pending)}`;
 }
  const guideMarkup=`<section class="learning-guide learning-guide-panel" data-learning-guide aria-label="阶段练习"><span class="learning-guide-kicker">本阶段目标</span><strong data-learning-goal></strong><details class="panel-lesson-details" ${mobileTray.mobile?'':'open'}><summary>展开本步练习</summary><div class="learning-hint-actions" aria-label="分级提示"><button type="button" data-guide-hint="goal" aria-pressed="false">普通话目标</button><button type="button" data-guide-hint="frame" aria-pressed="false">句框</button><button type="button" data-guide-hint="full" aria-pressed="false">完整句</button></div><p class="learning-frame" data-learning-frame hidden></p><div class="learning-example"><p class="learning-cantonese">可以说：<span data-learning-example></span></p><p class="learning-jyutping">粤拼：<span data-learning-jyutping></span></p><p class="learning-translation" data-learning-translation></p><p class="learning-parts">分句：<span data-learning-parts></span></p><details class="learning-word-details"><summary>拆开学</summary><div class="learning-words" data-learning-words></div></details></div><div class="practice-controls" data-practice-controls hidden aria-label="示范音和跟读"><button type="button" data-practice-action="normal">试听</button><button type="button" data-practice-action="slow">慢速试听</button><button type="button" data-practice-action="follow">跟读</button><button type="button" data-practice-action="next" hidden>下一句</button><button type="button" data-practice-action="whole" hidden>整句</button><button type="button" data-practice-action="npc-slow">阿明慢速</button><button type="button" data-practice-action="stop" hidden>停止</button></div><details class="jyutping-intro"><summary>粤拼入门 · 字母与 1–6 声调</summary><p>粤拼用字母写出粤语读音，音节末尾的 1–6 标示六个声调；例如 jat1 的 1 是第 1 声，wai2 的 2 是第 2 声。字母不按英语读，有语音时可配合上方「试听」和「慢速试听」模仿。</p><p><b>唔該 m4 goi1</b>：请人帮忙、点餐或礼貌引起注意时用，也可回应日常小帮助；<b>多謝 do1 ze6</b>：收到礼物或表达较重谢意时常用。本局点单说「唔該」，结账道别说「多謝晒」。</p><p><b>畀 bei2</b>：给；<b>凍 dung3</b>：冰的，用于饮品温度。</p></details><p class="practice-progress" data-practice-progress role="status"></p><p class="practice-status" data-practice-status role="status" hidden></p><div class="learning-help-actions" aria-label="随时求助"><button type="button" data-guide-help="meaning">这句什么意思</button><button type="button" data-guide-help="answer">教我怎么答</button><button type="button" data-guide-help="slower">请说慢一点</button></div><p class="learning-help-result" data-learning-result role="status" hidden></p></details></section>`;
 const markup=`<div class="paper-head"><div><h2>${title}</h2><small>YUE KEI · SINCE 1986</small></div><button data-close aria-label="合上餐牌或帳單">✕</button></div>${tabs}${guideMarkup}<div class="paper-body" tabindex="0" aria-label="${title}內容">${body}</div><p class="paper-message" role="status" hidden></p><div class="paper-foot">${foot}</div>`;
 if(markup!==panelMarkup){
  const changedView=key!==panelKey;
  el.innerHTML=panelMarkup=markup;
  el.querySelector('.paper-body').scrollTop=panelScroll.get(key)||0;
  el.querySelectorAll('[data-food]').forEach(node=>food(node.getContext('2d'),node.dataset.food,50,55));
  if(hadFocus&&!restoreFocus(el,token)) (changedView&&editing?el.querySelector('select, input'):el.querySelector('[aria-pressed="true"]'))?.focus({preventScroll:true});
 }
 panelKey=key;
 const message=el.querySelector('.paper-message');
 updateText(message,feedback(view.notice));message.hidden=!view.notice;
 if(!previousPanel||(hadFocus&&!el.contains(document.activeElement)))el.focus({preventScroll:true});
 previousPanel=true;
}
function render({state,view}){
 sound.setLocation(view.camera === 'outside' ? 'outside' : 'interior');
 syncPracticeRound(state.round);settlePracticeReview(state);
 voice?.sync({state,view});
 const currentFocus=document.activeElement,actionToken=focusToken(currentFocus),hadHotspotFocus=$('#hotspots').contains(currentFocus);
 const gameEl=$('#game'),roundChanged=lastRound!==state.round;
 if(roundChanged){selectedDining=null;tablePage=0;stopDiningSound();reviewChallenges=[];if($('#review-dialog')?.open)$('#review-dialog').close();}
 if(state.phase!==P.DINING||view.camera!=='table')selectedDining=null;
 const served=state.items.filter(i=>i.status==='served'),pages=Math.max(1,Math.ceil(served.length/6));tablePage=((tablePage%pages)+pages)%pages;
 const pageItems=served.slice(tablePage*6,tablePage*6+6),detail=state.phase===P.DINING?pageItems.find(i=>i.id===selectedDining):null;
 syncStage(state,view);
 if(hadHotspotFocus)restoreFocus($('#hotspots'),actionToken);
 if(roundChanged){
  editing=null;tab='food';tablePage=0;lookCamera='room';panelScroll.clear();panelKey='';panelMarkup='';
  learningGuide?.reset();
  gameEl.classList.remove('transitioning');
  lastRound=state.round;
 }
 if(['room','table'].includes(view.camera))lookCamera=view.camera;
 const outside=state.phase===P.OUTSIDE,finished=state.phase===P.FINISHED;
 $('#welcome').hidden=!outside;$('#shop-sign').hidden=!(outside||finished);$('#ending').hidden=!finished;
 const justFinished=finished&&!gameEl.classList.contains('is-finished');gameEl.classList.toggle('is-finished',finished);
 if(finished){
   $('#summary').textContent=endingSummary(state);
  renderRoundReview(state);
 }
 if(justFinished)$('#ending button:not(:disabled)')?.focus({preventScroll:true});
 $('#stage').textContent=stageNames[state.phase];$('#location').textContent=locationNames[view.camera];
 $('#cameras').hidden=![P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(state.phase);
 $('#cameras').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===view.camera||(b.dataset.camera==='menu'&&view.camera==='bill'))));
 $('#scene-hint').textContent=view.busy?'阿明正在服務 · 請稍候':view.camera==='table'?`${state.items.filter(i=>i.status==='served').length} 項已上枱 · ${view.water?'水已加滿':'清水半杯'}${view.utensils?' · 餐具已送到':''}`:outside?'一段屬於你的香港日常':finished?'今日嘅練習完成 · 得閒再嚟':'視角可自由切換 · 訂單會一直保留';
 updateText($('#speaker-name'),view.line[0]);updateText($('#dialogue'),view.line[1]);updateText($('#jyutping'),view.line[2]);updateText($('#meaning'),view.line[3]);$('#meaning').hidden=!showMeaning;
 updateText($('#notice'),['menu','bill'].includes(view.camera)?'':feedback(view.notice));
 panel(state,view);
 learningGuide?.render({state,view});
 const trayActive=!outside&&!finished&&!['menu','bill'].includes(view.camera);
 mobileTray.sync({active:trayActive,round:state.round});
 const actionMarkup=actions(state,view),actionEl=$('#actions'),hadActionFocus=actionEl.contains(currentFocus);
 const actionKey=(mobileTray.mobile?'mobile:':'desktop:')+actionMarkup;
 if(actionEl.dataset.markup!==actionKey){
  const moreWasOpen=Boolean(actionEl.querySelector('.mobile-secondary-actions[open]'))&&!roundChanged&&lastCamera===view.camera;
  actionEl.dataset.markup=actionKey;actionEl.innerHTML=actionMarkup;
  if(mobileTray.mobile)compactMobileActions(actionEl,moreWasOpen);
  actionEl.querySelector('[data-click-fallback]')?.addEventListener('toggle',event=>{if(event.currentTarget.open)learningGuide?.noteHint('full');});
 }
 practiceAudio?.sync({state,view});
 updatePracticeSummary(state.round);
 paint(state,view);
 const inventory=$('#table-labels');
 const inventoryMarkup=view.camera==='table'?`<div class="table-inventory">${pageItems.map(i=>diningInventoryItem(i,state)).join('')}${pages>1?`<button data-table-page>桌面 ${tablePage+1}/${pages} · 下一組 →</button>`:''}</div>${detail?diningDetail(detail,view):''}`:'';
  if(inventory.dataset.markup!==inventoryMarkup){
   const hadFocus=inventory.contains(document.activeElement);
   inventory.innerHTML=inventory.dataset.markup=inventoryMarkup;
   if(hadFocus&&!restoreFocus(inventory,actionToken)){
    const fallback=inventory.querySelector('[data-dining-preview]:not(:disabled)')||inventory.querySelector('[data-dining-close]')||inventory.querySelector('.dining-text-entry,[data-table-page]');
    fallback?.focus({preventScroll:true});
   }
  }
 $('#scene').setAttribute('aria-label',[locationNames[view.camera],state.waiterPresent?'侍應阿明在場':'',served.map(i=>`${i.name}${i.qty}份`).join('，'),view.water?'水已加滿':'',view.utensils?'餐具已送到':''].filter(Boolean).join('。'));
 if (roundChanged || lastCamera !== view.camera) $('#explore-note').hidden = true;
 if(lastCamera!==view.camera){
  gameEl.classList.remove('transitioning');
  if(!roundChanged){void gameEl.offsetWidth;gameEl.classList.add('transitioning');}
  lastCamera=view.camera;
 }
 for(const selector of ['#panel','#hotspots','#table-labels','#ending','#actions','#location','#stage','#notice','#scene-hint','#cameras'])localizeUi($(selector));
 hud?.sync({state,view});
 scheduleSceneFrame();
 if(document.activeElement===document.body){
  if(hadActionFocus&&!restoreFocus(actionEl,actionToken)) (actionEl.querySelector('button:not(:disabled)')||$('#location')).focus({preventScroll:true});
  if(currentFocus?.matches('#welcome button, #ending button')) ($('#actions button:not(:disabled)')||$('#welcome button')).focus({preventScroll:true});
 }
}
let lastPaint='',assetsSettled=false;
function paint(state,view){
 const canvas=$('#scene');
 const geometry=measureScene(view);
 const portions=[...diningPortions(state)];
 const key=JSON.stringify([geometry.key,assetsSettled,weather,selectedDining,portions,view.beat,view.camera,view.water,view.utensils,state.waiterPresent,state.billPresented,state.phase,tablePage,state.items.filter(i=>i.status==='served')]);
 if(lastPaint===key)return;
 lastPaint=key;
 draw(canvas,state,sceneView(state,view,geometry.fit,performance.now()));
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if (b.dataset.explore && b.closest('#hotspots')) {
  const {state, view} = game.snapshot();
  if (view.camera !== 'room' || view.busy || state.isPaid) return;
  const windowSpot = b.dataset.explore === 'window';
  const camera=windowSpot?'window':'cashier';
  const line = windowSpot ? '窗外街景' : '收银处';
  const note = windowSpot ? '街上的车慢慢驶过，店里飘着茶香。' : '用餐后，可以请阿明拿来账单。';
  game.camera(camera);
  $('#game').append($('#explore-note'));
  $('#actions [data-camera="room"]')?.focus({preventScroll:true});
  setTimeout(()=>{
   const current=game.snapshot();
   if(current.state.round!==state.round||current.view.camera!==camera)return;
   updateText($('#explore-note'),line+' · '+note);$('#explore-note').hidden=false;
  },matchMedia('(prefers-reduced-motion: reduce)').matches?0:400);
  return;
 }
 if(b.dataset.learningMode){learningGuide.choose(b.dataset.learningMode);render(game.snapshot());return;}
 if(b.hasAttribute('data-learning-cancel')){learningGuide.cancel();return;}
 if(b.hasAttribute('data-learning-settings')){learningGuide.openMode(null,$('#settings'),true);return;}
 if(b.dataset.guideHint){learningGuide.setHint(b.dataset.guideHint);render(game.snapshot());return;}
 if(b.dataset.practiceChoice){noteModelAudio(b.dataset.practiceChoice,replyText[b.dataset.practiceChoice]);practiceAudio?.preview(replyText[b.dataset.practiceChoice]);return;}
 if(b.dataset.practiceAction){if(['normal','slow','follow','next','whole'].includes(b.dataset.practiceAction))noteModelAudio();practiceAudio?.handle(b.dataset.practiceAction,b.closest('[data-learning-guide]'));return;}
 if(b.dataset.guideHelp){learningGuide.help(b.dataset.guideHelp);if(b.dataset.guideHelp==='slower')practiceAudio?.handle('npc-slow',b.closest('[data-learning-guide]'));return;}
 if(b.hasAttribute('data-open-review')){const origin=b.closest('dialog');if(origin?.open)origin.close();openReview();return;}
 if(b.dataset.challengeReveal!==undefined){
  const index=Number(b.dataset.challengeReveal),item=reviewChallenges[index];if(!item)return;
  item.revealed=!item.revealed;if(item.revealed)item.hinted=true;else practiceAudio?.stop();
  renderReview(`[data-challenge-reveal="${index}"]`);return;
 }
 if(b.dataset.challengeListen!==undefined){
  const index=Number(b.dataset.challengeListen),item=reviewChallenges[index];if(!item?.revealed||!practiceAudio)return;
  stopReviewPlayback();item.hinted=true;practiceAudio.preview(item.phrase.cantonese,'review');renderReview(`[data-challenge-listen="${index}"]`);return;
 }
 if(b.hasAttribute('data-challenge-record')||b.hasAttribute('data-review-retry')){
  const item=reviewChallenges[reviewIndex];if(!item)return;
  if(reviewState==='recording'){reviewRecorder.stop();return;}
  practiceAudio?.stop();stopReviewPlayback();voice?.suspend(true);
  const callbacks={score:reviewReady,onProgress:updateReviewProgress,
   onRecorded(audio){item.audio=audio;item.result=null;},
   onState(state){reviewState=state;reviewMessage=state==='recording'?'请读完后停止，最长录音 15 秒。':state==='recorded'?'录音已保留在本次复习中，可回听和核对参考粤拼。':'';renderReview('[data-challenge-record]');},
   onResult(result,audio){
    item.result=result;item.audio=audio;item.revealed=true;reviewState='';reviewMessage='';
    reviewStore.noteReview(item.phrase.id,{hinted:item.hinted});renderReview('[data-challenge-record]');
   },
   onError(message){reviewState='';reviewMessage=message;renderReview('[data-challenge-record]');},
  };
  if(b.hasAttribute('data-review-retry')){if(item.audio&&reviewReady)reviewRecorder.assess(item.phrase.id,item.audio,callbacks);}
  else {updateReviewProgress();reviewRecorder.start(item.phrase.id,callbacks);}return;
 }
 if(b.hasAttribute('data-review-playback')){
  const audio=reviewChallenges[reviewIndex]?.audio;if(!audio)return;
  practiceAudio?.stop();stopReviewPlayback();
  const url=URL.createObjectURL(audio),player=new Audio(url);reviewPlayback={url,player};
  player.addEventListener('ended',()=>{if(reviewPlayback?.player===player)stopReviewPlayback();},{once:true});
  player.play().catch(()=>{if(reviewPlayback?.player===player)stopReviewPlayback();});return;
 }
 if(b.hasAttribute('data-challenge-next')){
  reviewRecorder.cancel();practiceAudio?.stop();stopReviewPlayback();reviewIndex++;
  reviewState='';reviewMessage=reviewReady?'':'评分暂不可用。可以录音、回听并核对参考粤拼。';
  renderReview(reviewIndex<reviewChallenges.length?'[data-challenge-record]':'[data-dismiss]');return;
 }
 if(b.dataset.diningSelect){
  const snapshot=game.snapshot(),details=dining.inspect(b.dataset.diningSelect);
  if(!details.found||![null,'empty','busy'].includes(details.reason)){game.notify(diningReason(details));return;}
  selectedDining=b.dataset.diningSelect;render(snapshot);return;
 }
 if(b.hasAttribute('data-dining-close')){if(practiceAudio?.active)practiceAudio.stop();selectedDining=null;render(game.snapshot());return;}
 if(b.dataset.diningPreview){
  const snapshot=game.snapshot(),item=snapshot.state.items.find(i=>i.id===b.dataset.diningPreview),details=dining.inspect(b.dataset.diningPreview);
  if(snapshot.state.phase!==P.DINING||snapshot.view.camera!=='table'||!item||item.status!=='served'||details.isPacked){game.notify(diningReason(details));return;}
  if(!practiceAudio){game.notify('此版本暂不提供在线语音试听。');return;}
  const previewText=b.hasAttribute('data-dining-name')?item.name:diningPhrase(item,details.remaining).text;
  noteModelAudio('',previewText);practiceAudio.preview(previewText);return;
 }
 if(b.dataset.diningHot){
  const snapshot=game.snapshot(),item=snapshot.state.items.find(i=>i.id===b.dataset.diningHot),details=dining.inspect(b.dataset.diningHot);
  if(snapshot.state.phase!==P.DINING||snapshot.view.busy||!item||item.status!=='served'||!details.isDrink||details.isPacked||!details.remaining||item.options.temperature!=='熱'){
   game.notify('当前餐品不适用热饮提示，请查看餐品详情。');return;
  }
  game.say('小心熱，唔急，等涼少少先飲吖。','小心烫，不着急，等凉一点再喝。');return;
 }
 if(b.dataset.diningConsume){
  const snapshot=game.snapshot(),item=snapshot.state.items.find(i=>i.id===b.dataset.diningConsume),result=dining.takeBite(b.dataset.diningConsume,snapshot.state.round);
  if(!result.ok){game.notify(diningReason(result));return;}
  if(practiceAudio?.active)practiceAudio.stop();
  playDiningSound(result.isDrink);
  const verb=result.isDrink?'喝':'吃';
  game.notify(result.remaining?`${verb}了一口${systemText(item.name)}，还剩 ${result.remaining} 口。`:`${systemText(item.name)}已经${verb}完了。`);return;
 }
 if(b.dataset.action){
  if(b.dataset.action==='ENTER'){learningGuide.openMode(()=>game.action('ENTER'));return;}
  if(b.dataset.action==='RESTART')learningGuide.reset();
  performClickAction(b.dataset.action,b.dataset.partySize?{partySize:Number(b.dataset.partySize)}:{});return;
 }
 if(b.dataset.dialog){$('#'+b.dataset.dialog).showModal();return;}
 if(b.hasAttribute('data-dismiss')){b.closest('dialog').close();return;}
 if(b.dataset.chapter){const chapter=b.dataset.chapter;learningGuide.openMode(()=>game.chapter(chapter),$('#chapters'));return;}
 if(b.hasAttribute('data-table-page')){tablePage++;selectedDining=null;render(game.snapshot());return;}
  if(b.dataset.camera){performCamera(b.dataset.camera);return;}
 if(b.hasAttribute('data-close')){closePanel();return;}
 if(b.dataset.tab){tab=b.dataset.tab;editing=null;game.notify('');return;}
 if(b.hasAttribute('data-back')){editing=null;game.notify('');return;}
 if(b.dataset.item){if(game.snapshot().view.busy){game.notify('阿明正在服务，请稍等。');return;}const item=MENU.find(i=>i.id===b.dataset.item);if(!item.available){performClickAction('ADD_ITEM',{itemId:item.id});return;}const selected=game.snapshot().state.items.find(l=>l.itemId===item.id);if(selected?.status==='served'){game.notify(selected.options.serving==='外賣'?'这份餐品已打包，无法再修改或重复下单。':'这份餐品已上桌，无法再修改或重复下单。');return;}editing=selected?{lineId:selected.id}:{itemId:item.id};render(game.snapshot());return;}
 if(b.dataset.edit){const line=game.snapshot().state.items.find(i=>i.id===b.dataset.edit);if(line.status==='served'){game.notify(line.options.serving==='外賣'?'这份餐品已打包，无法再修改或取消。':'这份餐品已上桌，无法再修改或取消。');return;}editing={lineId:line.id};render(game.snapshot());return;}
  if(b.dataset.cancel){
   const draft=editing,target=currentPracticeTarget();editing=null;
   if(!performClickAction('CANCEL_ITEM',{orderItemId:b.dataset.cancel},target).ok){editing=draft;render(game.snapshot());}
  }
});
function readDraft(form){
 const data=new FormData(form);
 return {qty:data.get('qty'),values:Object.fromEntries([...data].filter(([k])=>k!=='qty'))};
}
document.addEventListener('input',e=>{
 const form=e.target.closest('#item-form');
 if(!form||!editing)return;
 Object.assign(editing,readDraft(form));e.target.removeAttribute('aria-invalid');
 const snapshot=game.snapshot();learningGuide.render(snapshot);practiceAudio?.sync(snapshot);
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='item-form')return;
 e.preventDefault();if(!editing)return;
 const draft=Object.assign(editing,readDraft(e.target)),qty=Number(draft.qty);
 if(qty!==1){
  game.notify('每款餐品本局限一份。');
  return;
 }
 const target=currentPracticeTarget(),previousTab=tab;editing=null;tab='order';
 const r=draft.lineId?performClickAction('UPDATE_ITEM',{orderItemId:draft.lineId,qty,options:draft.values},target):performClickAction('ADD_ITEM',{itemId:draft.itemId,qty,options:draft.values},target);
 if(!r.ok){editing=draft;tab=previousTab;render(game.snapshot());}
});
$('#translation').addEventListener('click',()=>learningGuide.setMeaning(!showMeaning));
function closeReviewPractice(){
 reviewSession++;reviewRecorder.cancel();practiceAudio?.stop();stopReviewPlayback();voice?.suspend(false);
 for(const item of reviewChallenges)item.audio=null;
}
$('#review-dialog').addEventListener('close',closeReviewPractice);
window.addEventListener('pagehide',closeReviewPractice);
$('#clear-review').addEventListener('click',()=>{
 const status=$('#clear-review-status');
 if(!clearReviewArmed){
  clearReviewArmed=true;$('#clear-review').textContent='再按一次確認清除';
  updateText(status,'只清除已保存的学习与复习记录，不改学习模式、字幕、声音等其他偏好。再按一次确认。');return;
 }
 reviewStore.clear();reviewChallenges=[];resetClearReview();
 updateText(status,'已清除本机保存的学习记录，其他偏好未改。当前这一局仍可继续。');
 if($('#review-dialog').open)renderReview();
});
$('#settings').addEventListener('close',resetClearReview);
$('#restart').addEventListener('click',()=>{$('#settings').close();game.action('RESTART');});
$('#pronunciation').addEventListener('click',e=>{const on=e.target.getAttribute('aria-pressed')!=='true';e.target.setAttribute('aria-pressed',on);document.body.classList.toggle('show-jyutping',on);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&!$('#panel').hidden){e.preventDefault();closePanel();}});
for(const selector of ['#welcome','#settings','#sound-controls','#chapters','#learning-mode','#pause','#asset-status'])localizeUi($(selector));
render(game.snapshot());ready.then(results=>{
 assetsSettled=true;render(game.snapshot());
 if(results.some(r=>r.status==='rejected'))$('#asset-status').hidden=false;
});

new ResizeObserver(()=>render(game.snapshot())).observe($('#game'));

function sceneSpot(view, id, label, x, y) {
 const {fit, originX, originY} = measureScene(view);
 const left = originX + fit.offsetX + x * fit.scaleX;
 const top = originY + fit.offsetY + y * fit.scaleY;
 return `<button type="button" class="spot explore-spot" data-explore="${id}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px">${label}</button>`;
}
function syncStage(state,view){
 const seated=[P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(state.phase);
 const down=view.camera==='table',open=['menu','bill'].includes(view.camera);
 document.body.dataset.camera=view.camera;
 document.body.classList.toggle('at-title',state.phase===P.OUTSIDE);
 const talk=view.beat?.pose==='talk'||state.phase===P.GREETING||(state.waiterPresent&&(!view.beat||view.beat.pose==='talk'||(view.beat.pose==='place'&&!['REQUEST_WATER','REQUEST_UTENSILS'].includes(view.beat.kind))));
 const exploring=['window','cashier'].includes(view.camera);
 document.querySelector('.conversation').hidden=(open&&(!voice||mobileTray.mobile))||state.phase===P.OUTSIDE||state.phase===P.FINISHED||(!voice&&!mobileTray.mobile&&!talk&&!view.notice&&!exploring);
 const hot=$('#hotspots');
 let html='';
 if(seated&&!open&&!view.busy){
  html=down?`<button class="spot water-spot" data-action="REQUEST_WATER">${learningGuide?.experienced?'加水':'唔該，加水'}</button>`:`${state.waiterPresent?'':'<button class="spot waiter-spot" data-action="CALL_WAITER">招呼阿明</button>'}`;
  if(state.phase===P.BILLING)html=down?'<button class="spot menu-spot" data-camera="bill">拿起帳單</button><button class="look" data-camera="room">↑ 抬頭望吓</button>':'<button class="look" data-camera="bill">查看帳單</button>';
 }
 if(exploring)html='';
 if (seated && !view.busy && !state.isPaid && view.camera === 'room') {
  html += sceneSpot(view, 'window', '窗邊', 306, 244);
  html += sceneSpot(view, 'cashier', '收銀處', 704, 252);
 }
 html+=diningHotspots(state,view);
 if(hot.innerHTML!==html)hot.innerHTML=html;
}
function finishedDrinks(state) {
 return new Set(state.items.filter(item => item.itemId.startsWith('drink-') &&
  item.status === 'served' && dining.inspect(item.id).remaining === 0).map(item => item.id));
}
function diningPortions(state){
 return new Map(state.items.filter(item=>item.status==='served').map(item=>[item.id,dining.inspect(item.id).remaining]));
}
function sceneView(state, view, sceneFit, elapsed) {
 const ambientTime=matchMedia('(prefers-reduced-motion: reduce)').matches&&view.camera!=='window'?0:elapsed;
 return {...view, tablePage, sceneFit, weather, elapsed:ambientTime, finishedDrinks: finishedDrinks(state),diningPortions:diningPortions(state)};
}
function motionNeeded(state, view) {
 if (document.hidden || document.querySelector('dialog[open]') ||
  ['menu', 'bill'].includes(view.camera) || selectedDining) return false;
 // Service motion conveys an action's progress. Never leave its timers running
 // while suppressing every intermediate frame (which makes the waiter teleport).
 if (view.beat && Date.now() < view.beat.start + view.beat.duration) return true;
 if (view.camera === 'window') return true;
 if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
 if (['room','window','cashier'].includes(view.camera)) return true;
 if (view.camera !== 'table') return false;
 return state.items.some(item => item.status === 'served' && item.itemId.startsWith('drink-') &&
  item.options.temperature === '熱' && dining.inspect(item.id).remaining > 0);
}
function scheduleSceneFrame() {
 const {state, view} = game.snapshot();
 if (!frame && motionNeeded(state, view)) frame = requestAnimationFrame(animate);
}
function animate(now) {
 frame = 0;
 const {state, view} = game.snapshot();
 if (!motionNeeded(state, view)) return;
 const moving = view.beat && Date.now() < view.beat.start + view.beat.duration;
 if (moving || now - lastMotionTime >= 65) {
  draw($('#scene'), state, sceneView(state, view, measuredScene?.fit, now));
  lastMotionTime = now;
 }
 frame = requestAnimationFrame(animate);
}
$('#scene-weather').addEventListener('change', event => {
 if (!weatherChoices.has(event.target.value)) return;
 weather = event.target.value;
 document.body.dataset.weather = weather;
 try { localStorage.setItem('yue-kei-weather', weather); } catch {}
 render(game.snapshot());
});
document.addEventListener('close', scheduleSceneFrame, true);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', scheduleSceneFrame);
document.addEventListener('visibilitychange', () => {
 document.body.toggleAttribute('data-page-hidden', document.hidden);
 if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
 else scheduleSceneFrame();
});
window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; stopDiningSound(); });
window.addEventListener('pageshow', scheduleSceneFrame);
