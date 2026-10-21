import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {match,normalize,collect,makeWorker,parseLocalFeed,lookupContacts,extractContacts,careerLevel,validateContactUrl,industryTags} from '../server.mjs';
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url)));
const job=normalize({title:'Junior Data Analyst',company:'Example',url:'https://example.com/jobs/1',location:'Lagos, Nigeria',description:'Python SQL Excel. 1 years experience',remote:false,eligibility:'yes'});
test('matches junior roles and profile skills, excludes senior and foreign local jobs',()=>{
 const result=match(job,config);assert.ok(result.score>60);assert.ok(result.tracks.includes('Data Analysis'));assert.ok(result.skills.includes('Python'));
 assert.equal(match({...job,title:'Senior Data Analyst'},config),null);assert.equal(match({...job,location:'London'},config),null);assert.equal(match({...job,url:''},config),null);
});
test('rejects unsafe application links and strips markup',()=>{assert.equal(normalize({...job,url:'javascript:alert(1)'}).url,'');assert.equal(normalize({...job,title:'<b>Junior</b> analyst'}).title,'Junior analyst')});
test('aggregates real API shapes, deduplicates, filters restrictions, survives partial source failure',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{if(url.includes('myjobmag'))return new Response('<rss><channel></channel></rss>');if(url.includes('himalayas'))return Response.json({jobs:[{title:'Junior Data Analyst',companyName:'Example',applicationLink:job.url,locationRestrictions:['Nigeria'],description:'SQL',timezoneRestrictions:[]},{title:'Junior Data Analyst',applicationLink:'https://example.com/us',locationRestrictions:['US']}]});if(url.includes('jobicy'))throw Error('Source offline');return Response.json({jobs:[{title:'Junior Data Analyst',company_name:'Example',url:job.url,candidate_required_location:'Worldwide'},{title:'Junior Data Analyst',url:'https://example.com/us2',candidate_required_location:'USA'}]})};
 try{const d=await collect({...config,boards:{greenhouse:[],lever:[]}});assert.equal(d.jobs.length,1);assert.equal(d.sources.filter(s=>!s.ok).length,1);assert.equal(d.localBoardsConfigured,true)}finally{globalThis.fetch=original}
});
test('worker serves HTML and configuration with correct security headers and rejects writes',async()=>{
 const w=makeWorker('<h1>Jobs</h1>',config);const r=await w.fetch(new Request('https://example.com/'));assert.equal(r.status,200);assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal(await r.text(),'<h1>Jobs</h1>');assert.equal((await w.fetch(new Request('https://example.com/missing'))).status,404);assert.equal((await w.fetch(new Request('https://example.com/api/jobs',{method:'POST'}))).status,405);assert.ok((await(await w.fetch(new Request('https://example.com/api/config'))).json()).tracks.length>5)
});
test('client script parses without syntax errors',async()=>{const page=await readFile(new URL('../page.html',import.meta.url),'utf8');new Function(page.match(/<script>([\s\S]*?)<\/script>/)[1])});

test('local RSS maps real fields, arrangements, contacts and expiry',async()=>{
 const xml=await readFile(new URL('../../tests/fixtures/local_jobs.xml',import.meta.url),'utf8');const rows=parseLocalFeed(xml);
 assert.equal(rows.length,4);assert.deepEqual(rows.map(j=>j.workMode),['On-site','Hybrid','Remote','Unspecified']);
 assert.equal(normalize(rows[0]).contacts[0].email,'careers@example.test');assert.equal(careerLevel(rows[1]),'Internship');
 for(const [title,track] of [['Associate Back-End Engineer','Backend Engineering'],['Full-Stack Intern','Full Stack Engineering']])assert.ok(match(normalize({...job,title}),config).tracks.includes(track));
 assert.equal(match(normalize({...job,title:'Head, Software Engineering'}),config),null);
 assert.equal(match(normalize({...job,description:'Minimum 5 years experience'}),config),null);
 assert.equal(match(normalize({...job,remote:true,location:'Remote, Spain',eligibility:'unknown'}),config),null);
 assert.throws(()=>parseLocalFeed('<html>unavailable</html>'));
});
test('contact extraction retains evidence, rejects unrelated addresses and hidden scripts',()=>{
 const rows=extractContacts('<script>apply fake@example.test</script><h2>How to apply</h2>Send your CV to jobs@example.test <h2>Related jobs</h2>other@example.test','https://www.myjobmag.com/job/a');
 assert.equal(rows.length,1);assert.equal(rows[0].email,'jobs@example.test');assert.ok(rows[0].evidence);assert.match(rows[0].kind,/unverified/);
 assert.equal(extractContacts('Sales: sales@example.test','https://example.com').length,0);
 assert.equal(extractContacts('<h2>How to apply</h2><a href="mailto:careers%40example.test?subject=CV">Apply here</a>','https://example.com')[0].email,'careers@example.test');
});
test('contact lookup blocks unsupported hosts and redirects and rejects identity mismatches',async()=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response('',{status:302,headers:{Location:'https://127.0.0.1/private'}})};
 try{assert.throws(()=>validateContactUrl('https://127.0.0.1'));await assert.rejects(()=>lookupContacts('https://www.myjobmag.com/job/redirect','Junior Engineer','Example'));assert.equal(count,1);
 globalThis.fetch=async()=>new Response('<title>Junior Engineer at Other Company</title><h2>How to apply</h2>Send CV to jobs@example.test',{headers:{'Content-Type':'text/html'}});
 await assert.rejects(()=>lookupContacts('https://www.myjobmag.com/job/identity','Junior Engineer','Example'),/title or company/);
 globalThis.fetch=async()=>new Response('<title>Junior Engineer at Example</title><h2>How to apply</h2>Send CV to jobs@example.test',{headers:{'Content-Type':'text/html'}});
 const rows=await lookupContacts('https://www.myjobmag.com/job/valid','Junior Engineer','Example');assert.equal(rows[0].email,'jobs@example.test');assert.equal(rows[0].source_url,'https://www.myjobmag.com/job/valid');
 }finally{globalThis.fetch=original}
});
test('contact API validates input, config exposes new roles and filters',async()=>{
 const worker=makeWorker('Page',config);assert.equal((await worker.fetch(new Request('https://example.com/api/contacts'))).status,400);
 const d=await(await worker.fetch(new Request('https://example.com/api/config'))).json();assert.ok(d.tracks.includes('Backend Engineering'));assert.ok(d.tracks.includes('Full Stack Engineering'));assert.ok(d.levels.includes('Associate'));assert.ok(d.workModes.includes('On-site'));
});

test('new support tracks and industry clues work without confusing benefits or loan LMS roles',async()=>{
 for(const [title,track] of [['Junior Website Administrator','Website Administration'],['Product Support Associate','Product Support'],['EdTech Support Assistant','EdTech Support']])assert.ok(match(normalize({...job,title}),config).tracks.includes(track));
 assert.ok(industryTags({...job,title:'Website Administrator',description:'We operate a clinic.'},config).includes('Healthcare & HealthTech'));
 assert.deepEqual(industryTags({...job,title:'Product Support',description:'Benefits: health insurance and pension scheme. University degree.'},config),[]);
 assert.ok(!match(normalize({...job,title:'LMS Support Associate',description:'Support our loan management platform'}),config));
 const w=makeWorker('Page',config),d=await(await w.fetch(new Request('https://example.com/api/config'))).json();assert.equal(Object.keys(d.industries).length,9);assert.ok(d.tracks.includes('Product Support'));
});
