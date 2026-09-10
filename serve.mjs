import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('./',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.sf2':'application/octet-stream','.wav':'audio/wav'};
http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){
    const upstream=http.request({hostname:'127.0.0.1',port:4190,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:4190'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'歌声エンジンへ接続できません。元の4190版を起動してください。'}));});
    req.pipe(upstream);return;
  }
  try{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(base,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(base)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);}catch{res.writeHead(400);res.end();}
}).listen(4193,'127.0.0.1',()=>console.log('AI Score Harmony Lab: http://127.0.0.1:4193/'));
