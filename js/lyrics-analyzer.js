/* lyrics-analyzer.js — 日本語歌詞を Section / Line / Phrase / Word / Mora に分解する。
   Phase 1では既存 mora.parse を壊さず、次世代生成器用の構造化データを横に追加する。 */
(function (root) {
  "use strict";

  var moraLegacy = root.mora;
  var SMALL = "ゃゅょぁぃぅぇぉゎヵヶャュョァィゥェォヮヵヶ";
  var SOKUON = "っッ";
  var NASAL = "んン";
  var LONG = "ー〜～－ｰ";
  var PARTICLES = ["から", "まで", "より", "って", "には", "では", "ても", "でも", "は", "が", "を", "に", "で", "と", "へ", "の", "も", "や"];
  var COMMON_PATTERNS = {
    2:[2], 3:[3], 4:[4], 5:[2,3], 6:[3,3], 7:[4,3], 8:[4,4], 9:[4,5],
    10:[5,5], 11:[5,3,3], 12:[5,7], 13:[4,4,5], 14:[7,7], 15:[5,5,5]
  };

  function unique(values) {
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }

  function normalize(text) {
    return String(text || "").replace(/\r\n?/g, "\n");
  }

  function sectionKind(label) {
    var value = String(label || "").replace(/[\s　]/g, "").toLowerCase();
    if (/^(intro|イントロ|前奏)$/.test(value)) return "intro";
    if (/^(aメロ|versea|verse1|verse)$/.test(value)) return "verseA";
    if (/^(bメロ|verseb|verse2|pre-?chorus|プレコーラス)$/.test(value)) return "verseB";
    if (/^(サビ|chorus|hook)$/.test(value)) return "chorus";
    if (/^(bridge|ブリッジ|cメロ)$/.test(value)) return "bridge";
    if (/^(outro|アウトロ|後奏)$/.test(value)) return "outro";
    return "custom";
  }

  function readSectionMarker(line) {
    var match = String(line).trim().match(/^[\[［【]([^\]］】]+)[\]］】]$/);
    return match ? { label: match[1].trim(), kind: sectionKind(match[1]), explicit: true } : null;
  }

  function isKana(ch) { return moraLegacy.isKana(ch); }

  function splitMoras(reading) {
    var out = [], i, ch, last;
    reading = String(reading || "");
    for (i = 0; i < reading.length; i++) {
      ch = reading.charAt(i);
      last = out.length ? out[out.length - 1] : null;
      if (/\s/.test(ch) || "、,。.！!？?・/／「」『』【】［］".indexOf(ch) >= 0) continue;
      if (SMALL.indexOf(ch) >= 0 && last && last.type === "normal") {
        last.text += ch; last.reading += ch; last.type = "contracted"; continue;
      }
      if (SOKUON.indexOf(ch) >= 0) {
        out.push({ text:ch, reading:ch, type:"sokuon", importance:0.35, canStretch:false, canRestAfter:false });
        continue;
      }
      if (NASAL.indexOf(ch) >= 0) {
        out.push({ text:ch, reading:ch, type:"nasal", importance:0.45, canStretch:true, canRestAfter:false });
        continue;
      }
      if (LONG.indexOf(ch) >= 0) {
        out.push({ text:ch, reading:ch, type:"long", importance:0.4, canStretch:true, canRestAfter:false });
        continue;
      }
      out.push({ text:ch, reading:ch, type:isKana(ch) ? "normal" : "unknown",
        importance:0.5, canStretch:isKana(ch), canRestAfter:false });
    }
    return out;
  }

  function particleReading(reading) {
    return PARTICLES.indexOf(reading) >= 0;
  }

  function inferWordReadings(reading) {
    var moras = splitMoras(reading), groups = [], current = [];
    moras.forEach(function (item, index) {
      current.push(item.reading);
      var word = current.join("");
      var atEnd = index === moras.length - 1;
      var boundary = !atEnd && current.length >= 2 && PARTICLES.some(function (particle) {
        return word.slice(-particle.length) === particle;
      });
      if (boundary || atEnd) { groups.push(current.join("")); current = []; }
    });
    return groups.length ? groups : [reading];
  }

  function cleanToken(token) {
    return String(token || "").replace(/[「」『』【】［］]/g, "").trim();
  }

  function makeWords(raw, unknown) {
    var explicit = raw.trim().split(/[\s　]+/).filter(Boolean);
    var tokenData = [];
    explicit.forEach(function (token) {
      var cleaned = cleanToken(token);
      if (!cleaned) return;
      var converted = moraLegacy.toReading(cleaned);
      Array.prototype.push.apply(unknown, converted.unknown);
      if (explicit.length === 1) {
        inferWordReadings(converted.reading).forEach(function (reading) {
          tokenData.push({ original:cleaned, reading:reading });
        });
      } else {
        tokenData.push({ original:cleaned, reading:converted.reading });
      }
    });
    return tokenData.map(function (token, index) {
      var moras = splitMoras(token.reading);
      return {
        type:"Word", index:index, text:token.original, reading:token.reading,
        particle:particleReading(token.reading), moras:moras, moraCount:moras.length,
        importance:particleReading(token.reading) ? 0.25 : 0.55
      };
    }).filter(function (word) { return word.moras.length; });
  }

  function phraseChunks(line) {
    var chunks = [], start = 0, i, ch, depth = 0;
    for (i = 0; i < line.length; i++) {
      ch = line.charAt(i);
      if (ch === "(" || ch === "（") depth++;
      if (ch === ")" || ch === "）") depth = Math.max(0, depth - 1);
      if (!depth && "、,。.！!？?/／".indexOf(ch) >= 0) {
        if (line.slice(start, i).trim()) chunks.push({ text:line.slice(start, i).trim(), boundary:ch });
        start = i + 1;
      }
    }
    if (line.slice(start).trim()) chunks.push({ text:line.slice(start).trim(), boundary:"line" });
    if (chunks.length && chunks[chunks.length - 1].boundary !== "line") chunks[chunks.length - 1].lineEnd = true;
    return chunks;
  }

  function patternFor(count, explicit, mode) {
    if (explicit && explicit.length > 1) return explicit.slice();
    if (mode === "shichigo" && count >= 12) {
      if (count === 12) return [5,7];
      if (count === 14) return [7,7];
    }
    if (COMMON_PATTERNS[count]) return COMMON_PATTERNS[count].slice();
    var left = count, out = [];
    while (left > 0) {
      var size;
      if (left <= 5) size = left;
      else if (left === 6) size = 3;
      else if (left === 7) size = 4;
      else size = (left % 4 === 0 || left % 4 >= 2) ? 4 : 5;
      out.push(size); left -= size;
    }
    return out;
  }

  function densityFor(count, phraseCount, mode) {
    var value = count + Math.max(0, phraseCount - 1) * 1.5;
    if (mode === "rap") value *= 0.78;
    if (value <= 8) return { level:"easy", label:"ゆったり歌いやすい長さです" };
    if (value <= 13) return { level:"normal", label:"自然に歌いやすい長さです" };
    if (value <= 17) return { level:"busy", label:"この行は少し言葉が多めです" };
    return { level:"crowded", label:"この行はかなり長めです。途中で休むと歌いやすくなります" };
  }

  function proposedKind(index, total) {
    if (total <= 2) return "chorus";
    if (total <= 4) return "verseA";
    if (index >= Math.ceil(total * 0.7)) return "chorus";
    if (index >= Math.ceil(total * 0.45)) return "verseB";
    return "verseA";
  }

  function analyze(text, options) {
    options = options || {};
    var mode = options.mode || "standard";
    var raw = normalize(text), rawLines = raw.split("\n"), unknown = [], lines = [];
    var activeMarker = null, hasExplicitSections = false;

    rawLines.forEach(function (rawLine, sourceIndex) {
      var marker = readSectionMarker(rawLine);
      if (marker) { activeMarker = marker; hasExplicitSections = true; return; }
      if (!rawLine.trim()) return;
      var line = { type:"Line", sourceIndex:sourceIndex, text:rawLine.trim(), phrases:[], sectionMarker:activeMarker };
      phraseChunks(rawLine).forEach(function (chunk, phraseIndex) {
        var words = makeWords(chunk.text, unknown), moras = [];
        words.forEach(function (word, wordIndex) {
          word.moras.forEach(function (item) {
            item.wordIndex = wordIndex; item.phraseIndex = phraseIndex;
            moras.push(item);
          });
          if (word.moras.length) word.moras[word.moras.length - 1].canRestAfter = true;
        });
        if (moras.length) moras[moras.length - 1].canRestAfter = true;
        line.phrases.push({
          type:"Phrase", index:phraseIndex, text:chunk.text, boundary:chunk.boundary,
          emphasized:chunk.boundary === "!" || chunk.boundary === "！",
          question:chunk.boundary === "?" || chunk.boundary === "？",
          words:words, moras:moras, moraCount:moras.length
        });
      });
      line.moras = [];
      line.phrases.forEach(function (phrase) { Array.prototype.push.apply(line.moras, phrase.moras); });
      line.moraCount = line.moras.length;
      if (line.moras.length) line.moras[line.moras.length - 1].canRestAfter = true;
      lines.push(line);
    });

    var frequencies = {};
    lines.forEach(function (line) {
      line.phrases.forEach(function (phrase) {
        phrase.words.forEach(function (word) { frequencies[word.reading] = (frequencies[word.reading] || 0) + 1; });
      });
    });
    var titleReading = moraLegacy.toReading(options.title || "").reading;
    var globalMoraIndex = 0;
    lines.forEach(function (line, lineIndex) {
      line.index = lineIndex;
      line.phrases.forEach(function (phrase) {
        phrase.lineIndex = lineIndex;
        phrase.words.forEach(function (word, wordIndex) {
          var important = word.importance;
          if (frequencies[word.reading] > 1 && !word.particle) important += 0.16;
          if (titleReading && titleReading.indexOf(word.reading) >= 0 && word.reading.length > 1) important += 0.18;
          if (/[^\x00-\xff]/.test(word.text) && /[一-龯々]/.test(word.text)) important += 0.08;
          if (phrase.emphasized) important += 0.1;
          if (wordIndex === phrase.words.length - 1) important += 0.08;
          word.importance = Math.min(1, important);
          word.moras.forEach(function (item, moraIndex) {
            item.lineIndex = lineIndex; item.globalIndex = globalMoraIndex++;
            item.importance = Math.min(1, word.importance + (moraIndex === word.moras.length - 1 ? 0.05 : 0));
          });
        });
      });
    });

    var sections = [], section = null;
    lines.forEach(function (line, index) {
      var meta = hasExplicitSections && line.sectionMarker ? line.sectionMarker : {
        label:"自動構成", kind:proposedKind(index, lines.length), explicit:false
      };
      if (!section || section.kind !== meta.kind || section.label !== meta.label) {
        section = { type:"Section", index:sections.length, label:meta.label, kind:meta.kind,
          explicit:meta.explicit, lines:[] };
        sections.push(section);
      }
      line.sectionIndex = section.index; line.sectionKind = section.kind;
      section.lines.push(line);
    });

    var meter = [];
    lines.forEach(function (line, index) {
      var explicitGroups = [];
      line.phrases.forEach(function (phrase) {
        phrase.words.forEach(function (word) { explicitGroups.push(word.moraCount); });
      });
      var pattern = patternFor(line.moraCount, explicitGroups, mode);
      var density = densityFor(line.moraCount, line.phrases.length, mode);
      var difference = index ? line.moraCount - lines[index - 1].moraCount : 0;
      var guidance = [density.label];
      if (index && Math.abs(difference) <= 1) guidance.push("前の行と近い長さなので、同じメロディを使いやすいです");
      if (line.phrases.length > 1) guidance.push("句読点で一度休むと、言葉が伝わりやすくなります");
      else if (line.moraCount >= 10 && explicitGroups.length <= 1) guidance.push("空白を入れて言葉のまとまりを示すと、自然な区切りを作れます");
      meter.push({
        lineIndex:index, text:line.text, sectionKind:line.sectionKind, moraCount:line.moraCount,
        phraseCount:line.phrases.length, groups:pattern, difference:difference,
        densityLevel:density.level, densityLabel:density.label, guidance:unique(guidance)
      });
    });

    var allMoras = [], allPhrases = [];
    lines.forEach(function (line) {
      Array.prototype.push.apply(allMoras, line.moras);
      Array.prototype.push.apply(allPhrases, line.phrases);
    });
    return {
      type:"Lyrics", raw:raw, mode:mode, sections:sections, lines:lines,
      phrases:allPhrases, moras:allMoras, meter:meter,
      unknown:unique(unknown), hasExplicitSections:hasExplicitSections,
      stats:{ lineCount:lines.length, phraseCount:allPhrases.length, moraCount:allMoras.length }
    };
  }

  root.lyricsAnalyzer = {
    analyze:analyze, splitMoras:splitMoras, patternFor:patternFor,
    readSectionMarker:readSectionMarker, sectionKind:sectionKind
  };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
