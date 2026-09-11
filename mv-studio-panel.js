void async function () {
  if (location.hostname !== '127.0.0.1') return;

  try {
    const response = await fetch('/mv-studio/', { cache: 'no-store' });
    if (!response.ok) return;
  } catch {
    return;
  }

  const old = document.getElementById('mvPanel');
  old.hidden = true;

  const section = document.createElement('section');
  section.id = 'mvStudioPanel';
  section.style.cssText = 'max-width:1400px;margin:24px auto;padding:24px;background:#fffaf7;border-radius:24px';
  section.innerHTML = `
    <h2>⑥ MV制作 · MVスタジオ</h2>
    <p>8系統の演出・背景・色調整・構成シャッフル・MP4出力</p>
    <button id="sendMvStudio">今の曲をMVに引き継ぐ</button>
    <button id="loadCharacterPack" hidden>ずんだもん・めたん素材をまとめて読み込む</button>
    <button id="loadCc0Pack">CC0素材19枚を使う</button>
    <button id="goMvPreview">書き出す場所へ移動</button>
    <button id="reloadMvStudio">制作画面を再接続</button>
    <p id="mvStudioMessage" role="status">① 曲を引き継ぐ（省略可） → ② 素材を読み込む → ③「書き出す場所へ移動」→「20秒プレビュー」を押します。</p>
    <iframe title="MVスタジオ制作画面" src="/mv-studio/" style="width:100%;height:1000px;border:0;border-radius:16px"></iframe>`;
  old.after(section);

  const frame = section.querySelector('iframe');
  const message = section.querySelector('#mvStudioMessage');
  const characterButton = section.querySelector('#loadCharacterPack');
  let characterManifest = null;

  const nav = [...document.querySelectorAll('button')].find(button => button.textContent === '⑥ MV制作');
  if (nav) nav.onclick = () => section.scrollIntoView({ behavior: 'smooth' });

  async function getManifest(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw Error('素材一覧を開けません');
    return response.json();
  }

  async function sendPack(manifest, label, preset = '') {
    const load = async (path, fit = 'cover') => {
      const response = await fetch(path);
      if (!response.ok) throw Error(path);
      return { name: path.split('/').pop(), blob: await response.blob(), fit };
    };
    const [backgrounds, main, characters] = await Promise.all([
      Promise.all((manifest.backgrounds || []).map(load)),
      Promise.all((manifest.main || []).map(load)),
      Promise.all((manifest.characters || []).map(path => load(path, 'contain')))
    ]);
    frame.contentWindow.postMessage({
      type: 'asset-pack-transfer',
      label,
      preset,
      backgrounds,
      main: [...main, ...characters]
    }, location.origin);
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'song-transfer-result') {
      message.textContent = event.data.ok
        ? '現在の曲とBPMを引き継ぎました。次に素材を読み込み、「書き出す場所へ移動」→「20秒プレビュー」を押してください。'
        : '曲の受け渡しに失敗しました：' + event.data.error;
    }
    if (event.data?.type === 'asset-pack-transfer-result') {
      message.textContent = event.data.ok
        ? `${event.data.label}${event.data.count}枚を読み込みました。「書き出す場所へ移動」→「20秒プレビュー」で映像を作れます。`
        : `${event.data.label || '素材'}の読み込みに失敗しました：${event.data.error}`;
    }
  });

  section.querySelector('#reloadMvStudio').onclick = () => frame.src = '/mv-studio/';
  section.querySelector('#goMvPreview').onclick = () => frame.contentWindow.postMessage({ type: 'show-render-controls' }, location.origin);

  characterButton.onclick = async function () {
    this.disabled = true;
    try {
      characterManifest ||= await getManifest('local-assets/mv-zundamon-metan/manifest.json');
      const count = (characterManifest?.backgrounds?.length || 0)
        + (characterManifest?.main?.length || 0)
        + (characterManifest?.characters?.length || 0);
      message.textContent = `ずんだもん・めたん素材${count}枚を準備しています…`;
      await sendPack(characterManifest, 'ずんだもん・めたん素材', 'cast');
      message.textContent = 'MVスタジオへずんだもん・めたん素材を送信しています…';
    } catch (error) {
      message.textContent = 'ずんだもん・めたん素材を読み込めません：' + error.message;
    } finally {
      this.disabled = false;
    }
  };

  section.querySelector('#loadCc0Pack').onclick = async function () {
    this.disabled = true;
    try {
      message.textContent = 'CC0素材19枚を準備しています…';
      const manifest = await getManifest('assets/mv-cc0-pack/manifest.json');
      await sendPack(manifest, 'CC0素材');
      message.textContent = 'MVスタジオへCC0素材を送信しています…';
    } catch (error) {
      message.textContent = 'CC0素材を読み込めません：' + error.message;
    } finally {
      this.disabled = false;
    }
  };

  section.querySelector('#sendMvStudio').onclick = async function () {
    this.disabled = true;
    try {
      message.textContent = '曲を準備しています…';
      if (typeof window.MVBridge !== 'function') {
        throw Error('曲の受け渡し機能を読み込めませんでした。ページを再読み込みしてください。');
      }
      const result = await window.MVBridge();
      frame.contentWindow.postMessage({
        type: 'song-transfer',
        audio: new Blob([result.bytes], { type: 'audio/wav' }),
        bpm: result.bpm
      }, location.origin);
      message.textContent = '制作画面へ送信しました。音源欄への反映を待っています…';
    } catch (error) {
      message.textContent = error.message;
    } finally {
      this.disabled = false;
    }
  };

  try {
    characterManifest = await getManifest('local-assets/mv-zundamon-metan/manifest.json');
    const count = (characterManifest.backgrounds?.length || 0)
      + (characterManifest.main?.length || 0)
      + (characterManifest.characters?.length || 0);
    characterButton.textContent = `ずんだもん・めたん素材${count}枚をまとめて読み込む`;
    characterButton.hidden = false;
    message.textContent = '① 曲を引き継ぐ（省略可） → ②「ずんだもん・めたん素材」を読み込む → ③ 書き出す場所へ移動します。';
  } catch {
    // The licensed character pack is local-only. Keep the public UI on its CC0 fallback.
  }
}();
