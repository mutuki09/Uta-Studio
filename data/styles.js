/* styles.js — 感情（Mood）と音楽語法（Style）を薄く分離する。 */
(function (root) {
  "use strict";

  var STYLES = [
    {
      id:"auto", name:"おまかせ", note:"選んだ雰囲気のリズムとコードを使う",
      overrides:{}
    },
    {
      id:"jpop-rock", name:"J-POP / Rock（おすすめ）", note:"バンド感と、段階的に上がるコード進行",
      overrides:{ progression:"jpop_lift", rhythm:"rock" }
    },
    {
      id:"electronic-pop", name:"Electronic Pop", note:"細かいビートで前へ進む電子ポップ",
      overrides:{ progression:"edm_loop", rhythm:"sixteen" }
    },
    {
      id:"funk-dance", name:"Funk / Dance", note:"裏拍と動くベースを使うダンス寄り",
      overrides:{ progression:"edm_drop", rhythm:"funk" }
    }
  ];

  function byId(id) {
    return STYLES.filter(function (style) { return style.id === id; })[0] || STYLES[0];
  }

  function value(style, key, mood) {
    var selected = style || STYLES[0];
    if (selected.overrides && selected.overrides[key] !== undefined) return selected.overrides[key];
    return mood[key];
  }

  root.styles = { STYLES:STYLES, byId:byId, value:value };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
