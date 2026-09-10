/* composition-core.js — 画面に依存しない、ZEN版とローカル版の共通作曲入口。 */
(function (root) {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function defaultRecipe() {
    return {
      key:{ root:0, mode:"major" }, chords:[], noteLen:2,
      density:0.55, stepwise:0.72, lo:60, hi:74, bars:4
    };
  }

  function buildCandidates(phrases, analysis, recipe, mood, seed, override) {
    if (!root.songSketch) throw new Error("作曲コアを読み込めませんでした");
    return root.songSketch.buildCandidates(phrases, analysis, recipe, mood, seed, override);
  }

  function createDraft(input) {
    var source = input && typeof input === "object" ? input : {};
    var title = String(source.title || "まだ名前のない曲").slice(0, 200);
    var lyrics = String(source.lyrics || "");
    if (!lyrics.trim()) throw new Error("歌詞を1行以上入れてください");
    var analysis = root.lyricsAnalyzer.analyze(lyrics, { title:title, mode:"standard" });
    var compositionText = analysis.lines.map(function (line) { return line.text; }).join("\n");
    var parsed = root.mora.parse(compositionText);
    if (!parsed.phrases.length) throw new Error("歌詞から歌える音を見つけられませんでした");

    var mood = clone(root.presets.byId(root.presets.MOODS, source.moodId || "shittori"));
    var style = root.styles.byId(source.styleId || "jpop-rock");
    var recipe = clone(source.recipe || defaultRecipe());
    if (source.key && typeof source.key === "object") recipe.key = clone(source.key);
    var override = clone(source.override || {});
    Object.keys(style.overrides || {}).forEach(function (name) {
      if (override[name] === undefined) override[name] = style.overrides[name];
    });
    if (Number.isFinite(+source.bpm)) mood.bpm = Math.max(60, Math.min(180, Math.round(+source.bpm)));
    var seed = Number.isFinite(+source.seed) ? (+source.seed >>> 0) : 20260810;
    var candidates = buildCandidates(parsed.phrases, analysis, recipe, mood, seed, override);
    return {
      title:title, lyrics:lyrics, bpm:mood.bpm, seed:seed,
      moodId:mood.id, styleId:style.id, recipe:recipe, override:override,
      analysis:analysis, unknown:parsed.unknown || [], candidates:candidates
    };
  }

  root.compositionCore = {
    defaultRecipe:defaultRecipe,
    buildCandidates:buildCandidates,
    createDraft:createDraft
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
