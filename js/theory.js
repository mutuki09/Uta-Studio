/* theory.js — 音楽理論。
   このファイルは画面にも音にも触らない。入力に対して出力が決まるだけの関数だけを置く。
   （そのぶんテストが書きやすい。test/test.html を参照） */
(function (root) {
  "use strict";

  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var MINOR = [0, 2, 3, 5, 7, 8, 10];

  /* Krumhansl-Schmuckler の調プロファイル（どの音がよく鳴る調か、の統計） */
  var P_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var P_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  /* 和音の作り（根音からの半音数） */
  var CHORD_SHAPES = {
    maj:   [0, 4, 7],
    min:   [0, 3, 7],
    dim:   [0, 3, 6],
    sus4:  [0, 5, 7],
    dom7:  [0, 4, 7, 10],
    min7:  [0, 3, 7, 10],
    maj7:  [0, 4, 7, 11],
    add9:  [0, 4, 7, 14],
    sus2:  [0, 2, 7],
    sixth: [0, 4, 7, 9],
    min6:  [0, 3, 7, 9],
    m7b5:  [0, 3, 6, 10],
    aug:   [0, 4, 8],
    dom9:  [0, 4, 7, 10, 14],
    min9:  [0, 3, 7, 10, 14],
    sus47: [0, 5, 7, 10],
    maj9:  [0, 4, 7, 11, 14],
    minmaj7:[0, 3, 7, 11],
    dim7:  [0, 3, 6, 9],
    aug7:  [0, 4, 8, 10],
    madd9: [0, 3, 7, 14],
    add11: [0, 4, 7, 17],
    sixth9:[0, 4, 7, 9, 14],
    dom7b9:[0, 4, 7, 10, 13],
    dom7s9:[0, 4, 7, 10, 15],
    dom7b5:[0, 4, 6, 10],
    power: [0, 7, 12]
  };
  var CHORD_SUFFIX = {
    maj: "", min: "m", dim: "dim", sus4: "sus4",
    dom7: "7", min7: "m7", maj7: "M7", add9: "add9",
    sus2: "sus2", sixth: "6", min6: "m6", m7b5: "m7-5",
    aug: "aug", dom9: "9", min9: "m9", sus47: "7sus4",
    maj9: "M9", minmaj7: "mM7", dim7: "dim7", aug7: "aug7",
    madd9: "madd9", add11: "add11", sixth9: "6/9", dom7b9: "7(b9)",
    dom7s9: "7(#9)", dom7b5: "7(b5)", power: "5"
  };

  /* 調（key）は {root: 0-11, mode: "major"|"minor"} */
  function scaleOf(key) { return key.mode === "minor" ? MINOR : MAJOR; }

  function keyLabel(key) {
    var ja = { C: "ハ", D: "ニ", E: "ホ", F: "ヘ", G: "ト", A: "イ", B: "ロ" };
    var n = NAMES[key.root];
    return ja[n.charAt(0)] + (n.charAt(1) === "#" ? "嬰" : "") +
           (key.mode === "minor" ? "短調" : "長調");
  }

  /** 重み付きピッチクラス分布（12個の配列）から調を推定する */
  function detectKey(weights) {
    var best = null, r, i, s, m, prof;
    for (r = 0; r < 12; r++) {
      for (m = 0; m < 2; m++) {
        prof = m ? P_MIN : P_MAJ;
        s = 0;
        for (i = 0; i < 12; i++) s += weights[(r + i) % 12] * prof[i];
        if (!best || s > best.score) best = { root: r, mode: m ? "minor" : "major", score: s };
      }
    }
    return best || { root: 0, mode: "major", score: 0 };
  }

  /** 和音 {root, type} を実際のピッチクラス配列にする */
  function chordPitches(chord) {
    var shape = CHORD_SHAPES[chord.type] || CHORD_SHAPES.maj;
    return shape.map(function (iv) { return (chord.root + iv) % 12; });
  }

  /** 和音を、指定した高さのあたりに並べた MIDI ノート番号にする */
  function chordVoicing(chord, lowMidi) {
    var shape = CHORD_SHAPES[chord.type] || CHORD_SHAPES.maj;
    var base = lowMidi - (lowMidi % 12) + chord.root;
    if (base < lowMidi) base += 12;
    return shape.map(function (iv) { return base + iv; });
  }

  function chordName(chord) {
    var pitchNames = chord.preferFlats ? ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"] : NAMES;
    var name = pitchNames[chord.root % 12] + (CHORD_SUFFIX[chord.type] !== undefined ? CHORD_SUFFIX[chord.type] : "");
    if (Number.isFinite(chord.bass) && chord.bass % 12 !== chord.root % 12) name += "/" + pitchNames[chord.bass % 12];
    return name;
  }

  /** 重み分布に最も合う三和音を選ぶ（お手本の解析用。ここでは三和音だけを候補にする） */
  function detectChord(weights) {
    var best = null, r, t, i, pcs, hit, total, score;
    var cand = ["maj", "min"];
    for (r = 0; r < 12; r++) {
      for (t = 0; t < cand.length; t++) {
        pcs = chordPitches({ root: r, type: cand[t] });
        hit = 0; total = 0;
        for (i = 0; i < 12; i++) {
          total += weights[i];
          if (pcs.indexOf(i) >= 0) hit += weights[i];
          else hit -= weights[i] * 0.45;
        }
        if (total === 0) continue;
        /* 同点のときは、根音がよく鳴っているほうを選ぶ */
        score = (hit + weights[r] * 0.18) / total;
        if (!best || score > best.score) best = { root: r, type: cand[t], score: score };
      }
    }
    return best || { root: 0, type: "maj", score: 0 };
  }

  /** その調で自然な和音の種類（度数 0-6 を渡す） */
  function diatonicType(key, degree) {
    var majorTypes = ["maj", "min", "min", "maj", "maj", "min", "dim"];
    var minorTypes = ["min", "dim", "maj", "min", "min", "maj", "maj"];
    var t = key.mode === "minor" ? minorTypes : majorTypes;
    return t[((degree % 7) + 7) % 7];
  }

  /** 度数（0=I）→ その調での和音 */
  function chordOfDegree(key, degree, type) {
    var sc = scaleOf(key);
    var idx = ((degree % 7) + 7) % 7;
    return {
      root: (key.root + sc[idx]) % 12,
      type: (!type || type === "auto") ? diatonicType(key, idx) : type
    };
  }

  /** 平行調（ハ長調 ⇔ イ短調）。使う音は同じで、中心の音だけが変わる */
  function relativeKey(key, mode) {
    if (key.mode === mode) return key;
    return mode === "minor"
      ? { root: (key.root + 9) % 12, mode: "minor" }
      : { root: (key.root + 3) % 12, mode: "major" };
  }

  function inScale(midi, key) {
    return scaleOf(key).indexOf((((midi - key.root) % 12) + 12) % 12) >= 0;
  }

  /** スケール度数 → MIDI ノート番号。octave 4 の 0 度が C4(60) になる */
  function degreeToMidi(degree, key, octave) {
    var sc = scaleOf(key);
    var oct = Math.floor(degree / 7);
    var idx = ((degree % 7) + 7) % 7;
    return key.root + sc[idx] + 12 * (octave + oct + 1);
  }

  function midiToDegree(midi, key, octave) {
    var best = 0, bd = 1e9, d, diff;
    for (d = -21; d <= 28; d++) {
      diff = Math.abs(degreeToMidi(d, key, octave) - midi);
      if (diff < bd) { bd = diff; best = d; }
    }
    return best;
  }

  /** その調のスケール上で、一番近い音に寄せる */
  function snapToScale(midi, key) {
    for (var d = 0; d <= 6; d++) {
      if (inScale(midi - d, key)) return midi - d;
      if (inScale(midi + d, key)) return midi + d;
    }
    return midi;
  }

  function midiName(m) {
    return NAMES[(((m % 12) + 12) % 12)] + (Math.floor(m / 12) - 1);
  }

  root.theory = {
    NAMES: NAMES, MAJOR: MAJOR, MINOR: MINOR, CHORD_SHAPES: CHORD_SHAPES,
    scaleOf: scaleOf, keyLabel: keyLabel, detectKey: detectKey,
    chordPitches: chordPitches, chordVoicing: chordVoicing, chordName: chordName,
    detectChord: detectChord, diatonicType: diatonicType, chordOfDegree: chordOfDegree,
    relativeKey: relativeKey, inScale: inScale, degreeToMidi: degreeToMidi, midiToDegree: midiToDegree,
    snapToScale: snapToScale, midiName: midiName
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
