/* wav-export.js — 伴奏のオフラインレンダリング結果と歌声WAVを混ぜて、
   16bit PCMのWAVにする。再生経路には触らないので、音は再生と同じものが出る。 */
(function (root) {
  "use strict";

  var MAX_SECONDS = 900;               /* 15分。長すぎる曲でメモリを食い潰さない */

  function toChannels(source) {
    if (!source) return null;
    if (Array.isArray(source.channels)) {
      return { channels:source.channels, sampleRate:source.sampleRate };
    }
    /* AudioBuffer */
    if (typeof source.getChannelData === "function") {
      var channels = [];
      for (var i = 0; i < source.numberOfChannels; i++) channels.push(source.getChannelData(i));
      return { channels:channels, sampleRate:source.sampleRate };
    }
    return null;
  }

  function channelAt(channels, index) {
    if (!channels.length) return null;
    return channels[Math.min(index, channels.length - 1)];
  }

  /* backing と vocal を足す。vocal は offsetSeconds だけ後ろにずらす。
     伴奏側には既に歌声ぶんの先頭空白（leadSteps）が入っているので、
     通常の呼び出しでは offsetSeconds は 0 になる。 */
  function mix(options) {
    var opts = options || {};
    var backing = toChannels(opts.backing);
    var vocal = toChannels(opts.vocal);
    if (!backing && !vocal) throw new Error("書き出す音がありません");

    var sampleRate = (backing || vocal).sampleRate;
    if (backing && vocal && backing.sampleRate !== vocal.sampleRate) {
      throw new Error("伴奏と歌声のサンプリングレートが違います");
    }

    var backingGain = opts.backingGain === undefined ? 1 : Number(opts.backingGain);
    var vocalGain = opts.vocalGain === undefined ? 1 : Number(opts.vocalGain);
    var offset = Math.max(0, Math.round((Number(opts.offsetSeconds) || 0) * sampleRate));
    var tail = Math.max(0, Math.round((Number(opts.tailSeconds) || 0) * sampleRate));

    var backingLength = backing ? backing.channels[0].length : 0;
    var vocalLength = vocal ? vocal.channels[0].length : 0;
    var length = Math.max(backingLength, offset + vocalLength) + tail;
    if (length > MAX_SECONDS * sampleRate) throw new Error("曲が長すぎて書き出せません");

    var out = [new Float32Array(length), new Float32Array(length)];
    var channel, source, i, n;
    for (channel = 0; channel < 2; channel++) {
      if (backing) {
        source = channelAt(backing.channels, channel);
        for (i = 0, n = Math.min(backingLength, length); i < n; i++) out[channel][i] += source[i] * backingGain;
      }
      if (vocal) {
        source = channelAt(vocal.channels, channel);
        for (i = 0, n = Math.min(vocalLength, length - offset); i < n; i++) {
          out[channel][offset + i] += source[i] * vocalGain;
        }
      }
    }

    /* 足し算で 1.0 を超えたぶんだけ、曲全体を同じ比率で下げる。
       部分的に潰すと音が変わるので、素直に音量を下げる。 */
    var peak = 0;
    for (channel = 0; channel < 2; channel++) {
      for (i = 0; i < length; i++) {
        var value = out[channel][i] < 0 ? -out[channel][i] : out[channel][i];
        if (value > peak) peak = value;
      }
    }
    var normalizedBy = 1;
    if (peak > 0.999) {
      normalizedBy = 0.999 / peak;
      for (channel = 0; channel < 2; channel++) {
        for (i = 0; i < length; i++) out[channel][i] *= normalizedBy;
      }
    }

    return { channels:out, sampleRate:sampleRate, peak:peak, normalizedBy:normalizedBy,
      durationSeconds:length / sampleRate };
  }

  /* 16bit PCM ステレオの WAV バイト列にする */
  function encode(mixed) {
    var channels = mixed.channels, sampleRate = mixed.sampleRate;
    var count = channels.length, length = channels[0].length;
    var dataBytes = length * count * 2;
    var buffer = new ArrayBuffer(44 + dataBytes);
    var view = new DataView(buffer);
    function ascii(offset, text) {
      for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    }
    ascii(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);                       /* PCM */
    view.setUint16(22, count, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * count * 2, true);
    view.setUint16(32, count * 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, dataBytes, true);

    var offset = 44;
    for (var i = 0; i < length; i++) {
      for (var channel = 0; channel < count; channel++) {
        var sample = channels[channel][i];
        if (sample > 1) sample = 1; else if (sample < -1) sample = -1;
        view.setInt16(offset, Math.round(sample * 32767), true);
        offset += 2;
      }
    }
    return new Uint8Array(buffer);
  }

  function mixToWav(options) {
    var mixed = mix(options);
    return { bytes:encode(mixed), durationSeconds:mixed.durationSeconds,
      peak:mixed.peak, normalizedBy:mixed.normalizedBy, sampleRate:mixed.sampleRate };
  }

  root.wavExport = { mix:mix, encode:encode, mixToWav:mixToWav, MAX_SECONDS:MAX_SECONDS };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
