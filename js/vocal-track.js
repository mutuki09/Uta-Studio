/* vocal-track.js — 再生バックエンドに依存しない歌声WAVトラック。 */
(function (root) {
  "use strict";

  function createVocalTrack(options) {
    var opts = options || {};
    var makeContext = opts.audioContextFactory || function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      return new AC();
    };
    var ctx = null, gain = null, buffer = null, source = null;
    var name = "", volume = 1, playing = false, generation = 0;

    function ensure() {
      if (ctx) return ctx;
      ctx = makeContext();
      gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
      return ctx;
    }

    function stop() {
      generation++;
      playing = false;
      if (source) {
        source.onended = null;
        try { source.stop(); } catch (error) { /* already stopped */ }
        try { source.disconnect(); } catch (error) { /* already disconnected */ }
        source = null;
      }
    }

    function load(arrayBuffer, fileName) {
      var audioContext = ensure();
      stop();
      return audioContext.decodeAudioData(arrayBuffer.slice(0)).then(function (decoded) {
        buffer = decoded;
        name = fileName || "NEUTRINO vocal.wav";
        return { name:name, duration:decoded.duration };
      });
    }

    function play(options) {
      var playOptions = options || {};
      if (!buffer) return Promise.resolve({ skipped:true });
      var audioContext = ensure();
      stop();
      var token = generation;
      source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = function () {
        if (token !== generation) return;
        playing = false;
        source = null;
        if (typeof playOptions.onEnded === "function") playOptions.onEnded();
      };
      playing = true;
      var startDelay = Math.max(0, Number(playOptions.startDelaySeconds) || 0);
      if (audioContext.state === "suspended" && audioContext.resume) audioContext.resume();
      source.start(audioContext.currentTime + startDelay);
      return Promise.resolve({ duration:buffer.duration, startDelaySeconds:startDelay });
    }

    function clear() {
      stop();
      buffer = null;
      name = "";
    }

    function setVolume(value) {
      volume = Math.max(0, Math.min(1.5, Number(value) || 0));
      if (gain) gain.gain.value = volume;
    }

    function dispose() {
      clear();
      if (gain) { try { gain.disconnect(); } catch (error) { /* already disconnected */ } }
      if (ctx && typeof ctx.close === "function") ctx.close();
      ctx = gain = null;
    }

    return {
      id:"vocal-track",
      load:load,
      play:play,
      stop:stop,
      clear:clear,
      setVolume:setVolume,
      hasAudio:function () { return !!buffer; },
      getBuffer:function () { return buffer; },
      getVolume:function () { return volume; },
      info:function () { return buffer ? { name:name, duration:buffer.duration } : null; },
      isPlaying:function () { return playing; },
      dispose:dispose,
      debugState:function () { return { context:!!ctx, loaded:!!buffer, playing:playing, name:name }; }
    };
  }

  root.createVocalTrack = createVocalTrack;
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
