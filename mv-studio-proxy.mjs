import http from 'node:http';
let token='';
export async function mvStudioProxy(req,res,frontendPort=4193){
 if(!req.url.startsWith('/mv-studio/'))return false;
 const expectedHost='127.0.0.1:'+frontendPort;
 if(req.headers.host!==expectedHost||(req.headers.origin&&req.headers.origin!=='http://'+expectedHost)){res.writeHead(403);res.end();return true;}
 const route=req.url.slice(10);
 if(!/^\/(?:$|upload$|render$|status$|asset\/|result\/)/.test(route)){res.writeHead(404);res.end();return true;}
 try{
 if(!token||route==='/'){
 const page=await fetch('http://127.0.0.1:4195/');if(!page.ok)throw Error('MVスタジオを起動してください');
 let html=await page.text();token=html.match(/const token='([^']+)'/)?.[1];if(!token)throw Error('MVスタジオの認証情報を取得できません');
 if(route==='/'){
 html=html.replace("fetch(url,","fetch('/mv-studio'+url,").replaceAll("'/asset/","'/mv-studio/asset/")
 .replace("$('video').src=s.url;","$('video').src='/mv-studio'+s.url;").replace("$('download').href=s.url;","$('download').href='/mv-studio'+s.url;")
 .replace('<button id="previous">','<button id="previous" hidden>');
 html=html.replace('</html>',`<script>window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='song-transfer')return;try{if(uploading)throw Error('素材の読み込み完了を待ってください');const d=await api('/upload',{method:'POST',headers:{'X-File-Name':'song.wav'},body:e.data.audio});audio=d.src;$('audioName').textContent='song.wav（現在の曲）';$('bpm').value=e.data.bpm;update();parent.postMessage({type:'song-transfer-result',ok:true},location.origin);}catch(err){parent.postMessage({type:'song-transfer-result',ok:false,error:err.message},location.origin);}});</script></html>`);
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return true;
 }
 }
 const headers={'host':'127.0.0.1:4195','origin':'http://127.0.0.1:4195','x-mv-studio-token':token};
 for(const key of ['content-type','content-length','x-file-name','range'])if(req.headers[key])headers[key]=req.headers[key];
 const upstream=http.request({hostname:'127.0.0.1',port:4195,path:route,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('MVスタジオ (4195) を起動してください');});req.pipe(upstream);
 }catch(e){res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('MVスタジオ (4195) を起動してください。'+e.message);}
 return true;
}
