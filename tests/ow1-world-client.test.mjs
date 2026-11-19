import assert from 'node:assert/strict';
import {createNeighborhoodVoice} from '../neighborhood-voice.js';

const AUDIO_BASE64=Buffer.from('fake audio').toString('base64');
const NPC_NAMES={qing:'阿晴',fang:'阿芳',lok:'阿樂',ling:'阿玲',lam:'阿林',ming:'阿明',guest:'客人',buyer:'買家'};

function json(value,status=200){
  return {ok:status>=200&&status<300,status,json:async()=>value};
}

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function worldResponse(request,overrides={}){
  const response={
    version:1,
    decision:'reply',
    reply:'模型回應',
    meaning:'模型释义',
    requestId:request.requestId,
    generation:request.generation,
    revision:request.revision,
    npcId:request.context.npcId,
    ...overrides,
  };
  if(response.decision!=='execute'&&!Object.hasOwn(overrides,'actionId'))delete response.actionId;
  return response;
}

function createRecorderStub(){
  let onRecording=()=>{};
  let active=null;
  const recorder={
    starts:[],
    cancelCount:0,
    stopCount:0,
    attach(callback){onRecording=callback;return recorder;},
    async start(kind,options){
      recorder.starts.push({kind,options});
      active=options;
      options.onState?.('recording');
      onRecording(true);
    },
    cancel(){
      recorder.cancelCount++;
      if(active){active=null;onRecording(false);}
    },
    stop(){
      recorder.stopCount++;
      if(active)onRecording(false);
    },
    finish(blob){
      const options=active;
      if(!options)throw Error('没有进行中的替身录音');
      active=null;
      onRecording(false);
      options.onState?.('preparing');
      options.onRecorded?.(blob);
    },
    fail(message){
      const options=active;
      active=null;
      onRecording(false);
      options?.onError?.(message);
    },
  };
  return recorder;
}

async function waitFor(predicate,label){
  for(let index=0;index<100;index++){
    if(predicate())return;
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.fail(`等待条件超时：${label}`);
}

function makeHarness({respond=body=>worldResponse(body),fetchImpl=null,applyAction=null,requestIdFactory=null,autoSpeak=false}={}){
  const state={npcId:'qing',revision:7,actions:['inspect-laundry'],applied:[]};
  const requests=[];
  const lines=[];
  const statuses=[];
  const transcripts=[];
  const activities=[];
  const progress=[];
  const recordingStates=[];
  const clips=[];
  const revoked=[];
  const recorder=createRecorderStub();
  let urlCounter=0;

  const client=createNeighborhoodVoice({
    getContext:()=>({
      npcId:state.npcId,
      name:NPC_NAMES[state.npcId],
      role:'街坊',
      facts:['只知道当前街坊明确提供的事实。'],
      history:[],
      allowedActions:state.actions.map(id=>({id,label:id==='inspect-laundry'?'查看衣物':id})),
    }),
    getRevision:()=>state.revision,
    applyAction:id=>{
      state.applied.push(id);
      return applyAction?applyAction(id,state):{ok:true,text:'规则字幕',meaning:'规则释义'};
    },
    onLine:line=>lines.push({...line}),
    onStatus:status=>statuses.push({...status}),
    onProgress:item=>progress.push({...item}),
    onTranscript:text=>transcripts.push(text),
    onActivity:detail=>activities.push({...detail}),
    onRecording:value=>recordingStates.push(value),
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);
      const entry={url,body,options};
      requests.push(entry);
      if(fetchImpl)return fetchImpl(url,options,body,entry);
      if(url==='/api/world/interpret')return json(await respond(body));
      if(url==='/api/voice/transcribe')return json({text:'识别文字'});
      if(url==='/api/voice/speak')return json({audioBase64:AUDIO_BASE64,mimeType:'audio/mpeg'});
      throw Error(`未处理的替身请求：${url}`);
    },
    recorderFactory:callback=>recorder.attach(callback),
    resolveUrl:path=>path,
    eventTarget:null,
    autoSpeak,
    requestIdFactory:requestIdFactory||(({generation,npcId})=>`req-${npcId}-${generation}`),
    createObjectURL:()=>`blob:test-${++urlCounter}`,
    revokeObjectURL:url=>revoked.push(url),
    audioFactory:url=>{
      const clip={
        url,
        playbackRate:1,
        played:0,
        paused:0,
        play:async()=>{clip.played++;},
        pause:()=>{clip.paused++;},
      };
      clips.push(clip);
      return clip;
    },
  });

  return {client,state,requests,lines,statuses,transcripts,activities,progress,recordingStates,recorder,clips,revoked};
}

function worldRequests(harness){return harness.requests.filter(entry=>entry.url==='/api/world/interpret');}

// 有效 execute 只能经过规则入口一次，字幕必须来自规则而不是模型成功话术。
{
  const h=makeHarness({respond:request=>worldResponse(request,{
    decision:'execute',actionId:'inspect-laundry',reply:'模型声称已经完成',meaning:'模型成功释义',
  })});
  const result=await h.client.submitText('请帮我查看衣物');
  assert.equal(result.ok,true);
  assert.deepEqual(h.state.applied,['inspect-laundry']);
  assert.deepEqual(h.lines,[{text:'规则字幕',meaning:'规则释义'}]);
  assert.equal(h.lines[0].text.includes('模型声称'),false);
  assert.equal(h.client.busy,false);
  assert.equal(worldRequests(h).length,1);
  const request=worldRequests(h)[0].body;
  assert.equal(request.version,1);
  assert.equal(request.text,'请帮我查看衣物');
  assert.equal(request.requestId,'req-qing-1');
  assert.equal(request.generation,1);
  assert.equal(request.revision,7);
  assert.equal(request.context.npcId,'qing');
  assert.deepEqual(request.context.allowedActions,[{id:'inspect-laundry',label:'查看衣物'}]);
  assert.equal(request.context.history.length,0);
}

// 规则拒绝或抛错时不能显示模型声称的成功，也不能留下 busy。
{
  const h=makeHarness({
    respond:request=>worldResponse(request,{decision:'execute',actionId:'inspect-laundry',reply:'已完成交付',meaning:'已完成交付'}),
    applyAction:()=>({ok:false,text:'当前规则拒绝'}),
  });
  const result=await h.client.submitText('请执行');
  assert.equal(result.ok,false);
  assert.equal(result.error,'rule_failed');
  assert.deepEqual(h.state.applied,['inspect-laundry']);
  assert.deepEqual(h.lines,[]);
  assert.equal(h.client.busy,false);
  assert.equal(h.statuses.at(-1).state,'error');
  assert.equal(h.statuses.at(-1).message,'当前规则拒绝');
}

// 模型提出不在当前 allowedActions 中的动作时必须安全拒绝。
{
  const h=makeHarness({respond:request=>worldResponse(request,{
    decision:'execute',actionId:'not-allowed',reply:'越权成功',meaning:'越权成功',
  })});
  const result=await h.client.submitText('尝试越权');
  assert.equal(result.ok,false);
  assert.equal(result.error,'invalid_response');
  assert.deepEqual(h.state.applied,[]);
  assert.deepEqual(h.lines,[]);
  assert.equal(h.client.busy,false);
}

// 帮助请求强制 allowedActions=[]，即使模型返回 execute 也不能调用规则。
{
  const h=makeHarness({respond:request=>worldResponse(request,{
    decision:'execute',actionId:'inspect-laundry',reply:'帮助中也不应执行',meaning:'帮助中也不应执行',
  })});
  const result=await h.client.help('这句点讲？');
  assert.equal(result.ok,false);
  assert.equal(result.error,'invalid_response');
  assert.deepEqual(worldRequests(h)[0].body.context.allowedActions,[]);
  assert.deepEqual(h.state.applied,[]);
  assert.deepEqual(h.lines,[]);
  assert.equal(h.client.busy,false);
}

// reply 纯聊天只产生文字，不调用 applyAction，也不推进外部 revision。
{
  const h=makeHarness({respond:request=>worldResponse(request,{
    decision:'reply',reply:'我唔清楚。',meaning:'我不清楚。',
  })});
  const before=h.state.revision;
  const result=await h.client.submitText('你知道什么？');
  assert.equal(result.ok,true);
  assert.deepEqual(h.state.applied,[]);
  assert.equal(h.state.revision,before);
  assert.deepEqual(h.lines,[{text:'我唔清楚。',meaning:'我不清楚。'}]);
  assert.equal(h.client.getHistory().length,2);
}

// 旧 NPC、旧 revision、cancel、reset 的迟到响应均不得执行动作或显示字幕。
async function checkLateResponse(kind){
  const gate=deferred();
  let captured;
  const h=makeHarness({fetchImpl:(url,options,body)=>{
    if(url!=='/api/world/interpret')throw Error(`意外请求：${url}`);
    captured=body;
    return gate.promise;
  }});
  const pending=h.client.submitText('等待迟到回应');
  await waitFor(()=>worldRequests(h).length===1,`${kind} 请求已发出`);
  if(kind==='npc')h.state.npcId='fang';
  if(kind==='revision')h.state.revision++;
  if(kind==='cancel')h.client.cancel();
  if(kind==='reset')h.client.reset();
  gate.resolve(json(worldResponse(captured,{decision:'execute',actionId:'inspect-laundry'})));
  const result=await pending;
  assert.equal(result.ok,false,kind);
  if(kind==='cancel'||kind==='reset')assert.equal(result.error,'cancelled',kind);
  else assert.equal(result.error,'invalid_response',kind);
  assert.deepEqual(h.state.applied,[],kind);
  assert.deepEqual(h.lines,[],kind);
  assert.equal(h.client.busy,false,kind);
}
await checkLateResponse('npc');
await checkLateResponse('revision');
await checkLateResponse('cancel');
await checkLateResponse('reset');

// ASR 失败必须结束本次尝试，不得继续理解或执行动作。
{
  const h=makeHarness({fetchImpl:(url)=>{
    if(url==='/api/voice/transcribe')return json({error:{message:'识别服务未配置'}},503);
    if(url==='/api/world/interpret')throw Error('ASR 失败后不应请求理解');
    throw Error(`意外请求：${url}`);
  }});
  assert.equal(await h.client.startRecording(),true);
  assert.equal(h.recorder.starts.length,1);
  assert.equal(h.recorder.starts[0].kind,'neighborhood');
  assert.equal(h.recorder.starts[0].options.score,false);
  h.recorder.finish(new Blob(['voice'],{type:'audio/webm;codecs=opus'}));
  await waitFor(()=>!h.client.busy,'ASR 失败释放 busy');
  assert.deepEqual(h.state.applied,[]);
  assert.deepEqual(h.lines,[]);
  assert.deepEqual(h.transcripts,[]);
  assert.equal(worldRequests(h).length,0);
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].body.mimeType,'audio/webm');
  assert.equal(typeof h.requests[0].body.audioBase64,'string');
  assert.equal(h.statuses.at(-1).state,'error');
}

// 成功录音走 score:false 的 ASR→理解链路，识别文本才会进入理解请求。
{
  const h=makeHarness({
    respond:request=>worldResponse(request,{decision:'execute',actionId:'inspect-laundry'}),
    fetchImpl:null,
  });
  // 默认替身 ASR 文本是“识别文字”；这里只验证链路和动作绑定。
  assert.equal(await h.client.startRecording(),true);
  h.recorder.finish(new Blob(['voice'],{type:'audio/webm'}));
  await waitFor(()=>h.lines.length===1,'录音理解和规则字幕');
  assert.deepEqual(h.transcripts,['识别文字']);
  assert.deepEqual(h.state.applied,['inspect-laundry']);
  assert.equal(worldRequests(h).length,1);
  assert.equal(worldRequests(h)[0].body.text,'识别文字');
  assert.equal(h.client.busy,false);
}

// 重听和慢速复用同一次合成。停止播放时撤销对象 URL。
{
  const h=makeHarness({respond:request=>worldResponse(request,{
    decision:'execute',actionId:'inspect-laundry',
  })});
  await h.client.submitText('先取得一句规则回应');
  assert.deepEqual(h.state.applied,['inspect-laundry']);
  assert.equal(await h.client.replay(),true);
  assert.equal(await h.client.replaySlow(),true);
  assert.equal(h.clips.length,2);
  assert.equal(h.clips[0].playbackRate,1);
  assert.equal(h.clips[1].playbackRate,0.78);
  assert.equal(h.clips[0].paused,1);
  assert.equal(h.revoked.length,1);
  assert.equal(worldRequests(h).length,1);
  assert.equal(h.requests.filter(entry=>entry.url==='/api/voice/speak').length,1);
  assert.deepEqual(h.state.applied,['inspect-laundry']);
  assert.equal(h.client.stopAudio(),true);
  assert.equal(h.client.speaking,false);
  assert.equal(h.revoked.length,2);
  assert.equal(h.activities.at(-1).active,false);
}

// 网络异常要映射为失败并释放 busy，不能执行任何动作。
{
  const h=makeHarness({fetchImpl:()=>{throw new TypeError('offline');}});
  const result=await h.client.submitText('网络不可用');
  assert.equal(result.ok,false);
  assert.equal(result.error,'network');
  assert.equal(h.client.busy,false);
  assert.deepEqual(h.state.applied,[]);
  assert.deepEqual(h.lines,[]);
  assert.equal(h.activities.at(-1).active,false);
}

// 历史按 NPC 隔离并限制为六条，导出只含必要文本，不含请求、音频或控制器。
{
  const h=makeHarness();
  for(let index=0;index<4;index++)await h.client.submitText(`qing-${index}`);
  assert.equal(h.client.getHistory().length,6);
  h.state.npcId='fang';
  await h.client.submitText('fang-only');
  const fangRequest=worldRequests(h).at(-1).body;
  assert.deepEqual(fangRequest.context.history,[]);
  assert.equal(h.client.getHistory().length,2);
  h.state.npcId='qing';
  await h.client.submitText('qing-return');
  const qingRequest=worldRequests(h).at(-1).body;
  assert.equal(qingRequest.context.history.length,6);
  assert.equal(qingRequest.context.history.some(turn=>turn.text==='fang-only'),false);
  const exported=h.client.exportHistory();
  assert.equal(exported.version,1);
  assert.deepEqual(exported.npcs.map(item=>item.npcId).sort(),['fang','qing']);
  assert.equal(JSON.stringify(exported).includes('audioBase64'),false);
  assert.equal(JSON.stringify(exported).includes('AbortController'),false);
  assert.equal(JSON.stringify(exported).includes('requestId'),false);
}

// importHistory 成功后可无损导出往返，输入深拷贝且清除旧 lastLine，不发请求或播音。
{
  const source=makeHarness();
  await source.client.submitText('qing-save');
  source.state.npcId='fang';
  await source.client.submitText('fang-save');
  const saved=source.client.exportHistory();
  const snapshot=JSON.parse(JSON.stringify(saved));
  const h=makeHarness();
  await h.client.submitText('destination-old');
  const requestCount=h.requests.length;
  assert.deepEqual(h.client.importHistory(saved),{ok:true});
  assert.deepEqual(h.client.exportHistory(),snapshot);
  assert.equal(h.requests.length,requestCount);
  assert.deepEqual(h.state.applied,[]);
  assert.equal(h.clips.length,0);
  assert.equal(await h.client.replay(),false);
  assert.equal(h.requests.length,requestCount);
  saved.npcs.find(entry=>entry.npcId==='qing').history[0].text='外部改动';
  assert.deepEqual(h.client.exportHistory(),snapshot);
}

// 任一格式、原型、字段或内容错误都不得部分替换原历史，也不得发新请求。
{
  const h=makeHarness();
  await h.client.submitText('保留原历史');
  const before=h.client.exportHistory();
  const requestCount=h.requests.length;
  const valid=()=>({version:1,npcs:[{npcId:'qing',history:[{speaker:'player',text:'有效句'}]}]});
  const withTurn=turn=>{const value=valid();value.npcs[0].history=[turn];return value;};
  const seven=valid();seven.npcs[0].history=Array.from({length:7},()=>({speaker:'npc',text:'句'}));
  const sparse=valid();sparse.npcs[0].history=Array(1);
  const arrayExtra=valid();arrayExtra.npcs.extra=true;
  const custom=valid();custom.npcs[0]=Object.assign(Object.create({inherited:true}),{npcId:'qing',history:[]});
  const customArray=valid();Object.setPrototypeOf(customArray.npcs,{});
  const polluted=valid();Object.defineProperty(polluted,'__proto__',{value:{polluted:true},enumerable:true});
  const constructorKey=valid();constructorKey.npcs[0].constructor='bad';
  const partiallyValid={version:1,npcs:[
    {npcId:'fang',history:[{speaker:'npc',text:'新历史'}]},
    {npcId:'qing',history:[{speaker:'system',text:'坏历史'}]},
  ]};
  const invalidValues=[
    null,[],{...valid(),version:2},{...valid(),extra:true},{version:1},
    {version:1,npcs:[{npcId:'stranger',history:[]}]},
    {version:1,npcs:[{npcId:'qing',history:[]},{npcId:'qing',history:[]}]},
    seven,sparse,arrayExtra,custom,customArray,polluted,constructorKey,partiallyValid,
    withTurn({speaker:'system',text:'非法角色'}),
    withTurn({speaker:'npc',text:''}),
    withTurn({speaker:'npc',text:' '}),
    withTurn({speaker:'npc',text:'长'.repeat(301)}),
    withTurn({speaker:'npc',text:42}),
    withTurn({speaker:'npc',text:'句',extra:true}),
  ];
  for(const value of invalidValues){
    assert.deepEqual(h.client.importHistory(value),{ok:false,error:'invalid_history'});
    assert.deepEqual(h.client.exportHistory(),before);
    assert.equal(h.requests.length,requestCount);
  }
  assert.deepEqual(h.state.applied,[]);
  assert.equal({}.polluted,undefined);
}

// 恢复数据严格按 NPC 隔离，后续理解请求不会带入其他 NPC 的历史。
{
  const h=makeHarness();
  const qingHistory=[{speaker:'player',text:'只给阿晴'}];
  const fangHistory=[{speaker:'npc',text:'只给阿芳'}];
  assert.deepEqual(h.client.importHistory({version:1,npcs:[
    {npcId:'qing',history:qingHistory},
    {npcId:'fang',history:fangHistory},
  ]}),{ok:true});
  assert.deepEqual(h.client.getHistory(),qingHistory);
  h.state.npcId='fang';
  assert.deepEqual(h.client.getHistory(),fangHistory);
  h.state.npcId='qing';
  await h.client.submitText('恢复后新句');
  const request=worldRequests(h).at(-1).body;
  assert.deepEqual(request.context.history,qingHistory);
  assert.equal(request.context.history.some(turn=>turn.text==='只给阿芳'),false);
}

// 恢复会取消在途理解；迟到 execute 不得执行、显示或覆盖刚恢复的历史。
{
  const gate=deferred();
  let captured;
  const h=makeHarness({fetchImpl:(url,options,body)=>{
    if(url!=='/api/world/interpret')throw Error(`意外请求：${url}`);
    captured=body;
    return gate.promise;
  }});
  const pending=h.client.submitText('等待恢复前的迟到回应');
  await waitFor(()=>worldRequests(h).length===1,'恢复前请求已发出');
  const restored={version:1,npcs:[{npcId:'qing',history:[{speaker:'npc',text:'恢复句'}]}]};
  const requestCount=h.requests.length;
  assert.deepEqual(h.client.importHistory(restored),{ok:true});
  assert.equal(h.client.busy,false);
  assert.equal(h.requests.length,requestCount);
  gate.resolve(json(worldResponse(captured,{
    decision:'execute',actionId:'inspect-laundry',reply:'迟到成功',meaning:'迟到成功',
  })));
  const result=await pending;
  assert.equal(result.ok,false);
  assert.equal(result.error,'cancelled');
  assert.deepEqual(h.state.applied,[]);
  assert.deepEqual(h.lines,[]);
  assert.deepEqual(h.client.exportHistory(),restored);
}

console.log('PASS world client: bound responses, rule-only execution, cancellation, ASR/TTS isolation and strict history import');
