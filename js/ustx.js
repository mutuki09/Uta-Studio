/* ustx.js — AI譜面スタジオの歌メロディをOpenUtau USTX 0.6へ書き出す。 */
(function (root) {
  "use strict";

  var PPQ = 480;
  var STEPS_PER_QUARTER = 4;
  var TICKS_PER_STEP = PPQ / STEPS_PER_QUARTER;
  var PHONEMIZER = "OpenUtau.Plugin.Builtin.JapaneseVCVPhonemizer";

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function finite(value) { return Number.isFinite(+value); }

  function quote(value) {
    return JSON.stringify(String(value === undefined || value === null ? "" : value));
  }

  function tick(value) { return Math.max(0, Math.round(+value * TICKS_PER_STEP)); }

  function signature(song, options) {
    var value = options && options.timeSignature;
    if (!value && song && song.importedMidiInfo) value = song.importedMidiInfo.timeSignature;
    if (!value && song) value = song.timeSignature;
    var numerator = Array.isArray(value) ? +value[0] : +(value && (value.numerator || value.beatPerBar));
    var denominator = Array.isArray(value) ? +value[1] : +(value && (value.denominator || value.beatUnit));
    if (!finite(numerator) || numerator < 1 || numerator > 32) numerator = 4;
    if ([1, 2, 4, 8, 16, 32].indexOf(denominator) < 0) denominator = 4;
    return { numerator:Math.round(numerator), denominator:Math.round(denominator) };
  }

  function validate(song, bpm) {
    if (!song || !Array.isArray(song.melody) || !song.melody.length) {
      throw new Error("先に歌メロディを作ってください");
    }
    if (!finite(bpm) || +bpm < 20 || +bpm > 400) throw new Error("BPMが正しくありません");
    var notes = song.melody.slice().sort(function (a, b) { return +a.s - +b.s || +a.n - +b.n; });
    var previousEnd = 0;
    notes.forEach(function (note) {
      if (!finite(note.s) || !finite(note.d) || !finite(note.n) || +note.s < 0 || +note.d <= 0 || +note.n < 0 || +note.n > 127) {
        throw new Error("OpenUtauへ渡せない音符があります");
      }
      if (+note.s < previousEnd - 0.0001) throw new Error("歌メロディに重なった音符があります。重なりを直してから保存してください");
      previousEnd = +note.s + +note.d;
    });
    return notes;
  }

  function lyric(note, previous) {
    var value = String(note.text || note.lyric || "").trim();
    var contiguous = previous && Math.abs((+previous.s + +previous.d) - +note.s) < 0.0001;
    if (note.lyricExtend || (!value && contiguous)) return "+";
    return value || "あ";
  }

  function dynamicValue(note) {
    var velocity = finite(note.v) ? +note.v : 96;
    return Math.round(clamp((velocity - 96) * 2, -80, 60));
  }

  function expressionLines() {
    var descriptors = [
      ["dyn", "dynamics (curve)", "Curve", -240, 120, 0, false, ""],
      ["pitd", "pitch deviation (curve)", "Curve", -1200, 1200, 0, false, ""],
      ["clr", "voice color", "Options", 0, -1, 0, false, null],
      ["eng", "resampler engine", "Options", 0, 1, 0, false, null],
      ["vel", "velocity", "Numerical", 0, 200, 100, false, ""],
      ["vol", "volume", "Numerical", 0, 200, 100, false, ""],
      ["atk", "attack", "Numerical", 0, 200, 100, false, ""],
      ["dec", "decay", "Numerical", 0, 100, 0, false, ""],
      ["gen", "gender", "Numerical", -100, 100, 0, true, "g"],
      ["bre", "breath", "Numerical", 0, 100, 0, true, "B"]
    ];
    var lines = ["expressions:"];
    descriptors.forEach(function (item) {
      lines.push("  " + item[0] + ":");
      lines.push("    name: " + quote(item[1]));
      lines.push("    abbr: " + item[0]);
      lines.push("    type: " + item[2]);
      lines.push("    min: " + item[3]);
      lines.push("    max: " + item[4]);
      lines.push("    default_value: " + item[5]);
      lines.push("    is_flag: " + (item[6] ? "true" : "false"));
      if (item[0] === "clr") lines.push("    options: []");
      else if (item[0] === "eng") { lines.push("    options:"); lines.push("    - \"\""); lines.push("    - worldline"); }
      else lines.push("    flag: " + quote(item[7]));
    });
    lines.push("exp_selectors:");
    ["dyn", "pitd", "clr", "eng", "vel", "vol", "atk", "dec", "gen", "bre"].forEach(function (abbr) { lines.push("- " + abbr); });
    lines.push("exp_primary: 0");
    lines.push("exp_secondary: 1");
    return lines;
  }

  function curve(notes, endTick) {
    var points = [], seen = {};
    notes.forEach(function (note) {
      var x = tick(note.s);
      if (seen[x]) points[seen[x] - 1].y = dynamicValue(note);
      else { points.push({ x:x, y:dynamicValue(note) }); seen[x] = points.length; }
    });
    if (!points.length || points[0].x !== 0) points.unshift({ x:0, y:points.length ? points[0].y : 0 });
    points.push({ x:endTick, y:points[points.length - 1].y });
    return points;
  }

  function build(song, bpm, title, options) {
    var notes = validate(song, bpm), sig = signature(song, options || {});
    var lastEnd = notes.reduce(function (maximum, note) { return Math.max(maximum, tick(+note.s + +note.d)); }, 0);
    var barTicks = Math.round(PPQ * 4 / sig.denominator * sig.numerator);
    var partDuration = Math.max(barTicks, Math.ceil(lastEnd / barTicks) * barTicks);
    var key = song && song.key && finite(song.key.root) ? clamp(Math.round(+song.key.root), 0, 11) : 0;
    var lines = [
      "name: " + quote(title || "AI譜面スタジオ"),
      "comment: " + quote("AI譜面スタジオから書き出し"),
      "output_dir: Vocal",
      "cache_dir: UCache",
      "ustx_version: \"0.6\"",
      "resolution: " + PPQ,
      "bpm: 120",
      "beat_per_bar: 4",
      "beat_unit: 4"
    ];
    lines = lines.concat(expressionLines());
    lines.push("key: " + key);
    lines.push("time_signatures:");
    lines.push("- bar_position: 0");
    lines.push("  beat_per_bar: " + sig.numerator);
    lines.push("  beat_unit: " + sig.denominator);
    lines.push("tempos:");
    lines.push("- position: 0");
    lines.push("  bpm: " + (+bpm));
    lines.push("tracks:");
    lines.push("- phonemizer: " + PHONEMIZER);
    lines.push("  renderer_settings: {}");
    lines.push("  track_name: Vocal");
    lines.push("  track_color: Blue");
    lines.push("  mute: false");
    lines.push("  solo: false");
    lines.push("  volume: 0");
    lines.push("  pan: 0");
    lines.push("  track_expressions: []");
    lines.push("  voice_color_names:");
    lines.push("  - \"\"");
    lines.push("voice_parts:");
    lines.push("- duration: " + partDuration);
    lines.push("  name: Vocal");
    lines.push("  comment: \"\"");
    lines.push("  track_no: 0");
    lines.push("  position: 0");
    lines.push("  notes:");
    notes.forEach(function (note, index) {
      var duration = Math.max(10, tick(note.d));
      lines.push("  - position: " + tick(note.s));
      lines.push("    duration: " + duration);
      lines.push("    tone: " + Math.round(+note.n));
      lines.push("    lyric: " + quote(lyric(note, notes[index - 1])));
      lines.push("    pitch:");
      lines.push("      data:");
      lines.push("      - {x: -40, y: 0, shape: io}");
      lines.push("      - {x: 0, y: 0, shape: io}");
      lines.push("      snap_first: true");
      lines.push("    vibrato: {length: 0, period: 175, depth: 25, in: 10, out: 10, shift: 0, drift: 0, vol_link: 0}");
      lines.push("    phoneme_expressions: []");
      lines.push("    phoneme_overrides: []");
    });
    var dynamics = curve(notes, partDuration);
    lines.push("  curves:");
    lines.push("  - abbr: dyn");
    lines.push("    xs: [" + dynamics.map(function (point) { return point.x; }).join(", ") + "]");
    lines.push("    ys: [" + dynamics.map(function (point) { return point.y; }).join(", ") + "]");
    lines.push("wave_parts: []");
    return lines.join("\n") + "\n";
  }

  root.ustx = {
    PPQ:PPQ,
    TICKS_PER_STEP:TICKS_PER_STEP,
    PHONEMIZER:PHONEMIZER,
    build:build
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
