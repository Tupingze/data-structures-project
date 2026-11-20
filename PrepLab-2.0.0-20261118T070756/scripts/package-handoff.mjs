import {readFile,writeFile,mkdir,readdir,copyFile,stat} from 'node:fs/promises';
import {resolve,join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'releases');
const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15),name='PrepLab-2.0.0-'+stamp;
const target=join(out,name);await mkdir(target,{recursive:true});
// Explicit allowlist: no .env, .git, platform identity, personal runtime data, or work/.
const roots=['dist','server','server.mjs','scripts','tests','docs','README.md','package.json','package-lock.json','.env.example','.gitignore','.dockerignore','Dockerfile','compose.yaml','start-windows.cmd','CHANGELOG.md'];
const hashes=[];
async function copy(source,dest){const st=await stat(source);if(st.isDirectory()){await mkdir(dest,{recursive:true});for(const n of (await readdir(source)).sort()){if(['.openai','server'].includes(n)&&relative(root,source)==='dist')continue;await copy(join(source,n),join(dest,n));}}else{const data=await readFile(source);if(['.js','.mjs','.md','.json','.example','.yaml','.cmd'].includes(extname(source))&&/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/.test(data.toString()))throw Error('Possible credential in packaged file: '+relative(root,source));await mkdir(resolve(dest,'..'),{recursive:true});await copyFile(source,dest);hashes.push({path:relative(target,dest).replaceAll('\\','/'),sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});}}
for(const item of roots){try{await stat(join(root,item));}catch{continue;}await copy(join(root,item),join(target,item));}
await writeFile(join(target,'HANDOFF-MANIFEST.json'),JSON.stringify({app:'PrepLab',version:'2.0.0',createdAt:new Date().toISOString(),excludes:['credentials','personal browser data','existing Sites account identity'],files:hashes},null,2));
const archive=join(out,name+'.zip');execFileSync('tar',['-a','-cf',archive,'-C',out,name],{stdio:'pipe'});
await writeFile(join(out,'latest.json'),JSON.stringify({directory:target,archive},null,2));console.log(JSON.stringify({directory:target,archive,files:hashes.length}));
