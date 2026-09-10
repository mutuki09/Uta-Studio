/* editor.js — 画面に触れない作曲編集の小さな道具。 */
(function (root) {
  "use strict";

  var theory = root.theory;
  var KINDS = ["kick", "snare", "hat"];

  function uniqueSteps(values) {
    var seen = {}, out = [];
    (values || []).forEach(function (value) {
      var step = Math.round(Number(value));
      if (step < 0 || step > 15 || seen[step]) return;
      seen[step] = true;
      out.push(step);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  function patternFromRhythm(rhythm) {
    return {
      kick: uniqueSteps(rhythm && rhythm.kick),
      snare: uniqueSteps(rhythm && rhythm.snare),
      hat: uniqueSteps(rhythm && rhythm.hat)
    };
  }

  function togglePattern(pattern, kind, step) {
    if (KINDS.indexOf(kind) < 0) return pattern;
    var next = patternFromRhythm(pattern || {});
    var at = next[kind].indexOf(step);
    if (at >= 0) next[kind].splice(at, 1);
    else next[kind].push(step);
    next[kind] = uniqueSteps(next[kind]);
    return next;
  }

  function buildDrums(pattern, bars) {
    var clean = patternFromRhythm(pattern || {}), out = [];
    for (var bar = 0; bar < Math.max(1, Math.round(bars || 1)); bar++) {
      KINDS.forEach(function (kind) {
        clean[kind].forEach(function (step) {
          out.push({ s: bar * 16 + step, kind: kind });
        });
      });
    }
    return out.sort(function (a, b) { return a.s - b.s || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind); });
  }

  function shiftMelody(notes, semitones, key) {
    return (notes || []).map(function (note) {
      var wanted = note.n + semitones;
      var pitch = Math.abs(semitones) === 12 || !key ? wanted : theory.snapToScale(wanted, key);
      var copy = {};
      Object.keys(note).forEach(function (name) { copy[name] = note[name]; });
      copy.n = Math.max(24, Math.min(108, pitch));
      return copy;
    });
  }

  function noteRange(notes) {
    if (!notes || !notes.length) return { lo: 60, hi: 72 };
    var lo = 127, hi = 0;
    notes.forEach(function (note) { lo = Math.min(lo, note.n); hi = Math.max(hi, note.n); });
    return { lo: lo, hi: hi };
  }

  root.editor = {
    KINDS: KINDS,
    patternFromRhythm: patternFromRhythm,
    togglePattern: togglePattern,
    buildDrums: buildDrums,
    shiftMelody: shiftMelody,
    noteRange: noteRange
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
