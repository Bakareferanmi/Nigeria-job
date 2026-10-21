import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {match,normalize,collect,makeWorker} from '../server.mjs';
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
const job=normalize({title:'Junior Data Analyst',company:'Example',url:'https://example.com/jobs/1',location:'Lagos, Nigeria',description:'Python SQL Excel. 1 years experience',remote:false,eligibility:'yes'});
test('matches junior roles and profile skills, excludes senior and foreign local jobs',()=>{
 const result=match(job,config);assert.ok(result.score>60);assert.ok(result.tracks.includes('Data Analysis'));assert.ok(result.skills.includes('Python'));
 assert.equal(match({...job,title:'Senior Data Analyst'},config),null);assert.equal(match({...job,location:'London'},config),null);assert.equal(match({...job,url:''},config),null);
});
test('rejects unsafe application links and strips markup',()=>{assert.equal(normalize({...job,url:'javascript:alert(1)'}).url,'');assert.equal(normalize({...job,title:'<b>Junior</b> analyst'}).title,'Junior analyst')});
test('aggregates real API shapes, deduplicates, filters restrictions, survives partial source failure',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{if(url.includes('himalayas'))return Response.json({jobs:[{title:'Junior Data Analyst',companyName:'Example',applicationLink:job.url,locationRestrictions:['Nigeria'],description:'SQL',timezoneRestrictions:[]},{title:'Junior Data Analyst',applicationLink:'https://example.com/us',locationRestrictions:['US']}]});if(url.includes('jobicy'))throw Error('Source offline');return Response.json({jobs:[{title:'Junior Data Analyst',company_name:'Example',url:job.url,candidate_required_location:'Worldwide'},{title:'Junior Data Analyst',url:'https://example.com/us2',candidate_required_location:'USA'}]})};
 try{const d=await collect(config);assert.equal(d.jobs.length,1);assert.equal(d.sources.filter(s=>!s.ok).length,1);assert.equal(d.localBoardsConfigured,false)}finally{globalThis.fetch=original}
});
test('worker serves HTML and configuration with correct security headers and rejects writes',async()=>{
 const w=makeWorker('<h1>Jobs</h1>',config);const r=await w.fetch(new Request('https://example.com/'));assert.equal(r.status,200);assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal(await r.text(),'<h1>Jobs</h1>');assert.equal((await w.fetch(new Request('https://example.com/missing'))).status,404);assert.equal((await w.fetch(new Request('https://example.com/api/jobs',{method:'POST'}))).status,405);assert.ok((await(await w.fetch(new Request('https://example.com/api/config'))).json()).tracks.length>5)
});
test('client script parses without syntax errors',async()=>{const page=await readFile(new URL('../page.html',import.meta.url),'utf8');new Function(page.match(/<script>([\s\S]*?)<\/script>/)[1])});
