/* smf.js — Standard MIDI File (SMF 0/1) import/export without dependencies. */
(function (root) {
  "use strict";

  var MAX_NOTES = 100000;

  function readVar(bytes, position) {
    var value = 0, octet, count = 0;
    do {
      if (position.i >= bytes.length || count++ > 4) throw new Error("MIDIの可変長データが壊れています");
      octet = bytes[position.i++];
      value = (value << 7) | (octet & 0x7f);
    } while (octet & 0x80);
    return value >>> 0;
  }

  function roundStep(value) { return Math.round(value * 1000) / 1000; }

  function decodeText(bytes) {
    try {
      if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    } catch (_) {}
    return bytes.map(function (value) { return String.fromCharCode(value); }).join("");
  }

  function parse(buffer) {
    var bytes = new Uint8Array(buffer);
    function requireBytes(offset, length) {
      if (offset < 0 || offset + length > bytes.length) throw new Error("MIDIファイルが途中で切れています");
    }
    function read32(offset) {
      requireBytes(offset, 4);
      return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    }
    function read16(offset) { requireBytes(offset, 2); return (bytes[offset] << 8) | bytes[offset + 1]; }
    function tag(offset) {
      requireBytes(offset, 4);
      return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    }

    if (bytes.length < 14 || tag(0) !== "MThd") throw new Error("MIDIファイルではありません");
    var headerLength = read32(4);
    if (headerLength < 6) throw new Error("MIDIヘッダーが壊れています");
    var format = read16(8), trackCount = read16(10), division = read16(12);
    if (format > 1) throw new Error("SMF Format 0/1だけ読み込めます");
    if (division & 0x8000) throw new Error("SMPTE時間形式のMIDIには未対応です");
    var ppq = division || 480;
    var position = 8 + headerLength;
    var rawNotes = [], rawLyrics = [], tempos = [], timeSignature = { numerator:4, denominator:4 };
    var sourceNames = [];

    for (var trackIndex = 0; trackIndex < trackCount; trackIndex++) {
      if (position + 8 > bytes.length || tag(position) !== "MTrk") throw new Error("MIDIトラックが壊れています");
      var length = read32(position + 4), end = position + 8 + length;
      if (end > bytes.length) throw new Error("MIDIトラックが途中で切れています");
      var cursor = { i:position + 8 }, tick = 0, runningStatus = 0, lastTick = 0;
      var active = {}, programs = [], banksMsb = [], banksLsb = [];
      for (var channel = 0; channel < 16; channel++) {
        programs[channel] = 0; banksMsb[channel] = 0; banksLsb[channel] = 0;
      }

      while (cursor.i < end) {
        tick += readVar(bytes, cursor); lastTick = Math.max(lastTick, tick);
        if (cursor.i >= end) break;
        var status = bytes[cursor.i];
        if (status < 0x80) {
          if (!runningStatus) throw new Error("MIDIのランニングステータスが壊れています");
          status = runningStatus;
        } else {
          cursor.i++;
          if (status < 0xf0) runningStatus = status;
        }

        if (status === 0xff) {
          if (cursor.i >= end) throw new Error("MIDIメタイベントが壊れています");
          var metaType = bytes[cursor.i++], metaLength = readVar(bytes, cursor);
          if (cursor.i + metaLength > end) throw new Error("MIDIメタイベントが途中で切れています");
          var metaStart = cursor.i;
          if (metaType === 0x51 && metaLength === 3) {
            var microseconds = (bytes[metaStart] << 16) | (bytes[metaStart + 1] << 8) | bytes[metaStart + 2];
            if (microseconds > 0) tempos.push({ tick:tick, microseconds:microseconds });
          } else if (metaType === 0x58 && metaLength >= 2 && !tick) {
            timeSignature = { numerator:bytes[metaStart] || 4, denominator:Math.pow(2, bytes[metaStart + 1]) || 4 };
          } else if (metaType === 0x03) {
            sourceNames[trackIndex] = decodeText(Array.prototype.slice.call(bytes, metaStart, metaStart + metaLength)).trim();
          } else if (metaType === 0x05) {
            var lyric = decodeText(Array.prototype.slice.call(bytes, metaStart, metaStart + metaLength))
              .replace(/\0/g, "").trim();
            if (lyric) rawLyrics.push({ trackIndex:trackIndex, tick:tick, text:lyric });
          }
          cursor.i += metaLength;
          continue;
        }
        if (status === 0xf0 || status === 0xf7) {
          var sysexLength = readVar(bytes, cursor);
          if (cursor.i + sysexLength > end) throw new Error("MIDI SysExが途中で切れています");
          cursor.i += sysexLength;
          continue;
        }

        var high = status & 0xf0, midiChannel = status & 0x0f;
        if (high === 0xc0 || high === 0xd0) {
          if (cursor.i >= end) throw new Error("MIDIイベントが途中で切れています");
          var oneByte = bytes[cursor.i++];
          if (high === 0xc0) programs[midiChannel] = oneByte & 0x7f;
          continue;
        }
        if (cursor.i + 1 >= end) throw new Error("MIDIイベントが途中で切れています");
        var data1 = bytes[cursor.i++], data2 = bytes[cursor.i++];
        if (high === 0xb0) {
          if (data1 === 0) banksMsb[midiChannel] = data2 & 0x7f;
          if (data1 === 32) banksLsb[midiChannel] = data2 & 0x7f;
          continue;
        }
        var noteKey = midiChannel + ":" + data1;
        if (high === 0x90 && data2 > 0) {
          (active[noteKey] = active[noteKey] || []).push({
            tick:tick, velocity:data2, program:programs[midiChannel],
            bank:banksMsb[midiChannel] * 128 + banksLsb[midiChannel]
          });
        } else if (high === 0x80 || (high === 0x90 && data2 === 0)) {
          var queue = active[noteKey];
          if (queue && queue.length) {
            var started = queue.shift();
            rawNotes.push({
              trackIndex:trackIndex, channel:midiChannel, program:started.program, bank:started.bank,
              tick:started.tick, endTick:Math.max(started.tick + 1, tick), note:data1, velocity:started.velocity
            });
            if (rawNotes.length > MAX_NOTES) throw new Error("MIDIの音符数が多すぎます（最大10万音）");
          }
        }
      }
      position = end;
    }

    tempos.sort(function (a, b) { return a.tick - b.tick; });
    var tempo = tempos.length ? tempos[0].microseconds : 500000;
    var groups = {}, stepTicks = ppq / 4;
    rawNotes.forEach(function (raw) {
      var key = [raw.trackIndex, raw.channel, raw.program, raw.bank].join(":");
      if (!groups[key]) {
        groups[key] = {
          id:"midi-" + key.replace(/:/g, "-"), sourceTrack:raw.trackIndex, channel:raw.channel,
          program:raw.program, bank:raw.bank, isDrum:raw.channel === 9,
          name:sourceNames[raw.trackIndex] || (raw.channel === 9 ? "Drums" : "Track " + (raw.trackIndex + 1)), notes:[]
        };
      }
      groups[key].notes.push({
        s:roundStep(raw.tick / stepTicks),
        d:Math.max(0.001, roundStep((raw.endTick - raw.tick) / stepTicks)),
        n:raw.note, v:raw.velocity
      });
    });
    var tracks = Object.keys(groups).map(function (key) { return groups[key]; });
    tracks.forEach(function (track) { track.notes.sort(function (a, b) { return a.s - b.s || a.n - b.n; }); });
    tracks.sort(function (a, b) { return a.sourceTrack - b.sourceTrack || a.channel - b.channel || a.program - b.program; });
    var notes = [];
    tracks.forEach(function (track) { if (!track.isDrum) notes = notes.concat(track.notes); });
    notes.sort(function (a, b) { return a.s - b.s || b.n - a.n; });
    var totalSteps = tracks.reduce(function (maximum, track) {
      return track.notes.reduce(function (inner, note) { return Math.max(inner, note.s + note.d); }, maximum);
    }, 0);

    var lyrics = rawLyrics.map(function (lyric) {
      return {
        trackIndex:lyric.trackIndex,
        tick:lyric.tick,
        step:roundStep(lyric.tick / stepTicks),
        text:lyric.text
      };
    }).sort(function (a, b) { return a.tick - b.tick || a.trackIndex - b.trackIndex; });

    return {
      format:format, ppq:ppq, bpm:Math.max(1, Math.round(60000000 / tempo)),
      tempoChanges:tempos.length, timeSignature:timeSignature, tracks:tracks, notes:notes,
      lyrics:lyrics, totalSteps:roundStep(totalSteps), bars:Math.max(1, Math.ceil(totalSteps / 16))
    };
  }

  function melodyScore(track) {
    if (!track || track.isDrum || !track.notes.length) return -Infinity;
    var name = String(track.name || "").toLowerCase();
    var average = track.notes.reduce(function (sum, note) { return sum + note.n; }, 0) / track.notes.length;
    var score = average / 12;
    if (/melody|lead|vocal|voice|歌|メロ/.test(name)) score += 100;
    if (track.channel === 0) score += 12;
    if (track.program >= 73 && track.program <= 88) score += 5;
    if (track.program >= 32 && track.program <= 39 || /bass|ベース/.test(name)) score -= 40;
    return score;
  }

  function roleFor(track, melodyId) {
    if (track.id === melodyId) return "melody";
    if (track.isDrum) return "drum";
    if (track.program >= 32 && track.program <= 39 || /bass|ベース/i.test(track.name || "")) return "bass";
    return "accompaniment";
  }

  function lyricUnits(text, parser) {
    var value = String(text || "").trim();
    if (!value) return [];
    if (typeof parser === "function") {
      var parsed = parser(value), output = [];
      (parsed && parsed.phrases || []).forEach(function (phrase) {
        (phrase || []).forEach(function (unit) {
          if (unit && unit.text) output.push(String(unit.text));
        });
      });
      if (output.length) return output;
    }
    return Array.from(value.replace(/[\s、。！？!?・「」『』（）()]/g, ""));
  }

  function assignLyrics(melody, lyricEvents, parser) {
    var notes = melody || [], events = (lyricEvents || []).filter(function (event) {
      return event && String(event.text || "").trim();
    }).slice().sort(function (a, b) { return a.step - b.step || a.trackIndex - b.trackIndex; });
    var assigned = 0, extended = 0, combined = 0, lineCount = 0;
    if (!notes.length || !events.length) {
      return { assigned:0, extended:0, combined:0, lineCount:0, unassigned:notes.length };
    }

    events.forEach(function (event, eventIndex) {
      var nextStep = eventIndex + 1 < events.length ? events[eventIndex + 1].step : Infinity;
      var lineNotes = [];
      notes.forEach(function (note, noteIndex) {
        if (note.s >= event.step - 0.001 && note.s < nextStep - 0.001) lineNotes.push({ note:note, index:noteIndex });
      });
      var units = lyricUnits(event.text, parser);
      if (!lineNotes.length || !units.length) return;
      lineCount++;
      var previousUnit = -1;
      lineNotes.forEach(function (entry, noteIndex) {
        var from, to;
        if (lineNotes.length >= units.length) {
          from = Math.min(units.length - 1, Math.floor(noteIndex * units.length / lineNotes.length));
          to = from === previousUnit ? from : from + 1;
        } else {
          from = Math.floor(noteIndex * units.length / lineNotes.length);
          to = Math.floor((noteIndex + 1) * units.length / lineNotes.length);
        }
        entry.note.line = lineCount - 1;
        if (to > from) {
          entry.note.text = units.slice(from, to).join("");
          entry.note.lyricExtend = false;
          assigned++;
          if (to - from > 1) combined += to - from - 1;
        } else {
          entry.note.text = "";
          entry.note.lyricExtend = true;
          extended++;
        }
        previousUnit = from;
      });
    });
    return {
      assigned:assigned,
      extended:extended,
      combined:combined,
      lineCount:lineCount,
      unassigned:notes.filter(function (note) { return !note.text && !note.lyricExtend; }).length
    };
  }

  function toSong(parsed, options) {
    if (!parsed || !Array.isArray(parsed.tracks) || !parsed.tracks.length) throw new Error("演奏ノートが入っていないMIDIです");
    var opts = options || {}, melodic = parsed.tracks.filter(function (track) { return !track.isDrum && track.notes.length; });
    if (!melodic.length) throw new Error("メロディとして表示できる音程付きトラックがありません");
    melodic.sort(function (a, b) { return melodyScore(b) - melodyScore(a); });
    var melodyTrack = melodic[0];
    var tracks = parsed.tracks.map(function (track) {
      return {
        id:track.id, name:track.name, sourceTrack:track.sourceTrack, channel:track.channel,
        program:track.program, bank:track.bank, isDrum:track.isDrum,
        role:roleFor(track, melodyTrack.id), enabled:true,
        notes:track.notes.map(function (note) { return { s:note.s, d:note.d, n:note.n, v:note.v }; })
      };
    });
    var melodySource = tracks.filter(function (track) { return track.id === melodyTrack.id; })[0];
    var melody = melodySource.notes.map(function (note) {
      return { s:note.s, d:note.d, n:note.n, v:note.v, text:"", line:0 };
    });
    var parser = opts.parseLyrics || (root.mora && root.mora.parse);
    var lyricAssignment = assignLyrics(melody, parsed.lyrics, parser);
    var lo = 127, hi = 0;
    melody.forEach(function (note) { lo = Math.min(lo, note.n); hi = Math.max(hi, note.n); });
    return {
      importedMidi:true,
      importedMidiInfo:{
        fileName:String(opts.fileName || "MIDI"), ppq:parsed.ppq, format:parsed.format,
        trackCount:tracks.length, noteCount:tracks.reduce(function (sum, track) { return sum + track.notes.length; }, 0),
        tempoChanges:parsed.tempoChanges, timeSignature:parsed.timeSignature, melodyTrackId:melodyTrack.id,
        lyricEvents:(parsed.lyrics || []).length,
        lyricText:(parsed.lyrics || []).map(function (entry) { return entry.text; }).join("\n"),
        lyricAssignment:lyricAssignment
      },
      importedTracks:tracks,
      melodyTrackId:melodyTrack.id,
      melody:melody, bass:[], pad:[], drum:[], extraTracks:[], chords:[],
      key:{ root:0, mode:"major" }, lo:lo, hi:hi,
      totalSteps:parsed.totalSteps, bars:parsed.bars
    };
  }

  function vlq(value) {
    var number = Math.max(0, Math.round(value));
    var output = [number & 0x7f];
    number >>= 7;
    while (number > 0) { output.unshift((number & 0x7f) | 0x80); number >>= 7; }
    return output;
  }

  function textBytes(text) {
    if (typeof TextEncoder !== "undefined") return Array.prototype.slice.call(new TextEncoder().encode(text));
    return String(text).split("").map(function (character) { return character.charCodeAt(0) & 0xff; });
  }

  function trackChunk(events) {
    events.sort(function (a, b) { return a.tick - b.tick || (a.order || 0) - (b.order || 0); });
    var last = 0, body = [];
    events.forEach(function (event) {
      body = body.concat(vlq(event.tick - last), event.data);
      last = event.tick;
    });
    body = body.concat([0x00, 0xff, 0x2f, 0x00]);
    var length = body.length;
    return [0x4d, 0x54, 0x72, 0x6b,
      (length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255].concat(body);
  }

  function header(trackCount, ppq) {
    return [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
      (trackCount >> 8) & 255, trackCount & 255, (ppq >> 8) & 255, ppq & 255];
  }

  function metaTrack(bpm, signature) {
    var microseconds = Math.round(60000000 / Math.max(1, bpm));
    var numerator = signature && signature.numerator || 4;
    var denominator = signature && signature.denominator || 4;
    var power = Math.max(0, Math.round(Math.log(denominator) / Math.log(2)));
    return trackChunk([
      { tick:0, data:[0xff, 0x51, 0x03, (microseconds >> 16) & 255, (microseconds >> 8) & 255, microseconds & 255] },
      { tick:0, data:[0xff, 0x58, 0x04, numerator & 255, power & 255, 24, 8] }
    ]);
  }

  function noteEvents(channel, notes, program, bank, name) {
    var events = [], safeChannel = Math.max(0, Math.min(15, channel | 0));
    if (name) {
      var encoded = textBytes(String(name).slice(0, 80));
      events.push({ tick:0, order:-4, data:[0xff, 0x03].concat(vlq(encoded.length), encoded) });
    }
    if (bank) {
      events.push({ tick:0, order:-3, data:[0xb0 | safeChannel, 0, Math.floor(bank / 128) & 0x7f] });
      events.push({ tick:0, order:-2, data:[0xb0 | safeChannel, 32, bank & 0x7f] });
    }
    if (safeChannel !== 9 && program !== null && program !== undefined) {
      events.push({ tick:0, order:-1, data:[0xc0 | safeChannel, Math.max(0, Math.min(127, program | 0))] });
    }
    notes.forEach(function (note) {
      var velocity = note.v === undefined ? 96 : Math.max(1, Math.min(127, Math.round(note.v)));
      var start = Math.max(0, Math.round(note.s * 120));
      var end = Math.max(start + 1, Math.round((note.s + note.d) * 120));
      if (note.text) {
        var lyric = textBytes(String(note.text));
        events.push({ tick:start, order:-1, data:[0xff, 0x05].concat(vlq(lyric.length), lyric) });
      }
      events.push({ tick:start, order:1, data:[0x90 | safeChannel, Math.max(0, Math.min(127, note.n | 0)), velocity] });
      events.push({ tick:end, order:0, data:[0x80 | safeChannel, Math.max(0, Math.min(127, note.n | 0)), 0] });
    });
    return events;
  }

  function buildImported(song, bpm, options) {
    var opts = options || {}, enabled = opts.enabled || {};
    var tracks = (song.importedTracks || []).filter(function (track) {
      if (track.enabled === false || !track.notes || !track.notes.length) return false;
      if (track.role === "melody" && enabled.melody === false) return false;
      if (track.role === "bass" && enabled.bass === false) return false;
      if (track.role === "drum" && enabled.drum === false) return false;
      if (track.role === "accompaniment" && enabled.pad === false) return false;
      return true;
    });
    var chunks = [header(tracks.length + 1, 480), metaTrack(bpm, song.importedMidiInfo && song.importedMidiInfo.timeSignature)];
    tracks.forEach(function (track) {
      var notes = track.id === song.melodyTrackId ? song.melody : track.notes;
      chunks.push(trackChunk(noteEvents(track.channel, notes, track.program, track.bank, track.name)));
    });
    return new Uint8Array([].concat.apply([], chunks));
  }

  function build(song, bpm, options) {
    if (song && song.importedMidi && Array.isArray(song.importedTracks)) return buildImported(song, bpm, options);
    var opts = options || {};
    var programs = opts.programs || { melody:0, bass:33, pad:89 };
    var enabled = opts.enabled || { melody:true, bass:true, pad:true, drum:true };
    var events = [];
    function append(channel, notes, program) {
      events = events.concat(noteEvents(channel, notes || [], program, 0, ""));
    }
    if (enabled.melody !== false) append(0, song.melody, programs.melody === undefined ? 0 : programs.melody);
    if (enabled.bass !== false) append(1, song.bass, programs.bass === undefined ? 33 : programs.bass);
    var padNotes = [];
    (song.pad || []).forEach(function (part) {
      part.chord.forEach(function (pitch) { padNotes.push({ s:part.s, d:part.d, n:pitch, v:part.v }); });
    });
    if (enabled.pad !== false) append(2, padNotes, programs.pad === undefined ? 89 : programs.pad);
    var extraChannel = 3;
    (song.extraTracks || []).forEach(function (track) {
      while (extraChannel === 9) extraChannel++;
      if (extraChannel > 15 || track.enabled === false) return;
      append(extraChannel++, track.notes || [], Number.isFinite(track.program) ? track.program : 0);
    });
    var drumPitch = { kick:36, snare:38, hat:42, crash:49 }, drumNotes = [];
    if (enabled.drum !== false) {
      (song.drum || []).forEach(function (hit) {
        if (drumPitch[hit.kind] === undefined) return;
        drumNotes.push({ s:hit.s, d:1, n:drumPitch[hit.kind], v:hit.v });
      });
      append(9, drumNotes, null);
    }
    return new Uint8Array(header(2, 480).concat(metaTrack(bpm, null), trackChunk(events)));
  }

  root.smf = { parse:parse, toSong:toSong, build:build, assignLyrics:assignLyrics, vlq:vlq };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
