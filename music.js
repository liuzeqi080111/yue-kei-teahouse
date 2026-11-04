// Official artist upload, played through the supported YouTube player (no copied MP3).
export function mountMusic(host){
 const title=document.createElement('p');title.textContent='陳慧嫻 · 千千闋歌';
 const button=document.createElement('button');button.type='button';button.textContent='播放香港老歌';
 const status=document.createElement('small');status.textContent='官方線上音源，需要連網。';status.setAttribute('role','status');
 const frame=document.createElement('div');frame.id='old-song-player';
 const link=document.createElement('a');link.href='https://www.youtube.com/watch?v=d44u2W-votY';link.target='_blank';link.rel='noopener noreferrer';link.textContent='開啟官方音源';
 const domestic=document.createElement('a');domestic.href='https://www.kugou.com/mixsong/zp4aa2a.html';domestic.target='_blank';domestic.rel='noopener noreferrer';domestic.textContent='國內平台試聽（酷狗）';
 host.append(title,button,status,frame,link,domestic);
 let offline=null,offlineEnabled=true,unlocked=false;
 let player=null,ready=false,playing=false,ducked=false,loading=false,disposed=false,readyTimer=0,attempt=0;
 const announce=()=>{updateOffline();window.dispatchEvent(new CustomEvent('background-music',{detail:{active:playing||(unlocked&&offlineEnabled)}}));};
 const volume=()=>{if(ready)player.setVolume(ducked||document.hidden?0:16);};
 function failure(){
  attempt++;clearTimeout(readyTimer);loading=false;ready=false;
  const old=player;player=null;try{old?.destroy();}catch{}
  playing=!!local&&!local.paused;announce();
  status.textContent='音源未能載入，可點官方連結或選擇本機音檔。';button.disabled=false;button.textContent='重試香港老歌';
  if(!document.getElementById('old-song-player')){const replacement=document.createElement('div');replacement.id='old-song-player';host.insertBefore(replacement,link);}
 }
 async function load(){
  if(ready){if(playing)player.pauseVideo();else player.playVideo();return;}
  if(loading)return;loading=true;const token=++attempt;button.disabled=true;status.textContent='正在連接官方音源…';
  try{
   if(!window.YT?.Player)await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('timeout')),15000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve();};
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);reject(Error('network'));};document.head.append(script);
   });
   if(disposed||token!==attempt)return;
   readyTimer=setTimeout(()=>{if(token===attempt)failure();},15000);
   player=new window.YT.Player('old-song-player',{width:'100%',height:220,videoId:'d44u2W-votY',playerVars:{playsinline:1,loop:1,playlist:'d44u2W-votY',origin:location.origin},events:{
    onReady:()=>{if(token!==attempt)return;clearTimeout(readyTimer);ready=true;loading=false;button.disabled=false;if(local){player.pauseVideo();return;}volume();player.playVideo();status.textContent='若未自動播放，請點播放器的播放鍵。';},
    onStateChange:e=>{if(token!==attempt)return;if(local){if(e.data===1)player.pauseVideo();return;}playing=e.data===1;button.textContent=playing?'暫停香港老歌':'播放香港老歌';if(playing)status.textContent='播放中 · 阿明說話及錄音時自動靜音';announce();},
    onError:()=>{if(token===attempt)failure();}
   }});
  }catch{if(token===attempt)failure();}
 }
 // A user-provided song stays on this computer; it is never uploaded.
 const fileLabel=document.createElement('label');fileLabel.textContent='或選擇本機歌曲：';
 const file=document.createElement('input');file.type='file';file.accept='audio/*';file.setAttribute('aria-label','選擇本機背景歌曲');fileLabel.append(file);host.append(fileLabel);
 let local=null,blobUrl=null;
 file.addEventListener('change',()=>{
  const selected=file.files?.[0];if(!selected)return;
  if(ready)player.pauseVideo();local?.pause();if(blobUrl)URL.revokeObjectURL(blobUrl);
  blobUrl=URL.createObjectURL(selected);local=new Audio(blobUrl);local.loop=true;
  local.volume=ducked?0:.16;local.onplay=()=>{playing=true;announce();};local.onpause=()=>{playing=false;announce();};
  local.play().then(()=>{status.textContent='本機播放：'+selected.name;button.textContent='暫停香港老歌';}).catch(failure);
 });
 button.addEventListener('click',()=>{if(local){if(local.paused)local.play().catch(failure);else local.pause();button.textContent=local.paused?'播放香港老歌':'暫停香港老歌';}else load();});
 const duck=e=>{ducked=!!e.detail?.active;updateOffline();volume();if(local)local.volume=ducked||document.hidden?0:.16;};
 const visibility=()=>{updateOffline();volume();if(local)local.volume=ducked||document.hidden?0:.16;};
 window.addEventListener('voice-activity',duck);document.addEventListener('visibilitychange',visibility);
 window.addEventListener('pagehide',()=>{disposed=true;offline?.pause();document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);attempt++;clearTimeout(readyTimer);player?.destroy();local?.pause();if(blobUrl)URL.revokeObjectURL(blobUrl);window.removeEventListener('voice-activity',duck);document.removeEventListener('visibilitychange',visibility);},{once:true});
 // Always-available original instrumental, with a separate explicit control.
 const bedButton=document.createElement('button');bedButton.type='button';
 const bedNote=document.createElement('small');bedNote.textContent='內置原創港風器樂 · 電鋼琴與貝斯；《千千闋歌》需選用上方音源。';
 host.prepend(bedButton,bedNote);
 try{offlineEnabled=localStorage.getItem('yue-kei-music')!=='off';}catch{}
 offline=new Audio('assets/hongkong-evening.wav');offline.loop=true;offline.preload='auto';
 function updateOffline(){
  bedButton.textContent='港風配樂：'+(offlineEnabled?'開':'關');bedButton.setAttribute('aria-pressed',String(offlineEnabled));
  if(!offline)return;offline.volume=ducked?0:.22;
  if(unlocked&&offlineEnabled&&!playing&&!document.hidden&&!disposed)offline.play().catch(()=>{bedNote.textContent='點「港風配樂」重試播放。';});else offline.pause();
 }
 function unlock(){unlocked=true;updateOffline();}
 bedButton.addEventListener('click',()=>{offlineEnabled=!offlineEnabled;try{localStorage.setItem('yue-kei-music',offlineEnabled?'on':'off');}catch{}announce();});
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);updateOffline();

}
