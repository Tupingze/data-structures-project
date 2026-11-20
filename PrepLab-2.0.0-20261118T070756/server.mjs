import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApiHandler} from './server/api.mjs';

const project=dirname(fileURLToPath(import.meta.url));
if(existsSync(resolve(project,'.env')))process.loadEnvFile(resolve(project,'.env'));
const host=process.env.HOST||'127.0.0.1';
const port=Number(process.env.PORT||4173);
if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.APP_ACCESS_TOKEN){console.error('對外監聽時必須設定 APP_ACCESS_TOKEN；本機使用請保留 HOST=127.0.0.1。');process.exit(1);}
const root=resolve(project,'dist');
// The portable server never trusts platform headers or a platform-only flag.
const api=createApiHandler({env:{...process.env,TRUST_SITES_GATE:'false'}});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{
  const authority=req.headers.host||`127.0.0.1:${port}`;
  const url=new URL(req.url,`http://${authority}`);
  if(url.pathname.startsWith('/api/')){
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'BODY_TOO_LARGE',message:'資料量超過限制。'}}));return;}chunks.push(chunk);}
    const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const response=await api(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  const relative=path.slice(root.length+1).replaceAll('\\','/');
  if(!path.startsWith(root+sep)||relative.split('/').some(s=>s.startsWith('.'))||relative.startsWith('server/')){res.writeHead(403);res.end('Forbidden');return;}
  const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:data);
}catch{res.writeHead(404);res.end('Not found');}});
server.listen(port,host,()=>console.log(`Local: http://${host.includes(':')?'['+host+']':host}:${port}\nAI: ${process.env.OPENAI_API_KEY?'configured (not yet verified)':'not configured; demo available'}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
