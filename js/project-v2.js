/* project-v2.js — ZEN版とローカル版が共有する、曲の損失なし保存形式。 */
(function (root) {
  "use strict";

  var FORMAT = "ai-score-project";
  var VERSION = 2;
  var LEGACY_UTA_FORMAT = "uta-genkou-studio";
  var LEGACY_AI_FORMAT = "ai-score-studio-project";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function finite(value) { return Number.isFinite(+value); }

  function text(value, maximum, fallback) {
    var result = String(value === undefined || value === null ? (fallback || "") : value);
    if (result.length > maximum) throw new Error("プロジェクト内の文字情報が長すぎます");
    return result;
  }

  function safeBpm(value) {
    if (!finite(value)) return 80;
    return Math.max(30, Math.min(300, Math.round(+value)));
  }

  function timeSignature(value) {
    var numerator = 4, denominator = 4;
    if (Array.isArray(value)) {
      numerator = +value[0]; denominator = +value[1];
    } else if (value && typeof value === "object") {
      numerator = +value.numerator; denominator = +value.denominator;
    }
    if (!finite(numerator) || numerator < 1 || numerator > 32) numerator = 4;
    if (!finite(denominator) || [1,2,4,8,16,32].indexOf(denominator) < 0) denominator = 4;
    return { numerator:Math.round(numerator), denominator:Math.round(denominator) };
  }

  function key(value) {
    var input = value && typeof value === "object" ? value : {};
    var rootValue = finite(input.root) ? Math.max(0, Math.min(11, Math.round(+input.root))) : 0;
    return { root:rootValue, mode:String(input.mode || "major") === "minor" ? "minor" : "major" };
  }

  function validNote(note) {
    return note && finite(note.s) && finite(note.d) && finite(note.n) &&
      +note.s >= 0 && +note.s <= 1000000 && +note.d > 0 && +note.d <= 100000 &&
      +note.n >= 0 && +note.n <= 127;
  }

  function validateSong(song) {
    if (!song || typeof song !== "object" || !Array.isArray(song.melody) || !song.melody.every(validNote)) {
      throw new Error("Project v2のメロディ情報が正しくありません");
    }
    return song;
  }

  function withoutSong(state) {
    var result = clone(state || {});
    if (result && typeof result === "object") delete result.song;
    return result;
  }

  function inferredSignature(song, explicit) {
    if (explicit) return timeSignature(explicit);
    if (song && song.importedMidiInfo && song.importedMidiInfo.timeSignature) {
      return timeSignature(song.importedMidiInfo.timeSignature);
    }
    return timeSignature(null);
  }

  function create(input) {
    var source = input && typeof input === "object" ? input : {};
    var song = clone(validateSong(source.song));
    var signature = inferredSignature(song, source.timeSignature);
    var songKey = key(source.key || song.key);
    var sections = clone(source.sections || song.sections ||
      (source.blueprint && source.blueprint.sections) || []);
    var performancePlan = clone(source.performance || song.performancePlan || null);
    var takes = Array.isArray(source.takes) && source.takes.length ? clone(source.takes) : [{
      id:"main", name:"メイン", kind:"compiled", selected:true
    }];
    return validate({
      format:FORMAT,
      version:VERSION,
      origin:text(source.origin, 80, "unknown"),
      title:text(source.title, 200, "まだ名前のない曲"),
      lyrics:text(source.lyrics, 100000, ""),
      transport:{ bpm:safeBpm(source.bpm), timeSignature:signature, key:songKey },
      timebase:{ unit:"step", stepsPerQuarter:4, recommendedPpq:960 },
      composition:{ sections:sections, chords:clone(song.chords || []) },
      performance:{ activeTakeId:text(source.activeTakeId, 80, "main"), takes:takes, plan:performancePlan },
      rendering:clone(source.rendering || {}),
      song:song,
      extensions:clone(source.extensions || {})
    });
  }

  function validate(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("Project v2の中身がありません");
    }
    if (document.format !== FORMAT || +document.version !== VERSION) {
      throw new Error("対応していないProject形式です");
    }
    validateSong(document.song);
    document.title = text(document.title, 200, "まだ名前のない曲");
    document.lyrics = text(document.lyrics, 100000, "");
    document.origin = text(document.origin, 80, "unknown");
    document.transport = document.transport && typeof document.transport === "object" ? document.transport : {};
    document.transport.bpm = safeBpm(document.transport.bpm);
    document.transport.timeSignature = timeSignature(document.transport.timeSignature);
    document.transport.key = key(document.transport.key || document.song.key);
    document.timebase = document.timebase && typeof document.timebase === "object" ? document.timebase : {};
    document.timebase.unit = "step";
    document.timebase.stepsPerQuarter = 4;
    document.timebase.recommendedPpq = 960;
    document.composition = document.composition && typeof document.composition === "object" ? document.composition : {};
    if (!Array.isArray(document.composition.sections)) document.composition.sections = [];
    if (!Array.isArray(document.composition.chords)) document.composition.chords = clone(document.song.chords || []);
    document.performance = document.performance && typeof document.performance === "object" ? document.performance : {};
    if (!Array.isArray(document.performance.takes) || !document.performance.takes.length) {
      document.performance.takes = [{ id:"main", name:"メイン", kind:"compiled", selected:true }];
    }
    document.performance.activeTakeId = text(document.performance.activeTakeId, 80, "main");
    document.rendering = document.rendering && typeof document.rendering === "object" ? document.rendering : {};
    document.extensions = document.extensions && typeof document.extensions === "object" ? document.extensions : {};
    return document;
  }

  function migrateLegacy(data) {
    if (data && data.format === LEGACY_UTA_FORMAT && +data.version === 1 && data.state) {
      return create({
        origin:"uta-genkou-studio",
        title:data.state.title,
        lyrics:data.state.lyrics,
        bpm:data.state.bpm,
        song:data.state.song,
        rendering:{ partMix:clone(data.state.partMix || null) },
        extensions:{ utaGenkou:withoutSong(data.state), migratedFrom:LEGACY_UTA_FORMAT + "/1" }
      });
    }
    if (data && data.format === LEGACY_AI_FORMAT && +data.version === 1 && data.song) {
      return create({
        origin:"ai-score-studio",
        title:data.title,
        lyrics:data.lyrics || (data.song.importedMidiInfo && data.song.importedMidiInfo.lyricText) || "",
        bpm:data.bpm,
        song:data.song,
        extensions:{ migratedFrom:LEGACY_AI_FORMAT + "/1" }
      });
    }
    return null;
  }

  function decodeObject(data) {
    if (data && data.format === FORMAT && +data.version === VERSION) return validate(clone(data));
    var migrated = migrateLegacy(data);
    if (migrated) return migrated;
    throw new Error("Project v2ではありません");
  }

  function decode(source) {
    var data = source;
    if (typeof source === "string") {
      try { data = JSON.parse(source); }
      catch (error) { throw new Error("JSONファイルを読めませんでした"); }
    }
    return decodeObject(data);
  }

  function tryDecode(source) {
    try {
      var data = typeof source === "string" ? JSON.parse(source) : source;
      if (!data || [FORMAT, LEGACY_UTA_FORMAT, LEGACY_AI_FORMAT].indexOf(data.format) < 0) return null;
      return decodeObject(data);
    } catch (error) {
      if (error && error.message === "Project v2ではありません") return null;
      throw error;
    }
  }

  function encode(input) {
    var document = input && input.format === FORMAT ? validate(clone(input)) : create(input);
    return JSON.stringify(document, null, 2);
  }

  root.projectV2 = {
    FORMAT:FORMAT,
    VERSION:VERSION,
    create:create,
    validate:validate,
    encode:encode,
    decode:decode,
    tryDecode:tryDecode
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
