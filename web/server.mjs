// Public job APIs only. No arbitrary URL proxy, credentials, or application submission.
const ENTRY=/\b(intern(ship)?|trainee|graduate|entry[- ]level|junior|associate|assistant|apprentice|nysc)\b/i;
const SENIOR=/\b(senior|principal|staff engineer|lead engineer|director|head of|vice president|chief|manager|architect)\b/i;
export const decode=v=>String(v||'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):''}).replace(/&(nbsp|amp|quot|apos|lt|gt|rsquo|lsquo|ndash|mdash);/g,(_,n)=>({nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',rsquo:"'",lsquo:"'",ndash:'–',mdash:'—'}[n]));
export const clean=v=>decode(String(v||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const quoteRE=v=>String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const inNigeria=(value,config)=>config.nigeriaTerms.some(term=>new RegExp('(?<!\\w)'+quoteRE(term)+'(?!\\w)','i').test(value||''));
export function careerLevel(j){
 if(/\b(senior|sr|principal|staff|lead|director|head|vice president|chief|architect)\b/i.test(j.title))return 'Senior';
 if(SENIOR.test(j.title)&&!ENTRY.test(j.title))return 'Senior';
 const text=j.title+' '+(j.level||'');
 for(const [name,re] of [['Internship',/\b(intern(ship)?|nysc|siwes)\b/i],['Graduate',/\b(graduate|trainee|apprentice)\b/i],['Junior',/\b(junior|jr|entry[- ]level|assistant)\b/i],['Associate',/\bassociate\b/i]])if(re.test(text))return name;
 return /senior|mid[- ]?level|intermediate|expert|executive/i.test(j.level||'')?'Senior':'Unspecified';
}
export function workMode(text){return /\bhybrid\b/i.test(text)?'Hybrid':/\bremote(?:ly)?\b/i.test(text)?'Remote':/\bon[- ]?site\b/i.test(text)?'On-site':'Unspecified'}
export const LEVELS=['Early career','Junior','Associate','Internship','Graduate','Unspecified'];
export const MODES=['All','On-site','Hybrid','Remote','Unspecified'];

export const safeUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}};
export function normalize(j){return {...j,title:clean(j.title),company:clean(j.company)||'Unspecified',url:safeUrl(j.url),location:clean(j.location),description:clean(j.description).slice(0,12000),salary:clean(j.salary),published:String(j.published||''),workMode:j.workMode||(j.remote?'Remote':workMode(j.location||'')),careerLevel:careerLevel(j),contacts:extractContacts(j.description||'',safeUrl(j.url))};}
export function match(j,config){
 if(!j.title||!j.url||careerLevel(j)==='Senior')return null;
 if(!j.remote&&!inNigeria(j.location,config))return null;
 if(j.remote&&!(j.eligibility==='yes'||j.eligibility==='likely'||inNigeria(j.location,config)||/\b(worldwide|anywhere|global)\b/i.test(j.location)))return null;
 const tracks=Object.entries(config.tracks).filter(([,words])=>words.some(w=>j.title.toLowerCase().includes(w))).map(([t])=>t);
 if(!tracks.length)return null;
 const text=(j.title+' '+j.description).toLowerCase();
 const skills=config.skills.filter(s=>new RegExp('(?<!\\w)'+s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?!\\w)').test(text));
 const years=[...j.description.slice(0,3500).matchAll(/\b([1-9]\d?)\s*(?:\+|plus)?\s*(?:years|yrs)\b/gi)].map(m=>+m[1]);
 if(years.length&&Math.min(...years)>=4)return null;
 let score=35+Math.min(15,tracks.length*5)+(ENTRY.test(j.title)?22:0)-(SENIOR.test(j.title)?35:0)+Math.min(15,skills.length*3)+(j.eligibility==='yes'?8:0)+(/lagos/i.test(j.location)?5:0);
 if(years.length)score+=Math.min(...years)>=4?-20:Math.min(...years)<=2?8:0;
 return {...j,tracks,skills,score:Math.max(0,Math.min(100,score))};
}
async function json(url){const r=await fetch(url,{headers:{'User-Agent':'NigeriaJobHunter/2.0','Accept':'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
const salary=j=>j.salary||((j.salaryMin||j.salaryMax||j.minSalary||j.maxSalary)?[j.salaryCurrency||j.currency||'',j.salaryMin||j.minSalary||'',j.salaryMax||j.maxSalary?'– '+(j.salaryMax||j.maxSalary):''].join(' '):'');
export async function collect(config){
 const sources=[
 ['MyJobMag',async()=>parseLocalFeed(await publicText('https://www.myjobmag.com/feeds/ng/jobsxml_by_categories.xml',5000000))],
 ['Himalayas',async()=>{const d=await json('https://himalayas.app/jobs/api/search?country=NG&sort=recent&page=1');return(d.jobs||[]).filter(j=>{const loc=j.locationRestrictions||[];const tz=j.timezoneRestrictions||[];return(!loc.length||loc.some(c=>/^(ng|nigeria)$/i.test(typeof c==='string'?c:c.alpha2||c.code||c.name||'')))&&(!tz.length||tz.some(t=>['1','+1','utc+1','utc+01','utc+01:00','+01:00','gmt+1'].includes(String(t).toLowerCase())))}).map(j=>({title:j.title,company:j.companyName,url:j.applicationLink,location:(j.locationRestrictions||[]).map(c=>typeof c==='string'?c:c.name||c.code||c.alpha2).join(', ')||'Worldwide',description:j.description||j.excerpt,published:j.pubDate,remote:true,eligibility:'yes',salary:salary(j)}))}],
 ['Jobicy',async()=>{const d=await json('https://jobicy.com/api/v2/remote-jobs?count=100');return(d.jobs||[]).filter(j=>inNigeria(j.jobGeo,config)||/^(anywhere|worldwide|global|international)$/i.test(clean(j.jobGeo))).map(j=>({title:j.jobTitle,company:j.companyName,url:j.url,location:j.jobGeo,description:j.jobDescription||j.jobExcerpt,published:j.pubDate,remote:true,eligibility:inNigeria(j.jobGeo,config)?'yes':'likely',salary:salary(j)}))}],
 ['Remotive',async()=>{const d=await json('https://remotive.com/api/remote-jobs');return(d.jobs||[]).filter(j=>inNigeria(j.candidate_required_location,config)||/worldwide|anywhere|global/i.test(j.candidate_required_location)).map(j=>({title:j.title,company:j.company_name,url:j.url,location:j.candidate_required_location,description:j.description,published:j.publication_date,remote:true,eligibility:inNigeria(j.candidate_required_location,config)?'yes':'likely',salary:j.salary}))}]
 ];
 for(const token of config.boards.greenhouse||[])if(/^[\w-]+$/.test(token))sources.push(['Greenhouse:'+token,async()=>{const d=await json('https://boards-api.greenhouse.io/v1/boards/'+token+'/jobs?content=true');return(d.jobs||[]).map(j=>({title:j.title,company:token,url:j.absolute_url,location:j.location?.name,description:j.content,published:j.updated_at,remote:/remote/i.test(j.location?.name||''),eligibility:'unknown'}))}]);
 for(const token of config.boards.lever||[])if(/^[\w-]+$/.test(token))sources.push(['Lever:'+token,async()=>{const d=await json('https://api.lever.co/v0/postings/'+token+'?mode=json');return d.map(j=>({title:j.text,company:token,url:j.hostedUrl||j.applyUrl,location:j.categories?.location,description:j.descriptionPlain||j.description,remote:j.workplaceType==='remote'||/remote/i.test(j.categories?.location||''),workMode:workMode(j.workplaceType||j.categories?.location||''),eligibility:'unknown'}))}]);
 const result=await Promise.all(sources.map(async([name,fn])=>{try{return{name,jobs:await fn(),ok:true}}catch(e){return{name,jobs:[],ok:false,error:e.name==='TimeoutError'?'Source timed out':e.message}}}));
 const unique=new Map();for(const s of result)for(const raw of s.jobs){const j=match(normalize({...raw,source:s.name}),config);if(j)unique.set(j.url.replace(/\/$/,''),j)}
 return{jobs:[...unique.values()].sort((a,b)=>b.score-a.score),sources:result.map(({name,ok,error,jobs})=>({name,ok,error,fetched:jobs.length})),updatedAt:new Date().toISOString(),localBoardsConfigured:true,localFeedLimit:100};
}
let cache=null;
export function makeWorker(page,config){return{async fetch(request){const url=new URL(request.url);const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET'}});
 if(url.pathname==='/api/jobs'){if(!cache||Date.now()-cache.time>300000){const data=await collect(config);if(data.sources.some(s=>s.ok))cache={time:Date.now(),data};else return Response.json(data,{status:503,headers:{...headers,'Cache-Control':'no-store'}})}return Response.json(cache.data,{headers:{...headers,'Cache-Control':'private, max-age=60'}})}
 if(url.pathname==='/api/contacts'){
   const target=url.searchParams.get('url')||'',title=url.searchParams.get('title')||'',company=url.searchParams.get('company')||'';
   if(!title||title.length>200||!company||company.length>150)return Response.json({error:'A job title and company are required.'},{status:400,headers});
   try{return Response.json({contacts:await lookupContacts(target,title,company)},{headers:{...headers,'Cache-Control':'no-store'}})}catch(e){return Response.json({error:e.message},{status:400,headers})}
 }
 if(url.pathname==='/api/config')return Response.json({tracks:Object.keys(config.tracks),skills:config.skills,levels:LEVELS,workModes:MODES,nigeriaTerms:config.nigeriaTerms},{headers});
 if(url.pathname!=='/')return new Response('Not found',{status:404,headers});
 return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
}}}

export function parseLocalFeed(xml){
 if(!/<rss\b/i.test(xml)||!/<channel[\s>]/i.test(xml))throw Error('Local source did not return an RSS feed');
 const out=[];
 for(const entry of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const field=name=>{const m=entry[1].match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return m?decode(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/,'$1')):''};
  let title=field('position'),company=field('company');if(!title){const parts=field('title').split(' at ');title=parts.shift();company=company||parts.join(' at ')}
  const expiry=Date.parse(field('expiryDate'));if(Number.isFinite(expiry)&&expiry<Date.now())continue;
  const description=field('description');const arrangement=clean(description).match(/(?:job type|work (?:mode|arrangement)|working arrangement)\s*:?\s*(remote|hybrid|on[- ]?site)|\b(hybrid working|work remotely|fully remote|on[- ]site role)\b/i);
  const mode=arrangement?workMode(arrangement[0]):'Unspecified';
  out.push({title,company,url:field('link'),location:field('location'),description,published:field('pubDate'),remote:mode==='Remote',eligibility:'yes',workMode:mode});
 }
 return out;
}

const decodeMail=v=>{try{return decodeURIComponent(v)}catch{return v}};
export function extractContacts(raw,url){
 let text=decode(String(raw).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<a\b[^>]*href\s*=\s*["']mailto:([^"']+)["'][^>]*>/gi,(_,m)=>' '+decodeMail(m.split('?')[0])+' ').replace(/<[^>]+>/g,' '));
 const section=text.match(/method of application|how to apply|application instructions|application process/i);
 if(section)text=text.slice(section.index+section[0].length,section.index+section[0].length+6000).split(/related jobs|similar jobs|jobs you might|subscribe to|build your cv|share this job/i)[0];
 const result=[],seen=new Set();
 for(const m of text.matchAll(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi)){
  const email=m[0].replace(/\.$/,'').toLowerCase(),evidence=clean(text.slice(Math.max(0,m.index-180),m.index+m[0].length+180)).slice(0,360);
  if(seen.has(email)||/@(myjobmag\.com|remotive\.com|jobicy\.com|himalayas\.app)$/.test(email)||/^(no-?reply|privacy|support|legal|abuse|info)@/.test(email))continue;
  if(!section&&!/apply|send.{0,40}(cv|resume)|recruit|hiring|talent acquisition/i.test(evidence))continue;
  seen.add(email);result.push({email,kind:'Published application contact; recruiter identity unverified',source_url:url,evidence,found_at:new Date().toISOString()});
 }
 return result;
}
const contactHosts=new Set(['www.myjobmag.com','myjobmag.com','boards.greenhouse.io','job-boards.greenhouse.io','job-boards.eu.greenhouse.io','boards.eu.greenhouse.io','jobs.lever.co','himalayas.app','jobicy.com','remotive.com','www.remotive.com']);
const contactCache=new Map();
export function validateContactUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!contactHosts.has(u.hostname))throw Error('Open the original listing to check contacts on this employer website. Automated lookup supports public job boards only.');return u.href}
async function readBounded(r,max){
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Source page is too large');chunks.push(value)}}finally{await reader.cancel()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const prefix=new TextDecoder().decode(bytes.slice(0,200));return new TextDecoder(/encoding=["']iso-8859-1/i.test(prefix)?'iso-8859-1':'utf-8').decode(bytes);
}
async function publicText(url,max){const r=await fetch(url,{headers:{Accept:'application/xml, text/html','User-Agent':'NigeriaJobHunter/3.0'},signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('HTTP '+r.status);return readBounded(r,max)}
export async function lookupContacts(value,title,company){
 let url=validateContactUrl(value);const key=[url,title,company].join('|');const cached=contactCache.get(key);if(cached&&Date.now()-cached.at<300000)return cached.contacts;
 for(let step=0;step<4;step++){
  validateContactUrl(url);const r=await fetch(url,{redirect:'manual',headers:{Accept:'text/html','User-Agent':'NigeriaJobHunter/3.0'},signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();url=new URL(r.headers.get('Location')||'',url).href;continue}
  if(!r.ok)throw Error('The listing could not be read (HTTP '+r.status+'). Open the original link.');
  if(!(r.headers.get('content-type')||'').includes('text/html')){await r.body?.cancel();throw Error('The listing did not return a readable HTML page.')}
  const raw=await readBounded(r,2000000),headline=raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i),identity=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),pageTitle=identity(headline?.[1]||'');
  if(!pageTitle||!identity(title)||!identity(company)||![title,company].every(v=>pageTitle.includes(identity(v))))throw Error('The listing title or company differs from this saved job. Check the original link before using its contact details.');
  const contacts=extractContacts(raw,url);if(contactCache.size>=100)contactCache.delete(contactCache.keys().next().value);contactCache.set(key,{at:Date.now(),contacts});return contacts;
 }
 throw Error('Too many listing redirects. Open the original link.');
}
