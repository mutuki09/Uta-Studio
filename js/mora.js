/* mora.js — 日本語の歌詞を「1 音ぶん」の単位に分ける。
   ルール:
     ・かな 1 文字 = 1 音
     ・小書きのかな（ゃゅょ 等）は前の文字とくっついて 1 音
     ・「ー」は前の音をのばす
     ・「っ」は前の音のあとに休みを入れる
     ・空白・読点は区切り、改行は行の区切り
     ・漢字(かんじ) と書けば、括弧の中を読みとして使う
     ・表にある漢字は自動で読む。読めない漢字は unknown 印をつけて返す */
(function (root) {
  "use strict";

  var SMALL = "ゃゅょぁぃぅぇぉャュョァィゥェォゎヮヵヶ";
  var LONG = "ー〜～－ｰ";
  var SOKUON = "っッ";
  var BREAKS = "、,。.　 ・！!？?";

  /* 歌詞によく出る漢字だけの読み表。全部の漢字は載せない（載せる必要もない）。
     読めないものはルビで補ってもらう。 */
  var KANJI = {
    "空":"そら","夜":"よる","朝":"あさ","昼":"ひる","星":"ほし","月":"つき","日":"ひ","陽":"ひ",
    "光":"ひかり","影":"かげ","雨":"あめ","雪":"ゆき","風":"かぜ","雲":"くも","海":"うみ","山":"やま",
    "川":"かわ","花":"はな","木":"き","森":"もり","道":"みち","町":"まち","街":"まち","駅":"えき",
    "夏":"なつ","秋":"あき","冬":"ふゆ","春":"はる","今":"いま","明日":"あした","昨日":"きのう",
    "君":"きみ","僕":"ぼく","私":"わたし","俺":"おれ","君達":"きみたち","人":"ひと","心":"こころ",
    "声":"こえ","顔":"かお","目":"め","手":"て","指":"ゆび","胸":"むね","涙":"なみだ","夢":"ゆめ",
    "愛":"あい","恋":"こい","歌":"うた","音":"おと","色":"いろ","言葉":"ことば","名前":"なまえ",
    "時":"とき","時間":"じかん","季節":"きせつ","世界":"せかい","未来":"みらい","過去":"かこ",
    "季":"き","記憶":"きおく","約束":"やくそく","景色":"けしき","願":"ねが","想":"おも","思":"おも",
    "僕等":"ぼくら","僕ら":"ぼくら","私達":"わたしたち",
    "行":"い","来":"く","見":"み","聞":"き","知":"し","歩":"ある","走":"はし","飛":"と",
    "笑":"わら","泣":"な","待":"ま","会":"あ","帰":"かえ","立":"た",
    "声援":"せいえん","電車":"でんしゃ","窓":"まど","部屋":"へや","扉":"とびら","鍵":"かぎ",
    "坂":"さか","橋":"はし","公園":"こうえん","教室":"きょうしつ","制服":"せいふく","放課後":"ほうかご",
    "青":"あお","赤":"あか","白":"しろ","黒":"くろ","蒼":"あお","紅":"くれない",
    "遠":"とお","近":"ちか","高":"たか","低":"ひく","長":"なが","短":"みじか","新":"あたら","古":"ふる",
    "優":"やさ","強":"つよ","弱":"よわ","早":"はや","速":"はや","遅":"おそ","嬉":"うれ","悲":"かな",
    "淋":"さび","寂":"さび","静":"しず","眠":"ねむ","夕":"ゆう","朝日":"あさひ","夕焼":"ゆうや",
    "君の":"きみの","一":"ひと","二":"ふた","三":"みっ","何":"なに","誰":"だれ","何処":"どこ",
    "自分":"じぶん","気持":"きもち","気":"き","持":"も","本当":"ほんとう","大丈夫":"だいじょうぶ",
    "大切":"たいせつ","大好":"だいす","好":"す","嫌":"きら","側":"そば","傍":"そば","隣":"となり"
  };

  function isKana(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x3041 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff);
  }
  function isKanji(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
  }

  /** 漢字(かんじ) のルビと、読み表をひらがなに置き換える。
      ルビは、直前の漢字のかたまり（なければ直前の区切りまで）を置き換える。
      戻り値: {reading: "...", unknown: ["漢","字"]} */
  function toReading(line) {
    /* ① 先にルビを処理する。括弧の中身で、その手前を置き換える */
    var s = "", i = 0, ch, open, close, cut, inner;
    while (i < line.length) {
      ch = line.charAt(i);
      open = (ch === "(" || ch === "（");
      if (open && s.length) {
        close = line.indexOf(ch === "(" ? ")" : "）", i + 1);
        if (close > i) {
          inner = line.slice(i + 1, close);
          cut = s.length;
          /* 送り仮名をまたいで、直前の漢字ひとかたまりを探す */
          while (cut > 0 && !isKanji(s.charAt(cut - 1)) && BREAKS.indexOf(s.charAt(cut - 1)) < 0) cut--;
          if (cut > 0 && isKanji(s.charAt(cut - 1))) {
            while (cut > 0 && isKanji(s.charAt(cut - 1))) cut--;
          } else {
            cut = s.length;   /* 漢字が見つからなければ、括弧はそのまま読みとして足す */
          }
          s = s.slice(0, cut) + inner;
          i = close + 1;
          continue;
        }
      }
      s += ch;
      i++;
    }

    /* ② 残った漢字を読み表で置き換える */
    var out = "", unknown = [], j, block, matched;
    i = 0;
    while (i < s.length) {
      ch = s.charAt(i);
      if (!isKanji(ch)) { out += ch; i++; continue; }
      matched = false;
      for (j = Math.min(4, s.length - i); j >= 1; j--) {
        block = s.substr(i, j);
        if (KANJI[block]) { out += KANJI[block]; i += j; matched = true; break; }
      }
      if (!matched) { unknown.push(ch); out += ch; i++; }
    }
    return { reading: out, unknown: unknown };
  }

  /** ひらがなの 1 行 → 音の並び。[{text, len, breakAfter, unknown}] */
  function splitLine(line) {
    var out = [], i, ch, last;
    for (i = 0; i < line.length; i++) {
      ch = line.charAt(i);
      last = out.length ? out[out.length - 1] : null;

      if (BREAKS.indexOf(ch) >= 0) { if (last) last.breakAfter = true; continue; }
      if (LONG.indexOf(ch) >= 0) { if (last) { last.len += 1; last.text += "ー"; } continue; }
      if (SOKUON.indexOf(ch) >= 0) { if (last) { last.rest = (last.rest || 0) + 1; last.text += "っ"; } continue; }
      if (SMALL.indexOf(ch) >= 0 && last) { last.text += ch; continue; }
      if (ch === "\u309b" || ch === "\u309c") { if (last) last.text += ch; continue; }

      out.push({ text: ch, len: 1, rest: 0, breakAfter: false, unknown: !isKana(ch) });
    }
    if (out.length) out[out.length - 1].breakAfter = true;
    return out;
  }

  /** 歌詞全体 → {phrases: [[音,...],...], unknown: [漢字,...]} */
  function parse(text) {
    var lines = String(text).split(/\r?\n/);
    var phrases = [], unknown = [];
    lines.forEach(function (l) {
      var r = toReading(l.trim());
      unknown = unknown.concat(r.unknown);
      var p = splitLine(r.reading);
      if (p.length) phrases.push(p);
    });
    /* 重複を消す */
    unknown = unknown.filter(function (v, i, a) { return a.indexOf(v) === i; });
    return { phrases: phrases, unknown: unknown };
  }

  root.mora = {
    parse: parse, splitLine: splitLine, toReading: toReading,
    isKana: isKana, isKanji: isKanji, KANJI: KANJI
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
