/* Independent Canvas MV prototype. No third-party plugins. */
(() => {
  const panel = document.createElement('section');
  panel.id = 'mvPanel';
  panel.style.cssText = 'margin:32px auto;padding:24px;max-width:1100px;background:#fff;color:#17213b;border:2px solid #7864d4;border-radius:20px';
  panel.innerHTML = `<h2>⑥ MV制作</h2><p>曲を引き継ぎ、画像を拍に合わせて動かします。ブラウザだけで使える文字なしMVです。</p><button id="mvSong">今の曲を引き継ぐ</button> <button id="mvCc0Pack">CC0素材19枚をまとめて読み込む</button> <label>音声ファイル <input id="mvAudio" type="file" accept="audio/*"></label><p><label>画像（複数可） <input id="mvImages" type="file" accept="image/png,image/jpeg,image/webp" multiple></label></p><label>BPM <input id="mvBpm" type="number" min="30" max="300" value="96" style="width:80px"></label> <label>切替 <select id="mvBeats"><option value="4">4拍</option><option value="8">8拍</option><option value="16">16拍</option></select></label> <label>演出 <select id="mvStyle"><option value="mix">ミックス</option><option value="zoom">ズーム</option><option value="split">分割</option><option value="slide">スライド</option><option value="circle">円形</option></select></label> <button id="mvShuffle">別の構成</button><p><button id="mvPlay">先頭から再生</button> <button id="mvStop">停止</button> <button id="mvSave">動画を保存（実時間）</button></p><canvas id="mvCanvas" width="1280" height="720" style="width:100%;background:#182036;border-radius:12px"></canvas><audio id="mvPlayer" controls style="width:100%"></audio><p id="mvStatus" role="status">曲と画像を選んでください。録画中は画面を開いたままにしてください。</p>`;
  document.body.append(panel);
  const nav = document.querySelector('.workflow-nav');
  const jump = document.createElement('button'); jump.textContent = '⑥ MV制作'; jump.type='button'; jump.onclick=()=>panel.scrollIntoView({behavior:'smooth'});
  (nav || document.body).append(jump);
  const $ = id => document.getElementById(id), canvas=$('mvCanvas'), ctx=canvas.getContext('2d'), player=$('mvPlayer');
  let pictures=[], seed=0, url, recorder, stream, audioContext, source, destination, raf;
  const status = text => $('mvStatus').textContent=text;
  function loadAudio(blob){ player.pause(); if(url) URL.revokeObjectURL(url); url=URL.createObjectURL(blob); player.src=url; }
  $('mvAudio').onchange=e=>{if(e.target.files[0])loadAudio(e.target.files[0]);};
  $('mvImages').onchange=async e=>{
    try { const next=await Promise.all([...e.target.files].slice(0,30).map(async file=>{ const image=await createImageBitmap(file); return image; })); pictures.forEach(p=>p.close()); pictures=next; draw(); status(`${pictures.length}枚を読み込みました（最大30枚）。`); } catch(err){status('画像を読み込めません: '+err.message);}
  };
  $('mvCc0Pack').onclick=async()=>{
    try{
      status('CC0素材を読み込んでいます…');
      const manifest=await fetch('assets/mv-cc0-pack/manifest.json').then(r=>{if(!r.ok)throw Error('素材一覧を開けません');return r.json();});
      const paths=[...manifest.backgrounds,...manifest.main,...manifest.characters];
      const next=await Promise.all(paths.map(async path=>createImageBitmap(await fetch(path).then(r=>{if(!r.ok)throw Error(path);return r.blob();}))));
      pictures.forEach(p=>p.close());pictures=next;draw();status(`CC0素材${pictures.length}枚を読み込みました。`);
    }catch(err){status('CC0素材を読み込めません: '+err.message);}
  };
  $('mvSong').onclick=async()=>{ try { status('曲を準備しています…'); const result=await window.MVBridge(); loadAudio(new Blob([result.bytes],{type:'audio/wav'})); $('mvBpm').value=result.bpm; status('現在の曲を引き継ぎました。編集後はもう一度引き継いでください。'); }catch(e){status(e.message);} };
  function cover(image,x,y,w,h,scale=1){const r=Math.max(w/image.width,h/image.height)*scale;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(image,x+(w-image.width*r)/2,y+(h-image.height*r)/2,image.width*r,image.height*r);ctx.restore();}
  function draw(){
    const bpm=Math.max(30,Math.min(300,Number($('mvBpm').value)||96)), duration=60/bpm*Number($('mvBeats').value), t=player.currentTime||0, shot=Math.floor(t/duration), phase=(t%duration)/duration;
    ctx.fillStyle='#182036';ctx.fillRect(0,0,1280,720);
    if(!pictures.length){ctx.fillStyle='#fff';ctx.font='32px sans-serif';ctx.fillText('画像を選んでMVを作る',50,360);return;}
    const image=pictures[(shot+seed)%pictures.length], next=pictures[(shot+seed+1)%pictures.length];
    let style=$('mvStyle').value; if(style==='mix')style=['zoom','split','slide','circle'][(shot+seed)%4];
    if(style==='zoom')cover(image,0,0,1280,720,1+phase*.12);
    if(style==='split'){cover(image,0,0,632,720,1+phase*.05);cover(next,648,0,632,720,1+(1-phase)*.05);}
    if(style==='slide'){cover(next,0,0,1280,720);cover(image,-phase*160,0,1280,720,1.15);}
    if(style==='circle'){cover(next,0,0,1280,720);ctx.save();ctx.beginPath();ctx.arc(640,360,220+phase*160,0,Math.PI*2);ctx.clip();cover(image,0,0,1280,720);ctx.restore();}
  }
  function loop(){draw(); if(!player.paused)raf=requestAnimationFrame(loop);}
  player.onplay=()=>{cancelAnimationFrame(raf);loop();}; player.onseeked=draw;
  function stop(){player.pause();cancelAnimationFrame(raf);if(recorder&&recorder.state!=='inactive')recorder.stop();}
  player.onended=stop;
  async function play(){if(!pictures.length||!player.src)throw Error('先に曲と画像を選んでください。');player.currentTime=0;if(audioContext)await audioContext.resume();await player.play();}
  $('mvPlay').onclick=()=>play().catch(e=>status(e.message));$('mvStop').onclick=stop;
  $('mvShuffle').onclick=()=>{seed++;draw();};['mvBpm','mvBeats','mvStyle'].forEach(id=>$(id).onchange=draw);
  $('mvSave').onclick=async()=>{
    try{
      if(!window.MediaRecorder||!canvas.captureStream)throw Error('このブラウザでは録画未対応です。PC Chromeで試してください。');
      if(!pictures.length||!player.src)throw Error('先に曲と画像を選んでください。');
      if(!audioContext){audioContext=new AudioContext();source=audioContext.createMediaElementSource(player);destination=audioContext.createMediaStreamDestination();source.connect(destination);source.connect(audioContext.destination);}
      await audioContext.resume();stream=canvas.captureStream(30);destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track.clone()));
      const type=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!type)throw Error('対応する録画形式がありません。');
      recorder=new MediaRecorder(stream,{mimeType:type});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const controls=[...panel.querySelectorAll('input,select,button')].filter(e=>e.id!=='mvStop'); controls.forEach(e=>e.disabled=true);
      recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());controls.forEach(e=>e.disabled=false);const href=URL.createObjectURL(new Blob(chunks,{type})),a=document.createElement('a');a.href=href;a.download='song-mv.'+(type.includes('mp4')?'mp4':'webm');a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);status('録画を保存しました。停止した場合はそこまでの動画です。');};
      recorder.start(1000);await play();status('録画中。曲が終わると保存します。');
    }catch(e){stop();status(e.message);}
  };
  draw();
})();
