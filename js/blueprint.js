/* blueprint.js — GPT / Gemini が書いた短い曲設計図を、安全な Song へ変換する。
   外部通信は行わない。入力音符を再作曲せず、形式検査と単位変換だけを行う。 */
(function (root) {
  "use strict";

  var FORMAT = "uta-genkou-song-blueprint";
  var VERSION = 1;
  var STEPS_PER_BAR = 16;
  var STEPS_PER_BEAT = 4;
  var MAX_TEXT = 2 * 1024 * 1024;
  var MAX_TRACKS = 32;
  var MAX_NOTES = 20000;
  var MAX_BARS = 512;
  var NOTE_ROOTS = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  var DRUM_NAMES = {
    kick:36, bass_drum:36, snare:38, clap:39, closed_hat:42,
    open_hat:46, low_tom:45, mid_tom:47, high_tom:50,
    crash:49, ride:51, tambourine:54
  };
  var CHORD_TYPES = {
    "":"maj", major:"maj", maj:"maj", m:"min", min:"min", minor:"min",
    dim:"dim", sus2:"sus2", sus4:"sus4", "7":"dom7", m7:"min7",
    min7:"min7", M7:"maj7", maj7:"maj7", add9:"add9", m6:"min6",
    "6":"sixth", "m7b5":"m7b5", "m7-5":"m7b5", aug:"aug", "+":"aug",
    "9":"dom9", m9:"min9", "7sus4":"sus47", M9:"maj9", maj9:"maj9",
    mM7:"minmaj7", dim7:"dim7", aug7:"aug7", madd9:"madd9",
    add11:"add11", "6/9":"sixth9", "7(b9)":"dom7b9", "7b9":"dom7b9",
    "7(#9)":"dom7s9", "7#9":"dom7s9", "7(b5)":"dom7b5", "7b5":"dom7b5",
    "5":"power"
  };

  function fail(message) { throw new Error(message); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value) { return value !== "" && value !== null && value !== undefined && Number.isFinite(+value); }
  function boundedNumber(value, low, high, label) {
    if (!finite(value) || +value < low || +value > high) fail(label + "が範囲外です");
    return +value;
  }
  function text(value, maximum, label) {
    var result = String(value === undefined || value === null ? "" : value);
    if (result.length > maximum) fail(label + "が長すぎます");
    return result;
  }
  function pitchClass(letter, accidental) {
    var rootValue = NOTE_ROOTS[String(letter || "").toUpperCase()];
    if (rootValue === undefined) fail("音名を読めません: " + letter);
    if (accidental === "#" || accidental === "♯") rootValue++;
    if (accidental === "b" || accidental === "♭") rootValue--;
    return (rootValue + 12) % 12;
  }
  function parsePitch(value, label) {
    if (finite(value)) return Math.round(boundedNumber(value, 0, 127, label));
    var match = String(value || "").trim().match(/^([A-Ga-g])([#b♯♭]?)(-?\d)$/);
    if (!match) fail(label + "の音高を読めません: " + value);
    return Math.max(0, Math.min(127, pitchClass(match[1], match[2]) + 12 * (+match[3] + 1)));
  }
  function parseKey(value) {
    if (value && typeof value === "object" && finite(value.root)) {
      return {
        root:Math.round(boundedNumber(value.root, 0, 11, "key.root")),
        mode:String(value.mode || "major").toLowerCase() === "minor" ? "minor" : "major"
      };
    }
    var source = String(value || "C major").trim().replace(/♯/g, "#").replace(/♭/g, "b");
    var match = source.match(/^([A-Ga-g])([#b]?)(?:\s*(major|minor|maj|min|m))?$/i);
    if (!match) fail("keyを読めません: " + source);
    var suffix = String(match[3] || "major").toLowerCase();
    return { root:pitchClass(match[1], match[2]), mode:(suffix === "minor" || suffix === "min" || suffix === "m") ? "minor" : "major" };
  }
  function parseChord(value, label) {
    if (value && typeof value === "object" && finite(value.root) && value.type) {
      if (!root.theory || !root.theory.CHORD_SHAPES[value.type]) fail(label + "のコード種類が未対応です: " + value.type);
      return { root:Math.round(boundedNumber(value.root, 0, 11, label + ".root")), type:String(value.type) };
    }
    /* LLMs commonly call the display value `name`, `chord`, or `symbol`.
       Accept all three spellings while keeping normalized output stable. */
    var source = String(value && (value.name || value.chord || value.symbol) || value || "").trim().replace(/♯/g, "#").replace(/♭/g, "b");
    var match = source.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g])([#b]?))?$/);
    if (!match) fail(label + "を読めません: " + source);
    var suffix = match[3] || "";
    if (CHORD_TYPES[suffix] === undefined) fail(label + "のコード種類が未対応です: " + source);
    var chord = { root:pitchClass(match[1], match[2]), type:CHORD_TYPES[suffix] };
    if (match[4]) chord.bass = pitchClass(match[4], match[5]);
    if (match[2] === "b" || match[2] === "♭") chord.preferFlats = true;
    return chord;
  }
  function normalizeSections(input, errors) {
    var cursor = 1;
    return (Array.isArray(input) ? input : []).map(function (section, index) {
      if (!section || typeof section !== "object") { errors.push("sections[" + index + "]が不正です"); return null; }
      var bars = Math.round(+section.bars);
      var startBar = section.startBar === undefined ? cursor : Math.round(+section.startBar);
      if (!finite(bars) || bars < 1 || bars > MAX_BARS || !finite(startBar) || startBar < 1 || startBar > MAX_BARS) {
        errors.push("sections[" + index + "]の小節位置が不正です"); return null;
      }
      cursor = startBar + bars;
      return {
        id:text(section.id || "section-" + (index + 1), 40, "section id"),
        label:text(section.label || section.id || "Section " + (index + 1), 60, "section label"),
        startBar:startBar, bars:bars,
        energy:finite(section.energy) ? Math.max(0, Math.min(1, +section.energy)) : null
      };
    }).filter(Boolean);
  }
  function notePosition(note, label) {
    if (finite(note.step)) return boundedNumber(note.step, 0, MAX_BARS * STEPS_PER_BAR, label + ".step");
    var bar = Math.round(boundedNumber(note.bar, 1, MAX_BARS, label + ".bar"));
    var beat = boundedNumber(note.beat === undefined ? 1 : note.beat, 1, 5, label + ".beat");
    if (beat >= 5) fail(label + ".beatは1以上5未満にしてください");
    return (bar - 1) * STEPS_PER_BAR + (beat - 1) * STEPS_PER_BEAT;
  }
  function noteDuration(note, label) {
    if (finite(note.durationSteps)) return boundedNumber(note.durationSteps, 0.01, MAX_BARS * STEPS_PER_BAR, label + ".durationSteps");
    return boundedNumber(note.durationBeats === undefined ? note.duration : note.durationBeats, 0.01, MAX_BARS * 4, label + ".durationBeats") * STEPS_PER_BEAT;
  }
  function roleName(role) {
    var value = String(role || "instrument").toLowerCase();
    if (value === "vocal" || value === "melody" || value === "voice") return "melody";
    if (value === "bass") return "bass";
    if (value === "drum" || value === "drums") return "drum";
    return "accompaniment";
  }
  function drumPitch(value, label) {
    if (finite(value)) return parsePitch(value, label);
    var normalized = String(value || "").toLowerCase().replace(/[ -]+/g, "_");
    if (DRUM_NAMES[normalized] === undefined) fail(label + "のドラム名を読めません: " + value);
    return DRUM_NAMES[normalized];
  }
  function normalizeTracks(input, diagnostics) {
    if (!Array.isArray(input) || !input.length) fail("tracksを1つ以上書いてください");
    if (input.length > MAX_TRACKS) fail("tracksは" + MAX_TRACKS + "個までです");
    var ids = {}, noteCount = 0, nextChannel = 2;
    var tracks = input.map(function (track, trackIndex) {
      if (!track || typeof track !== "object") fail("tracks[" + trackIndex + "]が不正です");
      var id = text(track.id || "track-" + (trackIndex + 1), 60, "track id");
      if (ids[id]) fail("track idが重複しています: " + id);
      ids[id] = true;
      var role = roleName(track.role), isDrum = role === "drum" || track.isDrum === true;
      var channel;
      if (isDrum) channel = 9;
      else if (finite(track.channel)) {
        /* AIがよく使う0始まりを正とする。16だけは旧1始まりのch16として受ける。 */
        var requestedChannel = Math.round(boundedNumber(track.channel, 0, 16, id + ".channel"));
        channel = requestedChannel === 16 ? 15 : requestedChannel;
        if (requestedChannel === 16) diagnostics.warnings.push(id + ".channel=16をMIDI ch16として読みました");
      }
      else if (role === "melody") channel = 0;
      else if (role === "bass") channel = 1;
      else {
        while (nextChannel === 9) nextChannel++;
        channel = nextChannel++;
        if (channel > 15) fail("自動割当できるMIDIチャンネルが足りません");
      }
      if (isDrum) channel = 9;
      var program = isDrum ? 0 : Math.round(boundedNumber(track.program === undefined ? 1 : track.program, 1, 128, id + ".program")) - 1;
      if (!Array.isArray(track.notes)) fail(id + ".notesを配列で書いてください");
      noteCount += track.notes.length;
      if (noteCount > MAX_NOTES) fail("音符は合計" + MAX_NOTES + "個までです");
      var notes = track.notes.map(function (note, noteIndex) {
        var label = id + ".notes[" + noteIndex + "]";
        if (!note || typeof note !== "object") fail(label + "が不正です");
        return {
          s:notePosition(note, label), d:noteDuration(note, label),
          n:isDrum ? drumPitch(note.pitch === undefined ? note.drum : note.pitch, label + ".pitch") : parsePitch(note.pitch, label + ".pitch"),
          v:Math.round(boundedNumber(note.velocity === undefined ? 96 : note.velocity, 1, 127, label + ".velocity")),
          text:text(note.lyric || "", 40, label + ".lyric"),
          line:finite(note.line) ? Math.max(0, Math.round(+note.line)) : 0
        };
      }).sort(function (a, b) { return a.s - b.s || a.n - b.n; });
      return {
        id:id, name:text(track.name || id, 80, id + ".name"), sourceTrack:trackIndex,
        channel:channel, program:program, bank:0, isDrum:isDrum,
        role:isDrum ? "drum" : role, enabled:track.enabled !== false, notes:notes
      };
    });
    diagnostics.stats.trackCount = tracks.length;
    diagnostics.stats.noteCount = noteCount;
    return tracks;
  }
  function expandedChords(input, bars, diagnostics) {
    if (!Array.isArray(input) || !input.length) fail("chordsを1つ以上書いてください");
    var output = [], i;
    if (input.every(function (entry) { return typeof entry === "string"; })) {
      var pattern = input.map(function (entry, index) { return parseChord(entry, "chords[" + index + "]"); });
      for (i = 0; i < bars; i++) output.push(clone(pattern[i % pattern.length]));
      diagnostics.stats.chordPatternBars = pattern.length;
      return output;
    }
    var events = input.map(function (entry, index) {
      if (!entry || typeof entry !== "object") fail("chords[" + index + "]が不正です");
      return { bar:Math.round(boundedNumber(entry.bar, 1, bars, "chords[" + index + "].bar")), chord:parseChord(entry, "chords[" + index + "]") };
    }).sort(function (a, b) { return a.bar - b.bar; });
    var current = events[0].chord, eventIndex = 0;
    for (i = 1; i <= bars; i++) {
      while (eventIndex + 1 < events.length && events[eventIndex + 1].bar <= i) current = events[++eventIndex].chord;
      output.push(clone(current));
    }
    diagnostics.stats.chordPatternBars = events.length;
    return output;
  }
  function chordTone(theory, note, chord) {
    return theory && chord && theory.chordPitches(chord).indexOf(((note.n % 12) + 12) % 12) >= 0;
  }
  function diagnose(song, blueprint, diagnostics) {
    var vocal = song.melody, bpm = blueprint.bpm, minimumMs = 220;
    var short = 0, overlap = 0, lyricNotes = 0, strong = 0, strongChord = 0, maximumLeap = 0;
    vocal.forEach(function (note, index) {
      var durationMs = note.d / STEPS_PER_BEAT * 60000 / bpm;
      if (durationMs + 0.01 < minimumMs) short++;
      if (note.text) lyricNotes++;
      if (index && note.s < vocal[index - 1].s + vocal[index - 1].d - 0.001) overlap++;
      if (index) maximumLeap = Math.max(maximumLeap, Math.abs(note.n - vocal[index - 1].n));
      if (note.s % 8 === 0) {
        strong++;
        if (chordTone(root.theory, note, song.chords[Math.floor(note.s / STEPS_PER_BAR) % song.chords.length])) strongChord++;
      }
    });
    diagnostics.stats.vocalNoteCount = vocal.length;
    diagnostics.stats.lyricNoteCount = lyricNotes;
    diagnostics.stats.tooShortVocalNoteCount = short;
    diagnostics.stats.vocalOverlapCount = overlap;
    diagnostics.stats.maximumAdjacentLeapSemitones = maximumLeap;
    diagnostics.stats.strongChordToneRate = strong ? Math.round(strongChord / strong * 1000) / 1000 : null;
    if (overlap) diagnostics.errors.push("歌唱トラックで音符が" + overlap + "か所重なっています");
    if (short) diagnostics.warnings.push("220ms未満の歌唱音が" + short + "個あります");
    if (maximumLeap > 12) diagnostics.warnings.push("歌唱メロディに" + maximumLeap + "半音の大跳躍があります");
    if (vocal.length && !lyricNotes) diagnostics.warnings.push("歌唱音符にlyricがありません。NEUTRINO用の歌詞を確認してください");
    if (blueprint.sections.length >= 2 && blueprint.sections.every(function (section) { return section.energy === null; })) {
      diagnostics.warnings.push("Sectionのenergyがないため、Aメロとサビの展開差を診断できません");
    }
  }
  function normalize(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("設計図の中身がありません");
    if (data.format !== FORMAT) fail("formatは\"" + FORMAT + "\"にしてください");
    if (+data.version !== VERSION) fail("version 1の設計図だけ開けます");
    var diagnostics = { errors:[], warnings:[], stats:{} };
    var bpm = Math.round(boundedNumber(data.bpm, 30, 240, "bpm"));
    var meter = Array.isArray(data.timeSignature) ? data.timeSignature : [4, 4];
    if (+meter[0] !== 4 || +meter[1] !== 4) fail("Blueprint v1は4/4拍子だけに対応しています");
    var sections = normalizeSections(data.sections, diagnostics.errors);
    var tracks = normalizeTracks(data.tracks, diagnostics);
    var vocalTracks = tracks.filter(function (track) { return track.role === "melody" && !track.isDrum; });
    if (vocalTracks.length !== 1) fail("roleがvocalまたはmelodyのトラックを1つだけ用意してください");
    var noteEnd = tracks.reduce(function (maximum, track) {
      return track.notes.reduce(function (inner, note) { return Math.max(inner, note.s + note.d); }, maximum);
    }, 0);
    var sectionEnd = sections.reduce(function (maximum, section) { return Math.max(maximum, section.startBar - 1 + section.bars); }, 0);
    var bars = Math.max(1, Math.ceil(noteEnd / STEPS_PER_BAR), sectionEnd, Array.isArray(data.chords) ? data.chords.length : 0);
    if (bars > MAX_BARS) fail("曲は" + MAX_BARS + "小節までです");
    var chords = expandedChords(data.chords, bars, diagnostics);
    var vocal = vocalTracks[0];
    var song = {
      importedMidi:true, blueprintImported:true,
      importedMidiInfo:{
        fileName:text(data.title || "AI設計図", 80, "title"), ppq:480, format:1,
        trackCount:tracks.length, noteCount:diagnostics.stats.noteCount, tempoChanges:1,
        timeSignature:{ numerator:4, denominator:4 }, melodyTrackId:vocal.id,
        lyricEvents:vocal.notes.filter(function (note) { return note.text; }).length,
        lyricText:text(data.lyrics || vocal.notes.map(function (note) { return note.text; }).filter(Boolean).join(""), 100000, "lyrics")
      },
      importedTracks:tracks, melodyTrackId:vocal.id,
      melody:vocal.notes.map(function (note) { return clone(note); }),
      bass:[], pad:[], drum:[], extraTracks:[], chords:chords,
      key:parseKey(data.key), totalSteps:Math.max(STEPS_PER_BAR, noteEnd), bars:bars,
      lo:vocal.notes.reduce(function (value, note) { return Math.min(value, note.n); }, 127),
      hi:vocal.notes.reduce(function (value, note) { return Math.max(value, note.n); }, 0),
      blueprintInfo:{ format:FORMAT, version:VERSION, sections:sections, source:text(data.source || "manual-copy", 80, "source") }
    };
    var blueprint = {
      format:FORMAT, version:VERSION, title:text(data.title || "AI設計図", 60, "title"), bpm:bpm,
      timeSignature:[4, 4], key:clone(song.key), lyrics:song.importedMidiInfo.lyricText,
      sections:sections, chords:clone(chords), tracks:clone(tracks), source:song.blueprintInfo.source
    };
    diagnose(song, blueprint, diagnostics);
    if (diagnostics.errors.length) fail(diagnostics.errors.join(" / "));
    song.blueprintDiagnostics = clone(diagnostics);
    return { blueprint:blueprint, song:song, diagnostics:diagnostics };
  }
  function parse(source) {
    var raw = String(source || "");
    if (!raw.trim()) fail("設計図を貼り付けてください");
    if (raw.length > MAX_TEXT) fail("設計図は2MBまでです");
    var data;
    try { data = JSON.parse(raw); }
    catch (_) { fail("JSONを読めません。GPT/Geminiへ『JSONだけ出力』と指定してください"); }
    var inputErrors = collectInputErrors(data);
    if (inputErrors.length) fail("設計図に" + inputErrors.length + "件の問題があります:\n- " + inputErrors.join("\n- "));
    return normalize(data);
  }

  /* 旧実装は最初の1件で止まり、AIへ何度も修正を頼む原因になっていた。
     正規化前に独立した問題をまとめて見せ、1回の手直しで済むようにする。 */
  function collectInputErrors(data) {
    var errors = [], ids = {};
    function add(message) { if (errors.indexOf(message) < 0) errors.push(message); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return ["設計図の中身がありません"];
    if (data.format !== FORMAT) add("formatは\"" + FORMAT + "\"にしてください");
    if (+data.version !== VERSION) add("versionは1にしてください");
    if (!finite(data.bpm) || +data.bpm < 30 || +data.bpm > 240) add("bpmは30〜240にしてください");
    var meter = Array.isArray(data.timeSignature) ? data.timeSignature : [];
    if (+meter[0] !== 4 || +meter[1] !== 4) add("timeSignatureは[4,4]にしてください");
    try { parseKey(data.key); } catch (error) { add(error.message); }
    if (!Array.isArray(data.sections)) add("sectionsを配列で書いてください");
    else data.sections.forEach(function (section, index) {
      if (!section || typeof section !== "object") { add("sections[" + index + "]が不正です"); return; }
      if (!finite(section.bars) || +section.bars < 1 || +section.bars > MAX_BARS) add("sections[" + index + "].barsが不正です");
      if (section.startBar !== undefined && (!finite(section.startBar) || +section.startBar < 1 || +section.startBar > MAX_BARS)) add("sections[" + index + "].startBarが不正です");
    });
    if (!Array.isArray(data.chords) || !data.chords.length) add("chordsを1つ以上書いてください");
    else data.chords.forEach(function (chord, index) { try { parseChord(chord, "chords[" + index + "]"); } catch (error) { add(error.message); } });
    if (!Array.isArray(data.tracks) || !data.tracks.length) add("tracksを1つ以上書いてください");
    else {
      var vocals = 0;
      data.tracks.forEach(function (track, trackIndex) {
        if (!track || typeof track !== "object") { add("tracks[" + trackIndex + "]が不正です"); return; }
        var id = String(track.id || "track-" + (trackIndex + 1));
        if (ids[id]) add("track idが重複しています: " + id); ids[id] = true;
        var role = roleName(track.role), isDrum = role === "drum" || track.isDrum === true;
        if (role === "melody" && !isDrum) vocals++;
        if (track.channel !== undefined && (!finite(track.channel) || +track.channel < 0 || +track.channel > 16)) add(id + ".channelは0〜15（16もch16として可）にしてください");
        if (!isDrum && track.program !== undefined && (!finite(track.program) || +track.program < 1 || +track.program > 128)) add(id + ".programは1〜128にしてください");
        if (!Array.isArray(track.notes)) { add(id + ".notesを配列で書いてください"); return; }
        track.notes.forEach(function (note, noteIndex) {
          var label = id + ".notes[" + noteIndex + "]";
          if (!note || typeof note !== "object") { add(label + "が不正です"); return; }
          if (note.step === undefined && (!finite(note.bar) || +note.bar < 1 || !finite(note.beat) || +note.beat < 1 || +note.beat >= 5)) add(label + "のbar/beatが不正です");
          if (note.step !== undefined && (!finite(note.step) || +note.step < 0)) add(label + ".stepが不正です");
          var duration = note.durationSteps === undefined ? (note.durationBeats === undefined ? note.duration : note.durationBeats) : note.durationSteps;
          if (!finite(duration) || +duration <= 0) add(label + "の長さが不正です");
          try { if (isDrum) drumPitch(note.pitch === undefined ? note.drum : note.pitch, label + ".pitch"); else parsePitch(note.pitch, label + ".pitch"); }
          catch (error) { add(error.message); }
        });
      });
      if (vocals !== 1) add("roleがvocalまたはmelodyのトラックを1つだけ用意してください（現在" + vocals + "個）");
    }
    return errors.slice(0, 100);
  }
  function sample() {
    return JSON.stringify({
      format:FORMAT, version:VERSION, title:"夜明けの帰り道", bpm:92,
      timeSignature:[4,4], key:"D minor", lyrics:"きみと あるいた かえりみち\nそらが すこしだけ とおかった",
      sections:[
        { id:"verse", label:"Aメロ", bars:2, energy:0.35 },
        { id:"chorus", label:"サビ", bars:2, energy:0.82 }
      ],
      chords:["Dm","Bb","F","C"],
      tracks:[
        { id:"vocal", name:"Vocal Guide", role:"vocal", program:81, notes:[
          { bar:1, beat:1, durationBeats:1, pitch:"D4", velocity:88, lyric:"き" },
          { bar:1, beat:2, durationBeats:1, pitch:"F4", velocity:90, lyric:"み" },
          { bar:1, beat:3, durationBeats:2, pitch:"A4", velocity:94, lyric:"と" },
          { bar:2, beat:1, durationBeats:1, pitch:"F4", velocity:88, lyric:"あ" },
          { bar:2, beat:2, durationBeats:1, pitch:"G4", velocity:90, lyric:"る" },
          { bar:2, beat:3, durationBeats:2, pitch:"F4", velocity:92, lyric:"く" },
          { bar:3, beat:1, durationBeats:1, pitch:"A4", velocity:102, lyric:"そ" },
          { bar:3, beat:2, durationBeats:1, pitch:"C5", velocity:106, lyric:"ら" },
          { bar:3, beat:3, durationBeats:2, pitch:"D5", velocity:110, lyric:"が" },
          { bar:4, beat:1, durationBeats:1, pitch:"C5", velocity:102, lyric:"と" },
          { bar:4, beat:2, durationBeats:1, pitch:"A4", velocity:98, lyric:"お" },
          { bar:4, beat:3, durationBeats:2, pitch:"D5", velocity:108, lyric:"い" }
        ]},
        { id:"piano", name:"Piano", role:"chord", program:1, notes:[
          { bar:1, beat:1, durationBeats:4, pitch:"D3", velocity:66 },
          { bar:1, beat:1, durationBeats:4, pitch:"F3", velocity:64 },
          { bar:1, beat:1, durationBeats:4, pitch:"A3", velocity:64 },
          { bar:2, beat:1, durationBeats:4, pitch:"Bb2", velocity:68 },
          { bar:2, beat:1, durationBeats:4, pitch:"D3", velocity:66 },
          { bar:2, beat:1, durationBeats:4, pitch:"F3", velocity:66 },
          { bar:3, beat:1, durationBeats:4, pitch:"F3", velocity:78 },
          { bar:3, beat:1, durationBeats:4, pitch:"A3", velocity:76 },
          { bar:3, beat:1, durationBeats:4, pitch:"C4", velocity:76 },
          { bar:4, beat:1, durationBeats:4, pitch:"C3", velocity:80 },
          { bar:4, beat:1, durationBeats:4, pitch:"E3", velocity:78 },
          { bar:4, beat:1, durationBeats:4, pitch:"G3", velocity:78 }
        ]},
        { id:"bass", name:"Bass", role:"bass", program:34, notes:[
          { bar:1, beat:1, durationBeats:2, pitch:"D2", velocity:82 },
          { bar:1, beat:3, durationBeats:2, pitch:"A2", velocity:78 },
          { bar:2, beat:1, durationBeats:4, pitch:"Bb1", velocity:82 },
          { bar:3, beat:1, durationBeats:2, pitch:"F2", velocity:92 },
          { bar:3, beat:3, durationBeats:2, pitch:"C3", velocity:88 },
          { bar:4, beat:1, durationBeats:4, pitch:"C2", velocity:92 }
        ]},
        { id:"drums", name:"Drums", role:"drums", notes:[
          { bar:1, beat:1, durationBeats:0.25, drum:"kick", velocity:100 },
          { bar:1, beat:3, durationBeats:0.25, drum:"snare", velocity:96 },
          { bar:2, beat:1, durationBeats:0.25, drum:"kick", velocity:102 },
          { bar:2, beat:3, durationBeats:0.25, drum:"snare", velocity:98 },
          { bar:3, beat:1, durationBeats:0.25, drum:"crash", velocity:112 },
          { bar:3, beat:1, durationBeats:0.25, drum:"kick", velocity:108 },
          { bar:3, beat:3, durationBeats:0.25, drum:"snare", velocity:104 },
          { bar:4, beat:1, durationBeats:0.25, drum:"kick", velocity:108 },
          { bar:4, beat:3, durationBeats:0.25, drum:"snare", velocity:104 }
        ]}
      ]
    }, null, 2);
  }
  function prompt() {
    return [
      "あなたは日本語ポップスの作曲者です。以下の仕様に厳密に従い、JSONだけを出力してください。",
      "formatは uta-genkou-song-blueprint、versionは1、timeSignatureは[4,4]です。",
      "key、sections（startBarとbars）、chords、tracksは必須です。",
      "programはGeneral MIDIの1〜128、channelは0〜15、barは1始まり、beatは1以上5未満、durationBeatsは四分音符=1です。",
      "tracksにはrole=vocalを必ず1つだけ含め、各歌唱音符へpitch・durationBeats・lyricを付けてください。",
      "歌唱音は原則220ms以上、語中に不自然な休符を作らず、Aメロとサビに音域・密度・energyの差を付けてください。",
      "chordsには見本で使っている一般的なコード表記を使い、ドラムはkick/snare/closed_hat/open_hat/crash等の名前を使ってください。",
      "実在曲・既存歌詞・固有の旋律をコピーせず、特定アーティストの模倣をしないでください。",
      "次の完全な見本と同じ構造で返してください。",
      "",
      sample(),
      "",
      "依頼内容：ここへ作りたい曲と歌詞を書く"
    ].join("\n");
  }

  root.blueprint = {
    FORMAT:FORMAT, VERSION:VERSION, parse:parse, normalize:normalize,
    parseKey:parseKey, parseChord:parseChord, sample:sample, prompt:prompt
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
