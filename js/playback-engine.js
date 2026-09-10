/* playback-engine.js — rendererを交換してもSongとMIDI exportを変えない境界。 */
(function (root) {
  "use strict";

  function createPlaybackEngine(options) {
    var opts = options || {};
    var current = opts.currentRenderer;
    if (!current) throw new Error("CurrentSynthRenderer is required");
    var vocalTrack = opts.vocalTrack || (root.createVocalTrack ? root.createVocalTrack() : null);

    var factories = opts.factories || {};
    var renderers = { current: current };
    var selectedId = "current";
    var activeId = "current";
    var active = current;
    var pending = false;
    var generation = 0;
    var fallback = null;
    var statusListeners = [];

    function emit(type, detail) {
      var event = {
        type: type,
        selectedBackend: selectedId,
        activeBackend: activeId,
        fallback: fallback,
        detail: detail || null
      };
      statusListeners.slice().forEach(function (listener) {
        try { listener(event); } catch (error) { /* UI listener failures do not stop audio */ }
      });
      return event;
    }

    function allRenderers(method) {
      Object.keys(renderers).forEach(function (id) {
        var renderer = renderers[id];
        if (renderer && typeof renderer[method] === "function") {
          try { renderer[method](); } catch (error) { /* cleanup is best effort */ }
        }
      });
    }

    function stop() {
      generation++;
      pending = false;
      allRenderers("stop");
      if (vocalTrack && typeof vocalTrack.stop === "function") vocalTrack.stop();
    }

    function getOrCreate(id) {
      if (renderers[id]) return renderers[id];
      var factory = factories[id] || (root.audioBackends && root.audioBackends[id]);
      if (typeof factory !== "function") throw new Error("Unknown audio backend: " + id);
      renderers[id] = factory();
      return renderers[id];
    }

    function useCurrent(reason, error) {
      active = current;
      activeId = "current";
      fallback = {
        from: selectedId,
        to: "current",
        reason: reason,
        message: error && error.message ? error.message : String(error || reason)
      };
      emit("fallback", fallback);
      return { selectedBackend:selectedId, activeBackend:activeId, fallback:fallback };
    }

    function configureBackend(id, config) {
      stop();
      selectedId = id || "current";
      fallback = null;
      if (selectedId === "current") {
        active = current;
        activeId = "current";
        emit("backendchange");
        return Promise.resolve({ selectedBackend:selectedId, activeBackend:activeId, fallback:null });
      }

      var renderer;
      try { renderer = getOrCreate(selectedId); }
      catch (error) { return Promise.resolve(useCurrent("backend-unavailable", error)); }

      var load = typeof renderer.load === "function" ? renderer.load(config || {}) : Promise.resolve();
      return Promise.resolve(load).then(function () {
        active = renderer;
        activeId = selectedId;
        fallback = null;
        emit("backendchange");
        return { selectedBackend:selectedId, activeBackend:activeId, fallback:null };
      }).catch(function (error) {
        return useCurrent("load-failed", error);
      });
    }

    function play(song, bpm, settings, onStep) {
      stop();
      var token = generation;
      var selectedRenderer = active;
      var selectedRendererId = activeId;
      pending = true;
      var rendererEnded = false;
      var vocalExpected = !!(vocalTrack && vocalTrack.hasAudio && vocalTrack.hasAudio());
      var vocalEnded = !vocalExpected;
      var finishSent = false;

      function finishTogether() {
        if (token !== generation) return;
        if (!rendererEnded || !vocalEnded || finishSent) return;
        finishSent = true;
        pending = false;
        if (typeof onStep === "function") onStep(-1);
      }

      function rendererStep(step) {
        if (token !== generation) return;
        if (step < 0) {
          rendererEnded = true;
          finishTogether();
          return;
        }
        if (typeof onStep === "function") onStep(step);
      }

      function vocalFinished() {
        if (token !== generation) return;
        vocalEnded = true;
        finishTogether();
      }

      function startRenderer(renderer, id) {
        var result;
        try { result = renderer.play(song, bpm, settings || {}, rendererStep); }
        catch (error) { return Promise.reject(error); }
        return Promise.resolve(result).then(function (timing) {
          if (token !== generation) return { cancelled:true };
          if (!vocalExpected) return { activeBackend:id };
          var delay = timing && Number(timing.vocalStartDelaySeconds);
          return Promise.resolve(vocalTrack.play({
            startDelaySeconds:isFinite(delay) ? Math.max(0, delay) : 0.12,
            onEnded:vocalFinished
          })).then(function () { return { activeBackend:id }; });
        });
      }

      return startRenderer(selectedRenderer, selectedRendererId).catch(function (error) {
        if (token !== generation) return { cancelled:true };
        if (selectedRendererId === "current") {
          pending = false;
          if (vocalTrack && vocalTrack.stop) vocalTrack.stop();
          emit("error", error);
          throw error;
        }
        if (selectedRenderer && selectedRenderer.stop) selectedRenderer.stop();
        if (vocalTrack && vocalTrack.stop) vocalTrack.stop();
        vocalEnded = !vocalExpected;
        rendererEnded = false;
        useCurrent("play-failed", error);
        pending = true;
        return startRenderer(current, "current").then(function () {
          return { activeBackend:"current", fallback:fallback };
        }).catch(function (fallbackError) {
          pending = false;
          if (vocalTrack && vocalTrack.stop) vocalTrack.stop();
          emit("error", fallbackError);
          throw fallbackError;
        });
      });
    }

    /* 伴奏（今選んでいるバックエンド）と歌声WAVを混ぜて、完成音源のWAVを作る。
       再生は使わずオフラインで作るので、実時間を待たずに書き出せる。 */
    function exportMix(song, bpm, settings, options) {
      var opts = options || {};
      var renderer = active;
      if (!renderer || typeof renderer.renderOffline !== "function") {
        return Promise.reject(new Error("この音源では書き出せません"));
      }
      if (typeof renderer.canRenderOffline === "function" && !renderer.canRenderOffline()) {
        return Promise.reject(new Error("SoundFontを読み込んでから書き出してください"));
      }
      var vocalBuffer = vocalTrack && vocalTrack.getBuffer ? vocalTrack.getBuffer() : null;
      /* 歌声があるときは、そのサンプリングレートに伴奏を合わせる。
         レートが違うと混ぜられないうえ、変換すると音が変わる。 */
      var sampleRate = vocalBuffer ? vocalBuffer.sampleRate : (Number(opts.sampleRate) || 44100);
      var tailSeconds = opts.tailSeconds === undefined ? 3 : Number(opts.tailSeconds);

      return Promise.resolve(renderer.renderOffline(song, bpm, settings || {}, {
        sampleRate:sampleRate,
        tailSeconds:tailSeconds,
        onProgress:opts.onProgress
      })).then(function (backing) {
        if (!root.wavExport) throw new Error("wav-export.js が読み込まれていません");
        var vocalGain = vocalTrack && vocalTrack.getVolume ? vocalTrack.getVolume() : 1;
        var result = root.wavExport.mixToWav({
          backing:backing,
          vocal:vocalBuffer,
          vocalGain:vocalGain,
          backingGain:1,
          offsetSeconds:0,          /* 伴奏側に既に先頭空白が入っているので0 */
          tailSeconds:0
        });
        result.hadVocal = !!vocalBuffer;
        result.backend = activeId;
        return result;
      });
    }

    function dispose() {
      stop();
      allRenderers("dispose");
      if (vocalTrack && typeof vocalTrack.dispose === "function") vocalTrack.dispose();
      renderers = {};
      active = null;
      vocalTrack = null;
      statusListeners = [];
    }

    return {
      id: "playback-engine",
      configureBackend: configureBackend,
      registerBackend: function (id, factory) { factories[id] = factory; },
      onStatus: function (listener) {
        statusListeners.push(listener);
        return function () {
          var index = statusListeners.indexOf(listener);
          if (index >= 0) statusListeners.splice(index, 1);
        };
      },
      status: function () {
        return { selectedBackend:selectedId, activeBackend:activeId, fallback:fallback, pending:pending };
      },
      play: play,
      stop: stop,
      exportMix: exportMix,
      canExportMix: function () {
        return !!(active && typeof active.renderOffline === "function" &&
          (typeof active.canRenderOffline !== "function" || active.canRenderOffline()));
      },
      isPlaying: function () {
        return pending || !!(active && active.isPlaying && active.isPlaying()) ||
          !!(vocalTrack && vocalTrack.isPlaying && vocalTrack.isPlaying());
      },
      setMasterVolume: function (value) {
        if (active && active.setMasterVolume) active.setMasterVolume(value);
      },
      setPartVolume: function (part, value) {
        return active && active.setPartVolume ? active.setPartVolume(part, value) : false;
      },
      loadVocal: function (buffer, name) {
        stop();
        return vocalTrack.load(buffer, name);
      },
      clearVocal: function () { stop(); return vocalTrack.clear(); },
      setVocalVolume: function (value) { return vocalTrack.setVolume(value); },
      hasVocal: function () { return !!(vocalTrack && vocalTrack.hasAudio && vocalTrack.hasAudio()); },
      vocalInfo: function () { return vocalTrack && vocalTrack.info ? vocalTrack.info() : null; },
      dispose: dispose,
      debugState: function () {
        return {
          selectedBackend:selectedId,
          activeBackend:activeId,
          fallback:fallback,
          pending:pending,
          rendererCount:Object.keys(renderers).length,
          vocal:vocalTrack && vocalTrack.debugState ? vocalTrack.debugState() : null,
          current:current.debugState ? current.debugState() : null
        };
      }
    };
  }

  root.createPlaybackEngine = createPlaybackEngine;
  root.audioBackends = root.audioBackends || {};
  root.audio = createPlaybackEngine({
    currentRenderer: root.audioBackends.current,
    factories: root.audioBackends,
    vocalTrack: root.createVocalTrack ? root.createVocalTrack() : null
  });
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
