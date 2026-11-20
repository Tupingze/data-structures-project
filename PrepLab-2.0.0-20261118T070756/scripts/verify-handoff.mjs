import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||'.');
const m=JSON.parse(await readFile(resolve(root,'HANDOFF-MANIFEST.json'),'utf8'));
for(const file of m.files){const path=resolve(root,file.path);if(!path.startsWith(root+sep))throw Error('Invalid manifest path');const b=await readFile(path);if(b.length!==file.bytes||createHash('sha256').update(b).digest('hex')!==file.sha256)throw Error('Changed or damaged: '+file.path);}
console.log(`Verified ${m.files.length} handoff files.`);
