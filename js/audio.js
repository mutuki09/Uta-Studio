/* audio.js — Web Audio API で音を鳴らす。
   音色は data/presets.js の TIMBRES に書いたパラメータで決まる。
   ・波を数枚かさねる（waves）
   ・ローパスフィルタを動かす（cut / sweep）
   ・音量のエンベロープをつける（a d s r）
   この 3 つで「電子音っぽさ」がかなり減る。 */
(function (root) {
  "use strict";

  var ctx = null, master = null, wetGain = null, vocalGain = null;
  var partGains = null, activeSources = [];
  var timer = null, playing = false, onStep = null;
  var vocalBuffer = null, vocalSource = null, vocalName = "";

  /* 出力グラフを組む。書き出し用のOfflineAudioContextにも同じ形で組めるよう、
     contextを引数で受け取る。 */
  function buildGraph(audioContext) {
    ctx = audioContext;

    master = ctx.createGain();
    master.gain.value = 0.9;
    partGains = {};
    ["melody", "pad", "bass", "drum"].forEach(function (part) {
      partGains[part] = ctx.createGain();
      partGains[part].gain.value = 1;
      partGains[part].connect(master);
    });
    vocalGain = ctx.createGain();
    vocalGain.gain.value = 1;
    vocalGain.connect(master);

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;

    /* 残響。インパルス応答はノイズから作るので、音声ファイルはいらない */
    var dur = 2.0, len = Math.floor(ctx.sampleRate * dur);
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    var conv = ctx.createConvolver();
    conv.buffer = ir;
    wetGain = ctx.createGain();
    wetGain.gain.value = 0.2;

    master.connect(comp); comp.connect(ctx.destination);
    master.connect(wetGain); wetGain.connect(conv); conv.connect(ctx.destination);
    return ctx;
  }

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    return buildGraph(new AC());
  }

  /* 書き出し中にモジュール変数を差し替えるので、元の再生グラフを退避しておく。 */
  function snapshotGraph() {
    return { ctx:ctx, master:master, wetGain:wetGain, vocalGain:vocalGain,
      partGains:partGains, activeSources:activeSources };
  }

  function restoreGraph(saved) {
    ctx = saved.ctx; master = saved.master; wetGain = saved.wetGain;
    vocalGain = saved.vocalGain; partGains = saved.partGains; activeSources = saved.activeSources;
  }

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function trackSource(source) {
    activeSources.push(source);
    source.onended = function () {
      var index = activeSources.indexOf(source);
      if (index >= 0) activeSources.splice(index, 1);
    };
    return source;
  }

  function velocityScale(note) {
    if (!note || note.v === undefined) return 1;
    return Math.max(0.08, Math.min(1, note.v / 127));
  }

  /** 1 音を鳴らす。tm は TIMBRES の melody / bass / pad のどれか */
  function voice(t, midi, dur, tm, gainScale, part) {
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 1;
    f.frequency.setValueAtTime(tm.cut, t);
    if (tm.sweep < 1) {
      f.frequency.exponentialRampToValueAtTime(
        Math.max(180, tm.cut * tm.sweep), t + Math.min(dur, 1.2));
    }

    tm.waves.forEach(function (w) {
      var osc = ctx.createOscillator();
      osc.type = w[0];
      osc.frequency.value = hz(midi);
      osc.detune.value = w[2] || 0;
      var og = ctx.createGain();
      og.gain.value = w[1];
      osc.connect(og); og.connect(f);
      osc.start(t);
      osc.stop(t + dur + tm.r + 0.05);
      trackSource(osc);
    });

    /* ギターらしさ：弾いた瞬間の小さなノイズ */
    if (tm.pluck) noise(t, 0.03, "bandpass", Math.min(6000, hz(midi) * 4), 0.05 * (gainScale || 1), part);

    var peak = tm.peak * (gainScale === undefined ? 1 : gainScale);
    var sus = Math.max(0.0001, peak * tm.s);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + tm.a);
    g.gain.exponentialRampToValueAtTime(sus, t + tm.a + tm.d);
    g.gain.setValueAtTime(sus, t + Math.max(tm.a + tm.d, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(tm.a + tm.d, dur) + tm.r);

    f.connect(g); g.connect(partGains[part] || master);
  }

  function noise(t, dur, type, freq, peak, part) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var src = ctx.createBufferSource(); src.buffer = b;
    var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    var g = ctx.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(partGains[part] || master);
    src.start(t);
    trackSource(src);
  }

  function drum(t, kind, kit, gainScale) {
    var retro = kit === "retro";
    var electronic = kit === "electronic";
    var tight = kit === "tight";
    var level = (kit === "soft" ? 0.58 : 1) * (gainScale === undefined ? 1 : gainScale);
    if (kind === "kick") {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = retro || electronic ? "square" : "sine";
      o.frequency.setValueAtTime(retro ? 110 : (electronic ? 185 : 150), t);
      o.frequency.exponentialRampToValueAtTime(electronic ? 38 : 45, t + (tight ? 0.07 : 0.11));
      g.gain.setValueAtTime(0.55 * level, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (tight ? 0.17 : 0.3));
      o.connect(g); g.connect(partGains.drum);
      o.start(t); o.stop(t + (tight ? 0.19 : 0.32)); trackSource(o);
    } else if (kind === "snare") {
      noise(t, retro ? 0.09 : (tight ? 0.1 : 0.17), "bandpass",
        retro ? 2600 : (electronic ? 2300 : 1700), 0.2 * level, "drum");
      if (electronic) {
        var so = ctx.createOscillator(), sg = ctx.createGain();
        so.type = "triangle"; so.frequency.value = 185;
        sg.gain.setValueAtTime(0.12 * level, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        so.connect(sg); sg.connect(partGains.drum); so.start(t); so.stop(t + 0.11); trackSource(so);
      }
    } else if (kind === "crash") {
      noise(t, 0.72, "highpass", electronic ? 7600 : 6400, 0.14 * level, "drum");
    } else {
      noise(t, tight ? 0.025 : 0.045, "highpass", electronic ? 8600 : 7200, 0.09 * level, "drum");
    }
  }

  function stop() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    activeSources.slice().forEach(function (source) {
      try { source.stop(); } catch (error) { /* すでに停止済み */ }
      try { source.disconnect(); } catch (error) { /* 切断済み */ }
    });
    activeSources = [];
    if (vocalSource) {
      try { vocalSource.stop(); } catch (error) { /* すでに停止済み */ }
      vocalSource = null;
    }
  }

  function loadVocal(arrayBuffer, name) {
    ensure();
    stop();
    return ctx.decodeAudioData(arrayBuffer.slice(0)).then(function (decoded) {
      vocalBuffer = decoded;
      vocalName = name || "NEUTRINO vocal.wav";
      return { name: vocalName, duration: decoded.duration };
    });
  }

  function clearVocal() {
    stop();
    vocalBuffer = null;
    vocalName = "";
  }

  function setVocalVolume(value) {
    ensure();
    vocalGain.gain.value = Math.max(0, Math.min(1.5, Number(value) || 0));
  }

  function setMasterVolume(value) {
    ensure();
    master.gain.value = Math.max(0, Math.min(1.5, Number(value) || 0));
  }

  function setPartVolume(part, value) {
    ensure();
    if (!partGains[part]) return false;
    partGains[part].gain.value = Math.max(0, Math.min(1.5, Number(value) || 0));
    return true;
  }

  function dispose() {
    stop();
    vocalBuffer = null;
    vocalName = "";
    if (ctx && typeof ctx.close === "function") ctx.close();
    ctx = master = wetGain = vocalGain = partGains = null;
  }

  /** 曲を再生する。onStepCb(現在のステップ) が呼ばれる。終わると -1 */
  function importedDrumKind(note) {
    if (note === 35 || note === 36) return "kick";
    if (note === 38 || note === 40 || note >= 41 && note <= 48) return "snare";
    if (note === 49 || note === 51 || note === 52 || note === 55 || note === 57 || note === 59) return "crash";
    return "hat";
  }

  /* 音を鳴らす予定表を作る。再生と書き出しで同じものを使うので、
     書き出した音源は再生と同じ内容になる。 */
  function buildSchedule(song, timbre, spb, leadSteps, enabled, drumKit) {
  var fire = [];
  if (song.importedMidi && Array.isArray(song.importedTracks)) {
    song.importedTracks.forEach(function (track) {
      if (track.enabled === false) return;
      if (track.role === "melody" && enabled.melody === false) return;
      if (track.role === "bass" && enabled.bass === false) return;
      if (track.role === "drum" && enabled.drum === false) return;
      if (track.role === "accompaniment" && enabled.pad === false) return;
      var notes = track.id === song.melodyTrackId ? song.melody : (track.notes || []);
      notes.forEach(function (n) {
        fire.push({ s:n.s + leadSteps, f:function (t) {
          if (track.isDrum) {
            drum(t, importedDrumKind(n.n), drumKit, velocityScale(n));
            return;
          }
          var part = track.role === "melody" ? "melody" : (track.role === "bass" ? "bass" : "pad");
          var trackTimbre = part === "melody" ? timbre.melody : (part === "bass" ? timbre.bass : timbre.pad);
          voice(t, n.n, n.d * spb * 0.92, trackTimbre, velocityScale(n), part);
        } });
      });
    });
  } else {
  if (enabled.melody !== false) {
    song.melody.forEach(function (n) {
      fire.push({ s: n.s + leadSteps, f: function (t) { voice(t, n.n, n.d * spb * 0.92, timbre.melody, velocityScale(n), "melody"); } });
    });
  }
  if (enabled.bass !== false) {
    song.bass.forEach(function (n) {
      fire.push({ s: n.s + leadSteps, f: function (t) { voice(t, n.n, n.d * spb * 0.9, timbre.bass, velocityScale(n), "bass"); } });
    });
  }
  if (enabled.pad !== false) {
    song.pad.forEach(function (p) {
      p.chord.forEach(function (pc, chordIndex) {
        fire.push({ s: p.s + leadSteps, f: function (t) {
          var strumDelay = timbre.pad.pluck ? chordIndex * 0.018 : 0;
          voice(t + strumDelay, pc, Math.max(0.06, p.d * spb * 0.95 - strumDelay), timbre.pad, velocityScale(p), "pad");
        } });
      });
    });
  }
  (song.extraTracks || []).forEach(function (track) {
    var trackTimbre = timbre.extraTracks && timbre.extraTracks[track.id] || timbre.pad;
    (track.notes || []).forEach(function (n) {
      fire.push({ s:n.s + leadSteps, f:function (t) {
        voice(t, n.n, n.d * spb * 0.9, trackTimbre, velocityScale(n), "pad");
      } });
    });
  });
  if (enabled.drum !== false) {
    song.drum.forEach(function (d) {
      fire.push({ s: d.s + leadSteps, f: function (t) { drum(t, d.kind, drumKit, velocityScale(d)); } });
    });
  }
  }
  fire.sort(function (a, b) { return a.s - b.s; });
    return fire;
  }

  function play(song, bpm, timbre, onStepCb) {
    ensure();
    if (ctx.state === "suspended") ctx.resume();
    stop();
    onStep = onStepCb;

    var spb = 60 / bpm / 4;            /* 16分ひとつぶんの秒数 */
    var startAt = ctx.currentTime + 0.12;
    var enabled = timbre.enabled || { melody:true, bass:true, pad:true, drum:true };
    var drumKit = timbre.drumKit || (timbre.melody.retro ? "retro" : "acoustic");
    /* The independent vocal track starts with the renderer.  Delay the
       accompaniment by the WAV's declared leading silence. */
    var leadSteps = Math.max(0, Math.round(timbre.leadSteps || 0));
    playing = true;

    var fire = buildSchedule(song, timbre, spb, leadSteps, enabled, drumKit);

    if (vocalBuffer) {
      vocalSource = ctx.createBufferSource();
      vocalSource.buffer = vocalBuffer;
      vocalSource.connect(vocalGain);
      vocalSource.start(startAt);
    }

    var done = 0;
    var finishStep = Math.max(song.totalSteps + leadSteps + 2,
      vocalBuffer ? vocalBuffer.duration / spb + 1 : 0);
    timer = setInterval(function () {
      if (!playing) return;
      var now = ctx.currentTime;
      while (done < fire.length && startAt + fire[done].s * spb < now + 0.25) {
        var e = fire[done++];
        e.f(startAt + e.s * spb);
      }
      var absoluteStep = (now - startAt) / spb;
      var cur = absoluteStep - leadSteps;
      if (onStep) onStep(cur);
      if (absoluteStep > finishStep) { stop(); if (onStep) onStep(-1); }
    }, 25);
    return { vocalStartDelaySeconds:Math.max(0, startAt - ctx.currentTime) };
  }

  /* 完成音源用に伴奏だけをオフラインで書き出す。歌声はwav-export側で混ぜる。
     再生中のグラフは退避してから差し替えるので、鳴っている音は乱れない。 */
  function renderOffline(song, bpm, timbre, options) {
    var opts = options || {};
    var OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return Promise.reject(new Error("この環境では音源を書き出せません"));

    var spb = 60 / bpm / 4;
    var enabled = timbre.enabled || { melody:true, bass:true, pad:true, drum:true };
    var drumKit = timbre.drumKit || (timbre.melody.retro ? "retro" : "acoustic");
    var leadSteps = Math.max(0, Math.round(timbre.leadSteps || 0));
    var sampleRate = Math.round(Number(opts.sampleRate) || 44100);
    var tail = opts.tailSeconds === undefined ? 3 : Math.max(0, Number(opts.tailSeconds));

    var fire = buildSchedule(song, timbre, spb, leadSteps, enabled, drumKit);
    var lastStep = fire.length ? fire[fire.length - 1].s : 0;
    var seconds = Math.max(0.1, Math.max(lastStep, (Number(song.totalSteps) || 0) + leadSteps) * spb) + tail;
    var frames = Math.ceil(seconds * sampleRate);

    var saved = snapshotGraph();
    var offline;
    try {
      offline = new OfflineCtx(2, frames, sampleRate);
      activeSources = [];
      buildGraph(offline);
      master.gain.value = saved.master ? saved.master.gain.value : 0.9;
      if (saved.partGains) {
        Object.keys(partGains).forEach(function (part) {
          if (saved.partGains[part]) partGains[part].gain.value = saved.partGains[part].gain.value;
        });
      }
      /* 書き出しでは 0 秒ちょうどから鳴らす。再生時の 0.12 秒の待ちは要らない。 */
      fire.forEach(function (event) { event.f(event.s * spb); });
    } catch (error) {
      restoreGraph(saved);
      return Promise.reject(error);
    }

    return offline.startRendering().then(function (buffer) {
      restoreGraph(saved);
      return {
        channels:[buffer.getChannelData(0), buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0)],
        sampleRate:buffer.sampleRate,
        durationSeconds:buffer.duration
      };
    }, function (error) {
      restoreGraph(saved);
      throw error;
    });
  }

  root.audio = {
    id: "current",
    ensure: ensure, play: play, stop: stop,
    renderOffline: renderOffline,
    canRenderOffline: function () { return true; },
    loadVocal: loadVocal, clearVocal: clearVocal, setVocalVolume: setVocalVolume,
    setMasterVolume: setMasterVolume, setPartVolume: setPartVolume, dispose: dispose,
    hasVocal: function () { return !!vocalBuffer; },
    vocalInfo: function () { return vocalBuffer ? { name:vocalName, duration:vocalBuffer.duration } : null; },
    isPlaying: function () { return playing; },
    debugState: function () { return { context:!!ctx, activeSources:activeSources.length, playing:playing }; }
  };
  root.audioBackends = root.audioBackends || {};
  root.audioBackends.current = root.audio;
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
