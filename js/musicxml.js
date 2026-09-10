/* musicxml.js — NEUTRINOへ渡す単旋律のMusicXML 3.1を作る。 */
(function (root) {
  "use strict";

  var STEP_NAMES = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  var ALTER =      [  0,   1,   0,   1,   0,   0,   1,   0,   1,   0,   1,   0];
  var MAJOR_FIFTHS = { 0:0, 1:-5, 2:2, 3:-3, 4:4, 5:-1, 6:6, 7:1, 8:-4, 9:3, 10:-2, 11:5 };
  var PARTS = [16, 12, 8, 6, 4, 3, 2, 1];
  var TYPE = { 16:"whole", 12:"half", 8:"half", 6:"quarter", 4:"quarter", 3:"eighth", 2:"eighth", 1:"16th" };

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function fifths(key) {
    var root = key.mode === "minor" ? (key.root + 3) % 12 : key.root;
    return MAJOR_FIFTHS[root];
  }

  function durationParts(duration) {
    var left = Math.max(0, Math.round(duration)), out = [];
    PARTS.forEach(function (part) {
      while (left >= part) { out.push(part); left -= part; }
    });
    return out;
  }

  function typeLines(duration, indent) {
    var lines = [indent + "<type>" + TYPE[duration] + "</type>"];
    if (duration === 12 || duration === 6 || duration === 3) lines.push(indent + "<dot/>");
    return lines;
  }

  function lyricText(note) {
    var text = String(note.text || "").trim();
    if (!text && note.lyricExtend) return "";
    if (!text || !/^[\u3040-\u309f\u30a0-\u30ffー]+$/.test(text)) {
      throw new Error("NEUTRINO用の読みを付けられない歌詞があります。漢字(かんじ) の形で読みを書いてください");
    }
    return text;
  }

  function restXml(duration) {
    var lines = ["      <note>", "        <rest/>", "        <duration>" + duration + "</duration>", "        <voice>1</voice>"];
    lines = lines.concat(typeLines(duration, "        "));
    lines.push("      </note>");
    return lines;
  }

  function pitchXml(note, duration, tieStop, tieStart, lyric, breath, lyricExtend) {
    // NEUTRINO requires a pronounceable lyric on each sung note. A bare
    // MusicXML <extend> is converted to the unknown phoneme "xx", so imported
    // MIDI melismas must use NEUTRINO's explicit long-vowel lyric instead.
    if (!lyric && lyricExtend) {
      lyric = "ー";
      lyricExtend = false;
    }
    var pc = ((note.n % 12) + 12) % 12;
    var lines = [
      "      <note>",
      "        <pitch>",
      "          <step>" + STEP_NAMES[pc] + "</step>"
    ];
    if (ALTER[pc]) lines.push("          <alter>" + ALTER[pc] + "</alter>");
    lines.push("          <octave>" + (Math.floor(note.n / 12) - 1) + "</octave>");
    lines.push("        </pitch>");
    lines.push("        <duration>" + duration + "</duration>");
    if (tieStop) lines.push("        <tie type=\"stop\"/>");
    if (tieStart) lines.push("        <tie type=\"start\"/>");
    lines.push("        <voice>1</voice>");
    lines = lines.concat(typeLines(duration, "        "));
    lines.push("        <stem>" + (note.n >= 71 ? "down" : "up") + "</stem>");
    if (tieStop || tieStart || breath) {
      lines.push("        <notations>");
      if (tieStop) lines.push("          <tied type=\"stop\"/>");
      if (tieStart) lines.push("          <tied type=\"start\"/>");
      if (breath) {
        lines.push("          <articulations>");
        lines.push("            <breath-mark/>");
        lines.push("          </articulations>");
      }
      lines.push("        </notations>");
    }
    if (lyric || lyricExtend) {
      lines.push("        <lyric number=\"1\">");
      if (lyric) {
        lines.push("          <syllabic>single</syllabic>");
        lines.push("          <text>" + esc(lyric) + "</text>");
      }
      if (lyricExtend) lines.push("          <extend type=\"continue\"/>");
      lines.push("        </lyric>");
    }
    lines.push("      </note>");
    return lines;
  }

  function validateSong(song) {
    if (!song || !Array.isArray(song.melody) || !song.melody.length || !song.key) {
      throw new Error("先にメロディを作ってください");
    }
    var previousEnd = 0;
    song.melody.forEach(function (note) {
      if (!Number.isFinite(note.s) || !Number.isFinite(note.d) || !Number.isFinite(note.n) ||
          note.s < previousEnd || note.d <= 0 || note.n < 0 || note.n > 127) {
        throw new Error("NEUTRINOへ渡せない音符があります");
      }
      lyricText(note);
      previousEnd = note.s + note.d;
    });
  }

  function build(song, bpm, title) {
    validateSong(song);
    var notes = song.melody.slice().sort(function (a, b) { return a.s - b.s; });
    var end = notes.reduce(function (max, note) { return Math.max(max, note.s + note.d); }, 16);
    var bars = Math.max(1, Math.ceil(end / 16));
    var lines = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<score-partwise version=\"3.1\">",
      "  <work><work-title>" + esc(title || "うた原稿") + "</work-title></work>",
      "  <identification><encoding><software>Uta Genkou Studio</software></encoding></identification>",
      "  <part-list>",
      "    <score-part id=\"P1\"><part-name>Vocal</part-name><score-instrument id=\"P1-I1\"><instrument-name>Voice</instrument-name></score-instrument><midi-instrument id=\"P1-I1\"><midi-channel>1</midi-channel><midi-program>54</midi-program></midi-instrument></score-part>",
      "  </part-list>",
      "  <part id=\"P1\">",
      "    <measure number=\"1\">",
      "      <attributes>",
      "        <divisions>4</divisions>",
      "        <key><fifths>" + fifths(song.key) + "</fifths><mode>" + song.key.mode + "</mode></key>",
      "        <time><beats>4</beats><beat-type>4</beat-type></time>",
      "        <clef><sign>G</sign><line>2</line></clef>",
      "      </attributes>",
      "      <direction placement=\"above\"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>" + Math.round(bpm) + "</per-minute></metronome></direction-type><sound tempo=\"" + Math.round(bpm) + "\"/></direction>"
    ];
    lines = lines.concat(restXml(16));
    lines.push("    </measure>");

    for (var bar = 0; bar < bars; bar++) {
      var measureStart = bar * 16, measureEnd = measureStart + 16, cursor = measureStart;
      lines.push("    <measure number=\"" + (bar + 2) + "\">");
      notes.forEach(function (note, noteIndex) {
        var noteEnd = note.s + note.d;
        if (noteEnd <= measureStart || note.s >= measureEnd) return;
        var from = Math.max(note.s, measureStart), to = Math.min(noteEnd, measureEnd);
        if (from > cursor) {
          durationParts(from - cursor).forEach(function (duration) { lines = lines.concat(restXml(duration)); });
        }
        var pieceStart = from;
        durationParts(to - from).forEach(function (duration) {
          var tieStop = pieceStart > note.s;
          var tieStart = pieceStart + duration < noteEnd;
          var firstPiece = pieceStart === note.s;
          var next = notes[noteIndex + 1];
          var phraseEnd = !next || next.line !== note.line;
          var breath = phraseEnd && !tieStart;
          lines = lines.concat(pitchXml(note, duration, tieStop, tieStart,
            firstPiece ? lyricText(note) : null, breath, firstPiece && !!note.lyricExtend));
          pieceStart += duration;
        });
        cursor = to;
      });
      if (cursor < measureEnd) {
        durationParts(measureEnd - cursor).forEach(function (duration) { lines = lines.concat(restXml(duration)); });
      }
      lines.push("    </measure>");
    }
    lines.push("  </part>", "</score-partwise>", "");
    return lines.join("\n");
  }

  root.musicxml = {
    LEAD_STEPS: 16,
    build: build,
    durationParts: durationParts,
    fifths: fifths,
    validateSong: validateSong
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
