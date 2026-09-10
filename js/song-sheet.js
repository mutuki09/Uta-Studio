/* song-sheet.js — GPT/Geminiが短く書ける「AI曲シート」を寛容に内部Songへ変換する。 */
(function (root) {
  "use strict";

  var SPB = 16, STEPS_PER_BEAT = 4;
  var NOTE_ROOTS = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  var CHORD_TYPES = {
    "":"maj", major:"maj", maj:"maj", m:"min", min:"min", minor:"min", dim:"dim", sus2:"sus2", sus4:"sus4",
    "7":"dom7", m7:"min7", min7:"min7", M7:"maj7", maj7:"maj7", add9:"add9", m6:"min6", "6":"sixth",
    "m7b5":"m7b5", "m7-5":"m7b5", aug:"aug", "+":"aug", "9":"dom9", m9:"min9", "7sus4":"sus47",
    M9:"maj9", maj9:"maj9", mM7:"minmaj7", dim7:"dim7", aug7:"aug7", madd9:"madd9", add11:"add11",
    "6/9":"sixth9", "7(b9)":"dom7b9", "7b9":"dom7b9", "7(#9)":"dom7s9", "7#9":"dom7s9",
    "7(b5)":"dom7b5", "7b5":"dom7b5", "5":"power"
  };
  var RHYTHM_ALIASES = {
    "8beat":"eight", "8-beat":"eight", "eight":"eight", "light-pop":"eight", "pop":"eight", "root-8beat":"eight",
    "rock":"rock", "light-rock":"rock", "16beat":"sixteen", "16-beat":"sixteen", "sixteen":"sixteen",
    "ballad":"ballad", "soft":"ballad", "quiet":"quiet", "soft-arpeggio":"quiet", "arpeggio":"quiet",
    "shuffle":"shuffle", "bossa":"bossa", "funk":"funk", "march":"march", "none":"none"
  };
  var BASS_ALIASES = {
    "root":"root", "root-8beat":"eighth", "8beat":"eighth", "eighth":"eighth",
    "walk":"walk", "walking":"walk", "pump":"pump", "none":"none"
  };

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function cleanSource(source) {
    return String(source === undefined || source === null ? "" : source)
      .replace(/^\uFEFF/, "")
      .replace(/```(?:text|txt|markdown|md)?\s*/gi, "")
      .replace(/```/g, "")
      .replace(/\r\n?/g, "\n");
  }
  function emptyReport() { return { read:[], filled:[], skipped:[], warnings:[], errors:[] }; }
  function remember(list, message) { if (list.indexOf(message) < 0) list.push(message); }
  function finite(value) { return Number.isFinite(+value); }

  function durationValue(source) {
    var value = String(source || "").trim();
    if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(value)) {
      var pair = value.split("/");
      return +pair[1] ? +pair[0] / +pair[1] : NaN;
    }
    return +value;
  }

  function parsePitch(source) {
    var match = String(source || "").trim().replace(/♯/g, "#").replace(/♭/g, "b")
      .match(/^([A-Ga-g])([#b]?)(-?\d)$/);
    if (!match) return null;
    var pitch = NOTE_ROOTS[match[1].toUpperCase()];
    if (match[2] === "#") pitch++;
    if (match[2] === "b") pitch--;
    pitch = pitch + 12 * (+match[3] + 1);
    return pitch >= 0 && pitch <= 127 ? pitch : null;
  }

  function parseNoteToken(token, lineNumber, report, preserve) {
    var value = String(token || "").trim().replace(/／/g, "/");
    if (!value) return null;
    var slash = value.lastIndexOf("/");
    if (slash <= 0) {
      remember(report.skipped, lineNumber + "行目の音符を読めませんでした: '" + value + "'");
      return null;
    }
    var head = value.slice(0, slash), beats = durationValue(value.slice(slash + 1));
    if (!finite(beats) || beats <= 0 || beats > 64) {
      remember(report.skipped, lineNumber + "行目の長さを読めませんでした: '" + value + "'");
      return null;
    }
    if (/^R(?:[:：].*)?$/i.test(head)) return { rest:true, d:beats * STEPS_PER_BEAT };
    var colon = Math.max(head.indexOf(":"), head.indexOf("："));
    var pitchText = colon >= 0 ? head.slice(0, colon) : head;
    var lyric = colon >= 0 ? head.slice(colon + 1) : "";
    var pitch = parsePitch(pitchText);
    if (pitch === null) {
      remember(report.skipped, lineNumber + "行目の音名を読めませんでした: '" + pitchText + "'");
      return null;
    }
    if (!lyric && !preserve) {
      lyric = "ん";
      remember(report.filled, lineNumber + "行目のハミングを『ん』として歌える形に補いました");
    }
    return { rest:false, n:pitch, text:lyric, d:beats * STEPS_PER_BEAT };
  }

  function safeKey(value) {
    try {
      if (root.blueprint && root.blueprint.parseKey) return root.blueprint.parseKey(value);
    } catch (_) { /* fall through */ }
    var match = String(value || "").trim().replace(/♯/g, "#").replace(/♭/g, "b")
      .match(/^([A-Ga-g])([#b]?)(?:\s*(m|minor|major))?$/i);
    if (!match) return null;
    var keyRoot = NOTE_ROOTS[match[1].toUpperCase()];
    if (match[2] === "#") keyRoot++;
    if (match[2] === "b") keyRoot--;
    return { root:(keyRoot + 12) % 12, mode:/^(?:m|minor)$/i.test(match[3] || "") ? "minor" : "major" };
  }

  function detectKey(notes) {
    var weights = new Array(12).fill(0);
    (notes || []).forEach(function (note) { weights[((note.n % 12) + 12) % 12] += Math.max(1, note.d || 1); });
    var detected = root.theory && root.theory.detectKey ? root.theory.detectKey(weights) : { root:0, mode:"major" };
    return { root:detected.root, mode:detected.mode };
  }

  function parseChord(text) {
    try {
      if (root.blueprint && root.blueprint.parseChord) return root.blueprint.parseChord(text, "CHORDS");
    } catch (_) { return null; }
    var source = String(text || "").trim().replace(/♯/g, "#").replace(/♭/g, "b");
    var match = source.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g])([#b]?))?$/);
    if (!match || CHORD_TYPES[match[3] || ""] === undefined) return null;
    function pitchClass(letter, accidental) {
      var value = NOTE_ROOTS[String(letter).toUpperCase()];
      if (accidental === "#") value++;
      if (accidental === "b") value--;
      return (value + 12) % 12;
    }
    var chord = { root:pitchClass(match[1], match[2]), type:CHORD_TYPES[match[3] || ""] };
    if (match[4]) chord.bass = pitchClass(match[4], match[5]);
    if (match[2] === "b") chord.preferFlats = true;
    return chord;
  }

  function parseChordLine(value, lineNumber, report) {
    var bars = [];
    String(value || "").split("|").forEach(function (barText) {
      var tokens = barText.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) return;
      var chords = [];
      tokens.forEach(function (token) {
        var chord = parseChord(token);
        if (chord) chords.push(chord);
        else remember(report.skipped, lineNumber + "行目のコードを読めませんでした: '" + token + "'");
      });
      if (chords.length) bars.push(chords);
    });
    return bars;
  }

  function rhythmById(id) {
    var list = root.presets && root.presets.RHYTHMS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || { id:"ballad", kick:[0,10], snare:[8], hat:[0,4,8,12], bass:"root", padGate:1 };
  }

  function nearestRhythm(arrange, report) {
    var requested = String(arrange.rhythm || arrange.drums || "").trim().toLowerCase();
    var mapped = RHYTHM_ALIASES[requested] || requested;
    var found = rhythmById(mapped || "eight");
    var list = root.presets && root.presets.RHYTHMS || [];
    var exact = list.some(function (item) { return item.id === mapped; });
    if (requested && !exact && !RHYTHM_ALIASES[requested]) {
      found = rhythmById("eight");
      remember(report.filled, "未知のリズム '" + requested + "' を8ビートへ寄せました");
    }
    var rhythm = clone(found);
    var bass = String(arrange.bass || "").trim().toLowerCase();
    if (bass) {
      if (BASS_ALIASES[bass]) rhythm.bass = BASS_ALIASES[bass];
      else remember(report.filled, "未知のベース指定 '" + bass + "' はリズム既定値を使いました");
    }
    var piano = String(arrange.piano || "").trim().toLowerCase();
    if (piano === "soft-arpeggio" || piano === "arpeggio" || piano === "arp") rhythm.arp = true;
    else if (piano === "block") { rhythm.arp = false; rhythm.padGate = 1; }
    else if (piano) remember(report.filled, "未知のピアノ指定 '" + piano + "' はリズム既定値を使いました");
    return rhythm;
  }

  function fallbackProgression(key) {
    if (key.mode === "minor") {
      return [
        { root:key.root, type:"min" }, { root:(key.root + 8) % 12, type:"maj" },
        { root:(key.root + 3) % 12, type:"maj" }, { root:(key.root + 10) % 12, type:"maj" }
      ];
    }
    return [
      { root:key.root, type:"maj" }, { root:(key.root + 7) % 12, type:"maj" },
      { root:(key.root + 9) % 12, type:"min" }, { root:(key.root + 5) % 12, type:"maj" }
    ];
  }

  function sectionKind(label) {
    var text = String(label || "").toLowerCase();
    if (/サビ|chorus|hook/.test(text)) return "chorus";
    if (/bメロ|pre|bridge/.test(text)) return "preChorus";
    if (/intro|イントロ/.test(text)) return "intro";
    if (/outro|エンディング/.test(text)) return "outro";
    return "verseA";
  }

  function buildBacking(melody, chords, chordEvents, rhythm, bars) {
    if (!root.compose || !root.compose.backing) return { bass:[], pad:[], drum:[], bars:bars };
    var backingMelody = melody.slice(), targetEnd = Math.max(SPB, bars * SPB);
    var melodyEnd = backingMelody.reduce(function (max, note) { return Math.max(max, note.s + note.d); }, 0);
    if (melodyEnd < targetEnd) backingMelody.push({ s:targetEnd - 1, d:1, n:60 });
    var backing = root.compose.backing(backingMelody, chords, rhythm);

    /* compose.backing()は1小節1コードなので、半小節コードだけbass/padを区間ごとに作り直す。 */
    var events = [];
    for (var bar = 0; bar < bars; bar++) events.push({ s:bar * SPB, chord:clone(chords[bar]) });
    (chordEvents || []).forEach(function (event) {
      if (event && finite(event.s) && event.s >= 0 && event.s < targetEnd && event.chord) events.push(clone(event));
    });
    events.sort(function (a, b) { return a.s - b.s; });
    var merged = [];
    events.forEach(function (event) {
      if (merged.length && merged[merged.length - 1].s === event.s) merged[merged.length - 1] = event;
      else merged.push(event);
    });
    var bass = [], pad = [], previousVoicing = null;
    merged.forEach(function (event, index) {
      var end = Math.min(targetEnd, index + 1 < merged.length ? merged[index + 1].s : targetEnd);
      var duration = Math.max(0, end - event.s);
      if (!duration) return;
      var segment = root.compose.backing([{ s:0, d:duration, n:60 }], [event.chord], rhythm, previousVoicing);
      if (root.harmonyLab && root.harmonyLab.enabled) previousVoicing = root.harmonyLab.voice(event.chord, previousVoicing);
      (segment.bass || []).forEach(function (note) {
        if (note.s >= duration) return;
        var copy = clone(note); copy.s += event.s; copy.d = Math.max(0.25, Math.min(copy.d, duration - note.s)); bass.push(copy);
      });
      (segment.pad || []).forEach(function (note) {
        if (note.s >= duration) return;
        var copy = clone(note); copy.s += event.s; copy.d = Math.max(0.25, Math.min(copy.d, duration - note.s)); pad.push(copy);
      });
    });
    backing.bass = bass; backing.pad = pad; backing.bars = bars;
    return backing;
  }

  function finalize(input) {
    var report = input.report, melody = input.melody, title = input.title || "無題の曲";
    var bpm = clamp(Math.round(+input.bpm || 100), 30, 240);
    if (input.preserve) {
      report.errors = report.errors.concat(report.skipped);
      if (!melody.length) report.errors.push("音程付きの音符がありません。MELODY: または VOCAL: に音符を書いてください。");
      if (report.errors.length) return { ok:false, song:null, report:report, source:input.source };
      var end = Math.max(input.cursor, 16), id = "sheet-melody";
      var lyricText = input.sections.map(function (section) { return section.vocalLines.filter(Boolean).join("\n"); }).filter(Boolean).join("\n\n");
      var events = [];
      input.sections.forEach(function (section) {
        section.chordBars.forEach(function (bar, i) {
          bar.forEach(function (chord, j) { events.push({ s:(section.startBar + i) * SPB + j * SPB / bar.length, chord:clone(chord) }); });
        });
      });
      if (Object.keys(input.arrange).length) report.warnings.push("ARRANGEは伴奏生成の指定です。そのままモードでは適用しません。伴奏を付ける場合のみ補完を選んでください。");
      report.read.push("そのままモード：音高・開始位置・長さを保持／伴奏追加なし", melody.length + "音（歌詞なしの音は楽器として演奏）");
      var preserved = {
        importedMidi:true, importedTracks:[{ id:id, name:lyricText ? "Vocal / Melody" : "Melody", sourceTrack:0, channel:0, program:0, bank:0, isDrum:false, role:"melody", enabled:true, notes:clone(melody) }],
        importedMidiInfo:{ melodyTrackId:id, timeSignature:{ numerator:4, denominator:4 }, noteCount:melody.length }, melodyTrackId:id,
        melody:melody, bass:[], pad:[], drum:[], extraTracks:[], chords:[], chordEvents:events,
        key:input.key || detectKey(melody), bars:Math.ceil(end / SPB), totalSteps:end,
        lo:Math.min.apply(null, melody.map(function (n) { return n.n; })), hi:Math.max.apply(null, melody.map(function (n) { return n.n; })),
        songSheetInfo:{ version:1, preserve:true, report:clone(report), arrange:clone(input.arrange) }
      };
      return { ok:true, song:preserved, title:title, bpm:bpm, lyrics:lyricText, report:report, source:input.source };
    }
    if (!melody.length) {
      remember(report.errors, "VOCALの歌唱音を1つも読み取れませんでした");
      remember(report.skipped, "曲を作るには D4:き/1 のようなVOCAL音符が必要です");
      return { ok:false, song:null, title:title, bpm:bpm, lyrics:"", key:input.key || null, arrange:clone(input.arrange), report:report, source:input.source };
    }

    var key = input.key || detectKey(melody);
    if (!input.key) remember(report.filled, "KEYが無いため " + (root.theory && root.theory.keyLabel ? root.theory.keyLabel(key) : "自動") + " と推定しました");
    var sectionEnd = input.sections.reduce(function (max, section) { return Math.max(max, section.endBar || 0); }, 0);
    var bars = Math.max(1, Math.ceil(input.cursor / SPB), sectionEnd);
    var fallback = fallbackProgression(key), chords = [], chordEvents = [];
    input.sections.forEach(function (section) {
      var count = Math.max(0, section.endBar - section.startBar);
      for (var offset = 0; offset < count; offset++) {
        var chordBar = section.chordBars.length ? section.chordBars[offset % section.chordBars.length] : null;
        if (!chordBar || !chordBar.length) continue;
        chords[section.startBar + offset] = clone(chordBar[0]);
        chordBar.forEach(function (chord, chordIndex) {
          chordEvents.push({ s:(section.startBar + offset) * SPB + chordIndex * (SPB / chordBar.length), chord:clone(chord) });
        });
      }
    });
    var missingChord = false, last = null;
    for (var bar = 0; bar < bars; bar++) {
      if (!chords[bar]) { chords[bar] = clone(last || fallback[bar % fallback.length]); missingChord = true; }
      last = chords[bar];
    }
    if (missingChord) remember(report.filled, "無い小節のコードを調と前後の進行から補いました");

    var rhythm = nearestRhythm(input.arrange, report);
    var backing = buildBacking(melody, chords, chordEvents, rhythm, bars);
    var lyricLines = [], sections = [];
    input.sections.forEach(function (section, index) {
      if (!section.vocalLines.length) return;
      lyricLines.push("[" + section.label + "]");
      section.vocalLines.forEach(function (line) { lyricLines.push(line); });
      sections.push({ id:"section-" + (index + 1), label:section.label, kind:sectionKind(section.label), startBar:section.startBar + 1, bars:Math.max(1, section.endBar - section.startBar), energy:section.energy });
    });
    var lyrics = lyricLines.join("\n");
    var analysis = null;
    try { if (root.lyricsAnalyzer) analysis = root.lyricsAnalyzer.analyze(lyrics, { title:title, mode:"standard" }); } catch (_) { analysis = null; }
    var lo = 127, hi = 0;
    melody.forEach(function (note) { lo = Math.min(lo, note.n); hi = Math.max(hi, note.n); });
    var energy = finite(input.arrange.energy) ? clamp(+input.arrange.energy, 0, 1) : 0.55;
    var normalizedArrange = clone(input.arrange); normalizedArrange.energy = energy;
    var profile = energy >= 0.72 ? { id:"chorus", name:"高エネルギー" } : energy <= 0.35 ? { id:"natural", name:"穏やか" } : { id:"groove", name:"標準" };
    var song = {
      melody:melody, bass:backing.bass || [], pad:backing.pad || [], drum:backing.drum || [], extraTracks:[],
      chords:chords, chordEvents:chordEvents, rhythm:rhythm, key:key, bars:bars, totalSteps:bars * SPB,
      lo:lo, hi:hi, sections:sections, candidateInfo:profile,
      songSheetInfo:{ version:1, arrange:clone(normalizedArrange), report:clone(report), chordEvents:clone(chordEvents) }
    };
    if (root.performancePass) root.performancePass.apply(song, analysis, profile);
    report.read.push(bars + "小節・" + sections.length + "セクション");
    report.read.push("歌唱音 " + melody.length + "個");
    report.read.push("コード " + chords.length + "小節分");
    return { ok:true, song:song, title:title, bpm:bpm, lyrics:lyrics, key:clone(key), arrange:clone(normalizedArrange), report:report, analysis:analysis, source:input.source };
  }

  function parseUnsafe(source, options) {
    var preserve = !!(options && options.preserve);
    var text = cleanSource(source), report = emptyReport(), lines = text.split("\n");
    var title = "無題の曲", bpm = 100, key = null, arrange = {};
    var sections = [], current = null, mode = "header", cursor = 0, melody = [], lineIndex = 0;
    function ensureSection() {
      if (!current) {
        current = { label:"曲全体", startBar:Math.floor(cursor / SPB), endBar:Math.floor(cursor / SPB), chordBars:[], vocalLines:[], energy:null };
        sections.push(current);
      }
      return current;
    }
    function closeSection() {
      if (!current) return;
      current.endBar = Math.max(current.endBar, Math.ceil(cursor / SPB), current.startBar + current.chordBars.length);
      cursor = Math.max(cursor, current.endBar * SPB);
    }

    lines.forEach(function (raw, rawIndex) {
      var lineNumber = rawIndex + 1, line = raw.trim();
      if (!line || /^#(?![#b♯♭]?\d)/.test(line) || /^\/\//.test(line)) return;
      var sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        closeSection();
        current = { label:sectionMatch[1].trim() || "セクション", startBar:Math.ceil(cursor / SPB), endBar:Math.ceil(cursor / SPB), chordBars:[], vocalLines:[], energy:null };
        sections.push(current); mode = "section"; return;
      }
      var field = line.match(/^([A-Za-z_]+)\s*[:：]\s*(.*)$/);
      if (field) {
        var name = field[1].toUpperCase(), value = field[2].trim();
        if (name === "TITLE") { title = value || title; mode = "header"; return; }
        if (name === "BPM") {
          if (preserve && (!finite(value) || +value < 30 || +value > 240 || +value !== Math.round(+value))) report.errors.push(lineNumber + "行目：曲シートのBPMは30〜240の整数で指定してください。");
          if (finite(value)) bpm = clamp(Math.round(+value), 30, 240);
          else remember(report.skipped, lineNumber + "行目のBPMを読めず100を使いました");
          mode = "header"; return;
        }
        if (name === "KEY") {
          key = safeKey(value);
          if (!key) remember(report.skipped, lineNumber + "行目のKEYを読めずメロディから推定します");
          mode = "header"; return;
        }
        if (name === "TIME") {
          if (preserve && value !== "4/4") report.errors.push("曲シートは4/4のみ対応しています。他の拍子はMIDI／MusicXMLで渡してください。4/4への置換は行いません。");
          if (!preserve && value && value !== "4/4") remember(report.filled, "TIME " + value + " は現在4/4として読みました");
          mode = "header"; return;
        }
        if (name === "CHORDS") {
          ensureSection().chordBars = ensureSection().chordBars.concat(parseChordLine(value, lineNumber, report));
          mode = "section"; return;
        }
        if (name === "VOCAL" || name === "MELODY") { ensureSection(); mode = "vocal"; if (value) line = value; else return; }
        else if (name === "ARRANGE") { mode = "arrange"; if (!value) return; }
        else if (mode === "arrange" || ["RHYTHM","BASS","PIANO","DRUMS","ENERGY"].indexOf(name) >= 0) {
          arrange[name.toLowerCase()] = value; mode = "arrange"; return;
        } else if (name !== "VOCAL" && name !== "MELODY") {
          remember(report.skipped, lineNumber + "行目の項目を使いませんでした: '" + name + "'"); return;
        }
      }
      if (mode === "arrange") {
        var arrangeField = line.match(/^([\w-]+)\s*[:：]\s*(.+)$/);
        if (arrangeField) arrange[arrangeField[1].toLowerCase()] = arrangeField[2].trim();
        else remember(report.skipped, lineNumber + "行目のARRANGE指定を読めませんでした: '" + line + "'");
        return;
      }
      if (mode !== "vocal") {
        remember(report.skipped, lineNumber + "行目を読みませんでした: '" + line.slice(0, 80) + "'"); return;
      }

      var content = line.replace(/^\d+\s*\|\s*/, "");
      var tokens = content.split(/\s+/).filter(Boolean), parsed = [];
      tokens.forEach(function (token) { var note = parseNoteToken(token, lineNumber, report, preserve); if (note) parsed.push(note); });
      if (!parsed.length) return;
      var section = ensureSection(), startBar = Math.ceil(cursor / SPB), start = startBar * SPB;
      cursor = start; var lastNote = null, total = 0, lyricText = "";
      parsed.forEach(function (note) {
        total += note.d;
        if (note.rest) { cursor += note.d; return; }
        var event = { s:cursor, d:note.d, n:note.n, v:96, text:note.text || "", line:lineIndex, sectionRole:sectionKind(section.label) };
        melody.push(event); lastNote = event; cursor += note.d; lyricText += note.text || "";
      });
      var intendedEnd = (startBar + 1) * SPB;
      if (preserve) {
        if (cursor > intendedEnd) report.errors.push(lineNumber + "行目：1行は4拍以内です。次の小節へ勝手に移動しません。");
        cursor = Math.max(cursor, intendedEnd);
      } else if (cursor < intendedEnd && lastNote) {
        lastNote.d += intendedEnd - cursor; cursor = intendedEnd;
        remember(report.filled, lineNumber + "行目の拍が足りないため最後の音を伸ばしました");
      } else if (cursor > intendedEnd) {
        remember(report.filled, lineNumber + "行目の余った拍を次の小節へ送りました");
      }
      section.vocalLines.push(lyricText || (preserve ? "" : "ん"));
      section.endBar = Math.max(section.endBar, Math.ceil(cursor / SPB));
      lineIndex++;
    });
    closeSection();
    if (!sections.length) ensureSection();
    sections.forEach(function (section) {
      if (finite(arrange.energy)) section.energy = clamp(+arrange.energy, 0, 1);
    });
    return finalize({ preserve:preserve, source:text, report:report, title:title, bpm:bpm, key:key, arrange:arrange, sections:sections, melody:melody, cursor:cursor });
  }

  function parse(source, options) {
    try { return parseUnsafe(source, options); }
    catch (error) {
      var report = emptyReport();
      report.errors.push("曲シートの処理中に問題が起きました");
      report.skipped.push(error && error.message ? error.message : String(error));
      var safeSource = "";
      try { safeSource = cleanSource(source); } catch (_) { safeSource = ""; }
      return { ok:false, song:null, title:"無題の曲", bpm:100, lyrics:"", key:null, arrange:{}, report:report, source:safeSource };
    }
  }

  function sample() {
    return [
      "TITLE: 夜明けの帰り道", "BPM: 92", "KEY: Dm", "TIME: 4/4", "",
      "[Aメロ]", "CHORDS: Dm | Bb | F | C", "VOCAL:",
      "D4:き/1 F4:み/1 A4:と/2", "F4:あ/1 G4:る/1 F4:く/2",
      "A4:そ/1 G4:ら/1 F4:が/2", "D4:と/1 F4:お/1 D4:い/2", "",
      "[サビ]", "CHORDS: Bb | F | C | Dm", "VOCAL:",
      "A4:ひ/1 C5:か/1 D5:り/2", "C5:へ/1 A4:て/1 D5:を/2", "",
      "ARRANGE:", "rhythm: rock", "bass: eighth", "energy: 0.7"
    ].join("\n");
  }

  function prompt() {
    return [
      "日本語ポップスの作曲者として、オリジナル曲を1つ作ってください。",
      "既存曲の旋律・歌詞をコピーせず、特定アーティストの模倣もしないでください。",
      "", "次の「AI曲シート」形式のテキストだけを出力してください。",
      "説明文・Markdownのコードフェンス・前置きは書かないでください。", "",
      "── 形式の見本 ──", "", sample(), "", "── 規則 ──", "",
      "・VOCALは1行が1小節です。",
      "・音符は「音名:歌詞/長さ」。長さは四分音符=1、二分音符=2、八分音符=0.5。",
      "・1小節の長さの合計は4にしてください。休符は R/1 のように書きます。",
      "・歌詞は1音符に1モーラ。「きゃ」のような拗音は1音符にまとめて構いません。",
      "・CHORDSは | で小節を区切ります。1小節に2つ置く場合は「Dm Bb |」と書きます。",
      "・ベース・ピアノ・ドラムの全音符は書かず、ARRANGEへ雰囲気だけを書いてください。", "",
      "── 依頼 ──", "", "（ここに作りたい曲の内容と歌詞を書く）"
    ].join("\n");
  }

  function looksLike(source) {
    var text = cleanSource(source);
    return /(?:^|\n)\s*(?:TITLE|BPM|KEY|TIME|CHORDS|VOCAL)\s*[:：]/i.test(text);
  }

  root.songSheet = { parse:parse, sample:sample, prompt:prompt, looksLike:looksLike, parsePitch:parsePitch, buildBacking:buildBacking };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
