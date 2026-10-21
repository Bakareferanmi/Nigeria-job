// Public job APIs only. No arbitrary URL proxy, credentials, or application submission.
const ENTRY=/\b(intern(ship)?|trainee|graduate|entry[- ]level|junior|associate|assistant|apprentice|nysc)\b/i;
const SENIOR=/\b(senior|principal|staff engineer|lead engineer|director|head of|vice president|chief|manager|architect)\b/i;
const NG=/nigeria|lagos|abuja|ibadan|ogun|ikeja|lekki|port harcourt|enugu/i;
export const clean=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export const safeUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}};
export function normalize(j){return {...j,title:clean(j.title),company:clean(j.company)||'Unspecified',url:safeUrl(j.url),location:clean(j.location),description:clean(j.description).slice(0,12000),salary:clean(j.salary),published:String(j.published||'')};}
export function match(j,config){
 if(!j.title||!j.url||(SENIOR.test(j.title)&&!ENTRY.test(j.title)))return null;
 if(!j.remote&&!NG.test(j.location))return null;
 const tracks=Object.entries(config.tracks).filter(([,words])=>words.some(w=>j.title.toLowerCase().includes(w))).map(([t])=>t);
 if(!tracks.length)return null;
 const text=(j.title+' '+j.description).toLowerCase();
 const skills=config.skills.filter(s=>new RegExp('(?<!\\w)'+s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?!\\w)').test(text));
 const years=[...j.description.slice(0,3500).matchAll(/\b([1-9]\d?)\s*(?:\+|plus)?\s*(?:years|yrs)\b/gi)].map(m=>+m[1]);
 let score=35+Math.min(15,tracks.length*5)+(ENTRY.test(j.title)?22:0)-(SENIOR.test(j.title)?35:0)+Math.min(15,skills.length*3)+(j.eligibility==='yes'?8:0)+(/lagos/i.test(j.location)?5:0);
 if(years.length)score+=Math.min(...years)>=4?-20:Math.min(...years)<=2?8:0;
 return {...j,tracks,skills,score:Math.max(0,Math.min(100,score))};
}
async function json(url){const r=await fetch(url,{headers:{'User-Agent':'NigeriaJobHunter/2.0','Accept':'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
const salary=j=>j.salary||((j.salaryMin||j.salaryMax||j.minSalary||j.maxSalary)?[j.salaryCurrency||j.currency||'',j.salaryMin||j.minSalary||'',j.salaryMax||j.maxSalary?'– '+(j.salaryMax||j.maxSalary):''].join(' '):'');
export async function collect(config){
 const sources=[
 ['Himalayas',async()=>{const d=await json('https://himalayas.app/jobs/api/search?country=NG&sort=recent&page=1');return(d.jobs||[]).filter(j=>{const loc=j.locationRestrictions||[];const tz=j.timezoneRestrictions||[];return(!loc.length||loc.some(c=>/^(ng|nigeria)$/i.test(typeof c==='string'?c:c.alpha2||c.code||c.name||'')))&&(!tz.length||tz.some(t=>['1','+1','utc+1','utc+01','utc+01:00','+01:00','gmt+1'].includes(String(t).toLowerCase())))}).map(j=>({title:j.title,company:j.companyName,url:j.applicationLink,location:(j.locationRestrictions||[]).map(c=>typeof c==='string'?c:c.name||c.code||c.alpha2).join(', ')||'Worldwide',description:j.description||j.excerpt,published:j.pubDate,remote:true,eligibility:'yes',salary:salary(j)}))}],
 ['Jobicy',async()=>{const d=await json('https://jobicy.com/api/v2/remote-jobs?count=100');return(d.jobs||[]).filter(j=>NG.test(j.jobGeo)||/^(anywhere|worldwide|global|international)$/i.test(clean(j.jobGeo))).map(j=>({title:j.jobTitle,company:j.companyName,url:j.url,location:j.jobGeo,description:j.jobDescription||j.jobExcerpt,published:j.pubDate,remote:true,eligibility:NG.test(j.jobGeo)?'yes':'likely',salary:salary(j)}))}],
 ['Remotive',async()=>{const d=await json('https://remotive.com/api/remote-jobs');return(d.jobs||[]).filter(j=>NG.test(j.candidate_required_location)||/worldwide|anywhere|global/i.test(j.candidate_required_location)).map(j=>({title:j.title,company:j.company_name,url:j.url,location:j.candidate_required_location,description:j.description,published:j.publication_date,remote:true,eligibility:NG.test(j.candidate_required_location)?'yes':'likely',salary:j.salary}))}]
 ];
 for(const token of config.boards.greenhouse||[])if(/^[\w-]+$/.test(token))sources.push(['Greenhouse:'+token,async()=>{const d=await json('https://boards-api.greenhouse.io/v1/boards/'+token+'/jobs?content=true');return(d.jobs||[]).map(j=>({title:j.title,company:token,url:j.absolute_url,location:j.location?.name,description:j.content,published:j.updated_at,remote:/remote/i.test(j.location?.name||''),eligibility:'unknown'}))}]);
 for(const token of config.boards.lever||[])if(/^[\w-]+$/.test(token))sources.push(['Lever:'+token,async()=>{const d=await json('https://api.lever.co/v0/postings/'+token+'?mode=json');return d.map(j=>({title:j.text,company:token,url:j.hostedUrl||j.applyUrl,location:j.categories?.location,description:j.descriptionPlain||j.description,remote:/remote/i.test(j.categories?.location||''),eligibility:'unknown'}))}]);
 const result=await Promise.all(sources.map(async([name,fn])=>{try{return{name,jobs:await fn(),ok:true}}catch(e){return{name,jobs:[],ok:false,error:e.name==='TimeoutError'?'Source timed out':e.message}}}));
 const unique=new Map();for(const s of result)for(const raw of s.jobs){const j=match(normalize({...raw,source:s.name}),config);if(j)unique.set(j.url.replace(/\/$/,''),j)}
 return{jobs:[...unique.values()].sort((a,b)=>b.score-a.score),sources:result.map(({name,ok,error,jobs})=>({name,ok,error,fetched:jobs.length})),updatedAt:new Date().toISOString(),localBoardsConfigured:!!((config.boards.greenhouse||[]).length+(config.boards.lever||[]).length)};
}
let cache=null;
export function makeWorker(page,config){return{async fetch(request){const url=new URL(request.url);const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET'}});
 if(url.pathname==='/api/jobs'){if(!cache||Date.now()-cache.time>300000){const data=await collect(config);if(data.sources.some(s=>s.ok))cache={time:Date.now(),data};else return Response.json(data,{status:503,headers:{...headers,'Cache-Control':'no-store'}})}return Response.json(cache.data,{headers:{...headers,'Cache-Control':'private, max-age=60'}})}
 if(url.pathname==='/api/config')return Response.json({tracks:Object.keys(config.tracks),skills:config.skills},{headers});
 if(url.pathname!=='/')return new Response('Not found',{status:404,headers});
 return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
}}}
