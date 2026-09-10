/* Optional SpessaSynth product backend.  Loaded in the normal page, but the
   third-party engine and a local SoundFont are loaded only in audio dev mode. */
(function (root) {
  "use strict";

  var CORE_URL = "optional/spessasynth/vendor/spessasynth-core-4.3.15.global.js";
  var coreLoadPromise = null;

  function loadCoreGlobal() {
    if (window.SpessaSynthCore) return Promise.resolve(window.SpessaSynthCore);
    if (coreLoadPromise) return coreLoadPromise;
    coreLoadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = CORE_URL;
      script.async = true;
      script.onload = function () {
        if (window.SpessaSynthCore) resolve(window.SpessaSynthCore);
        else reject(new Error("SpessaSynth Core global was not created"));
      };
      script.onerror = function () { reject(new Error("SpessaSynth Coreを読み込めませんでした")); };
      document.head.appendChild(script);
    }).catch(function (error) {
      coreLoadPromise = null;
      throw error;
    });
    return coreLoadPromise;
  }

  function exactArrayBuffer(bytes) {
    if (bytes instanceof ArrayBuffer) return bytes.slice(0);
    if (ArrayBuffer.isView(bytes)) {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    throw new Error("ArrayBuffer is required");
  }

  function withLeadIn(song, leadSteps) {
    var shift = Math.max(0, Math.round(Number(leadSteps) || 0));
    if (!shift) return song;
    function move(events) {
      return (events || []).map(function (event) {
        var moved = {};
        Object.keys(event).forEach(function (key) { moved[key] = event[key]; });
        moved.s = (Number(event.s) || 0) + shift;
        if (Array.isArray(event.chord)) moved.chord = event.chord.slice();
        return moved;
      });
    }
    var shifted = {};
    Object.keys(song).forEach(function (key) { shifted[key] = song[key]; });
    shifted.melody = move(song.melody);
    shifted.bass = move(song.bass);
    shifted.pad = move(song.pad);
    shifted.drum = move(song.drum);
    shifted.extraTracks = (song.extraTracks || []).map(function (track) {
      var copy = {};
      Object.keys(track).forEach(function (key) { copy[key] = track[key]; });
      copy.notes = move(track.notes);
      return copy;
    });
    /* An imported MIDI keeps every part in importedTracks, so the lead-in has to
       move those too.  Without this the accompaniment plays one bar ahead of the
       vocal WAV, which reads as the melody missing the chord changes. */
    shifted.importedTracks = (song.importedTracks || []).map(function (track) {
      var copy = {};
      Object.keys(track).forEach(function (key) { copy[key] = track[key]; });
      copy.notes = move(track.notes);
      return copy;
    });
    shifted.totalSteps = Math.max(0, Number(song.totalSteps) || 0) + shift;
    return shifted;
  }

  function createSpessaSynthRenderer(options) {
    var opts = options || {};
    var core = opts.core || null;
    var buildMidi = opts.buildMidi || function (song, bpm, settings) {
      return root.smf.build(song, bpm, settings);
    };
    var makeContext = opts.audioContextFactory || function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      return new AC();
    };
    var loadCore = opts.loadCore || loadCoreGlobal;

    var ctx = null, master = null, processorNode = null;
    var synth = null, sequencer = null, soundBank = null, synthInitPromise = null;
    var soundFontSource = null;
    var soundFontName = "", timer = null, startTimer = null, playing = false;
    var masterVolume = 0.9;
    var partVolumes = { melody:1, pad:1, bass:1, drum:1 };
    var lastMidiBytes = null, lastPartSummary = null;

    function ensureContext() {
      if (ctx) return ctx;
      ctx = makeContext();
      master = ctx.createGain();
      master.gain.value = masterVolume;
      master.connect(ctx.destination);
      return ctx;
    }

    function applyPartVolumes() {
      if (!synth || typeof synth.controllerChange !== "function") return;
      var channels = { melody:0, bass:1, pad:2, drum:9 };
      Object.keys(channels).forEach(function (part) {
        synth.controllerChange(channels[part], 7, Math.round(127 * partVolumes[part]));
      });
    }

    function load(config) {
      var cfg = config || {};
      if (!cfg.soundFontBuffer) return Promise.reject(new Error("SoundFontを選んでください"));
      destroySynthResources();
      return Promise.resolve(core || loadCore()).then(function (loadedCore) {
        core = loadedCore;
        if (!core.SoundBankLoader || !core.SpessaSynthProcessor || !core.SpessaSynthSequencer) {
          throw new Error("SpessaSynth Core APIが不足しています");
        }
        soundFontSource = exactArrayBuffer(cfg.soundFontBuffer);
        soundBank = core.SoundBankLoader.fromArrayBuffer(exactArrayBuffer(soundFontSource));
        soundFontName = cfg.soundFontName || "local SoundFont";
        return { name:soundFontName };
      });
    }

    function prepare(song, bpm, settings) {
      if (!soundBank) throw new Error("SoundFontが読み込まれていません");
      var midiSettings = settings && settings.midi ? settings.midi : (settings || {});
      var renderSong = withLeadIn(song, settings && settings.leadSteps);
      var bytes = buildMidi(renderSong, bpm, midiSettings);
      lastMidiBytes = new Uint8Array(exactArrayBuffer(bytes));
      lastPartSummary = {
        melody:(song.melody || []).length,
        pad:(song.pad || []).reduce(function (sum, chord) { return sum + (chord.chord || []).length; }, 0),
        bass:(song.bass || []).length,
        drum:(song.drum || []).length
      };
      var extraCount = (song.extraTracks || []).reduce(function (sum, track) { return sum + (track.notes || []).length; }, 0);
      if (extraCount) lastPartSummary.extra = extraCount;
      return core.BasicMIDI.fromArrayBuffer(exactArrayBuffer(lastMidiBytes));
    }

    function stopPlaybackNodes() {
      if (timer) { clearInterval(timer); timer = null; }
      if (startTimer) { clearTimeout(startTimer); startTimer = null; }
      if (sequencer && typeof sequencer.pause === "function") {
        try { sequencer.pause(); } catch (error) { /* already stopped */ }
      }
      if (synth) {
        try { synth.stopAllChannels(true); } catch (error) { /* already stopped */ }
      }
      if (processorNode) {
        processorNode.onaudioprocess = null;
        try { processorNode.disconnect(); } catch (error) { /* already disconnected */ }
      }
      processorNode = sequencer = null;
    }

    function destroySynthResources() {
      playing = false;
      stopPlaybackNodes();
      if (synth) {
        try { synth.destroySynthProcessor(); } catch (error) { /* already destroyed */ }
        /* SpessaSynth's processor owns and destroys every attached SoundBank. */
        soundBank = null;
      } else if (soundBank && typeof soundBank.destroySoundBank === "function") {
        try { soundBank.destroySoundBank(); } catch (error) { /* already destroyed */ }
      }
      synth = null;
      synthInitPromise = null;
    }

    function ensureSynth(audioContext, bufferSize) {
      if (synth) return synthInitPromise || Promise.resolve(synth);
      if (!soundBank && soundFontSource) {
        soundBank = core.SoundBankLoader.fromArrayBuffer(exactArrayBuffer(soundFontSource));
      }
      if (!soundBank) return Promise.reject(new Error("SoundFontが読み込まれていません"));
      synth = new core.SpessaSynthProcessor(audioContext.sampleRate, {
        maxBufferSize: bufferSize,
        effectsEnabled: true,
        eventsEnabled: false
      });
      synth.soundBankManager.addSoundBank(soundBank, "uta-genkou-local");
      synthInitPromise = Promise.resolve(synth.processorInitialized).then(function () {
        return synth;
      }).catch(function (error) {
        destroySynthResources();
        throw error;
      });
      return synthInitPromise;
    }

    function stop() {
      playing = false;
      /* Keep the initialized synth and its SoundBank alive for the next play. */
      stopPlaybackNodes();
    }

    function play(song, bpm, settings, onStep) {
      stop();
      var audioContext = ensureContext();
      var parsedMidi = prepare(song, bpm, settings || {});
      var bufferSize = 2048;
      var leadSteps = Math.max(0, Math.round(Number(settings && settings.leadSteps) || 0));
      var startAt = 0;
      return ensureSynth(audioContext, bufferSize).then(function () {
        if (audioContext.state === "suspended" && audioContext.resume) return audioContext.resume();
      }).then(function () {
        startAt = (Number(audioContext.currentTime) || 0) + 0.12;
        sequencer = new core.SpessaSynthSequencer(synth);
        sequencer.skipToFirstNoteOn = false;
        sequencer.loopCount = 0;
        sequencer.loadNewSongList([parsedMidi]);
        applyPartVolumes();

        processorNode = audioContext.createScriptProcessor(bufferSize, 0, 2);
        processorNode.onaudioprocess = function (event) {
          if (!playing || !sequencer || !synth) return;
          var left = event.outputBuffer.getChannelData(0);
          var right = event.outputBuffer.getChannelData(1);
          sequencer.processTick();
          synth.process(left, right, 0, left.length);
        };
        playing = true;
        sequencer.play();
        startTimer = setTimeout(function () {
          startTimer = null;
          if (playing && processorNode) processorNode.connect(master);
        }, 120);

        var stepSeconds = 60 / bpm / 4;
        timer = setInterval(function () {
          if (!playing || !sequencer) return;
          if (typeof onStep === "function") onStep(sequencer.currentTime / stepSeconds - leadSteps);
          if (sequencer.isFinished || sequencer.currentTime > sequencer.duration + 0.5) {
            stop();
            if (typeof onStep === "function") onStep(-1);
          }
        }, 25);
        return { vocalStartDelaySeconds:Math.max(0, startAt - (Number(audioContext.currentTime) || 0)) };
      }).catch(function (error) {
        stop();
        throw error;
      });
    }

    /* 再生とは別に、完成音源用の伴奏をオフラインで書き出す。
       再生中のsynthとSoundBankには触らず、使い捨てのインスタンスで回すので、
       途中でこれを呼んでも鳴っている音は乱れない。 */
    function renderOffline(song, bpm, settings, options) {
      var opts = options || {};
      if (!soundFontSource) return Promise.reject(new Error("SoundFontが読み込まれていません"));
      var parsedMidi = prepare(song, bpm, settings || {});
      var sampleRate = Math.round(Number(opts.sampleRate) || 44100);
      var tail = opts.tailSeconds === undefined ? 3 : Math.max(0, Number(opts.tailSeconds));
      var seconds = Math.max(0.1, Number(parsedMidi.duration) || 0) + tail;
      var block = 128;
      var total = Math.ceil(seconds * sampleRate);

      /* 書き出し用に SoundBank を作り直す。SpessaSynthProcessor は破棄時に
         ぶら下がった SoundBank も壊すので、再生用と共有してはいけない。 */
      var bank = core.SoundBankLoader.fromArrayBuffer(exactArrayBuffer(soundFontSource));
      var offlineSynth = new core.SpessaSynthProcessor(sampleRate, {
        maxBufferSize: block,
        effectsEnabled: true,
        eventsEnabled: false
      });
      offlineSynth.soundBankManager.addSoundBank(bank, "uta-genkou-offline");

      return Promise.resolve(offlineSynth.processorInitialized).then(function () {
        var offlineSeq = new core.SpessaSynthSequencer(offlineSynth);
        offlineSeq.skipToFirstNoteOn = false;
        offlineSeq.loopCount = 0;
        offlineSeq.loadNewSongList([parsedMidi]);
        var channels = { melody:0, bass:1, pad:2, drum:9 };
        Object.keys(channels).forEach(function (part) {
          offlineSynth.controllerChange(channels[part], 7, Math.round(127 * partVolumes[part]));
        });
        offlineSeq.play();

        var left = new Float32Array(total), right = new Float32Array(total);
        var blockLeft = new Float32Array(block), blockRight = new Float32Array(block);
        for (var written = 0; written < total; written += block) {
          var size = Math.min(block, total - written);
          blockLeft.fill(0); blockRight.fill(0);
          offlineSeq.processTick();
          offlineSynth.process(blockLeft, blockRight, 0, size);
          for (var i = 0; i < size; i++) {
            left[written + i] = blockLeft[i] * masterVolume;
            right[written + i] = blockRight[i] * masterVolume;
          }
          if (typeof opts.onProgress === "function" && written % (block * 400) === 0) {
            opts.onProgress(written / total);
          }
        }
        return { channels:[left, right], sampleRate:sampleRate, durationSeconds:total / sampleRate };
      }).then(function (result) {
        try { offlineSynth.destroySynthProcessor(); } catch (error) { /* already destroyed */ }
        return result;
      }, function (error) {
        try { offlineSynth.destroySynthProcessor(); } catch (destroyError) { /* already destroyed */ }
        throw error;
      });
    }

    function setMasterVolume(value) {
      masterVolume = Math.max(0, Math.min(1.5, Number(value) || 0));
      if (master) master.gain.value = masterVolume;
    }

    function setPartVolume(part, value) {
      if (partVolumes[part] === undefined) return false;
      partVolumes[part] = Math.max(0, Math.min(1, Number(value) || 0));
      applyPartVolumes();
      return true;
    }

    function dispose() {
      destroySynthResources();
      soundFontSource = null;
      if (master) { try { master.disconnect(); } catch (error) { /* already disconnected */ } }
      if (ctx && typeof ctx.close === "function") ctx.close();
      ctx = master = null;
      core = opts.core || null;
      lastMidiBytes = lastPartSummary = null;
    }

    return {
      id: "spessasynth",
      load: load,
      prepare: prepare,
      play: play,
      renderOffline: renderOffline,
      canRenderOffline: function () { return !!soundFontSource; },
      stop: stop,
      isPlaying: function () { return playing; },
      setMasterVolume: setMasterVolume,
      setPartVolume: setPartVolume,
      dispose: dispose,
      debugState: function () {
        return {
          context:!!ctx,
          soundFontLoaded:!!soundBank,
          soundFontName:soundFontName,
          playing:playing,
          processorConnected:!!processorNode,
          midiBytes:lastMidiBytes ? lastMidiBytes.length : 0,
          parts:lastPartSummary
        };
      }
    };
  }

  root.createSpessaSynthRenderer = createSpessaSynthRenderer;
  root.audioBackends = root.audioBackends || {};
  root.audioBackends.spessasynth = function () { return createSpessaSynthRenderer(); };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
