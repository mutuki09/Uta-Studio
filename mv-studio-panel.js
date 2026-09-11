void async function(){
 if(location.hostname!=='127.0.0.1')return;
 try{const response=await fetch('/mv-studio/',{cache:'no-store'});if(!response.ok)return;}catch{return;}
 const old=document.getElementById('mvPanel');old.hidden=true;
 const section=document.createElement('section');section.id='mvStudioPanel';section.style.cssText='max-width:1400px;margin:24px auto;padding:24px;background:#fffaf7;border-radius:24px';
 section.innerHTML='<h2>⑥ MV制作 · MVスタジオ</h2><p>8系統の演出・背景・色調整・構成シャッフル・MP4出力</p><button id="sendMvStudio">今の曲をMVに引き継ぐ</button> <button id="reloadMvStudio">制作画面を再接続</button><p id="mvStudioMessage" role="status">MVスタジオ（4195）に接続しました。画像を選び、20秒プレビューから確認してください。</p><iframe title="MVスタジオ制作画面" src="/mv-studio/" style="width:100%;height:1000px;border:0;border-radius:16px"></iframe>';
 old.after(section);const frame=section.querySelector('iframe'),message=section.querySelector('#mvStudioMessage');
 const nav=[...document.querySelectorAll('button')].find(b=>b.textContent==='⑥ MV制作');if(nav)nav.onclick=()=>section.scrollIntoView({behavior:'smooth'});
 window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='song-transfer-result')message.textContent=e.data.ok?'現在の曲とBPMを引き継ぎました。画像を選び、プレビューを作成してください。':'曲の受け渡しに失敗しました：'+e.data.error;});
 section.querySelector('#reloadMvStudio').onclick=()=>frame.src='/mv-studio/';
 section.querySelector('#sendMvStudio').onclick=async function(){this.disabled=true;try{message.textContent='曲を準備しています…';const r=await window.MVBridge();frame.contentWindow.postMessage({type:'song-transfer',audio:new Blob([r.bytes],{type:'audio/wav'}),bpm:r.bpm},location.origin);message.textContent='制作画面へ送信しました。下の音源欄にsong.wavが表示されたことを確認してください。';}catch(e){message.textContent=e.message;}finally{this.disabled=false;}};
}();
