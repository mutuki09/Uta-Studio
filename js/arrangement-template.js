/* arrangement-template.js — 生成済みの曲へ、再利用できる楽器編成を重ねる。 */
(function (root) {
  "use strict";

  var TEMPLATES = [
    { id:"free", name:"自由設定", note:"雰囲気とこだわり設定をそのまま使います" },
    { id:"run_pop_eb", name:"疾走ポップ（E♭・ピアノ＋2ギター）",
      note:"添付メモのコードと編成を抽象化。原曲メロディは使用しません。",
      key:{ root:3, mode:"major" }, progression:"provided_run_pop_eb", rhythm:"rock", bpm:110,
      ensemble:"band", melody:"piano", chord:"piano", bass:"eguitar", drum:"acoustic" }
  ];

  function byId(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return TEMPLATES[0];
  }

  function voiced(theory, chord, low) {
    return theory.chordVoicing(chord, low).slice(0, 4).map(function (value) {
      return Math.max(0, Math.min(127, Math.round(value)));
    });
  }

  function addChordNotes(target, pitches, start, duration, velocity, direction) {
    var ordered = pitches.slice();
    if (direction < 0) ordered.reverse();
    ordered.forEach(function (pitch, index) {
      target.push({ s:start + index * 0.16, d:Math.max(0.5, duration - index * 0.16), n:pitch, v:velocity - index * 2 });
    });
  }

  function buildRunPopTracks(song, theory) {
    var acoustic = [], electric = [], bars = Math.max(1, song.bars || Math.ceil(song.totalSteps / 16));
    for (var bar = 0; bar < bars; bar++) {
      var chord = song.chords[bar % song.chords.length];
      var start = bar * 16;
      var guitarVoicing = voiced(theory, chord, 52);
      addChordNotes(acoustic, guitarVoicing, start, 3.3, bar % 4 === 0 ? 94 : 84, 1);
      addChordNotes(acoustic, guitarVoicing, start + 8, 2.7, 78, -1);
      var upper = voiced(theory, chord, 64);
      [6, 14].forEach(function (offset, index) {
        electric.push({ s:start + offset, d:1.35, n:upper[(bar + index) % upper.length], v:index ? 82 : 88 });
        if (bar % 4 === 3 && offset === 14) {
          electric.push({ s:start + 15, d:0.8, n:upper[(bar + index + 1) % upper.length], v:94 });
        }
      });
    }
    return [
      { id:"acoustic-guitar", name:"Acoustic Guitar", role:"rhythm-guitar", timbreId:"aguitar", program:25, notes:acoustic },
      { id:"electric-guitar", name:"Electric Guitar", role:"electric-guitar", timbreId:"eguitar", program:29, notes:electric }
    ];
  }

  function applySlashBass(song) {
    if (!song.chords || song.chords.length < 10) return;
    song.chords.forEach(function (chord) { chord.preferFlats = true; });
    song.chords[9].bass = 10; /* Eb/Bb */
    (song.bass || []).forEach(function (note) {
      var bar = Math.floor(note.s / 16);
      if (bar % song.chords.length === 9) note.n = 46; /* Bb2 */
    });
  }

  function apply(song, templateId, theory) {
    if (!song) return song;
    var template = byId(templateId);
    if (template.id === "free") {
      delete song.extraTracks;
      delete song.arrangementTemplateId;
      return song;
    }
    applySlashBass(song);
    song.extraTracks = buildRunPopTracks(song, theory);
    song.arrangementTemplateId = template.id;
    return song;
  }

  root.arrangementTemplate = { TEMPLATES:TEMPLATES, byId:byId, apply:apply };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
