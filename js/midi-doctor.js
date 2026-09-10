/* midi-doctor.js — 読み込んだメロディを健康診断し、歌える形へ直す。
   外部のAIに作らせたMIDIは、調を外していたり音符が重なっていたりする。
   ここで測って直しておかないと、NEUTRINOへ渡す譜面が作れない。 */
(function (root) {
  "use strict";

  var STEPS_PER_BEAT = 4;              /* 1ステップ＝16分音符 */
  var STEPS_PER_BAR = 16;

  /* しきい値。ここを超えたら「直したほうがいい」と伝える */
  var LIMIT = {
    offScale: 0.05,                    /* 調から外れた音の割合 */
    chordTone: 0.55,                   /* 小節頭のコードトーン率 */
    leap: 7,                           /* 隣り合う音の跳躍（半音） */
    shortSteps: 2,                     /* これ未満の音は短すぎる（8分未満） */
    density: 0.80,                     /* 歌いっぱなしの上限 */
    longRatio: 0.05                    /* 2拍以上の音がこれ未満だと着地が無い */
  };

  function sortedMelody(song) {
    return (song && song.melody ? song.melody.slice() : []).sort(function (a, b) {
      return a.s - b.s || a.n - b.n;
    });
  }

  /* 読み込んだMIDIの song.key は smf.toSong が置く固定値（ハ長調）なので信用できない。
     ツールが自分で作った曲（chords を持つ）のときだけ song.key を使い、
     それ以外は実際に鳴っている音から調を推定する。 */
  function keyOf(song, melody) {
    if (song && song.key && Number.isFinite(song.key.root) &&
        song.chords && song.chords.length && !song.importedMidi) {
      return song.key;
    }
    var weights = [];
    for (var i = 0; i < 12; i++) weights.push(0);
    melody.forEach(function (note) { weights[((note.n % 12) + 12) % 12] += note.d || 1; });
    /* 伴奏も調を決める手がかりになる。メロディだけだと転調風の揺れに引きずられる。 */
    (song.importedTracks || []).forEach(function (track) {
      if (track.role === "drum" || track.isDrum || track.id === song.melodyTrackId) return;
      (track.notes || []).forEach(function (note) {
        weights[((note.n % 12) + 12) % 12] += (note.d || 1) * 0.5;
      });
    });
    return root.theory.detectKey(weights);
  }

  /* 伴奏トラックから、その時刻に鳴っている音の集合を作る。
     外部MIDIにはコード情報が無いので、実際に鳴っている音から判断する。 */
  function harmonyLookup(song) {
    var spans = [];
    (song.importedTracks || []).forEach(function (track) {
      if (track.role === "melody" || track.role === "drum" || track.isDrum) return;
      (track.notes || []).forEach(function (note) {
        spans.push({ s:note.s, e:note.s + note.d, pc:((note.n % 12) + 12) % 12 });
      });
    });
    (song.pad || []).forEach(function (part) {
      (part.chord || []).forEach(function (pitch) {
        spans.push({ s:part.s, e:part.s + part.d, pc:((pitch % 12) + 12) % 12 });
      });
    });
    (song.bass || []).forEach(function (note) {
      spans.push({ s:note.s, e:note.s + note.d, pc:((note.n % 12) + 12) % 12 });
    });
    spans.sort(function (a, b) { return a.s - b.s; });
    return function (step) {
      var found = [];
      for (var i = 0; i < spans.length; i++) {
        if (spans[i].s > step) break;
        if (spans[i].e > step && found.indexOf(spans[i].pc) < 0) found.push(spans[i].pc);
      }
      return found;
    };
  }

  function diagnose(song, bpm) {
    var melody = sortedMelody(song);
    var report = {
      ok:true, notes:melody.length, issues:[], key:null, keyLabel:"",
      metrics:{}, repairable:false
    };
    if (!melody.length) {
      report.ok = false;
      report.issues.push({ id:"empty", level:"error", text:"歌のパートが見つかりません" });
      return report;
    }

    var key = keyOf(song, melody);
    report.key = key;
    report.keyLabel = root.theory.keyLabel(key);
    var tempo = Number(bpm) > 0 ? Number(bpm) : 104;
    var stepSeconds = 60 / tempo / STEPS_PER_BEAT;

    /* --- 音符の重なり。単旋律でないとNEUTRINOへ渡せない --- */
    var overlaps = 0, cursor = -1;
    melody.forEach(function (note) {
      if (note.s < cursor) overlaps++;
      cursor = Math.max(cursor, note.s + note.d);
    });

    /* --- 調から外れた音 --- */
    var offScale = melody.filter(function (note) { return !root.theory.inScale(note.n, key); });

    /* --- 小節頭のコードトーン率 --- */
    var harmony = harmonyLookup(song), downbeats = 0, chordTones = 0;
    melody.forEach(function (note) {
      if (note.s % STEPS_PER_BAR !== 0) return;
      var pcs = harmony(note.s);
      if (!pcs.length) return;
      downbeats++;
      if (pcs.indexOf(((note.n % 12) + 12) % 12) >= 0) chordTones++;
    });

    /* --- 長さ・休符・密度 --- */
    var longNotes = melody.filter(function (note) { return note.d >= 2 * STEPS_PER_BEAT; });
    var shortNotes = melody.filter(function (note) { return note.d < LIMIT.shortSteps; });
    var breaths = 0, sung = 0, leaps = 0, maxLeap = 0;
    melody.forEach(function (note, index) {
      sung += note.d;
      if (index) {
        var gap = note.s - (melody[index - 1].s + melody[index - 1].d);
        if (gap >= STEPS_PER_BEAT) breaths++;
        var jump = Math.abs(note.n - melody[index - 1].n);
        if (jump > maxLeap) maxLeap = jump;
        if (jump > LIMIT.leap) leaps++;
      }
    });
    var span = (melody[melody.length - 1].s + melody[melody.length - 1].d) - melody[0].s;
    var lines = {};
    melody.forEach(function (note) { lines[note.line === undefined ? 0 : note.line] = true; });

    report.metrics = {
      overlaps:overlaps,
      offScale:offScale.length, offScaleRatio:offScale.length / melody.length,
      downbeats:downbeats, chordTones:chordTones,
      chordToneRatio:downbeats ? chordTones / downbeats : null,
      longNotes:longNotes.length, longRatio:longNotes.length / melody.length,
      shortNotes:shortNotes.length, shortestSeconds:Math.min.apply(null,
        melody.map(function (note) { return note.d * stepSeconds; })),
      breaths:breaths, phrases:Object.keys(lines).length,
      density:span > 0 ? sung / span : 1,
      maxLeap:maxLeap, bigLeaps:leaps
    };

    var m = report.metrics;
    function add(id, level, text, fixable) {
      report.issues.push({ id:id, level:level, text:text, fixable:!!fixable });
      if (level === "error") report.ok = false;
      if (fixable) report.repairable = true;
    }

    if (m.overlaps) {
      add("overlap", "error",
        "音符が" + m.overlaps + "箇所で重なっています。歌は一度にひとつの音しか出せないため、このままでは歌声を作れません。",
        true);
    }
    if (m.offScaleRatio > LIMIT.offScale) {
      add("offscale", "error",
        "音の" + Math.round(m.offScaleRatio * 100) + "%（" + m.offScale + "音）が" +
        report.keyLabel + "から外れています。音痴に聞こえます。", true);
    }
    if (m.maxLeap > LIMIT.leap) {
      add("leap", "warn",
        "最大" + m.maxLeap + "半音の跳躍があります（" + m.bigLeaps + "箇所）。人の声で跳ぶには広すぎます。", true);
    }
    if (m.shortNotes) {
      add("short", "warn",
        m.shortNotes + "個の音が" + Math.round(m.shortestSeconds * 1000) +
        "ミリ秒しかありません。日本語の1音を発音しきれず、つぶれて聞こえます。", true);
    }
    if (m.longRatio < LIMIT.longRatio) {
      add("nolong", "warn",
        "2拍以上のばす音がほとんどありません（" + m.longNotes + "個）。フレーズが着地せず、歌に聞こえにくくなります。", false);
    }
    if (m.density > LIMIT.density) {
      add("density", "warn",
        "歌っている時間が" + Math.round(m.density * 100) + "%です。息継ぎがなく、聴いていて苦しくなります。", false);
    }
    if (m.chordToneRatio !== null && m.chordToneRatio < LIMIT.chordTone) {
      add("chordtone", "warn",
        "小節の頭がコードに乗っている割合が" + Math.round(m.chordToneRatio * 100) +
        "%です。伴奏とメロディが噛み合わず、ずれて聞こえます。", false);
    }
    return report;
  }

  /* 診断で「直せる」とした項目を実際に直す。
     リズムと歌詞は動かさない。音の高さと、はみ出した長さだけを整える。 */
  function repair(song, options) {
    var opts = options || {};
    var melody = sortedMelody(song);
    if (!melody.length) return { changed:0, log:[] };
    var key = keyOf(song, melody);
    var log = [], changed = 0;

    /* 1) 単旋律にする。開始を後ろへ送り、次の音にかかる長さを切り詰める */
    if (opts.overlap !== false) {
      var moved = 0, trimmed = 0, cursor = 0;
      melody.forEach(function (note) {
        if (note.s < cursor) { note.s = cursor; moved++; }
        if (note.d < 1) note.d = 1;
        cursor = note.s + 1;
      });
      melody.forEach(function (note, index) {
        var next = melody[index + 1];
        if (next && note.s + note.d > next.s) { note.d = next.s - note.s; trimmed++; }
      });
      if (moved || trimmed) {
        changed += moved + trimmed;
        log.push("重なりを解消しました（" + moved + "音をずらし、" + trimmed + "音を短くしました）");
      }
    }

    /* 2) 調の外の音を、いちばん近い音階の音へ寄せる */
    if (opts.offScale !== false) {
      var snapped = 0;
      melody.forEach(function (note) {
        var fixed = root.theory.snapToScale(note.n, key);
        if (fixed !== note.n) { note.n = fixed; snapped++; }
      });
      if (snapped) {
        changed += snapped;
        log.push(snapped + "音を" + root.theory.keyLabel(key) + "の音へ直しました");
      }
    }

    /* 3) 広すぎる跳躍を、オクターブ単位で近づけて抑える */
    if (opts.leap !== false) {
      /* 広すぎる音だけを、前の音から LIMIT.leap 以内へ引き寄せる。
         オクターブ単位で動かすと、そこから先の音が全部つられて動いてしまう。 */
      var capped = 0;
      for (var i = 1; i < melody.length; i++) {
        var gap = melody[i].n - melody[i - 1].n;
        if (Math.abs(gap) <= LIMIT.leap) continue;
        var target = melody[i - 1].n + (gap > 0 ? LIMIT.leap : -LIMIT.leap);
        melody[i].n = root.theory.snapToScale(Math.max(48, Math.min(84, target)), key);
        capped++;
      }
      if (capped) {
        changed += capped;
        log.push(capped + "音の跳躍を" + LIMIT.leap + "半音以内に収めました");
      }
    }

    /* 4) 短すぎる音を、後ろに余裕があるぶんだけ伸ばす。
          伸ばせないものは、リズムを崩さないためそのまま残す。 */
    if (opts.shortNote !== false) {
      var lengthened = 0;
      melody.forEach(function (note, index) {
        if (note.d >= LIMIT.shortSteps) return;
        var next = melody[index + 1];
        var room = next ? next.s - note.s : LIMIT.shortSteps;
        var want = Math.min(LIMIT.shortSteps, room);
        if (want > note.d) { note.d = want; lengthened++; }
      });
      if (lengthened) {
        changed += lengthened;
        log.push(lengthened + "個の短い音を、すき間のぶんだけ伸ばしました");
      }
    }

    song.melody = melody;
    /* 外部MIDIでは、歌のトラックの実体も同じ配列を指している場合がある */
    (song.importedTracks || []).forEach(function (track) {
      if (track.id && track.id === song.melodyTrackId) track.notes = melody;
    });
    return { changed:changed, log:log, key:key };
  }

  root.midiDoctor = { diagnose:diagnose, repair:repair, LIMIT:LIMIT };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
