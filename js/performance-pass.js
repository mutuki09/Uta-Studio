/* performance-pass.js — 生成済みの曲へ「演奏」を足す非破壊レイヤー。
   歌詞・メロディの音高・開始位置・音価・コード・BPMは変更しない。
   Velocity、長い周期のドラム差、セクション境界、Bassの接続だけを扱う。 */
(function (root) {
  "use strict";

  var theory = root.theory;
  var SPB = 16;
  var VERSION = "performance-v1";

  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(value))); }

  function sectionForLine(analysis, lineIndex) {
    var line = analysis && analysis.lines && analysis.lines[lineIndex];
    return line && line.sectionKind ? line.sectionKind : "verseA";
  }

  function sectionForNote(note, analysis) {
    if (note && note.rhythmCell && note.rhythmCell.sectionId) return note.rhythmCell.sectionId;
    if (note && note.sectionRole === "chorus") return "chorus";
    return sectionForLine(analysis, note && Number.isFinite(note.line) ? note.line : 0);
  }

  function isChorus(section) { return section === "chorus"; }

  function beatAccent(step) {
    var local = ((Math.round(step) % SPB) + SPB) % SPB;
    if (local === 0) return 9;
    if (local === 8) return 6;
    if (local % 4 === 0) return 3;
    if (local % 2 === 1) return -3;
    return 0;
  }

  function applyMelodyVelocity(song, analysis, profile) {
    var groups = {};
    (song.melody || []).forEach(function (note) {
      var line = Number.isFinite(note.line) ? note.line : 0;
      if (!groups[line]) groups[line] = [];
      groups[line].push(note);
    });

    var profileBase = profile && profile.id === "chorus" ? 99 :
      (profile && profile.id === "groove" ? 97 : 94);
    Object.keys(groups).forEach(function (lineText) {
      var notes = groups[lineText].sort(function (a, b) { return a.s - b.s; });
      notes.forEach(function (note, index) {
        var position = notes.length <= 1 ? 0 : index / (notes.length - 1);
        var phraseArc = Math.sin(Math.PI * position) * 9;
        var sectionBoost = isChorus(sectionForNote(note, analysis)) ? 8 : 0;
        note.v = clamp(profileBase + phraseArc + beatAccent(note.s) + sectionBoost, 68, 122);
        note.dynamicRole = isChorus(sectionForNote(note, analysis)) ? "chorus-arc" : "phrase-arc";
      });
    });
  }

  function applyBackingVelocity(song, analysis) {
    (song.bass || []).forEach(function (note) {
      var sectionBoost = isChorus(sectionForBar(song, analysis, Math.floor(note.s / SPB))) ? 6 : 0;
      note.v = clamp(86 + beatAccent(note.s) + sectionBoost, 70, 112);
    });
    (song.pad || []).forEach(function (note) {
      var sectionBoost = isChorus(sectionForBar(song, analysis, Math.floor(note.s / SPB))) ? 8 : 0;
      note.v = clamp(72 + Math.max(0, beatAccent(note.s) - 2) + sectionBoost, 62, 96);
    });
    (song.drum || []).forEach(function (hit) {
      var local = ((Math.round(hit.s) % SPB) + SPB) % SPB;
      if (hit.kind === "kick") hit.v = local === 0 ? 114 : (local === 8 ? 108 : 98);
      else if (hit.kind === "snare") hit.v = local === 4 || local === 12 ? 108 : 82;
      else if (hit.kind === "crash") hit.v = 116;
      else hit.v = local % 4 === 0 ? 84 : 70;
    });
  }

  function barSections(song, analysis) {
    var bars = Math.max(1, song.bars || Math.ceil((song.totalSteps || SPB) / SPB));
    var sections = new Array(bars);
    (song.melody || []).forEach(function (note) {
      var bar = Math.max(0, Math.min(bars - 1, Math.floor(note.s / SPB)));
      var section = sectionForNote(note, analysis);
      if (!sections[bar] || isChorus(section)) sections[bar] = section;
    });
    var current = "verseA";
    for (var bar = 0; bar < sections.length; bar++) {
      if (sections[bar]) current = sections[bar];
      else sections[bar] = current;
    }
    return sections;
  }

  function sectionForBar(song, analysis, bar) {
    return barSections(song, analysis)[Math.max(0, bar)] || "verseA";
  }

  function removeGenerated(events) {
    return (events || []).filter(function (event) { return event.performanceGenerated !== VERSION; });
  }

  function addOrAccentHit(drums, step, kind, velocity, role) {
    var existing = drums.find(function (hit) { return hit.s === step && hit.kind === kind; });
    if (existing) {
      existing.v = Math.max(existing.v || 1, velocity);
      existing.performanceRole = role;
      return false;
    }
    drums.push({
      s:step,
      kind:kind,
      v:velocity,
      performanceGenerated:VERSION,
      performanceRole:role
    });
    return true;
  }

  function addDrumPhrasing(song, analysis, profile, enabled) {
    song.drum = removeGenerated(song.drum);
    if (enabled === false) return { fills:0, crashes:0 };

    var bars = Math.max(1, song.bars || Math.ceil((song.totalSteps || SPB) / SPB));
    var sections = barSections(song, analysis);
    var fillBars = {};
    var interval = profile && profile.id === "natural" ? 8 : 4;
    var bar;

    for (bar = interval - 1; bar < bars - 1; bar += interval) fillBars[bar] = true;
    for (bar = 1; bar < bars; bar++) {
      if (sections[bar] !== sections[bar - 1]) fillBars[bar - 1] = true;
    }

    var fills = 0, crashes = 0;
    Object.keys(fillBars).forEach(function (barText) {
      var at = (+barText) * SPB;
      var offsets = profile && profile.id === "natural" ? [15] :
        (profile && profile.id === "groove" ? [13,14,15] : [12,14,15]);
      offsets.forEach(function (offset, index) {
        if (addOrAccentHit(song.drum, at + offset, "snare", 78 + index * 9, "phrase-fill")) fills++;
      });
    });

    for (bar = 1; bar < bars; bar++) {
      if (sections[bar] === sections[bar - 1]) continue;
      if (addOrAccentHit(song.drum, bar * SPB, "crash", isChorus(sections[bar]) ? 118 : 108, "section-entry")) crashes++;
    }

    song.drum.sort(function (a, b) { return a.s - b.s || String(a.kind).localeCompare(String(b.kind)); });
    return { fills:fills, crashes:crashes };
  }

  function nearestRootMidi(root, around) {
    var best = 36 + (((root % 12) + 12) % 12), distance = Infinity;
    for (var midi = 28; midi <= 60; midi++) {
      if (((midi % 12) + 12) % 12 !== ((root % 12) + 12) % 12) continue;
      if (Math.abs(midi - around) < distance) { best = midi; distance = Math.abs(midi - around); }
    }
    return best;
  }

  function chooseApproach(target, previous, key) {
    var candidates = [target - 1, target + 1, target - 2, target + 2];
    candidates.sort(function (a, b) {
      var aScale = key && theory.inScale(a, key) ? 0 : 6;
      var bScale = key && theory.inScale(b, key) ? 0 : 6;
      return (aScale + Math.abs(a - previous)) - (bScale + Math.abs(b - previous));
    });
    return clamp(candidates[0], 28, 60);
  }

  function addBassApproaches(song, analysis, profile, enabled) {
    song.bass = removeGenerated(song.bass);
    if (enabled === false || !song.chords || song.chords.length < 2) return 0;

    var bars = Math.max(1, song.bars || Math.ceil((song.totalSteps || SPB) / SPB));
    var sections = barSections(song, analysis);
    var interval = profile && profile.id === "groove" ? 1 :
      (profile && profile.id === "chorus" ? 2 : 4);
    var added = 0;

    for (var bar = 0; bar < bars - 1; bar++) {
      var currentChord = song.chords[bar % song.chords.length];
      var nextChord = song.chords[(bar + 1) % song.chords.length];
      if (!currentChord || !nextChord || currentChord.root === nextChord.root) continue;
      var sectionBoundary = sections[bar] !== sections[bar + 1];
      if (!sectionBoundary && (bar + 1) % interval !== 0) continue;

      var approachStart = bar * SPB + 14;
      var inBar = song.bass.filter(function (note) {
        return note.s >= bar * SPB && note.s < (bar + 1) * SPB && note.s < approachStart;
      });
      var previous = inBar.length ? inBar[inBar.length - 1].n : 36 + currentChord.root;
      var target = nearestRootMidi(nextChord.root, previous);
      var pitch = chooseApproach(target, previous, song.key);

      song.bass = song.bass.filter(function (note) {
        if (note.s >= approachStart && note.s < (bar + 1) * SPB) return false;
        if (note.s < approachStart && note.s + note.d > approachStart) {
          note.d = Math.max(1, approachStart - note.s);
          note.performanceRole = "make-space-for-approach";
        }
        return true;
      });
      song.bass.push({
        s:approachStart,
        d:2,
        n:pitch,
        v:84,
        performanceGenerated:VERSION,
        performanceRole:"chord-approach"
      });
      added++;
    }
    song.bass.sort(function (a, b) { return a.s - b.s || a.n - b.n; });
    return added;
  }

  function velocityRange(song) {
    var values = [];
    [song.melody, song.bass, song.pad, song.drum].forEach(function (part) {
      (part || []).forEach(function (event) { if (Number.isFinite(event.v)) values.push(event.v); });
    });
    if (!values.length) return { min:0, max:0 };
    return { min:Math.min.apply(Math, values), max:Math.max.apply(Math, values) };
  }

  function apply(song, analysis, profile, options) {
    if (!song) return song;
    var opts = options || {};
    applyMelodyVelocity(song, analysis, profile || song.candidateInfo || {});
    applyBackingVelocity(song, analysis);
    var drums = addDrumPhrasing(song, analysis, profile || song.candidateInfo || {}, opts.drumVariation !== false);
    var approaches = addBassApproaches(song, analysis, profile || song.candidateInfo || {}, opts.bassApproach !== false);
    /* 追加したイベントにもpart固有の強弱を与える。 */
    applyBackingVelocity(song, analysis);
    song.performancePlan = {
      version:VERSION,
      melodyStructurePreserved:true,
      fillHits:drums.fills,
      sectionCrashes:drums.crashes,
      bassApproaches:approaches,
      velocityRange:velocityRange(song)
    };
    return song;
  }

  root.performancePass = {
    VERSION:VERSION,
    apply:apply,
    barSections:barSections
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
