/* presets.js — 曲の「引き出し」。
   ここはデータだけ。曲の種類を増やしたいときは、このファイルに足すだけでいい。 */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------
     コード進行
     d = スケールの度数（0 = I、5 = VI）
     t = 和音の種類。"auto" ならその調で自然なものになる
  --------------------------------------------------------------- */
  var PROGRESSIONS = [

    /* ===== ユーザー提供の編成メモから起こした制作テンプレート ===== */
    { id:"provided_run_pop_eb", name:"疾走ポップ・E♭", mode:"major", tag:"提供テンプレート", note:"ピアノ＋2本のギターで駆け抜ける",
      chords:[{d:3,t:"maj"},{d:4,t:"maj"},{d:2,t:"min"},{d:5,t:"min"},
              {d:1,t:"min"},{d:4,t:"maj"},{d:2,t:"min"},{d:5,t:"min"},
              {d:3,t:"maj"},{d:0,t:"maj"},
              {d:3,t:"maj"},{d:4,t:"maj"},{d:2,t:"min"},{x:4,t:"dom7"},{d:5,t:"min"},
              {d:1,t:"min"},{d:4,t:"dom7"},{d:5,t:"min"},{x:7,t:"min7"},{x:0,t:"dom7"}] },

    /* ===== J-POP（サビ・Aメロ・Bメロで使いやすい型） ===== */
    { id:"jpop_royal8", name:"王道・8小節", mode:"major", tag:"J-POP", note:"切なさからきれいに着地",
      chords:[{d:3,t:"maj7"},{d:4,t:"dom7"},{d:2,t:"min7"},{d:5,t:"min7"},
              {d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"},{d:0,t:"maj7"}] },
    { id:"jpop_6415", name:"vi–IV–I–V", mode:"major", tag:"J-POP", note:"エモく始まる定番",
      chords:[{d:5,t:"min7"},{d:3,t:"maj"},{d:0,t:"maj"},{d:4,t:"maj"}] },
    { id:"jpop_1564", name:"I–V–vi–IV", mode:"major", tag:"J-POP", note:"まっすぐ広がるサビ",
      chords:[{d:0,t:"maj"},{d:4,t:"maj"},{d:5,t:"min"},{d:3,t:"maj"}] },
    { id:"jpop_4156", name:"IV–I–V–vi", mode:"major", tag:"J-POP", note:"明るさの中に余韻",
      chords:[{d:3,t:"maj7"},{d:0,t:"maj"},{d:4,t:"maj"},{d:5,t:"min7"}] },
    { id:"jpop_6451", name:"vi–IV–V–I", mode:"major", tag:"J-POP", note:"暗めの入口から解決",
      chords:[{d:5,t:"min"},{d:3,t:"maj"},{d:4,t:"dom7"},{d:0,t:"maj"}] },
    { id:"jpop_2516", name:"ii–V–I–vi", mode:"major", tag:"J-POP", note:"歌が自然につながる",
      chords:[{d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"},{d:5,t:"min7"}] },
    { id:"jpop_3625", name:"iii–vi–ii–V", mode:"major", tag:"J-POP", note:"次へ進み続けるBメロ",
      chords:[{d:2,t:"min7"},{d:5,t:"min7"},{d:1,t:"min7"},{d:4,t:"dom7"}] },
    { id:"jpop_1645", name:"I–vi–IV–V", mode:"major", tag:"J-POP", note:"歌謡曲にも合う素直さ",
      chords:[{d:0,t:"maj"},{d:5,t:"min"},{d:3,t:"maj"},{d:4,t:"dom7"}] },
    { id:"jpop_4536251", name:"七つの王道", mode:"major", tag:"J-POP", note:"サビを長く押し上げる",
      chords:[{d:3,t:"maj7"},{d:4,t:"dom7"},{d:2,t:"min7"},{d:5,t:"min7"},
              {d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"}] },
    { id:"jpop_lift", name:"階段上昇", mode:"major", tag:"J-POP", note:"Aメロから気持ちを上げる",
      chords:[{d:0,t:"maj"},{d:1,t:"min"},{d:2,t:"min"},{d:3,t:"maj"}] },
    { id:"jpop_bridge", name:"Bメロ上昇", mode:"major", tag:"J-POP", note:"サビ直前の高揚",
      chords:[{d:1,t:"min7"},{d:2,t:"min7"},{d:3,t:"maj7"},{d:4,t:"dom7"}] },
    { id:"jpop_chorus", name:"サビ展開", mode:"major", tag:"J-POP", note:"二段階で主音へ戻る",
      chords:[{d:3,t:"maj"},{d:4,t:"maj"},{d:5,t:"min"},{d:2,t:"min"},
              {d:3,t:"maj"},{d:4,t:"dom7"},{d:0,t:"maj"},{d:0,t:"maj"}] },
    { id:"jpop_borrowed", name:"借用和音の余韻", mode:"major", tag:"J-POP", note:"最後の短いivが切ない",
      chords:[{x:0,t:"maj7"},{x:4,t:"dom7"},{d:5,t:"min7"},{x:5,t:"min6"}] },
    { id:"jpop_backdoor", name:"フラットVIIの風", mode:"major", tag:"J-POP", note:"少し意外なロック寄り",
      chords:[{x:0,t:"maj"},{x:10,t:"maj"},{x:5,t:"maj"},{x:0,t:"maj"}] },
    { id:"jpop_minor_hook", name:"短調フック", mode:"minor", tag:"J-POP", note:"暗いサビを強く回す",
      chords:[{d:0,t:"min"},{d:5,t:"maj"},{d:2,t:"maj"},{d:6,t:"maj"}] },
    { id:"jpop_color", name:"都会的J-POP", mode:"major", tag:"J-POP", note:"M7とm9で色を足す",
      chords:[{d:3,t:"maj9"},{d:2,t:"min7"},{d:5,t:"min9"},{d:1,t:"dom9"}] },

    /* ===== 追加ジャンル ===== */
    { id:"rock_flat7", name:"I–♭VII–IV", mode:"major", tag:"ロック＋", note:"ギターで鳴らしたい王道",
      chords:[{x:0,t:"power"},{x:10,t:"power"},{x:5,t:"power"},{x:0,t:"power"}] },
    { id:"rock_minor_drop", name:"i–♭VII–♭VI–♭VII", mode:"minor", tag:"ロック＋", note:"重く下降して戻る",
      chords:[{x:0,t:"power"},{x:10,t:"power"},{x:8,t:"power"},{x:10,t:"power"}] },
    { id:"blues_turn", name:"ブルース基本", mode:"major", tag:"ブルース", note:"I7・IV7・V7",
      chords:[{x:0,t:"dom7"},{x:5,t:"dom7"},{x:0,t:"dom7"},{x:7,t:"dom7"}] },
    { id:"funk_two", name:"ファンク2コード", mode:"minor", tag:"ファンク", note:"m7を二つで刻む",
      chords:[{x:0,t:"min7"},{x:0,t:"min7"},{x:5,t:"min7"},{x:5,t:"min7"}] },
    { id:"edm_drop", name:"EDMドロップ", mode:"minor", tag:"ダンス", note:"i–VI–III–VII",
      chords:[{d:0,t:"min"},{d:5,t:"maj"},{d:2,t:"maj"},{d:6,t:"maj"}] },
    { id:"edm_loop", name:"四つ打ちループ", mode:"major", tag:"ダンス", note:"vi–IV–I–V",
      chords:[{d:5,t:"min"},{d:3,t:"maj"},{d:0,t:"maj"},{d:4,t:"maj"}] },
    { id:"latin_minor", name:"ラテン短調", mode:"minor", tag:"ラテン", note:"i–iv–V7–i",
      chords:[{x:0,t:"min"},{x:5,t:"min"},{x:7,t:"dom7"},{x:0,t:"min"}] },
    { id:"folk_walk", name:"フォーク基本", mode:"major", tag:"フォーク", note:"I–IV–I–V",
      chords:[{d:0,t:"maj"},{d:3,t:"maj"},{d:0,t:"maj"},{d:4,t:"maj"}] },
    { id:"gospel_borrow", name:"ゴスペル借用", mode:"major", tag:"ゴスペル", note:"III7からivへ色づく",
      chords:[{x:0,t:"maj7"},{x:4,t:"dom7"},{d:5,t:"min7"},{x:5,t:"min6"}] },
    { id:"lofi_cycle", name:"Lo-Fi循環", mode:"major", tag:"Lo-Fi", note:"M7中心でゆっくり回る",
      chords:[{d:0,t:"maj9"},{d:5,t:"min7"},{d:1,t:"min9"},{d:4,t:"dom9"}] },
    { id:"neo_soul", name:"ネオソウル", mode:"major", tag:"ネオソウル", note:"9thと借用ドミナント",
      chords:[{d:0,t:"maj9"},{x:4,t:"dom7s9"},{d:5,t:"min9"},{x:2,t:"dom9"}] },
    { id:"cinema_rise", name:"シネマティック", mode:"minor", tag:"劇伴", note:"静かに大きくなる",
      chords:[{x:0,t:"madd9"},{x:8,t:"maj7"},{x:3,t:"maj"},{x:10,t:"sus2"}] },

    /* ===== 王道・J-POP ===== */
    { id:"oudou", name:"王道進行", mode:"major", tag:"定番", note:"切なくて前向き",
      chords:[{d:3,t:"maj7"},{d:4,t:"dom7"},{d:2,t:"min7"},{d:5,t:"min"}] },
    { id:"komuro", name:"小室進行", mode:"major", tag:"定番", note:"駆け出す感じ",
      chords:[{d:5,t:"min"},{d:3,t:"maj"},{d:4,t:"maj"},{d:0,t:"maj"}] },
    { id:"pop", name:"ポップ定番", mode:"major", tag:"定番", note:"明るく素直",
      chords:[{d:0,t:"maj"},{d:4,t:"maj"},{d:5,t:"min"},{d:3,t:"maj"}] },
    { id:"canon", name:"カノン進行", mode:"major", tag:"定番", note:"何度でも聴ける",
      chords:[{d:0,t:"auto"},{d:4,t:"auto"},{d:5,t:"auto"},{d:2,t:"auto"},
              {d:3,t:"auto"},{d:0,t:"auto"},{d:3,t:"auto"},{d:4,t:"auto"}] },
    { id:"junkan", name:"循環進行", mode:"major", tag:"定番", note:"ずっと回っていられる",
      chords:[{d:0,t:"maj7"},{d:5,t:"min7"},{d:1,t:"min7"},{d:4,t:"dom7"}] },
    { id:"gyaku", name:"逆循環", mode:"major", tag:"定番", note:"少しひねった始まり",
      chords:[{d:5,t:"min7"},{d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"}] },
    { id:"just2", name:"ふたつだけ", mode:"major", tag:"かんたん", note:"いちばん簡単",
      chords:[{d:0,t:"maj"},{d:4,t:"maj"}] },
    { id:"just2b", name:"ふたつだけ・切なめ", mode:"major", tag:"かんたん", note:"やさしく揺れる",
      chords:[{d:0,t:"maj"},{d:5,t:"min"}] },
    { id:"onechord", name:"ひとつだけ", mode:"major", tag:"かんたん", note:"ずっと同じ和音",
      chords:[{d:0,t:"maj7"}] },
    { id:"sanko", name:"三つの和音", mode:"major", tag:"かんたん", note:"童謡のような",
      chords:[{d:0,t:"maj"},{d:3,t:"maj"},{d:4,t:"maj"},{d:0,t:"maj"}] },

    /* ===== 明るい・元気 ===== */
    { id:"bright1", name:"まっすぐ明るい", mode:"major", tag:"明るい", note:"迷いのない進行",
      chords:[{d:0,t:"maj"},{d:3,t:"maj"},{d:0,t:"maj"},{d:4,t:"maj"}] },
    { id:"bright2", name:"はずむ", mode:"major", tag:"明るい", note:"跳ねるリズムに合う",
      chords:[{d:0,t:"maj"},{d:5,t:"min"},{d:3,t:"maj"},{d:4,t:"maj"}] },
    { id:"bright3", name:"のぼっていく", mode:"major", tag:"明るい", note:"だんだん高揚する",
      chords:[{d:0,t:"maj"},{d:1,t:"min"},{d:2,t:"min"},{d:3,t:"maj"}] },
    { id:"bright4", name:"広がる空", mode:"major", tag:"明るい", note:"サビ向き",
      chords:[{d:3,t:"maj"},{d:0,t:"maj"},{d:3,t:"maj"},{d:4,t:"maj"}] },
    { id:"bright5", name:"かけあがる", mode:"major", tag:"明るい", note:"最後に持ち上がる",
      chords:[{d:3,t:"maj"},{d:4,t:"maj"},{d:0,t:"maj"},{d:0,t:"maj"}] },
    { id:"bright6", name:"すこやか", mode:"major", tag:"明るい", note:"朝のような",
      chords:[{d:0,t:"add9"},{d:3,t:"add9"},{d:0,t:"add9"},{d:4,t:"sus4"}] },

    /* ===== 切ない・エモい ===== */
    { id:"emo1", name:"泣きの王道", mode:"major", tag:"切ない", note:"サビで刺さる",
      chords:[{d:3,t:"maj7"},{d:4,t:"dom7"},{d:5,t:"min7"},{d:5,t:"min7"}] },
    { id:"emo2", name:"ため息", mode:"major", tag:"切ない", note:"下降していく",
      chords:[{d:0,t:"maj7"},{d:4,t:"dom7"},{d:5,t:"min7"},{d:2,t:"min7"}] },
    { id:"emo3", name:"やわらかく沈む", mode:"major", tag:"切ない", note:"重さのない悲しさ",
      chords:[{d:3,t:"maj7"},{d:2,t:"min7"},{d:1,t:"min7"},{d:4,t:"dom7"}] },
    { id:"emo4", name:"夕暮れ", mode:"major", tag:"切ない", note:"あたたかく寂しい",
      chords:[{d:1,t:"min7"},{d:4,t:"dom7"},{d:5,t:"min7"},{d:3,t:"maj7"}] },
    { id:"emo5", name:"最後の一歩", mode:"major", tag:"切ない", note:"終わりの予感",
      chords:[{d:3,t:"maj7"},{d:4,t:"dom7"},{d:2,t:"min7"},{d:5,t:"min7"},
              {d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"},{d:0,t:"maj7"}] },
    { id:"emo6", name:"引きとめる", mode:"major", tag:"切ない", note:"sus4のもどかしさ",
      chords:[{d:0,t:"sus4"},{d:0,t:"maj"},{d:5,t:"min7"},{d:4,t:"dom7"}] },

    /* ===== 短調 ===== */
    { id:"minor1", name:"短調の定番", mode:"minor", tag:"暗い", note:"しっとり悲しい",
      chords:[{d:0,t:"min"},{d:5,t:"maj"},{d:2,t:"maj"},{d:6,t:"maj"}] },
    { id:"minor2", name:"切ない進行", mode:"minor", tag:"暗い", note:"胸がしめつけられる",
      chords:[{d:0,t:"min7"},{d:3,t:"min"},{d:6,t:"maj"},{d:2,t:"maj"}] },
    { id:"minor3", name:"下降進行", mode:"minor", tag:"暗い", note:"ゆっくり沈む",
      chords:[{d:0,t:"min"},{d:6,t:"maj"},{d:5,t:"maj"},{d:4,t:"maj"}] },
    { id:"minor4", name:"夜の底", mode:"minor", tag:"暗い", note:"重く静か",
      chords:[{d:0,t:"min9"},{d:0,t:"min9"},{d:5,t:"maj7"},{d:5,t:"maj7"}] },
    { id:"minor5", name:"追いかける", mode:"minor", tag:"暗い", note:"焦燥感",
      chords:[{d:0,t:"min"},{d:3,t:"min"},{d:0,t:"min"},{d:4,t:"min"}] },
    { id:"minor6", name:"嵐の前", mode:"minor", tag:"暗い", note:"張りつめる",
      chords:[{d:0,t:"min"},{d:1,t:"m7b5"},{d:6,t:"maj"},{d:2,t:"maj"}] },
    { id:"minor7", name:"雨のはじまり", mode:"minor", tag:"暗い", note:"淡々と降る",
      chords:[{d:0,t:"min7"},{d:6,t:"maj"},{d:5,t:"maj7"},{d:6,t:"maj"}] },
    { id:"minor8", name:"あきらめ", mode:"minor", tag:"暗い", note:"力が抜けていく",
      chords:[{d:3,t:"min7"},{d:6,t:"maj"},{d:2,t:"maj7"},{d:5,t:"maj7"}] },

    /* ===== おしゃれ・ジャズ ===== */
    { id:"jazz1", name:"ツーファイブ", mode:"major", tag:"おしゃれ", note:"大人の響き",
      chords:[{d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"},{d:0,t:"maj7"}] },
    { id:"jazz2", name:"都会の夜", mode:"major", tag:"おしゃれ", note:"シティポップ風",
      chords:[{d:3,t:"maj7"},{d:2,t:"dom7"},{d:5,t:"min7"},{d:5,t:"min7"}] },
    { id:"jazz3", name:"ゆらめき", mode:"major", tag:"おしゃれ", note:"ふわっと浮く",
      chords:[{d:0,t:"maj7"},{d:1,t:"min9"},{d:2,t:"min7"},{d:3,t:"maj7"}] },
    { id:"jazz4", name:"深夜のバー", mode:"minor", tag:"おしゃれ", note:"落ち着いた影",
      chords:[{d:0,t:"min9"},{d:3,t:"min9"},{d:6,t:"dom9"},{d:2,t:"maj7"}] },
    { id:"jazz5", name:"やわらかい四度", mode:"major", tag:"おしゃれ", note:"宙に浮いた感じ",
      chords:[{d:0,t:"sus47"},{d:0,t:"maj7"},{d:3,t:"sus47"},{d:3,t:"maj7"}] },
    { id:"jazz6", name:"ネオンサイン", mode:"major", tag:"おしゃれ", note:"きらびやか",
      chords:[{d:0,t:"sixth"},{d:5,t:"min7"},{d:1,t:"min7"},{d:4,t:"dom9"}] },
    { id:"jazz7", name:"雨上がりの街", mode:"major", tag:"おしゃれ", note:"少し湿った空気",
      chords:[{d:1,t:"min7"},{d:4,t:"dom7"},{d:2,t:"min7"},{d:5,t:"min7"},
              {d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"},{d:0,t:"maj7"}] },
    { id:"bossa1", name:"ボサノバ", mode:"major", tag:"おしゃれ", note:"南国の午後",
      chords:[{d:0,t:"maj7"},{d:1,t:"min7"},{d:4,t:"dom7"},{d:0,t:"maj7"}] },

    /* ===== ロック・シンプル ===== */
    { id:"rock1", name:"ロック基本", mode:"major", tag:"ロック", note:"力強い",
      chords:[{d:0,t:"maj"},{d:6,t:"maj"},{d:3,t:"maj"},{d:0,t:"maj"}] },
    { id:"rock2", name:"疾走", mode:"minor", tag:"ロック", note:"走り続ける",
      chords:[{d:0,t:"min"},{d:6,t:"maj"},{d:5,t:"maj"},{d:6,t:"maj"}] },
    { id:"rock3", name:"パンク", mode:"major", tag:"ロック", note:"勢いだけで押す",
      chords:[{d:0,t:"maj"},{d:4,t:"maj"},{d:3,t:"maj"},{d:4,t:"maj"}] },
    { id:"rock4", name:"重い足取り", mode:"minor", tag:"ロック", note:"ゆっくり歩く",
      chords:[{d:0,t:"min"},{d:0,t:"min"},{d:5,t:"maj"},{d:6,t:"maj"}] },
    { id:"rock5", name:"叫び", mode:"minor", tag:"ロック", note:"サビで爆発する",
      chords:[{d:5,t:"maj"},{d:6,t:"maj"},{d:0,t:"min"},{d:3,t:"min"}] },

    /* ===== 和風・ゲーム ===== */
    { id:"wafu1", name:"和風", mode:"minor", tag:"和・ゲーム", note:"五音階っぽい響き",
      chords:[{d:0,t:"min"},{d:3,t:"min"},{d:0,t:"min"},{d:6,t:"maj"}] },
    { id:"wafu2", name:"祭り", mode:"minor", tag:"和・ゲーム", note:"にぎやかで少し切ない",
      chords:[{d:0,t:"min"},{d:6,t:"maj"},{d:0,t:"min"},{d:4,t:"min"}] },
    { id:"game1", name:"冒険の始まり", mode:"major", tag:"和・ゲーム", note:"フィールド曲",
      chords:[{d:0,t:"maj"},{d:3,t:"maj"},{d:4,t:"maj"},{d:5,t:"min"}] },
    { id:"game2", name:"ダンジョン", mode:"minor", tag:"和・ゲーム", note:"うす暗い",
      chords:[{d:0,t:"min"},{d:1,t:"m7b5"},{d:0,t:"min"},{d:6,t:"maj"}] },
    { id:"game3", name:"ボス戦", mode:"minor", tag:"和・ゲーム", note:"緊迫",
      chords:[{d:0,t:"min"},{d:0,t:"min"},{d:6,t:"maj"},{d:4,t:"maj"}] },
    { id:"game4", name:"勝利", mode:"major", tag:"和・ゲーム", note:"晴れやか",
      chords:[{d:0,t:"maj"},{d:4,t:"sus4"},{d:4,t:"maj"},{d:0,t:"maj"}] },
    { id:"game5", name:"ふしぎな場所", mode:"major", tag:"和・ゲーム", note:"少し不安定",
      chords:[{d:0,t:"maj"},{d:0,t:"aug"},{d:5,t:"min"},{d:3,t:"maj"}] },

    /* ===== しずか ===== */
    { id:"lull1", name:"子守唄", mode:"major", tag:"しずか", note:"眠くなる",
      chords:[{d:0,t:"maj"},{d:0,t:"maj"},{d:3,t:"maj"},{d:0,t:"maj"}] },
    { id:"amb1", name:"漂う", mode:"major", tag:"しずか", note:"時間が止まる",
      chords:[{d:0,t:"sus2"},{d:3,t:"maj7"},{d:0,t:"sus2"},{d:5,t:"min7"}] },
    { id:"amb2", name:"雪のあさ", mode:"major", tag:"しずか", note:"白くて静か",
      chords:[{d:0,t:"maj7"},{d:2,t:"min7"},{d:3,t:"maj7"},{d:0,t:"maj7"}] }
  ];

  /* ---------------------------------------------------------------
     リズム（1 小節 = 16 ステップ）
     kick / snare / hat  … 鳴らすステップ
     bass … "root"(伸ばす) / "eighth"(8分) / "walk"(動く) / "arp"(和音を分ける)
     padGate … 和音をどれくらい伸ばすか（1 = 小節いっぱい）
  --------------------------------------------------------------- */
  var RHYTHMS = [
    { id:"ballad", name:"バラード",
      kick:[0,10], snare:[8], hat:[0,4,8,12], bass:"root", padGate:1 },
    { id:"eight", name:"8ビート",
      kick:[0,6,8], snare:[4,12], hat:[0,2,4,6,8,10,12,14], bass:"eighth", padGate:0.5 },
    { id:"rock", name:"ロック",
      kick:[0,6,8,14], snare:[4,12], hat:[0,2,4,6,8,10,12,14], bass:"eighth", padGate:0.25 },
    { id:"sixteen", name:"16ビート",
      kick:[0,6,8], snare:[4,12],
      hat:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], bass:"pump", padGate:0.25 },
    { id:"shuffle", name:"シャッフル",
      kick:[0,8], snare:[4,12], hat:[0,3,4,7,8,11,12,15], bass:"eighth", padGate:0.5 },
    { id:"bossa", name:"ボサノバ",
      kick:[0,7], snare:[3,11], hat:[0,4,6,10,12], bass:"walk", padGate:0.75 },
    { id:"funk", name:"ファンク",
      kick:[0,3,10], snare:[4,12], hat:[0,2,4,6,8,10,12,14], bass:"pump", padGate:0.25 },
    { id:"march", name:"マーチ",
      kick:[0,8], snare:[4,6,12,14], hat:[0,4,8,12], bass:"root", padGate:0.5 },
    { id:"quiet", name:"しずか",
      kick:[], snare:[], hat:[], bass:"root", padGate:1, arp:true },
    { id:"none", name:"伴奏なし",
      kick:[], snare:[], hat:[], bass:"none", padGate:1 }
  ];

  /* ---------------------------------------------------------------
     音色。Web Audio のパラメータそのもの。
     wave の重ね方とエンベロープで、楽器らしさを作る。
  --------------------------------------------------------------- */
  var TIMBRES = [
    { id:"piano", name:"ピアノ", program:0, bassProgram:32,
      melody:{ waves:[["triangle",1,0],["sine",0.5,0],["sine",0.22,1200]], cut:3400, sweep:0.4,
               a:0.004, d:0.55, s:0.12, r:0.5, peak:0.34 },
      bass:{ waves:[["sine",1,0],["triangle",0.35,0]], cut:800, sweep:0.5,
             a:0.006, d:0.5, s:0.25, r:0.3, peak:0.42 },
      pad:{ waves:[["triangle",1,0],["sine",0.4,7]], cut:1600, sweep:0.6,
            a:0.02, d:0.8, s:0.15, r:0.6, peak:0.12 } },

    { id:"eplano", name:"エレクトリックピアノ", program:4, bassProgram:33,
      melody:{ waves:[["sine",1,0],["sine",0.45,0],["triangle",0.18,-5]], cut:2600, sweep:0.55,
               a:0.006, d:0.7, s:0.28, r:0.6, peak:0.34 },
      bass:{ waves:[["sine",1,0]], cut:600, sweep:0.6, a:0.008, d:0.6, s:0.3, r:0.35, peak:0.44 },
      pad:{ waves:[["sine",1,0],["sine",0.5,9],["sine",0.5,-9]], cut:1400, sweep:0.8,
            a:0.25, d:1.0, s:0.5, r:0.9, peak:0.10 } },

    { id:"aguitar", name:"アコースティックギター", program:25, bassProgram:32,
      melody:{ waves:[["triangle",1,0],["sawtooth",0.35,0],["sine",0.3,1900]], cut:3000, sweep:0.3,
               pluck:true, a:0.003, d:0.5, s:0.10, r:0.4, peak:0.30 },
      bass:{ waves:[["triangle",1,0],["sine",0.5,0]], cut:700, sweep:0.45, pluck:true,
             a:0.004, d:0.4, s:0.2, r:0.3, peak:0.42 },
      pad:{ waves:[["triangle",1,0],["sawtooth",0.25,6]], cut:2200, sweep:0.4, pluck:true,
            a:0.005, d:0.7, s:0.08, r:0.6, peak:0.13 } },

    { id:"eguitar", name:"エレキギター", program:29, bassProgram:34,
      melody:{ waves:[["sawtooth",1,0],["square",0.5,4],["sawtooth",0.4,-6]], cut:2400, sweep:0.5,
               pluck:true, a:0.003, d:0.3, s:0.55, r:0.3, peak:0.26 },
      bass:{ waves:[["sawtooth",1,0],["sine",0.7,0]], cut:600, sweep:0.5, pluck:true,
             a:0.004, d:0.3, s:0.5, r:0.25, peak:0.42 },
      pad:{ waves:[["sawtooth",1,0],["square",0.4,7]], cut:1800, sweep:0.35, pluck:true,
            a:0.004, d:0.5, s:0.3, r:0.4, peak:0.11 } },

    { id:"organ", name:"オルガン", program:16, bassProgram:33,
      melody:{ waves:[["sine",1,0],["sine",0.6,1200],["sine",0.35,1902],["square",0.15,0]],
               cut:4000, sweep:1, a:0.012, d:0.05, s:0.95, r:0.09, peak:0.26 },
      bass:{ waves:[["sine",1,0],["sine",0.4,1200]], cut:900, sweep:1,
             a:0.01, d:0.05, s:0.95, r:0.08, peak:0.40 },
      pad:{ waves:[["sine",1,0],["sine",0.5,1200],["sine",0.3,700]], cut:2200, sweep:1,
            a:0.05, d:0.1, s:0.9, r:0.25, peak:0.09 } },

    { id:"strings", name:"ストリングス", program:48, bassProgram:43,
      melody:{ waves:[["sawtooth",1,0],["sawtooth",0.7,6],["sawtooth",0.7,-6]], cut:2000, sweep:0.7,
               a:0.12, d:0.3, s:0.8, r:0.7, peak:0.24 },
      bass:{ waves:[["sawtooth",1,0],["sine",0.5,0]], cut:520, sweep:0.7,
             a:0.09, d:0.3, s:0.8, r:0.5, peak:0.36 },
      pad:{ waves:[["sawtooth",1,0],["sawtooth",0.8,9],["sawtooth",0.8,-9]], cut:1300, sweep:0.6,
            a:0.5, d:1.0, s:0.75, r:1.4, peak:0.10 } },

    { id:"synth", name:"やわらかシンセ", program:89, bassProgram:38,
      melody:{ waves:[["sawtooth",1,0],["sawtooth",0.6,7],["sawtooth",0.6,-7]], cut:2200, sweep:0.5,
               a:0.03, d:0.4, s:0.6, r:0.4, peak:0.26 },
      bass:{ waves:[["sawtooth",1,0],["sine",0.6,0]], cut:520, sweep:0.7,
             a:0.01, d:0.3, s:0.7, r:0.25, peak:0.40 },
      pad:{ waves:[["sawtooth",1,0],["sawtooth",0.7,11],["sawtooth",0.7,-11]], cut:1200, sweep:0.5,
            a:0.4, d:1.2, s:0.6, r:1.2, peak:0.09 } },

    { id:"lead", name:"シンセリード", program:80, bassProgram:38,
      melody:{ waves:[["square",1,0],["sawtooth",0.5,9],["square",0.3,-9]], cut:3200, sweep:0.45,
               a:0.006, d:0.2, s:0.7, r:0.2, peak:0.26 },
      bass:{ waves:[["square",1,0],["sine",0.8,0]], cut:560, sweep:0.6,
             a:0.006, d:0.2, s:0.8, r:0.15, peak:0.42 },
      pad:{ waves:[["sawtooth",1,0],["sawtooth",0.6,13]], cut:1500, sweep:0.4,
            a:0.2, d:0.7, s:0.5, r:0.8, peak:0.08 } },

    { id:"bell", name:"オルゴール", program:10, bassProgram:32,
      melody:{ waves:[["sine",1,0],["sine",0.5,2400],["sine",0.25,3100]], cut:6000, sweep:0.25,
               a:0.002, d:0.9, s:0.02, r:0.9, peak:0.30 },
      bass:{ waves:[["sine",1,0]], cut:600, sweep:0.5, a:0.005, d:0.7, s:0.1, r:0.5, peak:0.36 },
      pad:{ waves:[["sine",1,0],["sine",0.4,1200]], cut:2600, sweep:0.4,
            a:0.01, d:1.2, s:0.05, r:1.0, peak:0.10 } },

    { id:"marimba", name:"マリンバ", program:12, bassProgram:32,
      melody:{ waves:[["sine",1,0],["sine",0.45,1902],["triangle",0.2,0]], cut:4200, sweep:0.3,
               a:0.002, d:0.35, s:0.02, r:0.3, peak:0.32 },
      bass:{ waves:[["sine",1,0],["triangle",0.4,0]], cut:700, sweep:0.4,
             a:0.003, d:0.35, s:0.08, r:0.3, peak:0.40 },
      pad:{ waves:[["sine",1,0],["triangle",0.3,7]], cut:2000, sweep:0.4,
            a:0.004, d:0.6, s:0.05, r:0.5, peak:0.11 } },

    { id:"flute", name:"笛", program:73, bassProgram:32,
      melody:{ waves:[["sine",1,0],["triangle",0.25,0],["sine",0.12,1200]], cut:3000, sweep:0.9,
               a:0.06, d:0.2, s:0.85, r:0.25, peak:0.28 },
      bass:{ waves:[["sine",1,0]], cut:700, sweep:0.9, a:0.03, d:0.2, s:0.85, r:0.25, peak:0.36 },
      pad:{ waves:[["sine",1,0],["sine",0.5,8],["sine",0.5,-8]], cut:1800, sweep:0.8,
            a:0.35, d:0.6, s:0.7, r:0.9, peak:0.09 } },

    { id:"chip", name:"8bit", program:80, bassProgram:38,
      melody:{ waves:[["square",1,0]], cut:6000, sweep:1, retro:true,
               a:0.002, d:0.1, s:0.8, r:0.06, peak:0.24 },
      bass:{ waves:[["triangle",1,0]], cut:1200, sweep:1, retro:true,
             a:0.002, d:0.1, s:0.85, r:0.05, peak:0.42 },
      pad:{ waves:[["square",0.6,0]], cut:3000, sweep:1, retro:true,
            a:0.002, d:0.1, s:0.7, r:0.05, peak:0.07 } }
  ];

  var DRUM_KITS = [
    { id:"acoustic", name:"アコースティック" },
    { id:"tight", name:"タイト" },
    { id:"electronic", name:"エレクトロ" },
    { id:"soft", name:"ソフト" },
    { id:"retro", name:"8bit" }
  ];

  var ENSEMBLES = [
    { id:"piano_trio", name:"ピアノトリオ", melody:"piano", chord:"piano", bass:"eplano", drum:"soft" },
    { id:"acoustic", name:"アコースティック", melody:"aguitar", chord:"aguitar", bass:"piano", drum:"soft" },
    { id:"band", name:"ロックバンド", melody:"eguitar", chord:"eguitar", bass:"eguitar", drum:"acoustic" },
    { id:"citypop", name:"シティポップ", melody:"eplano", chord:"synth", bass:"eguitar", drum:"tight" },
    { id:"synthpop", name:"シンセポップ", melody:"lead", chord:"synth", bass:"synth", drum:"electronic" },
    { id:"orchestra", name:"小さなオーケストラ", melody:"flute", chord:"strings", bass:"strings", drum:"soft" },
    { id:"retro", name:"8bitゲーム", melody:"chip", chord:"chip", bass:"chip", drum:"retro" },
    { id:"minimal", name:"静かなエレピ", melody:"eplano", chord:"eplano", bass:"piano", drum:"soft" }
  ];

  /* ---------------------------------------------------------------
     メロディの形（スケール度数の並び）。歌詞の音数に合わせて伸び縮みさせる。
     smooth = となりの音へ動く / leapy = 大きく跳ぶ
  --------------------------------------------------------------- */
  var CONTOURS = {
    smooth: [
      [0, 1, 2, 3, 2, 1, 0, -1],
      [0, 2, 3, 4, 3, 2, 1, 0],
      [2, 1, 0, 1, 2, 3, 2, 0],
      [0, -1, 0, 1, 2, 1, 0, 0],
      [0, 1, 2, 2, 3, 2, 1, 0],
      [3, 2, 1, 0, 1, 2, 1, 0],
      [0, 0, 1, 2, 3, 4, 2, 0],
      [1, 2, 1, 0, -1, 0, 1, 0],
      [0, 2, 1, 3, 2, 4, 2, 0],
      [4, 3, 4, 3, 2, 1, 0, 0]
    ],
    leapy: [
      [0, 4, 2, 5, 3, 6, 4, 0],
      [0, 3, -1, 4, 0, 5, 2, 0],
      [4, 0, 5, 1, 6, 2, 4, 0],
      [0, 5, 3, 7, 4, 2, 0, -2],
      [0, 4, 0, 5, 0, 6, 3, 0],
      [2, 6, 3, 7, 4, 1, 3, 0],
      [0, -2, 4, 1, 5, 2, 6, 0],
      [5, 2, 6, 3, 7, 4, 2, 0],
      [0, 4, 7, 4, 0, 4, 2, 0],
      [3, 7, 2, 6, 1, 5, 3, 0]
    ]
  };

  /* ---------------------------------------------------------------
     雰囲気プリセット。押すボタンはこれ 1 個。
     中では 進行・リズム・音色・速さ・形 が同時に切り替わる。
  --------------------------------------------------------------- */
  var MOODS = [
    { id:"shittori", name:"しっとり", note:"ゆっくり、ピアノで",
      progression:"oudou",   rhythm:"ballad",  timbre:"piano", ensemble:"piano_trio", bpm:80,  contour:"smooth", unit:4 },
    { id:"hashiru", name:"走り出す", note:"速く、アコギで",
      progression:"komuro",  rhythm:"eight",   timbre:"aguitar", ensemble:"acoustic", bpm:104, contour:"leapy",  unit:1 },
    { id:"setsunai", name:"切ない", note:"短調、エレピ",
      progression:"minor2",  rhythm:"quiet",   timbre:"eplano", ensemble:"minimal", bpm:92,  contour:"smooth", unit:2 },
    { id:"yurayura", name:"ゆらゆら", note:"ボサノバ、おしゃれな和音",
      progression:"bossa1",  rhythm:"bossa",   timbre:"synth", ensemble:"citypop", bpm:108, contour:"smooth", unit:2 },
    { id:"retro", name:"レトロ", note:"8bit、ゲームっぽく",
      progression:"game1",   rhythm:"rock",    timbre:"chip", ensemble:"retro", bpm:106, contour:"leapy",  unit:1 },
    { id:"yoru", name:"夜の街", note:"シティポップ風",
      progression:"jazz2",   rhythm:"sixteen", timbre:"eplano", ensemble:"citypop", bpm:96,  contour:"smooth", unit:2 },
    { id:"atsui", name:"熱い", note:"エレキギターで押す",
      progression:"rock2",   rhythm:"rock",    timbre:"eguitar", ensemble:"band", bpm:110, contour:"leapy",  unit:1 },
    { id:"nemuru", name:"ねむる", note:"オルゴール、静かに",
      progression:"lull1",   rhythm:"quiet",   timbre:"bell", ensemble:"minimal", bpm:66,  contour:"smooth", unit:4 },
    { id:"sanpo", name:"さんぽ", note:"マリンバで軽く",
      progression:"bright2", rhythm:"shuffle", timbre:"marimba", ensemble:"acoustic", bpm:100, contour:"smooth", unit:2 },
    { id:"sora", name:"空", note:"ストリングスで広く",
      progression:"bright4", rhythm:"ballad",  timbre:"strings", ensemble:"orchestra", bpm:84,  contour:"smooth", unit:4 }
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  root.presets = {
    PROGRESSIONS: PROGRESSIONS, RHYTHMS: RHYTHMS, TIMBRES: TIMBRES,
    DRUM_KITS: DRUM_KITS, ENSEMBLES: ENSEMBLES,
    CONTOURS: CONTOURS, MOODS: MOODS, byId: byId
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
