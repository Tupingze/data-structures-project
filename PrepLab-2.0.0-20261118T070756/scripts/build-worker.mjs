import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const assets={};
for(const name of (await readdir(resolve(root,'dist'))).sort()) {
  const extension=name.slice(name.lastIndexOf('.'));if(!types[extension])continue;
  assets['/'+name]={body:await readFile(resolve(root,'dist',name),'utf8'),type:types[extension]};
}
const source=await readFile(resolve(root,'server/api.mjs'),'utf8');
if(/^import\s/m.test(source))throw Error('Worker builder requires dependency-free server/api.mjs; update builder if dependencies are added.');
const entry=source+`\nconst STATIC_ASSETS=${JSON.stringify(assets)};\nlet api;\nexport default {async fetch(request,env){const u=new URL(request.url);if(u.pathname.startsWith('/api/')){api??=createApiHandler({env:{...env,TRUST_SITES_GATE:'true'}});return api(request);}if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const a=STATIC_ASSETS[u.pathname==='/'?'/index.html':u.pathname];if(!a)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:a.body,{headers:{'Content-Type':a.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});}};\n`;
await mkdir(resolve(root,'dist/server'),{recursive:true});await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await writeFile(resolve(root,'dist/server/index.js'),entry);
await writeFile(resolve(root,'dist/.openai/hosting.json'),await readFile(resolve(root,'.openai/hosting.json')));
console.log('Built portable Sites Worker with embedded frontend assets.');
