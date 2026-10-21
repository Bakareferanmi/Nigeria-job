import http from 'node:http';
import worker from './worker/index.js';
http.createServer(async(req,res)=>{try{const r=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch{res.writeHead(500);res.end('Request failed')}}).listen(Number(process.env.PORT)||4173,'0.0.0.0');
