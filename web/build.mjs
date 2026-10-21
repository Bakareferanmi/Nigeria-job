import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const [page,config,server]=await Promise.all(['page.html','config.json','server.mjs'].map(p=>readFile(new URL(p,root),'utf8')));
await mkdir(new URL('worker/',root),{recursive:true});
await writeFile(new URL('worker/index.js',root),server+'\nconst page='+JSON.stringify(page)+';\nconst config='+config+';\nexport default makeWorker(page,config);\n');
console.log('Built web/worker/index.js');
