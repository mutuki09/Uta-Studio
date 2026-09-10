/* vocal-timing.js — 日本語を実際に歌える時間へ置く製品用ガードレール。
   音高・歌詞順・コードは変えず、LyricsAnalyzer の構造へ厳密に整列して
   最低発音時間、語中休符禁止、実ブレスを保証する。 */
(function (root) {
  "use strict";

  var compose = root.compose;
  var SPB = compose.SPB || 16;
  var VERSION = "vocal-timing-v1";
  var MIN_NOTE_MS = 120;
  var MIN_SHORT_REST_MS = 80;
  var MIN_BREATH_MS = 200;

  /* advance は次の音までの距離ではなく、その音の score duration の候補。
     本当の休符は prosody decision が選んだ場合だけ別イベントとして作る。 */
  var CELLS = {
    sparse: [
      { id:"sparse-ssl", advances:[2,2,4] },
      { id:"sparse-slsl", advances:[2,4,2,4] },
      { id:"sparse-lsls", advances:[4,2,4,2] }
    ],
    dense: [
      { id:"dense-even", advances:[2,2,2,2] },
      { id:"dense-turn", advances:[1,1,2,2,2] },
      { id:"dense-tail", advances:[2,1,1,2,2] }
    ],
    groove: [
      { id:"groove-push", advances:[3,1,2,3,1] },
      { id:"groove-turn", advances:[1,3,2,2,3] },
      { id:"groove-answer", advances:[2,3,1,3,1] }
    ],
    pickup: [
      { id:"pickup-ssl", advances:[1,1,2,4] },
      { id:"pickup-turn", advances:[1,3,1,2,4] },
      { id:"pickup-answer", advances:[3,1,3,2] }
    ]
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value, fallback) { return Number.isFinite(+value) ? +value : fallback; }
  function unique(values) {
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }
  function normalizeText(value) {
    return String(value || "").replace(/[\s　、,。.！!？?・/／「」『』【】［］]/g, "");
  }
  function makeRng(seed) { return compose.makeRng((seed >>> 0) || 1); }

  function boundaryStrength(boundary, phraseEnd, lineEnd, wordEnd) {
    if (lineEnd) return 1;
    if (phraseEnd) {
      if (/[！!]/.test(boundary)) return 0.95;
      if (/[？?]/.test(boundary)) return 0.9;
      if (/[。.]/.test(boundary)) return 0.86;
      if (/[、,]/.test(boundary)) return 0.68;
      return 0.72;
    }
    return wordEnd ? 0.36 : 0;
  }

  function boundaryType(boundary, phraseEnd, lineEnd, wordEnd) {
    if (lineEnd) return "line";
    if (phraseEnd && boundary && boundary !== "line") return "punctuation";
    if (phraseEnd) return "phrase";
    if (wordEnd) return "word";
    return "none";
  }

  /* 促音・長音は現在のMusicXML経路と同じく直前の歌唱音へ結合する。
     撥音は独立音。これが歌詞解析と譜面をつなぐ唯一の正規表現となる。 */
  function buildSingingUnits(analysis) {
    var units = [];
    var lines = analysis && Array.isArray(analysis.lines) ? analysis.lines : [];
    lines.forEach(function (line, lineIndex) {
      var lineUnits = [];
      (line.phrases || []).forEach(function (phrase, phraseIndex) {
        var phraseUnits = [];
        (phrase.words || []).forEach(function (word, wordIndex) {
          var wordUnits = [];
          (word.moras || []).forEach(function (mora, moraIndex) {
            var id = "line-" + lineIndex + ":phrase-" + phraseIndex +
              ":word-" + wordIndex + ":mora-" + moraIndex;
            var attach = (mora.type === "sokuon" || mora.type === "long") && wordUnits.length;
            if (attach) {
              var previous = wordUnits[wordUnits.length - 1];
              previous.text += mora.text;
              previous.moraIds.push(id);
              previous.moraTypes.push(mora.type);
              previous.canStretch = previous.canStretch || mora.type === "long" || Boolean(mora.canStretch);
              return;
            }
            var unit = {
              unitId:id, text:String(mora.text || ""), moraIds:[id],
              moraTypes:[mora.type || "normal"], lineIndex:lineIndex,
              phraseId:"line-" + lineIndex + ":phrase-" + phraseIndex,
              wordId:"line-" + lineIndex + ":phrase-" + phraseIndex + ":word-" + wordIndex,
              sectionId:"section-" + finite(line.sectionIndex, 0) + "-" + (line.sectionKind || "custom"),
              sectionKind:line.sectionKind || "custom",
              importance:finite(mora.importance, finite(word.importance, 0.5)),
              canStretch:Boolean(mora.canStretch), wordEnd:false, phraseEnd:false, lineEnd:false,
              boundary:String(phrase.boundary || ""), boundaryStrength:0, boundaryType:"none"
            };
            units.push(unit); lineUnits.push(unit); phraseUnits.push(unit); wordUnits.push(unit);
          });
          if (wordUnits.length) wordUnits[wordUnits.length - 1].wordEnd = true;
        });
        if (phraseUnits.length) phraseUnits[phraseUnits.length - 1].phraseEnd = true;
      });
      if (lineUnits.length) lineUnits[lineUnits.length - 1].lineEnd = true;
      lineUnits.forEach(function (unit) {
        unit.boundaryStrength = boundaryStrength(unit.boundary, unit.phraseEnd, unit.lineEnd, unit.wordEnd);
        unit.boundaryType = boundaryType(unit.boundary, unit.phraseEnd, unit.lineEnd, unit.wordEnd);
        unit.moraTypes = unique(unit.moraTypes);
      });
    });
    return units;
  }

  function mergeUnits(consumed) {
    var first = consumed[0], last = consumed[consumed.length - 1];
    return {
      unitIds:consumed.map(function (unit) { return unit.unitId; }),
      moraIds:consumed.reduce(function (all, unit) { return all.concat(unit.moraIds); }, []),
      moraTypes:unique(consumed.reduce(function (all, unit) { return all.concat(unit.moraTypes); }, [])),
      lineIndex:first.lineIndex, phraseId:first.phraseId, wordId:last.wordId,
      sectionId:first.sectionId, sectionKind:first.sectionKind,
      importance:consumed.reduce(function (best, unit) { return Math.max(best, unit.importance); }, 0),
      canStretch:consumed.some(function (unit) { return unit.canStretch; }),
      wordEnd:Boolean(last.wordEnd), phraseEnd:Boolean(last.phraseEnd), lineEnd:Boolean(last.lineEnd),
      boundary:last.boundary || "", boundaryStrength:last.boundaryStrength || 0,
      boundaryType:last.boundaryType || "none"
    };
  }

  /* 音符番号からモーラ位置を推測しない。文字spanが一致しない場合は元タイミングへ戻す。 */
  function alignNotes(notes, units) {
    var aligned = [], mismatches = [];
    var lines = unique(units.map(function (unit) { return unit.lineIndex; }).concat(
      notes.map(function (note) { return finite(note.line, 0); })
    )).sort(function (a, b) { return a - b; });

    lines.forEach(function (lineIndex) {
      var lineNotes = notes.map(function (note, sourceIndex) { return { note:note, sourceIndex:sourceIndex }; })
        .filter(function (entry) { return finite(entry.note.line, 0) === lineIndex; })
        .sort(function (a, b) { return finite(a.note.s, 0) - finite(b.note.s, 0) || a.sourceIndex - b.sourceIndex; });
      var lineUnits = units.filter(function (unit) { return unit.lineIndex === lineIndex; });
      var unitIndex = 0;
      lineNotes.forEach(function (entry, noteIndex) {
        var target = normalizeText(entry.note.text), combined = "", consumed = [];
        while (unitIndex < lineUnits.length && combined.length < target.length) {
          var unit = lineUnits[unitIndex++];
          consumed.push(unit); combined += normalizeText(unit.text);
          if (combined === target) break;
        }
        if (!target || combined !== target || !consumed.length) {
          mismatches.push({ lineIndex:lineIndex, noteIndex:noteIndex,
            noteText:String(entry.note.text || ""), consumedText:consumed.map(function (unit) { return unit.text; }).join("") });
          return;
        }
        var meta = mergeUnits(consumed);
        if (consumed.some(function (unit) { return unit.phraseId !== meta.phraseId; })) {
          mismatches.push({ lineIndex:lineIndex, noteIndex:noteIndex, reason:"note-crosses-phrase" });
          return;
        }
        aligned.push({ note:entry.note, sourceIndex:entry.sourceIndex, meta:meta });
      });
      if (unitIndex < lineUnits.length) {
        mismatches.push({ lineIndex:lineIndex,
          unconsumedText:lineUnits.slice(unitIndex).map(function (unit) { return unit.text; }).join("") });
      }
    });
    aligned.sort(function (a, b) { return a.sourceIndex - b.sourceIndex; });
    if (aligned.length !== notes.length && !mismatches.length) {
      mismatches.push({ reason:"note-count", expected:notes.length, actual:aligned.length });
    }
    return { aligned:aligned, mismatches:mismatches };
  }

  function familyFor(profile, mood) {
    if (profile && profile.rhythm === "groove") return "groove";
    if (profile && profile.rhythm === "pickup") return "pickup";
    return mood && (mood.unit >= 2 || mood.bpm <= 92) ? "sparse" : "dense";
  }

  function minimumSteps(meta, stepMs) {
    var steps = Math.max(1, Math.ceil(MIN_NOTE_MS / stepMs));
    if (meta.moraTypes.indexOf("long") >= 0 || meta.moraTypes.indexOf("sokuon") >= 0) steps++;
    return steps;
  }

  function restDecision(meta, family, rng, shortSteps, breathSteps) {
    if (!meta.wordEnd || meta.lineEnd) return null;
    var probability = family === "groove" ? 0.2 :
      (family === "pickup" ? 0.24 : (family === "sparse" ? 0.16 : 0.08));
    if (meta.phraseEnd) probability += meta.boundaryStrength * 0.38;
    if (rng() >= Math.min(0.78, probability)) return null;
    var breath = meta.phraseEnd && meta.boundaryStrength >= 0.85 && family !== "dense";
    return { kind:breath ? "breath" : "short", duration:breath ? breathSteps : shortSteps,
      reason:meta.boundaryType + "-boundary" };
  }

  function apply(song, analysis, profile, mood, seed) {
    if (!song || !Array.isArray(song.melody) || !song.melody.length) return song;
    var units = buildSingingUnits(analysis);
    var alignment = alignNotes(song.melody, units);
    if (!units.length || alignment.mismatches.length || alignment.aligned.length !== song.melody.length) {
      song.vocalTimingPlan = {
        version:VERSION, fallback:true, reason:"strict-alignment-failed",
        diagnostics:{ alignmentMismatchCount:alignment.mismatches.length,
          alignmentMismatches:clone(alignment.mismatches), hardViolations:["strict-alignment-failed"] }
      };
      return song;
    }

    var bpm = Math.max(30, Math.min(300, finite(mood && mood.bpm, 120)));
    var stepMs = 60000 / bpm / (SPB / 4);
    var shortSteps = Math.max(1, Math.ceil(MIN_SHORT_REST_MS / stepMs));
    var breathSteps = Math.max(1, Math.ceil(MIN_BREATH_MS / stepMs));
    var family = familyFor(profile, mood || {}), pool = CELLS[family];
    var rng = makeRng((seed >>> 0) || 1), byLine = {}, lines = [];
    alignment.aligned.forEach(function (entry) {
      var line = entry.meta.lineIndex;
      if (!byLine[line]) { byLine[line] = []; lines.push(byLine[line]); }
      byLine[line].push(entry);
    });

    var output = [], rests = [], phraseRegions = {}, cellIds = [], cursor = 0;
    lines.forEach(function (entries, lineOrdinal) {
      var cell = pool[(lineOrdinal + Math.floor(rng() * pool.length)) % pool.length];
      cellIds.push(cell.id);
      var lineStart = cursor;
      entries.forEach(function (entry, localIndex) {
        var meta = entry.meta, slot = cell.advances[localIndex % cell.advances.length];
        var duration = Math.max(slot, minimumSteps(meta, stepMs));
        if (meta.phraseEnd && meta.canStretch && family !== "dense") duration++;
        var note = clone(entry.note);
        note.s = cursor; note.d = duration;
        note.sourceNoteId = entry.note.id || "note-" + entry.sourceIndex;
        note.unitIds = meta.unitIds.slice(); note.moraIds = meta.moraIds.slice();
        note.performanceGateRatio = family === "groove" ? 0.9 : (family === "pickup" ? 0.92 : 0.97);
        note.rhythmCell = {
          cellId:cell.id,
          variationId:(profile && profile.id ? profile.id : "natural") + "-line-" + (lineOrdinal + 1),
          phraseId:meta.phraseId, sectionId:meta.sectionId,
          prosodyDecision:"continue", boundaryStrength:meta.boundaryStrength
        };
        output.push(note); cursor += duration;

        var lastInLine = localIndex === entries.length - 1;
        if (!lastInLine) {
          var decision = restDecision(meta, family, rng, shortSteps, breathSteps);
          if (decision) {
            rests.push({ start:cursor, duration:decision.duration, kind:decision.kind,
              afterSourceNoteId:note.sourceNoteId, afterWordEnd:true,
              phraseId:meta.phraseId, sectionId:meta.sectionId,
              reason:decision.reason, boundaryStrength:meta.boundaryStrength });
            note.rhythmCell.prosodyDecision = decision.kind + "-rest";
            cursor += decision.duration;
          }
        }
        if (!phraseRegions[meta.phraseId]) {
          phraseRegions[meta.phraseId] = { phraseId:meta.phraseId, sectionId:meta.sectionId,
            start:note.s, end:note.s + note.d, cellIds:[cell.id], moraCount:0, noteCount:0 };
        }
        phraseRegions[meta.phraseId].end = cursor;
        phraseRegions[meta.phraseId].moraCount += meta.moraIds.length;
        phraseRegions[meta.phraseId].noteCount++;
      });

      if (lineOrdinal < lines.length - 1) {
        var restStart = cursor;
        var earliest = cursor + breathSteps;
        var nextStart;
        if (family === "pickup") {
          nextStart = Math.ceil((earliest + 2) / SPB) * SPB - 2;
          while (nextStart < earliest) nextStart += SPB;
        } else {
          nextStart = Math.ceil(earliest / SPB) * SPB;
        }
        rests.push({ start:restStart, duration:nextStart - restStart, kind:"breath",
          afterSourceNoteId:output[output.length - 1].sourceNoteId, afterWordEnd:true,
          phraseId:entries[entries.length - 1].meta.phraseId,
          sectionId:entries[entries.length - 1].meta.sectionId,
          reason:"line-boundary", boundaryStrength:1 });
        output[output.length - 1].rhythmCell.prosodyDecision = "breath-rest";
        cursor = nextStart;
      }
      /* lineStart is retained in metadata indirectly through phrase start. */
      void lineStart;
    });

    var minimumDurationMs = output.reduce(function (best, note) {
      return Math.min(best, note.d * stepMs);
    }, Infinity);
    var wordInternalRestCount = rests.filter(function (rest) { return !rest.afterWordEnd; }).length;
    var hardViolations = [];
    output.forEach(function (note, index) {
      if (note.d * stepMs + 1e-6 < MIN_NOTE_MS) hardViolations.push("too-short:" + index);
      if (index && output[index - 1].s + output[index - 1].d > note.s) hardViolations.push("overlap:" + index);
    });
    if (wordInternalRestCount) hardViolations.push("word-internal-rest");

    var originalTotal = finite(song.totalSteps, cursor);
    song.melody = output;
    song.totalSteps = cursor;
    song.bars = Math.max(1, Math.ceil(cursor / SPB));
    song.sketchRhythm = { kind:family, cellIds:unique(cellIds) };
    song.vocalTimingPlan = {
      version:VERSION, fallback:false, family:family, rests:rests,
      phraseRegions:Object.keys(phraseRegions).map(function (id) { return phraseRegions[id]; }),
      diagnostics:{
        alignmentMismatchCount:0, hardViolations:hardViolations,
        requiredMinimumDurationMs:MIN_NOTE_MS,
        minimumDurationMs:Number(minimumDurationMs.toFixed(3)),
        requiredMinimumBreathMs:MIN_BREATH_MS,
        breathRestCount:rests.filter(function (rest) { return rest.kind === "breath"; }).length,
        trueRestCount:rests.length, wordInternalRestCount:wordInternalRestCount,
        stepMs:Number(stepMs.toFixed(3)), originalTotalSteps:originalTotal,
        expandedSteps:Math.max(0, cursor - originalTotal), noteCount:output.length
      }
    };
    return song;
  }

  root.vocalTiming = {
    VERSION:VERSION, CELLS:CELLS,
    DEFAULT_LIMITS:{ minimumDurationMs:MIN_NOTE_MS,
      minimumShortRestMs:MIN_SHORT_REST_MS, minimumBreathMs:MIN_BREATH_MS },
    buildSingingUnits:buildSingingUnits, alignNotes:alignNotes, apply:apply
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
