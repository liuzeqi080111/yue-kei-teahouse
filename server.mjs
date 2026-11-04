import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createBailian} from './server/bailian.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
try{process.loadEnvFile(path.join(root,'.env'));}catch{/* 缺文件或其他读取问题均忽略；不读取、不输出任何凭证内容 */}

const allowed=new Set(['index.html','style.css','app.js','scene.js','controller.js','voice.js','voice-bridge.js','voice.css','ambient.js','npc-speech.js','music.js','voice-capture.js']);
const mime={'.wav':'audio/wav','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const MAX_BODY=3*1024*1024,MAX_CONCURRENCY=2,RATE_PER_MINUTE=30;
const HTTP_BY_CODE={INVALID_INPUT:400,INVALID_JSON:400,UNSUPPORTED_MEDIA_TYPE:415,PAYLOAD_TOO_LARGE:413,AUDIO_TOO_LARGE:413,ASR_EMPTY:422,PROVIDER_UNCONFIGURED:503,UPSTREAM_TIMEOUT:504,UPSTREAM_ERROR:502,UPSTREAM_STATUS:502,INVALID_MODEL_JSON:502,UNTRUSTED_AUDIO_URL:502,RATE_LIMITED:429};

const sendJson=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
const failJson=(res,status,code,message)=>sendJson(res,status,{ok:false,error:{code,message}});
const httpError=(status,code,message)=>Object.assign(new Error(message),{status,code});

/** Host 仅允许 localhost/127.0.0.1（可带有效端口）。 */
function localHost(host){
  if(typeof host!=='string')return false;
  const m=/^(localhost|127\.0\.0\.1)(?::(\d{1,5}))?$/.exec(host.trim());
  if(!m)return false;
  if(m[2]!==undefined){const p=Number(m[2]);if(p<1||p>65535)return false;}
  return true;
}

/** POST 必须 application/json；流式累计超 3MB 抛 413；非法 JSON 抛 400。 */
async function readJsonBody(req){
  const type=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(type!=='application/json')throw httpError(415,'UNSUPPORTED_MEDIA_TYPE','Content-Type 必須是 application/json');
  const chunks=[];let total=0;
  await new Promise((resolve,reject)=>{
    let over=false;
    req.on('data',chunk=>{
      if(over)return;
      total+=chunk.length;
      if(total>MAX_BODY){over=true;chunks.length=0;reject(httpError(413,'PAYLOAD_TOO_LARGE','請求體超過 3MB 上限'));return;}
      chunks.push(chunk);
    });
    req.on('end',resolve);req.on('error',reject);
    req.on('aborted',()=>reject(httpError(400,'INVALID_JSON','請求已取消')));
  });
  const text=Buffer.concat(chunks).toString('utf8').trim();
  if(!text)throw httpError(400,'INVALID_JSON','請求體不是合法 JSON');
  try{return JSON.parse(text);}catch{throw httpError(400,'INVALID_JSON','請求體不是合法 JSON');}
}

/** 静态白名单保持不变；server 目录、md/json/.env 永不可达。GET/HEAD 之外 405，HEAD 不返回 body。 */
async function handleStatic(req,res,pathname){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return failJson(res,405,'METHOD_NOT_ALLOWED','方法不允許');}
  try{
    const name=decodeURIComponent(pathname).replace(/^\/+/, '')||'index.html';
    if(!allowed.has(name)&&!/^assets\/[a-zA-Z0-9_-]+\.(png|svg|wav)$/.test(name)&&!/^teahouse-scene\/(index|session|menu)\.js$/.test(name)){res.writeHead(404);return res.end('Not found');}
    const data=await readFile(path.join(root,name));
    res.writeHead(200,{'Content-Type':mime[path.extname(name)],'Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
}

export function createServer({provider=createBailian()}={}){
  let active=0;const stamps=[];
  const rateOk=()=>{const now=Date.now();while(stamps.length&&now-stamps[0]>60000)stamps.shift();if(stamps.length>=RATE_PER_MINUTE)return false;stamps.push(now);return true;};

  async function handleApi(req,res,pathname){
    const routes={
      '/api/voice/status':{method:'GET',call:()=>provider.status()},
      '/api/voice/transcribe':{method:'POST',call:(body)=>provider.transcribe(body)},
      '/api/voice/interpret':{method:'POST',call:(body)=>provider.interpret(body)},
      '/api/voice/speak':{method:'POST',call:(body)=>provider.speak(body)},
    };
    const route=routes[pathname];
    if(!route)return failJson(res,404,'NOT_FOUND','Not found');
    if(req.method!==route.method){res.setHeader('Allow',route.method);return failJson(res,405,'METHOD_NOT_ALLOWED','方法不允許');}
    if(!rateOk()||active>=MAX_CONCURRENCY)return failJson(res,429,'RATE_LIMITED','請求過於頻繁或服務繁忙，請稍後再試');
    active++;
    try{
      const body=route.method==='POST'?await readJsonBody(req):undefined;
      const result=await route.call(body);
      sendJson(res,200,result);
    }catch(e){
      // 仅透传已知安全 code/message；不输出上游原文、堆栈或请求头
      if(typeof e?.code==='string'&&Object.hasOwn(HTTP_BY_CODE,e.code))return failJson(res,HTTP_BY_CODE[e.code],e.code,({ASR_EMPTY:'未聽清楚，請靠近咪高峰再講一次。',UPSTREAM_TIMEOUT:'語音服務逾時，請稍後重試。',RATE_LIMITED:'語音服務繁忙，請稍後重試。',PROVIDER_UNCONFIGURED:'語音服務未配置。'}[e.code]||'請求未完成，請檢查輸入或稍後重試。'));
      failJson(res,500,'INTERNAL_ERROR','服務內部錯誤');
    }finally{active--;}
  }

  return http.createServer(async(req,res)=>{
    try{
      if(!localHost(req.headers.host))return failJson(res,403,'FORBIDDEN_HOST','僅允許本機 Host');
      const origin=req.headers.origin;
      if(origin!==undefined){ // 无 CORS：Origin 必须与本服务 Host 完全一致，否则拒绝
        if(origin!==`http://${req.headers.host}`)return failJson(res,403,'FORBIDDEN_ORIGIN','Origin 與本服務 Host 不符');
      }
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname.startsWith('/api/'))return await handleApi(req,res,pathname);
      return await handleStatic(req,res,pathname);
    }catch{
      if(!res.headersSent)failJson(res,500,'INTERNAL_ERROR','服務內部錯誤');else res.end();
    }
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createServer();
  server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
}
