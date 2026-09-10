/* musicxml-import.js — 多パートMusicXMLを外部参照なしで安全に内部Songへ変換する。 */
(function (root) {
  "use strict";

  var SPB = 16, STEPS_PER_QUARTER = 4;
  var NOTE_ROOTS = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  var FIFTH_ROOTS = { "-7":11, "-6":6, "-5":1, "-4":8, "-3":3, "-2":10, "-1":5, "0":0, "1":7, "2":2, "3":9, "4":4, "5":11, "6":6, "7":1 };
  var KIND_TYPES = {
    major:"maj", minor:"min", dominant:"dom7", "major-seventh":"maj7", "minor-seventh":"min7",
    diminished:"dim", augmented:"aug", "half-diminished":"m7b5", suspended:"sus4",
    "suspended-second":"sus2", "suspended-fourth":"sus4", power:"power", none:"maj"
  };

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function emptyReport() { return { read:[], filled:[], skipped:[], warnings:[], errors:[] }; }
  function remember(list, message) { if (list.indexOf(message) < 0) list.push(message); }
  function decode(value) {
    return String(value || "")
      .replace(/&#x([0-9a-f]+);/gi, function (_, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
      .replace(/&#([0-9]+);/g, function (_, number) { return String.fromCodePoint(+number); })
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }
  function stripTags(value) { return decode(String(value || "").replace(/<[^>]*>/g, "")).trim(); }
  function attr(source, name) {
    var match = String(source || "").match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(['\"])([\\s\\S]*?)\\1", "i"));
    return match ? decode(match[2]) : "";
  }
  function first(source, tag) {
    var match = String(source || "").match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i"));
    return match ? stripTags(match[1]) : "";
  }
  function blocks(source, tag) {
    var out = [], re = new RegExp("<" + tag + "(?=\\s|>)([^>]*)>([\\s\\S]*?)</" + tag + "\\s*>", "gi"), match;
    while ((match = re.exec(String(source || "")))) out.push({ attrs:match[1], body:match[2], raw:match[0], index:match.index });
    return out;
  }
  function sanitize(source, report) {
    var text = String(source === undefined || source === null ? "" : source).replace(/^\uFEFF/, "");
    var before = text;
    text = text.replace(/<!DOCTYPE[\s\S]*?\]>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "").replace(/<!ENTITY[\s\S]*?>/gi, "");
    if (text !== before) {
      remember(report.filled, "DOCTYPE / ENTITYを安全のため除去しました");
      remember(report.skipped, "DTD（DOCTYPE）と外部定義は読み込まず除去しました");
    }
    return text.replace(/<!--([\s\S]*?)-->/g, "");
  }
  function finite(value) { return Number.isFinite(+value); }
  function number(value, fallback) { return finite(value) ? +value : fallback; }

  function partDefinitions(xml) {
    var definitions = {};
    blocks(xml, "score-part").forEach(function (entry, index) {
      var id = attr(entry.attrs, "id") || "P" + (index + 1), midi = blocks(entry.body, "midi-instrument")[0];
      definitions[id] = {
        id:id, name:first(entry.body, "part-name") || first(entry.body, "part-abbreviation") || id,
        channel:midi ? Math.max(0, Math.min(15, Math.round(number(first(midi.body, "midi-channel"), index + 1)) - 1)) : Math.min(15, index),
        program:midi ? Math.max(0, Math.min(127, Math.round(number(first(midi.body, "midi-program"), 1)) - 1)) : 0,
        unpitched:midi ? Math.max(0, Math.min(127, Math.round(number(first(midi.body, "midi-unpitched"), 37)) - 1)) : 36
      };
    });
    return definitions;
  }

  function keyFromAttributes(body) {
    var fifthsText = first(body, "fifths");
    if (!String(fifthsText).trim() || !finite(fifthsText)) return null;
    var fifths = Math.max(-7, Math.min(7, Math.round(+fifthsText))), mode = first(body, "mode").toLowerCase() === "minor" ? "minor" : "major";
    var rootValue = FIFTH_ROOTS[String(fifths)];
    if (mode === "minor") rootValue = (rootValue + 9) % 12;
    return { root:rootValue, mode:mode };
  }
  function pitchFromNote(body, fallback) {
    var pitch = blocks(body, "pitch")[0];
    if (pitch) {
      var step = first(pitch.body, "step").toUpperCase(), octave = number(first(pitch.body, "octave"), NaN), alter = number(first(pitch.body, "alter"), 0);
      if (NOTE_ROOTS[step] !== undefined && finite(octave)) return Math.max(0, Math.min(127, NOTE_ROOTS[step] + Math.round(alter) + 12 * (Math.round(octave) + 1)));
    }
    return fallback;
  }
  function chordFromHarmony(body) {
    var rootBlock = blocks(body, "root")[0], bassBlock = blocks(body, "bass")[0];
    if (!rootBlock) return null;
    var step = first(rootBlock.body, "root-step").toUpperCase();
    if (NOTE_ROOTS[step] === undefined) return null;
    var rootValue = (NOTE_ROOTS[step] + Math.round(number(first(rootBlock.body, "root-alter"), 0)) + 12) % 12;
    var kindBlock = blocks(body, "kind")[0], kindText = kindBlock ? first(kindBlock.raw, "kind").toLowerCase() : "major";
    var symbol = kindBlock ? attr(kindBlock.attrs, "text") : "";
    var chord = { root:rootValue, type:KIND_TYPES[kindText] || "maj", symbol:symbol };
    if (bassBlock) {
      var bassStep = first(bassBlock.body, "bass-step").toUpperCase();
      if (NOTE_ROOTS[bassStep] !== undefined) chord.bass = (NOTE_ROOTS[bassStep] + Math.round(number(first(bassBlock.body, "bass-alter"), 0)) + 12) % 12;
    }
    return chord;
  }
  function lyricFromNote(body) {
    var lyricBlocks = blocks(body, "lyric"), text = lyricBlocks.map(function (lyric) { return first(lyric.body, "text"); }).filter(Boolean).join("");
    var extendType = "";
    lyricBlocks.forEach(function (lyric) {
      var match = lyric.body.match(/<extend(?=\s|\/?>)([^>]*)\/?\s*>/i);
      if (match) extendType = (attr(match[1], "type") || "continue").toLowerCase();
    });
    return { text:text, extendType:extendType };
  }
  function tempoFromBody(body) {
    var sound = String(body || "").match(/<sound\b[^>]*\btempo\s*=\s*(['"])([\d.]+)\1/i);
    if (sound && finite(sound[2])) return +sound[2];
    var perMinute = first(body, "per-minute");
    return finite(perMinute) ? +perMinute : null;
  }

  function parsePart(partBlock, definition, shared, report) {
    var divisions = 1, beats = 4, beatType = 4, measureStart = 0, notes = [], rests = [], harmonies = [], lyricCount = 0;
    var lyricCounts = {}, voiceNoteCounts = {}, openTies = {}, lyricExtendState = {};
    var measures = blocks(partBlock.body, "measure");
    measures.forEach(function (measure, measureIndex) {
      var cursor = 0, maximum = 0, previousStart = 0, implicit = attr(measure.attrs, "implicit") === "yes";
      var eventRe = /<(attributes|direction|harmony|backup|forward|note)\b([^>]*)>([\s\S]*?)<\/\1>/gi, event;
      while ((event = eventRe.exec(measure.body))) {
        var kind = event[1].toLowerCase(), body = event[3];
        if (kind === "attributes") {
          divisions = Math.max(1, number(first(body, "divisions"), divisions));
          var time = blocks(body, "time")[0];
          if (time) { beats = Math.max(1, Math.round(number(first(time.body, "beats"), beats))); beatType = Math.max(1, Math.round(number(first(time.body, "beat-type"), beatType))); }
          var key = keyFromAttributes(body); if (key && !shared.key) shared.key = key;
          if (!shared.timeSignature) shared.timeSignature = { numerator:beats, denominator:beatType };
          continue;
        }
        if (kind === "direction") {
          var tempo = tempoFromBody(body); if (tempo && !shared.bpm) shared.bpm = tempo;
          continue;
        }
        if (kind === "harmony") {
          var chord = chordFromHarmony(body);
          if (chord) {
            var symbol = chord.symbol || "";
            delete chord.symbol;
            harmonies.push({ s:measureStart + cursor / divisions * STEPS_PER_QUARTER, bar:measureIndex, chord:chord, symbol:symbol });
          }
          continue;
        }
        var duration = Math.max(0, number(first(body, "duration"), 0));
        if (kind === "backup") { cursor = Math.max(0, cursor - duration); continue; }
        if (kind === "forward") { cursor += duration; maximum = Math.max(maximum, cursor); continue; }

        var isChord = /<chord\b[^>]*\/>/i.test(body), isRest = /<rest\b/i.test(body), startDiv = isChord ? previousStart : cursor;
        var voice = first(body, "voice") || "1";
        var stepDuration = duration / divisions * STEPS_PER_QUARTER;
        if (isRest) rests.push({ s:measureStart + startDiv / divisions * STEPS_PER_QUARTER, d:stepDuration, bar:measureIndex, voice:voice });
        else {
          var pitch = pitchFromNote(body, definition.channel === 9 ? definition.unpitched : null), lyricInfo = lyricFromNote(body);
          var lyric = lyricInfo.text, extendType = lyricInfo.extendType;
          if (pitch !== null && pitch !== undefined && stepDuration > 0) {
            if (lyric) { lyricCount++; lyricCounts[voice] = (lyricCounts[voice] || 0) + 1; }
            voiceNoteCounts[voice] = (voiceNoteCounts[voice] || 0) + 1;
            var inheritedExtend = !lyric && !!lyricExtendState[voice];
            var lyricExtend = !!extendType || inheritedExtend;
            if (extendType === "stop") lyricExtendState[voice] = false;
            else if (extendType) lyricExtendState[voice] = true;
            else if (lyric) lyricExtendState[voice] = false;

            var noteStart = measureStart + startDiv / divisions * STEPS_PER_QUARTER;
            var note = { s:noteStart, d:Math.max(0.25, stepDuration), n:pitch, v:96, text:lyric, lyricExtend:lyricExtend, line:measureIndex, voice:voice };
            var tieStart = /<(?:tie|tied)(?=\s|\/?>)[^>]*\btype\s*=\s*(['"])start\1/i.test(body);
            var tieStop = /<(?:tie|tied)(?=\s|\/?>)[^>]*\btype\s*=\s*(['"])stop\1/i.test(body);
            var tieKey = voice + ":" + pitch, tied = tieStop ? openTies[tieKey] : null;
            if (tied) {
              tied.d = Math.max(tied.d, noteStart + note.d - tied.s);
              if (!tied.text && lyric) tied.text = lyric;
              tied.lyricExtend = tied.lyricExtend || lyricExtend;
              if (tieStart) openTies[tieKey] = tied; else delete openTies[tieKey];
            } else {
              notes.push(note);
              if (tieStart) openTies[tieKey] = note;
            }
          }
        }
        if (!isChord) { previousStart = startDiv; cursor += duration; maximum = Math.max(maximum, cursor); }
      }
      var expected = beats * (4 / beatType) * STEPS_PER_QUARTER;
      var actual = maximum / divisions * STEPS_PER_QUARTER;
      measureStart += implicit && actual > 0 ? actual : Math.max(expected, actual || 0);
    });
    var voices = Object.keys(voiceNoteCounts);
    voices.sort(function (a, b) {
      var lyricDiff = (lyricCounts[b] || 0) - (lyricCounts[a] || 0);
      return lyricDiff || (voiceNoteCounts[b] || 0) - (voiceNoteCounts[a] || 0);
    });
    var vocalVoice = voices[0] || "1";
    var vocalNotes = notes.filter(function (note) { return note.voice === vocalVoice; });
    var vocalRests = rests.filter(function (rest) { return rest.voice === vocalVoice; });
    return {
      id:definition.id, name:definition.name, channel:definition.channel, program:definition.program,
      isDrum:definition.channel === 9, notes:notes, rests:rests, harmonies:harmonies,
      lyricCount:lyricCount, vocalVoice:vocalVoice, vocalNotes:vocalNotes, vocalRests:vocalRests,
      measures:measures.length, endStep:measureStart
    };
  }

  function choosePart(parts, requestedId) {
    if (requestedId) {
      var requested = parts.find(function (part) { return part.id === requestedId; });
      if (requested) return requested;
    }
    var ordered = parts.slice().sort(function (a, b) {
      if (b.lyricCount !== a.lyricCount) return b.lyricCount - a.lyricCount;
      var aVoice = /vocal|voice|歌|ボーカル|メロディ/i.test(a.name) ? 1 : 0;
      var bVoice = /vocal|voice|歌|ボーカル|メロディ/i.test(b.name) ? 1 : 0;
      return bVoice - aVoice;
    });
    if (ordered[0] && ordered[0].lyricCount > 0) return ordered[0];
    return parts.find(function (part) { return /vocal|voice|歌|ボーカル|メロディ/i.test(part.name); }) || parts[0] || null;
  }

  function fallbackChords(key, bars) {
    var sequence = key.mode === "minor"
      ? [{root:key.root,type:"min"},{root:(key.root+8)%12,type:"maj"},{root:(key.root+3)%12,type:"maj"},{root:(key.root+10)%12,type:"maj"}]
      : [{root:key.root,type:"maj"},{root:(key.root+7)%12,type:"maj"},{root:(key.root+9)%12,type:"min"},{root:(key.root+5)%12,type:"maj"}];
    var out = [];
    for (var i = 0; i < bars; i++) out.push(clone(sequence[i % sequence.length]));
    return out;
  }

  function parseUnsafe(source, options) {
    var report = emptyReport(), raw = String(source === undefined || source === null ? "" : source), opts = options || {};
    var hasEntityDeclaration = /<!ENTITY\b/i.test(raw);
    var xml = sanitize(raw, report);
    if (hasEntityDeclaration) {
      report.errors.push("ENTITY宣言を含むMusicXMLは安全のため読み込みません");
      return { ok:false, song:null, title:"MusicXML", bpm:100, lyrics:"", parts:[], selectedPartId:"", report:report, sanitizedXml:xml, source:raw };
    }
    if (!/<score-partwise\b/i.test(xml)) {
      report.errors.push("score-partwise形式のMusicXMLではありません");
      return { ok:false, song:null, title:"MusicXML", bpm:100, lyrics:"", parts:[], selectedPartId:"", report:report, sanitizedXml:xml, source:raw };
    }
    var definitions = partDefinitions(xml), shared = { bpm:null, timeSignature:null, key:null };
    var partBlocks = blocks(xml, "part"), parts = [];
    partBlocks.forEach(function (partBlock, index) {
      var id = attr(partBlock.attrs, "id") || "P" + (index + 1);
      var definition = definitions[id] || { id:id, name:id, channel:index === 9 ? 10 : Math.min(15, index), program:0, unpitched:36 };
      parts.push(parsePart(partBlock, definition, shared, report));
    });
    if (!parts.length) {
      report.errors.push("演奏パートを見つけられませんでした");
      return { ok:false, song:null, title:"MusicXML", bpm:100, lyrics:"", parts:[], selectedPartId:"", report:report, sanitizedXml:xml, source:raw };
    }
    var selected = choosePart(parts, opts.partId), title = first(xml, "work-title") || first(xml, "movement-title") || "MusicXMLの曲";
    if (opts.partId && selected && selected.id !== opts.partId) remember(report.warnings, "指定されたパートが無いため歌唱パートを自動選択しました");
    var bpm = Math.max(30, Math.min(300, Math.round(shared.bpm || 100))), timeSignature = shared.timeSignature || { numerator:4, denominator:4 };
    var key = shared.key || { root:0, mode:"major" }, totalSteps = Math.max.apply(Math, parts.map(function (part) { return part.endStep; }).concat([SPB]));
    var barSteps = timeSignature.numerator * (4 / timeSignature.denominator) * STEPS_PER_QUARTER;
    var bars = Math.max(1, Math.ceil(totalSteps / Math.max(1, barSteps))), harmonyEvents = [];
    parts.forEach(function (part) { harmonyEvents = harmonyEvents.concat(part.harmonies); });
    harmonyEvents.sort(function (a, b) { return a.s - b.s; });
    var chords = fallbackChords(key, bars), last = null, harmonyByBar = {};
    harmonyEvents.forEach(function (event) { var bar = Math.floor(event.s / Math.max(1, barSteps)); if (!harmonyByBar[bar]) harmonyByBar[bar] = event.chord; });
    for (var bar = 0; bar < bars; bar++) { if (harmonyByBar[bar]) last = harmonyByBar[bar]; if (last) chords[bar] = clone(last); }
    if (!harmonyEvents.length) remember(report.filled, "コード記号が無いため調から伴奏用コードを補いました");

    var importedTracks = parts.map(function (part) {
      var role = part.id === selected.id ? "melody" : part.isDrum ? "drum" : /bass|ベース/i.test(part.name) ? "bass" : "accompaniment";
      return { id:"musicxml-" + part.id, name:part.name, sourceTrack:parts.indexOf(part), channel:part.channel, program:part.program, bank:0, isDrum:part.isDrum, role:role, enabled:true, notes:clone(part.notes) };
    });
    var melodyTrackId = "musicxml-" + selected.id, melody = clone(selected.vocalNotes || selected.notes), lo = 127, hi = 0;
    melody.forEach(function (note) { lo = Math.min(lo, note.n); hi = Math.max(hi, note.n); });
    var lyricMeasures = {}, lyricOrder = [];
    melody.forEach(function (note) { if (!note.text) return; if (!lyricMeasures[note.line]) { lyricMeasures[note.line] = []; lyricOrder.push(note.line); } lyricMeasures[note.line].push(note.text); });
    var lyrics = lyricOrder.sort(function (a,b){return a-b;}).map(function (line) { return lyricMeasures[line].join(""); }).join("\n");
    var selectedLyricCount = melody.reduce(function (sum, note) { return sum + (note.text ? 1 : 0); }, 0);
    var selectedRests = clone(selected.vocalRests || selected.rests);
    var selectedChordEvents = clone(selected.harmonies || []);
    var song = {
      importedMidi:true, musicXmlImported:true,
      importedMidiInfo:{ fileName:title, ppq:480, format:1, trackCount:importedTracks.length, noteCount:parts.reduce(function (sum, part) { return sum + part.notes.length; }, 0), tempoChanges:shared.bpm ? 1 : 0, timeSignature:timeSignature, melodyTrackId:melodyTrackId, lyricEvents:selectedLyricCount, lyricText:lyrics },
      importedTracks:importedTracks, melodyTrackId:melodyTrackId, melody:melody,
      bass:[], pad:[], drum:[], extraTracks:[], chords:chords, chordEvents:harmonyEvents,
      key:key, totalSteps:Math.max(SPB, totalSteps), bars:bars, lo:melody.length ? lo : 60, hi:melody.length ? hi : 72,
      musicXmlInfo:{ selectedPartId:selected.id, selectedPartName:selected.name, selectedVoice:selected.vocalVoice, rests:selectedRests, sanitizedSource:xml },
      importedMusicXmlInfo:{ selectedPartId:selected.id, selectedPartName:selected.name, selectedVoice:selected.vocalVoice, restCount:selectedRests.length, selectedChordEvents:selectedChordEvents }
    };
    report.read.push(parts.length + "パート・" + song.importedMidiInfo.noteCount + "音");
    report.read.push("歌唱パート: " + selected.name + "（歌詞 " + selectedLyricCount + "個）");
    report.read.push(bpm + " BPM・" + timeSignature.numerator + "/" + timeSignature.denominator + "・" + bars + "小節");
    if (!melody.length) report.errors.push("選んだパートに音符がありません");
    if (!selectedLyricCount) remember(report.warnings, "選んだパートに歌詞がありません。NEUTRINO用に歌詞を確認してください");
    return {
      ok:!!melody.length, song:melody.length ? song : null, title:title, bpm:bpm, lyrics:lyrics, key:clone(key), report:report, sanitizedXml:xml, source:raw,
      selectedPartId:selected.id,
      parts:parts.map(function (part) { return { id:part.id, name:part.name, lyricCount:part.lyricCount, noteCount:part.notes.length, vocalVoice:part.vocalVoice, isDrum:part.isDrum }; })
    };
  }

  function parse(source, options) {
    try { return parseUnsafe(source, options); }
    catch (error) {
      var report = emptyReport();
      report.errors.push("MusicXMLを最後まで解析できませんでした");
      report.skipped.push(error && error.message ? error.message : String(error));
      var safeSource = "", safeXml = "";
      try { safeSource = String(source === undefined || source === null ? "" : source); safeXml = sanitize(safeSource, report); } catch (_) { /* keep empty */ }
      return { ok:false, song:null, title:"MusicXML", bpm:100, lyrics:"", parts:[], selectedPartId:"", report:report, sanitizedXml:safeXml, source:safeSource };
    }
  }

  function isMusicXml(source) {
    try { return /<score-partwise(?=\s|>)/i.test(String(source || "")); }
    catch (_) { return false; }
  }

  root.musicxmlImport = { parse:parse, sanitize:sanitize, isMusicXml:isMusicXml };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
