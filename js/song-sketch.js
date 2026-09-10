/* song-sketch.js — 通常の作曲器を壊さず、比較できる3つの「曲の原型」を作る製品層。
   音高・和声の土台は compose.js を使い、ここでは時間配置、A/A'反復、
   小さなセクション差だけを加える。研究画面や自動スコアには依存しない。 */
(function (root) {
  "use strict";

  var compose = root.compose;
  var theory = root.theory;
  var vocalTiming = root.vocalTiming;
  var performancePass = root.performancePass;
  var SPB = compose.SPB || 16;

  var CANDIDATE_PROFILES = [
    { id:"natural", letter:"A", name:"素直", note:"言葉を追いやすい、落ち着いた案", rhythm:"natural", motif:0.56, chorusLift:0 },
    { id:"groove", letter:"B", name:"ノリ", note:"休符と食いで前へ進む案", rhythm:"groove", motif:0.62, chorusLift:1 },
    { id:"chorus", letter:"C", name:"サビ", note:"弱起と反復で山場を作る案", rhythm:"pickup", motif:0.82, chorusLift:2 }
  ];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function groupedNotes(song) {
    var groups = [], byLine = {};
    song.melody.forEach(function (note) {
      var line = Number.isFinite(note.line) ? note.line : 0;
      if (!byLine[line]) { byLine[line] = []; groups.push(byLine[line]); }
      byLine[line].push(note);
    });
    groups.forEach(function (notes) { notes.sort(function (a, b) { return a.s - b.s; }); });
    return groups;
  }

  function lineSection(analysis, index) {
    var line = analysis && analysis.lines && analysis.lines[index];
    return line ? line.sectionKind : (index >= Math.max(1, Math.floor(((analysis && analysis.lines.length) || 1) * 0.65)) ? "chorus" : "verseA");
  }

  function fitPitch(pitch, song, extraTop) {
    var lo = song.lo, hi = song.hi + (extraTop || 0);
    while (pitch < lo) pitch += 12;
    while (pitch > hi) pitch -= 12;
    return theory.snapToScale(pitch, song.key);
  }

  function contourFor(notes) {
    if (!notes.length) return [];
    var first = notes[0].n;
    return notes.map(function (note) { return note.n - first; });
  }

  function sampled(values, length) {
    if (!values.length) return [];
    if (length <= 1) return [values[0]];
    var out = [];
    for (var i = 0; i < length; i++) {
      var position = i / (length - 1) * (values.length - 1);
      var left = Math.floor(position), right = Math.min(values.length - 1, left + 1);
      out.push(Math.round(values[left] + (values[right] - values[left]) * (position - left)));
    }
    return out;
  }

  function applyMotif(song, analysis, strength) {
    var groups = groupedNotes(song), repeated = 0;
    for (var index = 1; index < groups.length; index += 2) {
      var source = groups[index - 1], target = groups[index];
      if (!source.length || !target.length) continue;
      if (lineSection(analysis, index - 1) !== lineSection(analysis, index)) continue;
      var ratio = target.length / source.length;
      if (ratio < 0.58 || ratio > 1.7) continue;
      var contour = sampled(contourFor(source), target.length);
      var anchor = target[0].n;
      target.forEach(function (note, noteIndex) {
        if (noteIndex === target.length - 1 && strength < 0.75) return;
        var desired = anchor + contour[noteIndex];
        if (strength < 0.75 && noteIndex % 3 === 2) desired = Math.round((desired + note.n) / 2);
        note.n = fitPitch(desired, song, 2);
        note.motif = { id:"motif-A-" + Math.ceil(index / 2), variation:index % 2 ? "A-prime" : "A" };
      });
      repeated++;
    }
    song.motifPlan = { family:"A/A'", repeatedPairs:repeated, strength:strength };
  }

  function liftSection(song, analysis, degrees) {
    if (!degrees) return 0;
    var lifted = 0;
    song.melody.forEach(function (note) {
      if (lineSection(analysis, note.line) !== "chorus") return;
      var target = note.n + degrees * 2;
      note.n = fitPitch(target, song, degrees * 2 + 2);
      note.sectionRole = "chorus";
      lifted++;
    });
    return lifted;
  }

  function addSectionDrums(song, analysis, profile) {
    if (!song.drum || !song.melody.length) return;
    var chorusBars = {}, added = [];
    song.melody.forEach(function (note) {
      if (lineSection(analysis, note.line) === "chorus") chorusBars[Math.floor(note.s / SPB)] = true;
    });
    Object.keys(chorusBars).forEach(function (barText) {
      var bar = +barText, at = bar * SPB;
      [2,6,10,14].forEach(function (offset) {
        if (!song.drum.some(function (hit) { return hit.s === at + offset && hit.kind === "hat"; })) {
          added.push({ s:at + offset, kind:"hat" });
        }
      });
      if (profile.id === "chorus" && !song.drum.some(function (hit) { return hit.s === at + 12 && hit.kind === "kick"; })) {
        added.push({ s:at + 12, kind:"kick" });
      }
    });
    song.drum = song.drum.concat(added).sort(function (a, b) { return a.s - b.s; });
  }

  function finishSong(song, analysis, profile, mood, seed) {
    if (vocalTiming) vocalTiming.apply(song, analysis, profile, mood, seed + 17);
    applyMotif(song, analysis, profile.motif);
    var lifted = liftSection(song, analysis, profile.chorusLift);
    /* Timing guardrail が小節を増やした場合は、その長さで伴奏を作り直す。 */
    var backing = compose.backing(song.melody, song.chords, song.rhythm);
    song.bass = backing.bass; song.pad = backing.pad; song.drum = backing.drum;
    song.bars = backing.bars;
    addSectionDrums(song, analysis, profile);
    var lo = 127, hi = 0;
    song.melody.forEach(function (note) { lo = Math.min(lo, note.n); hi = Math.max(hi, note.n); });
    song.lo = lo; song.hi = hi;
    song.candidateInfo = clone(profile);
    song.sectionPlan = {
      chorusNoteCount:lifted,
      sections:(analysis && analysis.sections ? analysis.sections : []).map(function (section) {
        return { id:section.id, kind:section.kind, lineCount:section.lines.length };
      })
    };
    if (performancePass) performancePass.apply(song, analysis, profile);
    return song;
  }

  function buildCandidates(phrases, analysis, recipe, mood, seed, override) {
    return CANDIDATE_PROFILES.map(function (profile, index) {
      var candidateSeed = (seed + index * 104729) >>> 0;
      var base = compose.song(phrases, recipe, mood, candidateSeed, override);
      return finishSong(base, analysis, profile, mood, candidateSeed);
    });
  }

  function liftChorus(song, analysis) {
    song.quickAdjusts = song.quickAdjusts || {};
    if ((song.quickAdjusts.chorusLift || 0) >= 2) return 0;
    var lifted = liftSection(song, analysis, 1);
    var lo = 127, hi = 0;
    song.melody.forEach(function (note) { lo = Math.min(lo, note.n); hi = Math.max(hi, note.n); });
    song.lo = lo; song.hi = hi;
    song.quickAdjusts.chorusLift = (song.quickAdjusts.chorusLift || 0) + 1;
    return lifted;
  }

  function strengthenMotif(song, analysis) {
    applyMotif(song, analysis, 0.92);
    song.quickAdjusts = song.quickAdjusts || {};
    song.quickAdjusts.motif = true;
    return song.motifPlan.repeatedPairs;
  }

  root.songSketch = {
    CANDIDATE_PROFILES:CANDIDATE_PROFILES,
    buildCandidates:buildCandidates,
    liftChorus:liftChorus,
    strengthenMotif:strengthenMotif
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
