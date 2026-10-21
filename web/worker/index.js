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
export function industryTags(j,config){
 const body=String(j.description||'').slice(0,1800).replace(/health insurance|medical insurance|life insurance|pension contributions|pension scheme|university degree|high school|secondary school/gi,' ');
 const text=clean([j.industry||'',j.title||'',j.company||'',body].join(' '));
 return Object.entries(config.industries||{}).filter(([,words])=>words.some(word=>new RegExp('(?<!\\w)'+quoteRE(word)+'(?!\\w)','i').test(text))).map(([name])=>name);
}
export function match(j,config){
 if(!j.title||!j.url||careerLevel(j)==='Senior')return null;
 if(!j.remote&&!inNigeria(j.location,config))return null;
 if(j.remote&&!(j.eligibility==='yes'||j.eligibility==='likely'||inNigeria(j.location,config)||/\b(worldwide|anywhere|global)\b/i.test(j.location)))return null;
 const tracks=Object.entries(config.tracks).filter(([name,words])=>words.some(w=>j.title.toLowerCase().includes(w))&&!(name==='EdTech Support'&&/loan management/i.test(j.title+' '+j.description)&&!/education|learning management|school/i.test(j.title))).map(([t])=>t);
 if(!tracks.length)return null;
 const text=(j.title+' '+j.description).toLowerCase();
 const skills=config.skills.filter(s=>new RegExp('(?<!\\w)'+s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?!\\w)').test(text));
 const years=[...j.description.slice(0,3500).matchAll(/\b([1-9]\d?)\s*(?:\+|plus)?\s*(?:years|yrs)\b/gi)].map(m=>+m[1]);
 if(years.length&&Math.min(...years)>=4)return null;
 let score=35+Math.min(15,tracks.length*5)+(ENTRY.test(j.title)?22:0)-(SENIOR.test(j.title)?35:0)+Math.min(15,skills.length*3)+(j.eligibility==='yes'?8:0)+(/lagos/i.test(j.location)?5:0);
 if(years.length)score+=Math.min(...years)>=4?-20:Math.min(...years)<=2?8:0;
 return {...j,tracks,skills,industryTags:industryTags(j,config),score:Math.max(0,Math.min(100,score))};
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
 if(url.pathname==='/api/config')return Response.json({tracks:Object.keys(config.tracks),skills:config.skills,levels:LEVELS,workModes:MODES,nigeriaTerms:config.nigeriaTerms,industries:config.industries},{headers});
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
  out.push({title,company,url:field('link'),location:field('location'),description,published:field('pubDate'),remote:mode==='Remote',eligibility:'yes',workMode:mode,industry:field('industry')});
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

const page="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"theme-color\" content=\"#183c32\"><meta name=\"description\" content=\"Find Nigeria and remote jobs, shortlist opportunities, and track your next move.\"><title>JobHunter — Your next move</title><style>\n:root{font-family:Inter,Arial,sans-serif;color:#182c26;background:#f6f7f3;font-synthesis:none;--green:#183c32;--muted:#67746c;--line:#e1e6dd}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0}button,input,select,textarea{font:inherit}button,a,select{touch-action:manipulation}button{cursor:pointer}a{color:inherit}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #b7d77d;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}.layout{display:grid;grid-template-columns:232px 1fr;min-height:100vh}aside{background:var(--green);color:#fff;padding:35px 22px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}.logo{display:flex;gap:10px;align-items:center;font-size:23px;font-weight:750;letter-spacing:-1px}.logo svg{width:32px;height:32px;background:#d1e6a6;color:#183c32;border-radius:9px;padding:6px}.edition{font-size:10px;letter-spacing:2px;color:#a9c4b6;margin:13px 0 44px 42px}.nav{background:none;border:0;color:#b8cbc2;text-align:left;display:flex;align-items:center;gap:12px;padding:14px;border-radius:8px;width:100%;margin:4px 0}.nav.active{background:#315247;color:white}.nav b{margin-left:auto;font-size:11px;background:#d1e6a6;color:var(--green);padding:3px 7px;border-radius:5px}.aside-bottom{margin-top:auto}.aside-note{border-top:1px solid #456052;padding:22px 8px;font-size:12px;line-height:1.7;color:#bed0c7}.avatar{display:flex;gap:11px;align-items:center;padding:15px 5px}.avatar span{background:#d1e6a6;color:var(--green);border-radius:50%;padding:12px;font-weight:700}.avatar small{display:block;color:#bed0c7;margin-top:5px}main{min-width:0;padding:0 45px 40px;max-width:1600px;width:100%;margin:auto}.topbar{height:86px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--muted)}.topbar strong{font-weight:500;color:var(--green)}.private{display:flex;align-items:center;gap:7px}.dot{width:6px;height:6px;background:#559766;border-radius:50%;display:inline-block}.intro{display:flex;justify-content:space-between;align-items:center;margin:35px 0 25px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;color:var(--muted);text-transform:uppercase}h1{font-size:36px;letter-spacing:-1.5px;margin:9px 0 10px;font-weight:650}p{color:var(--muted);font-size:14px;line-height:1.6}.intro p{margin:0}.btn{border:1px solid var(--line);border-radius:7px;background:white;padding:11px 15px;color:var(--green);display:inline-flex;gap:8px;align-items:center;text-decoration:none;justify-content:center;font-size:12px;font-weight:600;min-height:42px}.btn.primary{background:var(--green);color:white;border-color:var(--green)}.btn.light{background:#eef3e7;border-color:#dbe5cf}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:25px 0}.stat{background:white;border:1px solid var(--line);border-radius:10px;padding:20px}.stat .label{display:flex;justify-content:space-between;color:var(--muted);font-size:12px}.stat .number{font-size:30px;font-weight:650;letter-spacing:-1px;margin:14px 0 5px}.stat small{font-size:10px;color:var(--muted)}.stat:last-child{background:#ebf1e1}.searchbox{background:white;border:1px solid var(--line);padding:16px;border-radius:10px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:7px}label,.field>span{font-size:11px;font-weight:600;color:var(--muted)}input,select,textarea{border:1px solid var(--line);border-radius:6px;background:white;color:var(--green);padding:12px;width:100%;min-width:0;font-size:12px}textarea{min-height:110px;resize:vertical}.searchbox .btn{align-self:end}.content-grid{display:grid;grid-template-columns:minmax(0,1fr) 255px;gap:24px;margin-top:26px}.results-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:12px}h2{font-size:17px;margin:0;letter-spacing:-.4px}h2 span{font-size:11px;background:#e8eddf;border-radius:5px;padding:4px 7px;margin-left:6px;color:var(--muted)}.sort{width:145px;padding:8px;background:transparent;border:0;font-size:11px}.job{background:white;border:1px solid var(--line);border-radius:10px;padding:21px;margin-bottom:13px;transition:border-color .15s}.job:hover{border-color:#9bb49b}.job-top{display:flex;align-items:flex-start;gap:13px}.company-icon{width:42px;height:42px;border:1px solid #dce5d5;background:#f1f5e9;color:#436248;border-radius:10px;display:grid;place-items:center;flex-shrink:0;font-weight:700;font-size:15px}.job-title{flex:1;min-width:0}.job-title button{background:none;border:0;padding:0;font-weight:650;color:var(--green);text-align:left;font-size:15px;line-height:1.4}.company{font-size:11px;color:var(--muted);margin-top:5px}.save{background:none;border:0;color:var(--muted);padding:4px}.save.saved{color:#477046}.save.saved svg{fill:#d1e6a6}.tags{display:flex;gap:6px;flex-wrap:wrap;margin:17px 0}.tag{font-size:10px;background:#f1f3ef;padding:5px 8px;border-radius:4px;color:#5c6c60}.tag.green{background:#edf4e4;color:#416431}.job-foot{border-top:1px solid #eef0eb;padding-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}.score{font-size:11px;color:#426339;font-weight:600}.score small{font-size:9px;color:var(--muted);font-weight:400;display:block;margin-top:4px}.job-foot select{padding:8px;width:120px;font-size:11px}.rail-card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:20px;margin-bottom:16px}.rail-card h3{font-size:13px;margin:0 0 15px}.rail-card p{font-size:11px;margin:0 0 16px}.source{font-size:11px;display:flex;justify-content:space-between;gap:10px;margin:14px 0}.source span{color:var(--muted)}.source .ok{color:#52803f}.rail-card.tinted{background:#eaf0df}.rail-card a.discovery{display:block;font-size:11px;text-decoration:none;padding:11px 0;border-bottom:1px solid #d7dfce;line-height:1.5}.rail-card a.discovery:last-child{border:0}.small{font-size:10px;color:var(--muted);line-height:1.6}.notice{font-size:12px;padding:12px 15px;border-radius:7px;background:#edf2e4;margin:15px 0;line-height:1.6}.notice.error{background:#f8ece3;color:#744227}.empty{background:white;border:1px dashed #cbd5c3;border-radius:10px;padding:55px 25px;text-align:center}.empty svg{width:32px;height:32px;color:#6c8860}.empty h3{font-size:18px;font-weight:600}.empty p{font-size:12px;max-width:330px;margin:12px auto 20px}.actions{display:flex;gap:9px;flex-wrap:wrap}.footer{font-size:10px;color:var(--muted);margin-top:35px;display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:20px}dialog{border:1px solid var(--line);border-radius:14px;padding:28px;width:min(620px,calc(100% - 28px));max-height:85vh;color:var(--green);box-shadow:0 20px 100px #0003}dialog::backdrop{background:#14281f80;backdrop-filter:blur(3px)}.dialog-top{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:15px}.dialog-top h2{line-height:1.5}.close{border:0;background:#f0f3ec;border-radius:50%;padding:7px;color:var(--green);display:flex}#description{white-space:pre-wrap;font-size:13px;color:#526055;line-height:1.8;max-height:330px;overflow:auto;padding-right:8px}.formgrid{display:grid;gap:15px}.formgrid .actions{margin-top:10px}#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--green);color:#fff;padding:13px 20px;border-radius:8px;font-size:12px;z-index:20;max-width:90vw}#toast:empty{display:none}.loading{animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}@media(min-width:1500px){main{padding-left:65px;padding-right:65px}}@media(max-width:1150px){.layout{grid-template-columns:195px 1fr}main{padding:0 25px 30px}.content-grid{grid-template-columns:1fr}.rail{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rail-card{margin:0}.rail-card:last-child{grid-column:1/-1}.searchbox{grid-template-columns:1fr 1fr}.stats{gap:10px}.stat{padding:16px}}@media(max-width:700px){.layout{display:block}aside{height:auto;position:static;padding:18px;display:grid;grid-template-columns:1fr 1fr}.logo{font-size:20px}.edition,.aside-bottom{display:none}aside nav{grid-column:1/-1;display:flex;margin-top:15px;gap:8px}.nav{padding:11px 9px;font-size:12px;justify-content:center}.nav svg{width:17px}.nav b{margin:0}main{padding:0 18px 25px}.topbar{height:55px;font-size:10px}.intro{margin:27px 0 20px;align-items:flex-start;gap:8px}h1{font-size:29px}.intro p{font-size:12px;max-width:210px}.intro .btn{font-size:10px;padding:9px;white-space:nowrap;margin-top:24px}.intro .btn svg{display:none}.stats{grid-template-columns:1fr 1fr;gap:10px}.stat{padding:15px}.stat .number{font-size:25px;margin:10px 0 4px}.searchbox{gap:13px;padding:13px}.searchbox .field:first-child{grid-column:1/-1}.searchbox .btn{grid-column:1/-1}.rail{display:block}.rail-card{margin-bottom:14px}.job{padding:16px}.job-title button{font-size:14px}.private{font-size:9px}.footer{gap:15px;line-height:1.6}.job-foot .actions{gap:6px}.job-foot .btn{padding:8px 9px;font-size:10px}.job-foot select{width:103px}.results-header h2{font-size:15px}}\n</style></head><body>\n<svg style=\"display:none\" aria-hidden=\"true\"><defs><symbol id=\"bag\" viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c5 4 13 4 18 0M12 11v5\"/></symbol><symbol id=\"search\" viewBox=\"0 0 24 24\"><circle cx=\"10\" cy=\"10\" r=\"7\"/><path d=\"m15 15 6 6\"/></symbol><symbol id=\"bookmark\" viewBox=\"0 0 24 24\"><path d=\"M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4z\"/></symbol><symbol id=\"chart\" viewBox=\"0 0 24 24\"><path d=\"M4 3v18h17M9 16v-4m5 4V8m5 8V5\"/></symbol><symbol id=\"arrow\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14m-5-5 5 5-5 5\"/></symbol><symbol id=\"download\" viewBox=\"0 0 24 24\"><path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\"/></symbol><symbol id=\"close\" viewBox=\"0 0 24 24\"><path d=\"m6 6 12 12M6 18 18 6\"/></symbol><symbol id=\"plus\" viewBox=\"0 0 24 24\"><path d=\"M12 5v14M5 12h14\"/></symbol></defs></svg>\n<div class=\"layout\"><aside><div class=\"logo\"><svg><use href=\"#bag\"/></svg>JobHunter<span style=\"color:#cde2a2\">.</span></div><div class=\"edition\">NIGERIA + REMOTE</div><nav aria-label=\"Main navigation\"><button class=\"nav active\" data-view=\"discover\"><svg><use href=\"#search\"/></svg>Find jobs</button><button class=\"nav\" data-view=\"shortlist\"><svg><use href=\"#bookmark\"/></svg>Shortlist <b id=\"saved-count\">0</b></button><button class=\"nav\" data-view=\"applications\"><svg><use href=\"#chart\"/></svg>Applications</button></nav><div class=\"aside-bottom\"><div class=\"aside-note\">A little progress, every day.<br>Your next role starts with<br>your next application.</div><div class=\"avatar\"><span>F</span><div style=\"font-size:12px\">Feranmi<small>Personal workspace</small></div></div></div></aside>\n<main><header class=\"topbar\"><span>Your workspace <span style=\"padding:0 10px\">/</span> <strong id=\"breadcrumb\">Find jobs</strong></span><span class=\"private\"><i class=\"dot\"></i> Nigeria + worldwide opportunities</span></header><section class=\"intro\"><div><div class=\"eyebrow\">MAKE YOUR NEXT MOVE</div><h1 id=\"page-title\">Find your next opportunity.</h1><p id=\"page-subtitle\">A focused space for your job search, Feranmi.</p></div><button class=\"btn\" id=\"add\"><svg><use href=\"#plus\"/></svg>Add a job</button></section>\n<section class=\"stats\" aria-label=\"Job search overview\"><div class=\"stat\"><div class=\"label\">Jobs discovered<svg><use href=\"#search\"/></svg></div><div class=\"number\" id=\"stat-jobs\">0</div><small>In this workspace</small></div><div class=\"stat\"><div class=\"label\">Shortlisted<svg><use href=\"#bookmark\"/></svg></div><div class=\"number\" id=\"stat-saved\">0</div><small>Opportunities on your radar</small></div><div class=\"stat\"><div class=\"label\">Applications<svg><use href=\"#bag\"/></svg></div><div class=\"number\" id=\"stat-applied\">0</div><small>Applied, interview or offer</small></div><div class=\"stat\"><div class=\"label\">Interviews<svg><use href=\"#chart\"/></svg></div><div class=\"number\" id=\"stat-interviews\">0</div><small>Your next conversations</small></div></section>\n<section class=\"searchbox\" aria-label=\"Filter jobs\"><div class=\"field\"><label for=\"query\">Role, company or skill</label><input id=\"query\" placeholder=\"e.g. data analyst, Python, IT support\"></div><div class=\"field\"><label for=\"track\">Career track</label><select id=\"track\"><option value=\"All\">All career tracks</option></select></div><div class=\"field\"><label for=\"region\">Location</label><select id=\"region\"><option>Nigeria + Remote</option><option>Nigeria</option><option>Lagos</option><option>Remote</option></select></div><div class=\"field\"><label for=\"level\">Career level</label><select id=\"level\"><option>Early career</option><option>Junior</option><option>Associate</option><option>Internship</option><option>Graduate</option><option>Unspecified</option></select></div><div class=\"field\"><label for=\"work-mode\">Work arrangement</label><select id=\"work-mode\"><option>All</option><option>On-site</option><option>Hybrid</option><option>Remote</option><option>Unspecified</option></select></div><div class=\"field\"><label for=\"industry\">Industry focus</label><select id=\"industry\"><option value=\"All\">All industries</option></select><span style=\"font-size:10px;font-weight:400\">Listing keywords; matches can overlap.</span></div><button class=\"btn primary\" id=\"refresh\"><svg><use href=\"#search\"/></svg><span>Find live jobs</span></button></section>\n<div id=\"notice\" role=\"status\" class=\"notice\">Start a live search to bring opportunities into your workspace.</div><div class=\"content-grid\"><section><div class=\"results-header\"><h2 id=\"results-title\">Opportunities <span id=\"result-count\">0</span></h2><select class=\"sort\" id=\"sort\" aria-label=\"Sort results\"><option value=\"match\">Highest match first</option><option value=\"recent\">Newest first</option><option value=\"company\">Company A–Z</option></select></div><div id=\"jobs\"></div><button class=\"btn\" id=\"more\" hidden>Show more jobs</button></section><section class=\"rail\" aria-label=\"Search tools\"><div class=\"rail-card\"><h3>Connected job sources</h3><div id=\"sources\"><div class=\"source\">MyJobMag<span>Ready to search</span></div><div class=\"source\">Moniepoint<span>Ready to search</span></div><div class=\"source\">Yassir<span>Ready to search</span></div><div class=\"source\">Himalayas<span>Ready to search</span></div><div class=\"source\">Jobicy<span>Ready to search</span></div><div class=\"source\">Remotive<span>Ready to search</span></div></div><div class=\"small\" id=\"updated\">Live search runs when you ask.</div></div><div class=\"rail-card tinted\"><div class=\"eyebrow\" style=\"font-size:9px;margin-bottom:12px\">LOOK A LITTLE CLOSER</div><h3>Explore jobs in Nigeria</h3><p>MyJobMag and employer feeds bring local vacancies into your results. These links expand your search beyond the feeds.</p><div id=\"discovery\"></div><p class=\"small\" style=\"margin:14px 0\">The local RSS feed covers its latest 100 entries. Unspecified arrangements do not confirm on-site work.</p><p style=\"margin:14px 0 0\">Found something promising? Add it to your tracker.</p></div><div class=\"rail-card\"><h3>Your search, kept together.</h3><p>Tracking stays in this browser on this device. Download a backup to move it or keep a copy.</p><div class=\"actions\"><button class=\"btn\" id=\"backup\">Backup</button><button class=\"btn\" id=\"restore\">Restore</button><button class=\"btn\" id=\"csv\"><svg><use href=\"#download\"/></svg>CSV</button></div><input type=\"file\" id=\"import\" accept=\"application/json,.json\" hidden><p class=\"small\" style=\"margin:14px 0 0\">Match scores are estimates based on your repository profile, not a chance of selection. Confirm remote eligibility on the employer’s page.</p></div></section></div><footer class=\"footer\"><span>JobHunter · Built for your next chapter.</span><span>No automatic applications. You choose what comes next.</span></footer></main></div>\n<dialog id=\"detail\"><div class=\"dialog-top\"><div><div class=\"eyebrow\" id=\"detail-source\"></div><h2 id=\"detail-title\"></h2><p id=\"detail-meta\"></p></div><button class=\"close\" aria-label=\"Close job details\"><svg><use href=\"#close\"/></svg></button></div><div id=\"detail-tags\" class=\"tags\"></div><div id=\"description\"></div><section style=\"margin-top:22px;border-top:1px solid var(--line);padding-top:18px\"><h3 style=\"font-size:14px;margin:0 0 12px\">Published application contacts</h3><div id=\"contact-list\"></div><button class=\"btn\" id=\"lookup-contacts\" style=\"margin-top:12px\">Check listing for email</button><p class=\"small\" id=\"contact-status\" role=\"status\">Published addresses are application contacts. Recruiter identity and email delivery are unverified.</p></section><div class=\"field\" style=\"margin-top:20px\"><label for=\"notes\">Your notes</label><textarea id=\"notes\" placeholder=\"CV sent, recruiter contact, interview prep…\" maxlength=\"10000\"></textarea></div><div class=\"actions\" style=\"margin-top:18px\"><a id=\"apply\" class=\"btn primary\" target=\"_blank\" rel=\"noopener noreferrer\">Open application <svg><use href=\"#arrow\"/></svg></a><button class=\"btn\" id=\"save-note\">Save notes</button></div></dialog>\n<dialog id=\"add-dialog\"><div class=\"dialog-top\"><h2>Add an opportunity</h2><button class=\"close\" aria-label=\"Close add job\"><svg><use href=\"#close\"/></svg></button></div><p>Keep a role you found elsewhere in the same tracker.</p><form id=\"add-form\" class=\"formgrid\"><div class=\"field\"><label for=\"new-title\">Job title</label><input id=\"new-title\" required maxlength=\"200\"></div><div class=\"field\"><label for=\"new-company\">Company</label><input id=\"new-company\" required maxlength=\"150\"></div><div class=\"field\"><label for=\"new-url\">Application link (https://)</label><input id=\"new-url\" type=\"url\" required placeholder=\"https://…\" pattern=\"https://.*\"></div><div class=\"field\"><label for=\"new-location\">Location</label><input id=\"new-location\" required placeholder=\"e.g. Lagos or Worldwide\"></div><label><input id=\"new-remote\" type=\"checkbox\" style=\"width:auto;margin-right:8px\">Remote role</label><div class=\"actions\"><button class=\"btn primary\">Add to shortlist</button></div></form></dialog><div id=\"toast\" role=\"status\"></div>\n<script>\nconst $=s=>document.querySelector(s), icon=n=>'<svg aria-hidden=\"true\"><use href=\"#'+n+'\"/></svg>', esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst statuses=['new','interested','applied','interview','rejected','offer','archived'];let jobs=[],sources=[],updatedAt='',view='discover',shown=20,current=null,config={tracks:[]},storageOK=true;\nfunction validUrl(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return ''}}\nfunction normalize(j){if(!j||typeof j!=='object'||!validUrl(j.url)||typeof j.title!=='string')return null;return{url:validUrl(j.url),title:j.title.slice(0,200),company:String(j.company||'Unspecified').slice(0,150),location:String(j.location||''),source:String(j.source||'Manual'),description:String(j.description||'').slice(0,12000),salary:String(j.salary||''),industry:String(j.industry||''),industryTags:Array.isArray(j.industryTags)?j.industryTags.map(String):[],careerLevel:String(j.careerLevel||'Unspecified'),workMode:String(j.workMode||(j.remote?'Remote':'Unspecified')),contacts:Array.isArray(j.contacts)?j.contacts.filter(c=>c&&typeof c.email==='string'&&/^[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}$/i.test(c.email)).slice(0,30).map(c=>({email:c.email,source_url:validUrl(c.source_url),kind:String(c.kind||'Published application contact'),evidence:String(c.evidence||'').slice(0,360),found_at:String(c.found_at||'')})):[],published:String(j.published||''),remote:!!j.remote,eligibility:['yes','likely','no','unknown'].includes(j.eligibility)?j.eligibility:'unknown',tracks:Array.isArray(j.tracks)?j.tracks.map(String):[],skills:Array.isArray(j.skills)?j.skills.map(String):[],score:j.score===null?null:Math.min(100,Math.max(0,Number(j.score)||0)),status:statuses.includes(j.status)?j.status:'new',notes:String(j.notes||'').slice(0,10000)}}\ntry{const data=JSON.parse(localStorage.getItem('jobhunter-v1')||'{}');jobs=Array.isArray(data.jobs)?data.jobs.map(normalize).filter(Boolean):[];sources=Array.isArray(data.sources)?data.sources:[];updatedAt=String(data.updatedAt||'')}catch{storageOK=false}\nfunction toast(s){$('#toast').textContent=s;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').textContent='',4000)}\nfunction persist(){try{localStorage.setItem('jobhunter-v1',JSON.stringify({jobs,sources,updatedAt}));storageOK=true;return true}catch{storageOK=false;toast('Browser storage is unavailable or full. Download a backup before leaving.');return false}}\nfunction notice(s,error=false){$('#notice').textContent=s;$('#notice').classList.toggle('error',error)}\nfunction setStatus(url,status){const j=jobs.find(j=>j.url===url);if(j){j.status=status;persist();render()}}\nfunction sectorClues(job){\n const body=(job.description||'').slice(0,1800).replace(/health insurance|medical insurance|life insurance|pension contributions|pension scheme|university degree|high school|secondary school/gi,' '),text=[job.industry||'',job.title||'',job.company||'',body].join(' ');\n return Object.entries(config.industries||{}).filter(([,words])=>words.some(word=>new RegExp('(?<!\\\\w)'+word.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'(?!\\\\w)','i').test(text))).map(([name])=>name);\n}\nfunction localLocation(value){return (config.nigeriaTerms||['nigeria','lagos','abuja','ogun','abia','rivers','ibadan']).some(t=>new RegExp('(?<!\\\\w)'+t+'(?!\\\\w)','i').test(value))}\nfunction discovery(){let word=$('#track').value==='All'?($('#query').value||'graduate trainee'):$('#track').value;const sector=$('#industry').value;if(sector!=='All'&&config.industries?.[sector])word+=' '+config.industries[sector][0];$('#discovery').innerHTML=[['Jobberman','https://www.jobberman.com/jobs?search='+encodeURIComponent(word)],['LinkedIn Jobs','https://www.linkedin.com/jobs/search/?keywords='+encodeURIComponent(word)+'&location=Nigeria']].map(([n,u])=>'<a class=\"discovery\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"'+esc(u)+'\">'+n+' <span style=\"float:right\">↗</span></a>').join('')}\nfunction render(){\n const applied=jobs.filter(j=>['applied','interview','offer'].includes(j.status)),shortlist=jobs.filter(j=>j.status==='interested');$('#stat-jobs').textContent=jobs.length;$('#stat-saved').textContent=shortlist.length;$('#saved-count').textContent=shortlist.length;$('#stat-applied').textContent=applied.length;$('#stat-interviews').textContent=jobs.filter(j=>j.status==='interview').length;\n const q=$('#query').value.toLowerCase().trim(),region=$('#region').value,track=$('#track').value,level=$('#level').value,mode=$('#work-mode').value,sector=$('#industry').value;\n let list=jobs.filter(j=>(sector==='All'||j.industryTags?.includes(sector))&&(level==='Early career'?j.careerLevel!=='Senior':j.careerLevel===level)&&(mode==='All'||j.workMode===mode)&&(view==='shortlist'?j.status==='interested':view==='applications'?['applied','interview','rejected','offer'].includes(j.status):j.status!=='archived')&&(track==='All'||j.tracks.includes(track))&&(!q||[j.title,j.company,j.description,...j.skills].join(' ').toLowerCase().includes(q))&&(region==='Nigeria + Remote'||(region==='Remote'?j.remote:!j.remote&&(region==='Lagos'?/lagos/i.test(j.location):localLocation(j.location)))));\n const sort=$('#sort').value;list.sort(sort==='company'?(a,b)=>a.company.localeCompare(b.company):sort==='recent'?(a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0):(a,b)=>(b.score??-1)-(a.score??-1));\n $('#results-title').innerHTML=(view==='shortlist'?'Your shortlist':view==='applications'?'Your applications':'Opportunities')+' <span>'+list.length+'</span>';\n $('#jobs').innerHTML=list.slice(0,shown).map(j=>'<article class=\"job\"><div class=\"job-top\"><div class=\"company-icon\">'+esc(j.company.slice(0,2).toUpperCase())+'</div><div class=\"job-title\"><button data-open=\"'+esc(j.url)+'\">'+esc(j.title)+'</button><div class=\"company\">'+esc(j.company)+' · '+esc(j.location||'Location unspecified')+'</div></div><button class=\"save '+(j.status==='interested'?'saved':'')+'\" aria-label=\"'+(j.status==='interested'?'Remove from shortlist':'Save to shortlist')+'\" aria-pressed=\"'+(j.status==='interested')+'\" data-save=\"'+esc(j.url)+'\">'+icon('bookmark')+'</button></div><div class=\"tags\"><span class=\"tag green\">'+esc(j.workMode||'Unspecified')+'</span>'+(j.tracks[0]?'<span class=\"tag\">'+esc(j.tracks[0])+'</span>':'')+'<span class=\"tag\">'+esc(j.careerLevel||'Unspecified')+'</span><span class=\"tag\">'+esc(j.source)+'</span>'+(j.salary?'<span class=\"tag\">'+esc(j.salary)+'</span>':'')+'</div><div class=\"job-foot\"><div class=\"score\">'+(j.score===null?'Added by you':j.score+'/100 match')+'<small>'+(j.remote?'Eligibility: '+esc(j.eligibility):'Review employer requirements')+'</small></div><div class=\"actions\"><select aria-label=\"Application status for '+esc(j.title)+'\" data-status=\"'+esc(j.url)+'\">'+statuses.map(s=>'<option value=\"'+s+'\" '+(j.status===s?'selected':'')+'>'+s[0].toUpperCase()+s.slice(1)+'</option>').join('')+'</select><button class=\"btn light\" data-open=\"'+esc(j.url)+'\">View job '+icon('arrow')+'</button></div></div></article>').join('')||'<div class=\"empty\">'+icon('search')+'<h3>'+(jobs.length?'No jobs match this view.':'Your next move starts here.')+'</h3><p>'+(jobs.length?'Try a different career track or location, or search for another role.':'Search live sources for opportunities, or add a job you have already found.')+'</p><button class=\"btn primary\" id=\"empty-action\">'+(view==='discover'?'Find live jobs':'Browse opportunities')+' '+icon('arrow')+'</button></div>';\n $('#more').hidden=list.length<=shown;\n if(sources.length)$('#sources').innerHTML=sources.map(s=>'<div class=\"source\">'+esc(s.name)+'<span class=\"'+(s.ok?'ok':'')+'\">'+(s.ok?'Connected · '+esc(s.fetched):'Unavailable')+'</span></div>').join('');\n if(updatedAt)$('#updated').textContent='Last search: '+new Date(updatedAt).toLocaleString();discovery();\n}\nasync function refresh(){const btn=$('#refresh');if(btn.disabled)return;btn.disabled=true;btn.classList.add('loading');btn.querySelector('span').textContent='Searching…';notice('Checking live sources. Your saved jobs and application statuses will stay here.');try{const r=await fetch('/api/jobs');const d=await r.json();if(!Array.isArray(d.jobs))throw Error('Unexpected source response');sources=d.sources||[];if(!r.ok)throw Error('All live sources are unavailable. Try again later.');let added=0;for(const raw of d.jobs){const j=normalize(raw);if(!j)continue;const old=jobs.find(x=>x.url.replace(/\\/$/,'')===j.url.replace(/\\/$/,''));if(old)Object.assign(old,j,{status:old.status,notes:old.notes,contacts:j.contacts.length?j.contacts:old.contacts});else{jobs.push(j);added++}}updatedAt=d.updatedAt;persist();const failed=sources.filter(s=>!s.ok).map(s=>s.name);notice(added+' new opportunities added. '+d.jobs.length+' matching listings returned.'+(failed.length?' Unavailable: '+failed.join(', ')+'.':'')+' Local RSS coverage is limited to its latest 100 entries; employer coverage varies.',!!failed.length)}catch(e){notice(e.message+' Your stored jobs are still available.',true)}finally{btn.disabled=false;btn.classList.remove('loading');btn.querySelector('span').textContent='Find live jobs';shown=20;render()}}\nfunction changeView(v){view=v;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('#breadcrumb').textContent=v==='discover'?'Find jobs':v==='shortlist'?'Shortlist':'Applications';$('#page-title').textContent=v==='discover'?'Find your next opportunity.':v==='shortlist'?'Keep the good ones close.':'Every application, in one place.';$('#page-subtitle').textContent=v==='discover'?'A focused space for your job search, Feranmi.':v==='shortlist'?'Roles you want to come back to.':'Track the conversations that could come next.';shown=20;render()}\nfunction openJob(url){current=jobs.find(j=>j.url===url);if(!current)return;$('#detail-title').textContent=current.title;$('#detail-source').textContent=current.source;$('#detail-meta').textContent=current.company+' · '+current.location;$('#detail-tags').innerHTML=[...current.tracks,...current.skills,...(current.industryTags||[])].map(t=>'<span class=\"tag\">'+esc(t)+'</span>').join('');$('#description').textContent=current.description||'Open the original listing to read the full role requirements and confirm the vacancy is still available.';$('#notes').value=current.notes;$('#apply').href=validUrl(current.url);renderContacts();$('#detail').showModal()}\nfunction renderContacts(){\n $('#contact-list').innerHTML=(current.contacts||[]).map(c=>'<div style=\"margin:10px 0;padding:12px;background:#f0f4e9;border-radius:6px\"><strong style=\"font-size:13px;overflow-wrap:anywhere\">'+esc(c.email)+'</strong><p class=\"small\" style=\"margin:7px 0\">'+esc(c.evidence)+'</p>'+(validUrl(c.source_url)?'<a target=\"_blank\" rel=\"noopener noreferrer\" class=\"small\" href=\"'+esc(validUrl(c.source_url))+'\">View contact source ↗</a>':'')+'</div>').join('')||'<p class=\"small\">No application email has been saved for this job.</p>';\n $('#contact-status').textContent='Published application addresses. Recruiter identity and email delivery are unverified.';\n}\n$('#lookup-contacts').onclick=async()=>{\n const job=current,button=$('#lookup-contacts');if(!job||button.disabled)return;button.disabled=true;button.textContent='Checking listing…';$('#contact-status').textContent='Reading the public listing and checking its title and company.';\n try{const query=new URLSearchParams({url:job.url,title:job.title,company:job.company}),r=await fetch('/api/contacts?'+query),d=await r.json();if(!r.ok)throw Error(d.error||'Contact lookup failed.');\n  const map=new Map((job.contacts||[]).map(c=>[c.email,c]));for(const c of d.contacts||[])map.set(c.email,c);job.contacts=[...map.values()];persist();\n  if(current===job){renderContacts();$('#contact-status').textContent=d.contacts.length?'Published application contacts saved with source links.':'No published application email was found. The employer may use an application form. Open the original listing to apply.'}\n }catch(e){if(current===job)$('#contact-status').textContent=e.message}finally{button.disabled=false;button.textContent='Check listing for email'}\n};\nfunction download(name,data,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}\n$('#refresh').onclick=refresh;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>changeView(b.dataset.view));['query','track','region','sort','level','work-mode','industry'].forEach(id=>$('#'+id).addEventListener(id==='query'?'input':'change',()=>{shown=20;render()}));\n$('#jobs').onclick=e=>{const open=e.target.closest('[data-open]'),save=e.target.closest('[data-save]');if(open)openJob(open.dataset.open);if(save){const j=jobs.find(j=>j.url===save.dataset.save);if(!j)return;if(!['new','interested','archived'].includes(j.status)){toast('This job is already tracked in Applications.');return}setStatus(j.url,j.status==='interested'?'new':'interested')}if(e.target.closest('#empty-action'))view==='discover'?refresh():changeView('discover')};\n$('#jobs').onchange=e=>{if(e.target.dataset.status)setStatus(e.target.dataset.status,e.target.value)};$('#more').onclick=()=>{shown+=20;render()};document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#add').onclick=()=>$('#add-dialog').showModal();$('#save-note').onclick=()=>{current.notes=$('#notes').value;if(persist())toast('Notes saved.');$('#detail').close()};\n$('#add-form').onsubmit=e=>{e.preventDefault();const url=validUrl($('#new-url').value);if(!url){toast('Use an https:// application link.');return}if(jobs.some(j=>j.url.replace(/\\/$/,'')===url.replace(/\\/$/,''))){toast('This opportunity is already in your workspace.');return}jobs.push(normalize({title:$('#new-title').value,company:$('#new-company').value,url,location:$('#new-location').value,remote:$('#new-remote').checked,source:'Manual',status:'interested',score:null}));jobs[jobs.length-1].industryTags=sectorClues(jobs[jobs.length-1]);persist();$('#add-dialog').close();e.target.reset();$('#query').value='';$('#track').value='All';$('#region').value='Nigeria + Remote';$('#level').value='Early career';$('#work-mode').value='All';$('#industry').value='All';changeView('shortlist');toast('Opportunity added to your shortlist.')};\n$('#backup').onclick=()=>download('jobhunter-backup.json',JSON.stringify({version:1,jobs,sources,updatedAt},null,2),'application/json');$('#restore').onclick=()=>$('#import').click();$('#import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>20000000)throw Error('Backup is too large (maximum 20 MB).');const d=JSON.parse(await f.text());if(!Array.isArray(d.jobs))throw Error('This is not a JobHunter backup.');const list=d.jobs.map(normalize);if(list.some(j=>!j))throw Error('Backup contains invalid job records.');let n=0;for(const j of list)if(!jobs.some(x=>x.url===j.url)){if(!j.industryTags.length)j.industryTags=sectorClues(j);jobs.push(j);n++}persist();render();toast(n+' jobs restored. Existing records were kept.')}catch(e){toast(e.message)}finally{e.target.value=''}};\n$('#csv').onclick=()=>{const cell=v=>'\"'+String(v??'').replace(/^[=+@\\-\\t\\r]/,\"'$&\").replace(/\"/g,'\"\"')+'\"',cols=['title','company','location','industry','industryTags','careerLevel','workMode','source','salary','score','status','url','notes','contacts'];download('jobhunter-applications.csv','\\ufeff'+[cols,...jobs.map(j=>cols.map(c=>c==='contacts'?(j.contacts||[]).map(v=>v.email+' | '+v.source_url).join('; '):Array.isArray(j[c])?j[c].join(', '):j[c]))].map(row=>row.map(cell).join(',')).join('\\r\\n'),'text/csv;charset=utf-8')};\nrender();if(updatedAt)notice('Your previous search is loaded. Find live jobs to check the sources again.');if(!storageOK)notice('Browser storage could not be loaded. Use a backup to preserve your tracking data.',true);\nfetch('/api/config').then(r=>r.json()).then(d=>{config=d;for(const name of Object.keys(d.industries||{})){const o=document.createElement('option');o.value=name;o.textContent=name;$('#industry').append(o)};for(const job of jobs){if(!job.industryTags?.length)job.industryTags=sectorClues(job)}render();for(const track of d.tracks){const o=document.createElement('option');o.value=track;o.textContent=track;$('#track').append(o)}}).catch(()=>notice('Career filters could not load. Refresh the page to retry.',true));\n</script></body></html>\n";
const config={
  "tracks": {
    "Website Administration": [
      "website administrator",
      "web administrator",
      "webmaster",
      "website officer",
      "web content officer",
      "web content administrator",
      "cms administrator",
      "cms assistant",
      "wordpress administrator",
      "website support",
      "web content specialist",
      "web content assistant",
      "wordpress specialist",
      "website coordinator"
    ],
    "Product Support": [
      "product support",
      "software support",
      "application support",
      "platform support",
      "saas support",
      "technical customer support",
      "customer technical support"
    ],
    "EdTech Support": [
      "edtech support",
      "educational technology",
      "education technology",
      "e-learning support",
      "elearning support",
      "e-learning administrator",
      "lms administrator",
      "lms support",
      "learning management system",
      "school ict",
      "school it support",
      "cbt support",
      "digital learning support",
      "learning technologist",
      "learning platform administrator",
      "learning platform support",
      "lms assistant"
    ],
    "Electrical Engineering": [
      "electrical",
      "maintenance engineer",
      "field engineer",
      "solar engineer",
      "power engineer"
    ],
    "Data Analysis": [
      "data analyst",
      "reporting analyst",
      "analytics analyst",
      "business intelligence",
      "bi analyst",
      "mis analyst"
    ],
    "Data Science": [
      "data scientist",
      "data science",
      "machine learning",
      "ml engineer"
    ],
    "Supply Chain": [
      "supply chain",
      "procurement",
      "logistics",
      "inventory",
      "warehouse",
      "purchasing",
      "sourcing",
      "demand planning"
    ],
    "IT Support": [
      "it support",
      "technical support",
      "helpdesk",
      "help desk",
      "service desk",
      "it technician",
      "desktop support"
    ],
    "Networking": [
      "network engineer",
      "network support",
      "network technician",
      "noc analyst",
      "noc engineer",
      "network operations"
    ],
    "Telecommunications": [
      "telecom",
      "telecommunications",
      "rf engineer",
      "transmission engineer",
      "fiber optic",
      "fibre optic",
      "noc engineer"
    ],
    "Frontend Engineering": [
      "frontend",
      "front end",
      "front-end",
      "react developer",
      "react engineer",
      "web developer",
      "javascript developer"
    ],
    "Backend Engineering": [
      "backend",
      "back end",
      "back-end",
      "node.js developer",
      "nodejs developer",
      "python developer",
      "java developer",
      "php developer",
      "django developer"
    ],
    "Full Stack Engineering": [
      "full stack",
      "fullstack",
      "full-stack"
    ],
    "Software Engineering": [
      "software engineer",
      "software developer",
      "full stack",
      "fullstack",
      "full-stack",
      "backend",
      "back-end",
      "back end",
      "python developer",
      "web developer",
      "qa engineer",
      "software tester"
    ],
    "Product Management": [
      "product analyst",
      "product associate",
      "associate product manager",
      "product management",
      "product operations"
    ],
    "Business Analysis": [
      "business analyst",
      "business intelligence",
      "business operations analyst",
      "process analyst"
    ],
    "Operations": [
      "operations analyst",
      "operations associate",
      "operations assistant",
      "operations coordinator",
      "business operations"
    ]
  },
  "skills": [
    "Python",
    "SQL",
    "Excel",
    "Data Analysis",
    "Pandas",
    "Matplotlib",
    "JavaScript",
    "HTML",
    "CSS",
    "React",
    "Frontend Development",
    "Web Development",
    "Git",
    "IT Support",
    "Computer Networking",
    "Technical Support",
    "Digital Marketing",
    "Copywriting"
  ],
  "boards": {
    "greenhouse": [
      "moniepoint"
    ],
    "lever": [
      "Yassir"
    ]
  },
  "nigeriaTerms": [
    "nigeria",
    "lagos",
    "abuja",
    "ibadan",
    "ogun",
    "ikeja",
    "lekki",
    "port harcourt",
    "enugu",
    "abia",
    "adamawa",
    "akwa ibom",
    "anambra",
    "bauchi",
    "bayelsa",
    "benue",
    "borno",
    "cross river",
    "delta",
    "ebonyi",
    "edo",
    "ekiti",
    "gombe",
    "imo",
    "jigawa",
    "kaduna",
    "kano",
    "katsina",
    "kebbi",
    "kogi",
    "kwara",
    "nasarawa",
    "nassarawa",
    "niger state",
    "ondo",
    "osun",
    "oyo",
    "plateau",
    "rivers",
    "sokoto",
    "taraba",
    "yobe",
    "zamfara",
    "fct"
  ],
  "industries": {
    "Education & EdTech": [
      "edtech",
      "education / teaching",
      "educational technology",
      "educational services",
      "school",
      "university",
      "e-learning",
      "elearning",
      "learning management system",
      "digital learning",
      "student management"
    ],
    "Healthcare & HealthTech": [
      "healthcare",
      "healthtech",
      "hospital",
      "clinic",
      "medical",
      "patient management",
      "electronic health record"
    ],
    "Logistics & Supply Chain": [
      "logistics",
      "warehousing",
      "warehouse",
      "freight",
      "fleet management",
      "supply chain",
      "transportation",
      "ride-hailing"
    ],
    "Manufacturing & Industrial Services": [
      "manufacturing",
      "industrial automation",
      "factory",
      "industrial services",
      "production plant",
      "equipment maintenance"
    ],
    "Energy & Utilities": [
      "solar",
      "renewable energy",
      "utilities",
      "electricity",
      "power distribution",
      "energy management",
      "metering"
    ],
    "Agriculture & Food Processing": [
      "agriculture",
      "agribusiness",
      "agritech",
      "food processing",
      "agro-allied",
      "farming",
      "food production"
    ],
    "Property & Facilities": [
      "property management",
      "facilities management",
      "facility management",
      "real estate",
      "proptech",
      "building services"
    ],
    "Insurance & Pensions": [
      "insurance",
      "insurtech",
      "pension",
      "pensions",
      "underwriting"
    ],
    "Nonprofit & Development": [
      "nonprofit",
      "non-profit",
      "ngo",
      "humanitarian",
      "international development",
      "development organization"
    ]
  }
}
;
export default makeWorker(page,config);
