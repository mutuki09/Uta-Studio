/* compose.js — 歌詞と「作り方」から、メロディと伴奏を組み立てる。
   ここも画面には触らない。同じ入力なら必ず同じ曲が返る（seed で決まる）。 */
(function (root) {
  "use strict";

  var theory = root.theory;
  var presets = root.presets;
  var SPB = 16; /* 1 小節あたりのステップ数 */

  /* 種を渡すと同じ並びを返す簡単な乱数 */
  function makeRng(seed) {
    var s = (Math.imul(seed >>> 0 || 1, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
    for (var i = 0; i < 8; i++) { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; }
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /** 形を歌詞の音数にあわせて伸び縮みさせる */
  function resample(tpl, n) {
    if (n <= 1) return [tpl[0]];
    var out = [], i, pos, a, b;
    for (i = 0; i < n; i++) {
      pos = i / (n - 1) * (tpl.length - 1);
      a = Math.floor(pos); b = Math.min(tpl.length - 1, a + 1);
      out.push(tpl[a] + (tpl[b] - tpl[a]) * (pos - a));
    }
    return out;
  }

  /** 進行のテンプレを、その調の実際の和音の並びにする */
  function buildProgression(key, progression) {
    return progression.chords.map(function (c) {
      if (Number.isFinite(c.x)) {
        return { root: ((key.root + c.x) % 12 + 12) % 12, type: c.t || "maj" };
      }
      return theory.chordOfDegree(key, c.d, c.t);
    });
  }

  /**
   * メロディを作る。
   * @param phrases 行ごとの音の並び（mora.parse の結果）
   * @param recipe  お手本から取り出した作り方（analyze.run の結果）
   * @param mood    雰囲気プリセット
   * @param chords  実際に使う和音の並び
   * @param seed    種
   */
  function melody(phrases, recipe, mood, chords, seed, chordKey) {
    var rnd = makeRng(seed);
    var key = chordKey || recipe.key;
    var centre = Math.round((recipe.lo + recipe.hi) / 2);
    var baseOct = Math.floor(centre / 12) - 1;
    var span = Math.max(7, Math.min(16, recipe.hi - recipe.lo));
    var centreDeg = theory.midiToDegree(centre, key, baseOct);
    var spanDeg = Math.max(4, Math.round(span / 2));

    /* 1 音の基本の長さ。プリセットの指定を、お手本のクセで少し補正する */
    var unit = mood.unit;
    if (recipe.noteLen >= 4) unit = unit * 2;
    if (recipe.noteLen <= 1.6) unit = unit / 2;
    unit = Math.max(1, Math.min(4, Math.round(unit)));

    /* 形の引き出しを選ぶ。プリセットの指定に、お手本の動き方を混ぜる */
    var poolName = (mood.contour === "leapy" || recipe.stepwise < 0.45) ? "leapy" : "smooth";
    var pool = presets.CONTOURS[poolName] || presets.CONTOURS.smooth;

    var notes = [];
    var step = 0;
    var deg = centreDeg;

    phrases.forEach(function (ph, pi) {
      step = Math.ceil(step / SPB) * SPB;           /* 行は小節あたまから */
      var startStep = step;
      var tpl = pool[Math.floor(rnd() * pool.length) % pool.length];
      var shape = resample(tpl, ph.length);
      var lastPhrase = (pi === phrases.length - 1);
      var lift = pi === 0 ? 0 : (rnd() < 0.5 ? 1 : -1);

      ph.forEach(function (m, i) {
        /* 長さは必ず unit の倍数にする。ここが崩れると伴奏と拍がずれる */
        var dur = Math.max(1, Math.round(m.len)) * unit;
        var chord = chords[Math.floor(step / SPB) % chords.length];
        var strong = (step % 8) === 0;
        var last = (i === ph.length - 1);
        var prevDeg = deg;

        /* 形どおりの高さ ＋ たまに 1 度ゆらす */
        var d = centreDeg + lift + Math.round(shape[i] + (rnd() < 0.22 ? (rnd() < 0.5 ? -1 : 1) : 0));

        /* 強拍と語尾は和音の音に寄せる（前の音と同じにならないように） */
        if (strong || last) {
          var want = theory.chordPitches(chord);
          var bestD = null, bd = 99, k, m2, diff;
          for (k = d - 2; k <= d + 2; k++) {
            m2 = theory.degreeToMidi(k, key, baseOct);
            if (want.indexOf((((m2 % 12) + 12) % 12)) < 0) continue;
            if (k === prevDeg && ph.length > 1) continue;
            diff = Math.abs(k - d);
            if (diff < bd) { bd = diff; bestD = k; }
          }
          if (bestD !== null) d = bestD;
        }

        /* 同じ音が続きすぎないように */
        if (d === prevDeg && rnd() > 0.2) d += (rnd() < 0.5 ? -1 : 1);

        /* 曲の最後は主音に着地させる */
        if (last && lastPhrase) d = Math.round(d / 7) * 7;

        /* 音域からはみ出したら 1 オクターブ折り返す */
        while (d > centreDeg + spanDeg) d -= 7;
        while (d < centreDeg - spanDeg) d += 7;

        deg = d;
        notes.push({ s: step, d: dur, n: theory.degreeToMidi(d, key, baseOct), text: m.text, line: pi });
        step += dur;
        if (m.rest) step += m.rest * unit;                 /* 「っ」のぶんは休みにする */
        if (m.breakAfter && !last) {
          /* 区切りは休みではなく、その音をのばして埋める */
          notes[notes.length - 1].d += unit;
          step += unit;
        }
      });

      /* 行の終わりを小節線までのばす。穴を残すと、次の行の頭が拍から浮いて聞こえる */
      if (notes.length) {
        var lastNote = notes[notes.length - 1];
        var barEnd = Math.max(startStep + SPB, Math.ceil((lastNote.s + lastNote.d + 1) / SPB) * SPB);
        lastNote.d = barEnd - lastNote.s;
        step = barEnd;
      } else {
        step = Math.max(step, startStep + SPB);
      }
    });

    return notes;
  }

  /** メロディの長さぶんの伴奏を、リズムパターンにしたがって組む */
  function backing(melodyNotes, chords, rhythm, previousVoicing) {
    var end = SPB, i, b;
    for (i = 0; i < melodyNotes.length; i++) end = Math.max(end, melodyNotes[i].s + melodyNotes[i].d);
    var bars = Math.max(1, Math.ceil(end / SPB));
    var bass = [], pad = [], drum = [];

    for (b = 0; b < bars; b++) {
      var c = chords[b % chords.length];
      var rootNote = 36 + (c.root % 12);
      var voicing = theory.chordVoicing(c, 48);
      if (root.harmonyLab && root.harmonyLab.enabled) voicing = root.harmonyLab.voice(c, previousVoicing);
      previousVoicing = voicing;
      var at = b * SPB;

      /* ベース */
      if (rhythm.bass === "none") {
        /* 何も鳴らさない */
      } else if (rhythm.bass === "pump") {
        for (i = 0; i < SPB; i += 2) bass.push({ s: at + i, d: 1, n: rootNote + (i % 8 === 6 ? 7 : 0) });
      } else if (rhythm.bass === "eighth") {
        for (i = 0; i < SPB; i += 4) bass.push({ s: at + i, d: 3, n: rootNote + (i % 8 === 0 ? 0 : 7) });
      } else if (rhythm.bass === "walk") {
        var walk = [0, 7, 12, 7];
        for (i = 0; i < 4; i++) bass.push({ s: at + i * 4, d: 3, n: rootNote + walk[i] });
      } else {
        bass.push({ s: at, d: 7, n: rootNote });
        bass.push({ s: at + 8, d: 7, n: rootNote });
      }

      /* 和音 */
      var gate = Math.max(1, Math.round(SPB * (rhythm.padGate || 1)));
      if (rhythm.arp) {
        for (i = 0; i < voicing.length; i++) {
          pad.push({ s: at + i * 2, d: SPB - i * 2, chord: [voicing[i]] });
        }
      } else {
        for (i = 0; i < SPB; i += gate) pad.push({ s: at + i, d: gate, chord: voicing });
      }

      /* ドラム */
      (rhythm.kick  || []).forEach(function (k) { drum.push({ s: at + k, kind: "kick"  }); });
      (rhythm.snare || []).forEach(function (k) { drum.push({ s: at + k, kind: "snare" }); });
      (rhythm.hat   || []).forEach(function (k) { drum.push({ s: at + k, kind: "hat"   }); });
    }
    return { bass: bass, pad: pad, drum: drum, bars: bars };
  }

  /** ここまでをまとめて 1 曲にする */
  function song(phrases, recipe, mood, seed, override) {
    var o = override || {};
    var progression = presets.byId(presets.PROGRESSIONS, o.progression || mood.progression);
    var rhythm = presets.byId(presets.RHYTHMS, o.rhythm || mood.rhythm);
    /* 進行が短調用なら平行短調に置きかえる。使う音は同じまま、中心だけ移る */
    var chordKey = theory.relativeKey(recipe.key, progression.mode);
    var chords = buildProgression(chordKey, progression);
    var mel = melody(phrases, recipe, mood, chords, seed, chordKey);
    var back = backing(mel, chords, rhythm);
    var total = 0, lo = 127, hi = 0, i;
    for (i = 0; i < mel.length; i++) {
      total = Math.max(total, mel[i].s + mel[i].d);
      lo = Math.min(lo, mel[i].n); hi = Math.max(hi, mel[i].n);
    }
    return {
      melody: mel, bass: back.bass, pad: back.pad, drum: back.drum,
      chords: chords, progression: progression, rhythm: rhythm, key: chordKey,
      totalSteps: total, bars: back.bars, lo: lo, hi: hi
    };
  }

  root.compose = {
    song: song, melody: melody, backing: backing,
    buildProgression: buildProgression, resample: resample, makeRng: makeRng, SPB: SPB
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
