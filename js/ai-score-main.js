(function () {
  "use strict";

  var UG = window.UG || {};
  var projectV2 = UG.projectV2, compositionCore = UG.compositionCore;
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    song:null, bpm:96, title:"", lyrics:"", blueprint:null, sourceText:"", sourceType:"", analysis:null,
    history:[], vocalBlob:null, vocalName:"", compositionDraft:null, activeCandidateIndex:0, composeSeed:20260829,
    override:{}, customDrum:null, arrangementTemplateId:"free", partMix:null,
    selectedFile:null, pendingMusicXml:null, separatorFile:null, separation:null,
    songRevision:0, voiceRequestId:0, voiceAbort:null, importBusy:false
  };
  var stage = UG.view.create($("pianoCanvas"), $("pianoScroll"));

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function safeName() { return (state.title || "ai-score").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80); }
  function status(node, message, kind) {
    if (!node) return;
    node.textContent = message;
    node.className = "status" + (kind ? " " + kind : "");
  }
  function toast(message) {
    var node = $("toast");
    node.textContent = message; node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.hidden = true; }, 4200);
  }
  function scrollToPanel(id) {
    var node = $(id);
    if (node) node.scrollIntoView({ behavior:"smooth", block:"start" });
    Array.from(document.querySelectorAll("[data-scroll-target]")).forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-scroll-target") === id || (id === "aiImportPanel" && button.getAttribute("data-scroll-target") === "createPanel"));
    });
  }
  function updateWorkflow(ready) {
    Array.from(document.querySelectorAll("[data-song-step]")).forEach(function (button) { button.disabled = !ready; });
    if ($("songLockedPanel")) $("songLockedPanel").hidden = !!ready;
    if ($("workflowState")) $("workflowState").textContent = ready
      ? "曲を開きました。上の番号から移動できます"
      : "まず曲を作るか、ファイルを読み込みます";
  }
  function clearUnifiedSelection(showMessage) {
    state.selectedFile = null;
    if ($("unifiedFile")) $("unifiedFile").value = "";
    $("unifiedFileName").textContent = "曲シート／Project／Blueprint／MIDI／MusicXMLをここへ";
    $("clearUnifiedFileBtn").hidden = true;
    if (showMessage) status($("importStatus"), "ファイル選択を解除しました。貼り付けた曲シートを使えます。");
  }
  function selectUnifiedFile(file) {
    if (!file) return false;
    state.selectedFile = file;
    $("unifiedFileName").textContent = file.name;
    $("clearUnifiedFileBtn").hidden = false;
    status($("importStatus"), "「" + file.name + "」を選びました。読み込んで編集へ進めます。", "good");
    return true;
  }
  function download(data, type, name) {
    var blob = data instanceof Blob ? data : new Blob([data], { type:type });
    var url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }
  function copyText(text, message) {
    return navigator.clipboard.writeText(text).then(function () { toast(message); }).catch(function () {
      var area = document.createElement("textarea");
      area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); toast(message);
    });
  }
  function clearChildren(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function option(value, label) { var node = document.createElement("option"); node.value = value; node.textContent = label; return node; }
  function isFullScore(song) { return !!(song && song.importedMidi && Array.isArray(song.importedTracks)); }
  function hasSingingLyrics() { return !!(state.song && (state.song.melody || []).some(function (note) { return String(note.text || "").trim(); })); }

  function partMixFromEnsemble(id) {
    var ensemble = UG.presets.byId(UG.presets.ENSEMBLES, id);
    return {
      ensembleId:ensemble.id,
      melody:{ enabled:true, instrument:ensemble.melody },
      chord:{ enabled:true, instrument:ensemble.chord },
      bass:{ enabled:true, instrument:ensemble.bass },
      drum:{ enabled:true, kit:ensemble.drum }
    };
  }
  function normalizePartMix(value) {
    var fallback = partMixFromEnsemble((UG.presets.MOODS[0] || {}).ensemble || "piano_trio");
    var result = value && typeof value === "object" ? clone(value) : fallback;
    function timbreExists(id) { return UG.presets.TIMBRES.some(function (item) { return item.id === id; }); }
    ["melody", "chord", "bass"].forEach(function (part) {
      if (!result[part] || !timbreExists(result[part].instrument)) result[part] = clone(fallback[part]);
      result[part].enabled = result[part].enabled !== false;
    });
    if (!result.drum) result.drum = clone(fallback.drum);
    result.drum.enabled = result.drum.enabled !== false;
    if (!UG.presets.DRUM_KITS.some(function (item) { return item.id === result.drum.kit; })) result.drum.kit = fallback.drum.kit;
    result.ensembleId = result.ensembleId || "custom";
    return result;
  }
  function selectedTimbre(part) {
    var id = state.partMix && state.partMix[part] && state.partMix[part].instrument;
    return UG.presets.byId(UG.presets.TIMBRES, id || "piano");
  }
  function playbackSettings(forMidi) {
    var melody = selectedTimbre("melody"), bass = selectedTimbre("bass"), chord = selectedTimbre("chord");
    var hasVoice = !!(UG.audio && UG.audio.hasVocal && UG.audio.hasVocal());
    return {
      enabled:{
        melody:state.partMix.melody.enabled && (forMidi || !hasVoice),
        bass:state.partMix.bass.enabled,
        pad:state.partMix.chord.enabled,
        drum:state.partMix.drum.enabled
      },
      programs:{ melody:melody.program, bass:bass.bassProgram, pad:chord.program },
      melody:melody.melody, bass:bass.bass, pad:chord.pad, drumKit:state.partMix.drum.kit,
      leadSteps:hasVoice && UG.musicxml ? UG.musicxml.LEAD_STEPS : 0
    };
  }

  function currentReport() {
    if (!state.song) return null;
    if (!hasSingingLyrics()) return { instrumental:true, notes:(state.song.melody || []).length, issues:[], repairable:false };
    return UG.midiDoctor.diagnose(state.song, state.bpm);
  }
  function renderDiagnosis() {
    var report = currentReport(), list = $("diagnosisList");
    clearChildren(list);
    if (!report) { $("diagnosisSummary").textContent = "曲を作ると診断が出ます。"; return; }
    if (report.instrumental) {
      $("diagnosisSummary").textContent = "歌詞なしの楽器パートです。歌いやすさの診断・自動修復は適用しません。";
      $("repairBtn").disabled = true; return;
    }
    var metrics = report.metrics || {};
    $("diagnosisSummary").textContent = report.notes + "歌唱音・推定 " + (report.keyLabel || "不明") +
      "・最短 " + (Number.isFinite(metrics.shortestSeconds) ? Math.round(metrics.shortestSeconds * 1000) + "ms" : "-") +
      "・最大跳躍 " + (metrics.maxLeap || 0) + "半音";
    if (!report.issues.length) {
      var ok = document.createElement("li"); ok.className = "ok"; ok.textContent = "重大な問題は見つかりませんでした。"; list.appendChild(ok);
    } else report.issues.forEach(function (issue) {
      var item = document.createElement("li"); item.className = issue.level === "error" ? "error" : ""; item.textContent = issue.text; list.appendChild(item);
    });
    $("repairBtn").disabled = !report.repairable;
  }

  function renderHistory() {
    var box = $("historyList"); clearChildren(box);
    state.history.forEach(function (entry, index) {
      var button = document.createElement("button");
      button.textContent = (index + 1) + ". " + entry.title + "（" + entry.type + "）";
      button.addEventListener("click", function () { restoreHistory(index); }); box.appendChild(button);
    });
  }
  function snapshot() {
    if (!state.song) return;
    state.history.push({
      title:state.title, lyrics:state.lyrics, type:state.sourceType, bpm:state.bpm,
      song:clone(state.song), blueprint:clone(state.blueprint), sourceText:state.sourceText,
      analysis:clone(state.analysis), partMix:clone(state.partMix), customDrum:clone(state.customDrum),
      arrangementTemplateId:state.arrangementTemplateId
    });
    if (state.history.length > 8) state.history.shift();
    renderHistory();
  }
  function restoreHistory(index) {
    var item = state.history[index]; if (!item) return;
    beginSongChange("履歴の曲へ戻したため、歌声を作り直してください。");
    state.title = item.title; state.lyrics = item.lyrics || ""; state.sourceType = item.type; state.bpm = item.bpm;
    state.song = clone(item.song); state.blueprint = clone(item.blueprint); state.sourceText = item.sourceText || "";
    state.analysis = clone(item.analysis); state.partMix = normalizePartMix(item.partMix); state.customDrum = clone(item.customDrum);
    state.arrangementTemplateId = item.arrangementTemplateId || "free";
    renderCurrentSong({ scroll:true }); toast("この版へ戻しました");
  }

  function clearVoice(message) {
    if (UG.audio) UG.audio.clearVocal();
    state.vocalBlob = null; state.vocalName = "";
    $("saveVoiceBtn").disabled = true;
    status($("voiceStatus"), message || (state.song ? "歌声はまだ作っていません。" : "曲を作ると歌わせられます。"));
  }
  function beginSongChange(message) {
    state.songRevision++;
    state.voiceRequestId++;
    if (state.voiceAbort) {
      try { state.voiceAbort.abort(); } catch (_) { /* already finished */ }
      state.voiceAbort = null;
    }
    clearVoice(message || "曲が変わったため、歌声を作り直してください。");
  }
  function invalidateVoice(reason) {
    beginSongChange(reason || "メロディが変わったため、古い歌声を外しました。");
  }
  function updateSongRange() {
    var range = UG.editor.noteRange(state.song && state.song.melody || []);
    if (state.song) { state.song.lo = range.lo; state.song.hi = range.hi; }
  }
  function commitCandidate() {
    if (!state.compositionDraft || !state.song || state.activeCandidateIndex < 0) return;
    state.compositionDraft.candidates[state.activeCandidateIndex] = clone(state.song);
  }
  function roleLabel(track) {
    var role = track.role === "melody" ? (hasSingingLyrics() ? "歌" : "メロディ") : track.role === "bass" ? "ベース" : track.role === "drum" ? "ドラム" : "伴奏";
    return role + " · " + (track.name || track.id) + (track.isDrum ? "" : " · GM " + ((track.program || 0) + 1));
  }
  function renderTrackChips() {
    var tracks = state.song && state.song.importedTracks || [], box = $("trackChips"); clearChildren(box);
    var labels = tracks.length ? tracks.map(roleLabel) : ["歌メロディ", "ベース", "コード伴奏", "ドラム"];
    labels.forEach(function (label) { var chip = document.createElement("span"); chip.textContent = label; box.appendChild(chip); });
  }
  function renderCandidateButtons() {
    var draft = state.compositionDraft, box = $("composeCandidates"); clearChildren(box);
    box.hidden = !draft;
    if (!draft) return;
    draft.candidates.forEach(function (song, index) {
      var info = song.candidateInfo || {}, button = document.createElement("button");
      button.type = "button"; button.textContent = (info.letter || ["A","B","C"][index]) + " " + (info.name || "曲案");
      button.classList.toggle("active", state.activeCandidateIndex === index);
      button.addEventListener("click", function () { selectCompositionCandidate(index); }); box.appendChild(button);
    });
  }
  function renderCurrentSong(options) {
    var opts = options || {}; if (!state.song) return;
    UG.audio.stop(); $("playBtn").textContent = "▶ 再生"; state.song.title = state.title; updateSongRange(); stage.setSong(state.song, state.song.key);
    $("workspace").hidden = false; updateWorkflow(true); $("songTitle").textContent = state.title;
    var tracks = state.song.importedTracks || [];
    $("songMeta").textContent = state.sourceType + "・" + (tracks.length ? tracks.length + "トラック" : "4パート") + "・" + state.bpm + " BPM・" + (state.song.melody || []).length + (hasSingingLyrics() ? "歌唱音" : "メロディ音");
    renderTrackChips(); renderCandidateButtons(); syncPartControls();
    var full = isFullScore(state.song);
    $("nativeArrangementTools").hidden = full; $("importedEditNotice").hidden = !full;
    $("newCandidatesBtn").disabled = !state.compositionDraft;
    renderChordEditor(); renderDrumGrid(); renderDiagnosis();
    $("generateVoiceBtn").disabled = !$("voiceSelect").value || !hasSingingLyrics();
    if (!hasSingingLyrics()) status($("voiceStatus"), "歌詞の割当なし。楽器曲として再生・WAV保存できます。");
    $("saveMixBtn").disabled = !UG.audio.canExportMix();
    if (opts.snapshot) snapshot();
    if (opts.scroll) scrollToPanel("listenPanel");
  }

  function populateComposer() {
    clearChildren($("composeMood")); clearChildren($("composeStyle"));
    (UG.presets.MOODS || []).forEach(function (item) { var node = option(item.id, item.name + " — " + item.note); if (item.id === "shittori") node.selected = true; $("composeMood").appendChild(node); });
    (UG.styles.STYLES || []).forEach(function (item) { var node = option(item.id, item.name); if (item.id === "jpop-rock") node.selected = true; $("composeStyle").appendChild(node); });
    UG.theory.NAMES.forEach(function (name, index) { $("keySel").appendChild(option(index, name)); });

    var groups = {};
    UG.presets.PROGRESSIONS.forEach(function (item) { (groups[item.tag] = groups[item.tag] || []).push(item); });
    Object.keys(groups).forEach(function (tag) {
      var group = document.createElement("optgroup"); group.label = tag;
      groups[tag].forEach(function (item) { group.appendChild(option(item.id, item.name + " — " + item.note)); });
      $("progSel").appendChild(group);
    });
    UG.presets.RHYTHMS.forEach(function (item) { $("rhythmSel").appendChild(option(item.id, item.name)); });
    UG.arrangementTemplate.TEMPLATES.forEach(function (item) { $("arrangementTemplateSel").appendChild(option(item.id, item.name)); });
    UG.presets.ENSEMBLES.forEach(function (item) { $("ensembleSel").appendChild(option(item.id, item.name)); });
    var custom = option("custom", "カスタム編成"); custom.disabled = true; $("ensembleSel").appendChild(custom);
    ["melodyInstrument", "chordInstrument", "bassInstrument"].forEach(function (id) {
      UG.presets.TIMBRES.forEach(function (item) { $(id).appendChild(option(item.id, item.name)); });
    });
    UG.presets.DRUM_KITS.forEach(function (item) { $("drumKit").appendChild(option(item.id, item.name)); });
    resetSetup(false);
  }
  function currentMood() { return UG.presets.byId(UG.presets.MOODS, $("composeMood").value); }
  function currentStyle() { return UG.styles.byId($("composeStyle").value); }
  function resetSetup(showMessage) {
    var mood = currentMood(), style = currentStyle();
    state.override = {};
    $("keySel").value = 0; $("modeSel").value = "major"; $("rangeSel").value = "middle"; $("motionSel").value = "auto";
    $("progSel").value = style.overrides.progression || mood.progression;
    $("rhythmSel").value = style.overrides.rhythm || mood.rhythm;
    $("bpmSel").value = mood.bpm; $("bpmVal").textContent = mood.bpm + " BPM";
    state.bpm = mood.bpm; state.arrangementTemplateId = "free"; $("arrangementTemplateSel").value = "free";
    $("arrangementTemplateNote").textContent = UG.arrangementTemplate.byId("free").note;
    state.customDrum = null; state.partMix = partMixFromEnsemble(mood.ensemble); syncPartControls();
    if (showMessage) status($("composeStatus"), "初期設定へ戻しました。作成ボタンで反映します。");
  }
  function recipeFromControls() {
    var recipe = compositionCore.defaultRecipe();
    recipe.key = { root:+$("keySel").value, mode:$("modeSel").value };
    if ($("rangeSel").value === "low") { recipe.lo = 52; recipe.hi = 67; }
    else if ($("rangeSel").value === "high") { recipe.lo = 65; recipe.hi = 81; }
    else { recipe.lo = 59; recipe.hi = 75; }
    recipe.stepwise = $("motionSel").value === "leapy" ? 0.25 : 0.78;
    return recipe;
  }
  function overrideFromControls() {
    return {
      progression:$("progSel").value, rhythm:$("rhythmSel").value,
      contour:$("motionSel").value, range:$("rangeSel").value, bpm:+$("bpmSel").value
    };
  }
  function activeMood() {
    var mood = clone(currentMood());
    if ($("motionSel").value !== "auto") mood.contour = $("motionSel").value;
    mood.bpm = +$("bpmSel").value; return mood;
  }
  function composeFromLyrics(options) {
    var opts = options || {};
    try {
      if (opts.newSeed !== false) state.composeSeed = (state.composeSeed + 104729) >>> 0;
      var draft = compositionCore.createDraft({
        title:$("composeTitle").value, lyrics:$("composeLyrics").value,
        moodId:$("composeMood").value, styleId:$("composeStyle").value,
        bpm:+$("bpmSel").value, recipe:recipeFromControls(), override:overrideFromControls(), seed:state.composeSeed
      });
      state.compositionDraft = draft; state.analysis = draft.analysis; state.activeCandidateIndex = 0;
      state.arrangementTemplateId = $("arrangementTemplateSel").value || "free";
      draft.candidates.forEach(function (candidate) { UG.arrangementTemplate.apply(candidate, state.arrangementTemplateId, UG.theory); });
      if (!state.partMix || opts.resetParts) state.partMix = partMixFromEnsemble(currentMood().ensemble);
      selectCompositionCandidate(0, true);
      if (draft.unknown.length) status($("composeStatus"), "案Aを作りました。読みが不明な字: " + draft.unknown.join(" ") + "（漢字(かんじ)の形で指定できます）", "bad");
    } catch (error) { status($("composeStatus"), error.message || "曲を作れませんでした", "bad"); }
  }
  function selectCompositionCandidate(index, newSource) {
    if (!state.compositionDraft || !state.compositionDraft.candidates[index]) return;
    if (!newSource) commitCandidate();
    beginSongChange("曲案を切り替えたため、歌声を作り直してください。");
    state.activeCandidateIndex = index; state.song = clone(state.compositionDraft.candidates[index]);
    state.customDrum = clone(state.song.editorState && state.song.editorState.customDrum) || null;
    state.blueprint = null; state.sourceText = ""; state.sourceType = "自前作曲・案" + ["A","B","C"][index];
    state.pendingMusicXml = null; $("musicxmlPartRow").hidden = true;
    state.title = state.compositionDraft.title; state.lyrics = state.compositionDraft.lyrics; state.bpm = state.compositionDraft.bpm;
    status($("composeStatus"), "案" + ["A","B","C"][index] + "を開きました。下で聴いて、必要な所だけ直せます。", "good");
    renderCurrentSong({ snapshot:!!newSource, scroll:true });
  }

  function syncPartControls() {
    if (!state.partMix) return;
    $("ensembleSel").value = state.partMix.ensembleId;
    ["melody", "chord", "bass"].forEach(function (part) {
      $(part + "Enabled").checked = state.partMix[part].enabled;
      $(part + "Instrument").value = state.partMix[part].instrument;
    });
    $("drumEnabled").checked = state.partMix.drum.enabled; $("drumKit").value = state.partMix.drum.kit;
  }
  function markCustomEnsemble() { state.partMix.ensembleId = "custom"; $("ensembleSel").value = "custom"; }
  function chordChoiceGroups(key, currentChord) {
    var romans = ["I","II","III","IV","V","VI","VII"], groups = [], seen = {};
    function group(label) { var value = { label:label, items:[] }; groups.push(value); return value; }
    function add(target, chord, label) {
      var value = chord.root + ":" + chord.type; if (seen[value]) return; seen[value] = true;
      target.items.push({ value:value, label:label + " · " + UG.theory.chordName(chord) });
    }
    var current = group("現在"); add(current, currentChord, "現在");
    var diatonic = group("この調で使いやすいコード");
    for (var degree = 0; degree < 7; degree++) {
      var base = UG.theory.chordOfDegree(key, degree, "auto"); add(diatonic, base, romans[degree]);
      var seventh = base.type === "maj" ? (degree === 4 ? "dom7" : "maj7") : (base.type === "min" ? "min7" : "m7b5");
      add(diatonic, { root:base.root, type:seventh }, romans[degree] + " 7th");
    }
    var colors = group("同じ根音の別の響き");
    Object.keys(UG.theory.CHORD_SHAPES).forEach(function (type) { add(colors, { root:currentChord.root, type:type }, UG.theory.NAMES[currentChord.root]); });
    return groups.filter(function (entry) { return entry.items.length; });
  }
  function renderChordEditor() {
    var box = $("chordEditor"); clearChildren(box);
    if (!state.song || isFullScore(state.song)) return;
    (state.song.chords || []).forEach(function (chord, index) {
      var slot = document.createElement("div"); slot.className = "chord-slot";
      var label = document.createElement("label"); label.textContent = "進行 " + (index + 1);
      var select = document.createElement("select");
      chordChoiceGroups(state.song.key, chord).forEach(function (choiceGroup) {
        var group = document.createElement("optgroup"); group.label = choiceGroup.label;
        choiceGroup.items.forEach(function (choice) { group.appendChild(option(choice.value, choice.label)); }); select.appendChild(group);
      });
      select.value = chord.root + ":" + chord.type;
      select.addEventListener("change", function () {
        var parts = this.value.split(":"); state.song.chords[index] = { root:+parts[0], type:parts[1] };
        var at = index * 16, event = (state.song.chordEvents || []).find(function (item) { return item.s === at; });
        if (event) event.chord = clone(state.song.chords[index]);
        rebuildBacking(); renderChordEditor(); toast("進行" + (index + 1) + "を " + UG.theory.chordName(state.song.chords[index]) + " に変更しました");
      });
      slot.appendChild(label); slot.appendChild(select); box.appendChild(slot);
    });
  }
  function renderDrumGrid() {
    var box = $("drumGrid"); clearChildren(box);
    if (!state.song || isFullScore(state.song)) return;
    var rhythm = state.song.rhythm || UG.presets.byId(UG.presets.RHYTHMS, $("rhythmSel").value);
    var pattern = state.customDrum || UG.editor.patternFromRhythm(rhythm);
    [{ key:"kick", label:"Kick" }, { key:"snare", label:"Snare" }, { key:"hat", label:"Hi-Hat" }].forEach(function (row) {
      var label = document.createElement("span"); label.className = "drum-label"; label.textContent = row.label; box.appendChild(label);
      for (var step = 0; step < 16; step++) {
        (function (kind, at) {
          var button = document.createElement("button"); button.type = "button"; button.className = "drum-step" + (at % 4 === 0 ? " beat" : "");
          button.setAttribute("aria-label", row.label + " " + (at + 1)); button.setAttribute("aria-pressed", pattern[kind].indexOf(at) >= 0 ? "true" : "false");
          button.addEventListener("click", function () {
            state.customDrum = UG.editor.togglePattern(state.customDrum || pattern, kind, at);
            state.song.drum = UG.editor.buildDrums(state.customDrum, state.song.bars);
            state.song.editorState = state.song.editorState || {};
            state.song.editorState.customDrum = clone(state.customDrum);
            if (UG.performancePass) UG.performancePass.apply(state.song, state.analysis, state.song.candidateInfo || {}, { drumVariation:false });
            commitCandidate(); renderDrumGrid(); stage.setSong(state.song, state.song.key); renderDiagnosis();
          });
          box.appendChild(button);
        })(row.key, step);
      }
    });
  }
  function rebuildBacking() {
    if (!state.song || isFullScore(state.song)) return;
    var rhythm = state.song.rhythm || UG.presets.byId(UG.presets.RHYTHMS, $("rhythmSel").value);
    var backing = state.song.chordEvents && UG.songSheet && UG.songSheet.buildBacking
      ? UG.songSheet.buildBacking(state.song.melody, state.song.chords, state.song.chordEvents, rhythm, state.song.bars)
      : UG.compose.backing(state.song.melody, state.song.chords, rhythm);
    state.song.bass = backing.bass; state.song.pad = backing.pad; state.song.bars = backing.bars;
    state.song.drum = state.customDrum ? UG.editor.buildDrums(state.customDrum, backing.bars) : backing.drum;
    if (UG.performancePass) UG.performancePass.apply(state.song, state.analysis, state.song.candidateInfo || {}, { drumVariation:!state.customDrum });
    UG.arrangementTemplate.apply(state.song, state.arrangementTemplateId, UG.theory);
    commitCandidate(); stage.setSong(state.song, state.song.key); renderDiagnosis(); renderDrumGrid();
  }
  function shiftMelody(semitones) {
    if (!state.song) return;
    invalidateVoice("音の高さを変えたため、古い歌声を外しました。");
    state.song.melody = UG.editor.shiftMelody(state.song.melody, semitones, state.song.key);
    updateSongRange(); commitCandidate(); stage.setSong(state.song, state.song.key); renderDiagnosis();
    toast((semitones > 0 ? "+" : "") + semitones + "半音動かしました");
  }

  function analysisFromLyrics(lyrics, title) {
    try { return UG.lyricsAnalyzer.analyze(lyrics || "", { title:title || "", mode:"standard" }); }
    catch (_) { return null; }
  }
  function showImportReport(report) {
    var value = report || { read:[], filled:[], skipped:[], errors:[] };
    $("importReport").hidden = false;
    function fill(id, items, empty) {
      var list = $(id); clearChildren(list); var values = items && items.length ? items : [empty];
      values.forEach(function (message) { var item = document.createElement("li"); item.textContent = message; list.appendChild(item); });
    }
    fill("reportRead", value.read, "まだありません");
    fill("reportFilled", value.filled || [], "補完なし");
    fill("reportWarnings", value.warnings || [], "報告された注意なし（完全再現の保証ではありません）");
    fill("reportSkipped", (value.errors || []).map(function (x) { return "エラー: " + x; }).concat(value.skipped || []), "破棄なし");
  }
  function applySongResult(result, sourceType, sourceText, blueprint) {
    showImportReport(result.report);
    if (!result.song) {
      status($("importStatus"), (result.report.errors || [])[0] || "歌える音符を読み取れませんでした。報告を確認してください。", "bad");
      return false;
    }
    beginSongChange("別の曲を読み込んだため、歌声を作り直してください。");
    state.song = result.song; state.title = result.title || "無題の曲"; state.bpm = result.bpm || 100;
    state.lyrics = result.lyrics || ""; state.sourceType = sourceType; state.sourceText = sourceText || ""; state.blueprint = blueprint || null;
    state.analysis = result.analysis || analysisFromLyrics(state.lyrics, state.title); state.compositionDraft = null; state.activeCandidateIndex = -1;
    state.customDrum = clone(state.song.editorState && state.song.editorState.customDrum) || null; state.arrangementTemplateId = "free";
    state.partMix = partMixFromEnsemble(currentMood().ensemble);
    if (sourceType !== "MusicXML") { state.pendingMusicXml = null; $("musicxmlPartRow").hidden = true; }
    $("composeTitle").value = state.title; $("composeLyrics").value = state.lyrics || "";
    $("bpmSel").value = Math.max(60, Math.min(180, state.bpm)); $("bpmVal").textContent = state.bpm + " BPM";
    if (state.song.key) { $("keySel").value = state.song.key.root; $("modeSel").value = state.song.key.mode; }
    if (state.song.rhythm && state.song.rhythm.id && Array.from($("rhythmSel").options).some(function (node) { return node.value === state.song.rhythm.id; })) $("rhythmSel").value = state.song.rhythm.id;
    $("arrangementTemplateSel").value = "free"; $("arrangementTemplateNote").textContent = UG.arrangementTemplate.byId("free").note;
    status($("importStatus"), sourceType + "を読み込みました。何を補ったかは下の報告で確認できます。", "good");
    renderCurrentSong({ snapshot:true, scroll:true }); return true;
  }
  function applyProjectDocument(document) {
    var ai = document.extensions && document.extensions.aiScore || {}, rendering = document.rendering || {}, composition = ai.composition || {};
    beginSongChange("Projectの曲を読み込んだため、歌声を作り直してください。");
    state.song = clone(document.song); state.blueprint = ai.blueprint ? clone(ai.blueprint) : null; state.sourceText = ai.sourceText || "";
    state.sourceType = "Project v2" + (document.origin ? "（" + document.origin + "）" : ""); state.title = document.title; state.lyrics = document.lyrics;
    state.bpm = document.transport.bpm; state.analysis = analysisFromLyrics(state.lyrics, state.title); state.compositionDraft = null; state.activeCandidateIndex = -1;
    state.partMix = normalizePartMix(rendering.partMix); state.customDrum = clone(rendering.customDrum || (state.song.editorState && state.song.editorState.customDrum));
    state.arrangementTemplateId = rendering.arrangementTemplateId || "free";
    function setKnown(id, value) {
      if (value === undefined || value === null) return;
      var select = $(id); if (Array.from(select.options).some(function (node) { return node.value === String(value); })) select.value = String(value);
    }
    if (composition.moodId) setKnown("composeMood", composition.moodId);
    if (composition.styleId) setKnown("composeStyle", composition.styleId);
    if (composition.override) state.override = clone(composition.override);
    if (Number.isFinite(+composition.seed)) state.composeSeed = +composition.seed;
    $("composeTitle").value = state.title || ""; $("composeLyrics").value = state.lyrics || "";
    if (state.song.key) { setKnown("keySel", state.song.key.root); setKnown("modeSel", state.song.key.mode); }
    setKnown("arrangementTemplateSel", state.arrangementTemplateId);
    $("arrangementTemplateNote").textContent = UG.arrangementTemplate.byId($("arrangementTemplateSel").value).note;
    setKnown("progSel", composition.override && composition.override.progression);
    setKnown("rhythmSel", composition.override && composition.override.rhythm);
    setKnown("motionSel", composition.override && composition.override.contour);
    setKnown("rangeSel", composition.override && composition.override.range);
    var restoredBpm = composition.override && composition.override.bpm || state.bpm;
    $("bpmSel").value = Math.max(60, Math.min(180, restoredBpm)); $("bpmVal").textContent = state.bpm + " BPM";
    state.pendingMusicXml = null; $("musicxmlPartRow").hidden = true;
    showImportReport({ read:["共通Project v2", (state.song.melody || []).length + "歌唱音"], filled:[], skipped:[], errors:[] });
    status($("importStatus"), "共通Project v2を読み込みました。編集設定も復元しました。", "good"); renderCurrentSong({ snapshot:true, scroll:true }); return true;
  }
  function applyBlueprintText(text) {
    try {
      var parsed = UG.blueprint.parse(text);
      return applySongResult({ song:parsed.song, title:parsed.blueprint.title, bpm:parsed.blueprint.bpm, lyrics:parsed.blueprint.lyrics || "", report:{ read:["Blueprint v1", parsed.song.importedTracks.length + "トラック", parsed.song.melody.length + "歌唱音"], filled:parsed.diagnostics.warnings || [], skipped:[], errors:[] } }, "AI設計図", text, parsed.blueprint);
    } catch (error) {
      showImportReport({ read:[], filled:[], skipped:[], errors:[error.message || "Blueprintを読めませんでした"] });
      status($("importStatus"), error.message || "設計図を読めません", "bad"); return false;
    }
  }
  function populateMusicXmlParts(result) {
    state.pendingMusicXml = result;
    var row = $("musicxmlPartRow"), select = $("musicxmlPartSelect"); clearChildren(select);
    (result.parts || []).forEach(function (part) { select.appendChild(option(part.id, part.name + "（歌詞" + part.lyricCount + "・" + part.noteCount + "音）")); });
    if (result.selectedPartId) select.value = result.selectedPartId;
    row.hidden = !(result.parts && result.parts.length > 1);
  }
  function applyMusicXmlText(text, requestedPartId) {
    var result = UG.musicxmlImport.parse(text, requestedPartId ? { partId:requestedPartId } : {});
    populateMusicXmlParts(result);
    return applySongResult(result, "MusicXML", text, null);
  }
  function detectAndApplyText(text) {
    var source = String(text || "").trim();
    if (!source) { status($("importStatus"), "曲シートかファイルを入れてください。", "bad"); return false; }
    if (/^<\?xml|^<score-partwise/i.test(source)) return applyMusicXmlText(source);
    if (/^\s*\{/.test(source)) {
      try {
        var document = projectV2.tryDecode(source); if (document) return applyProjectDocument(document);
      } catch (projectError) {
        showImportReport({ read:[], filled:[], skipped:[], errors:[projectError.message] }); status($("importStatus"), projectError.message, "bad"); return false;
      }
      return applyBlueprintText(source);
    }
    var result = UG.songSheet.parse(source, { preserve:!$("completeSheet").checked });
    return applySongResult(result, "AI曲シート", source, null);
  }
  function readFile(file, binary) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error("ファイルを開けませんでした")); };
      if (binary) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    });
  }
  function loadMidiBuffer(buffer, fileName) {
    try {
      var parsed = UG.smf.parse(buffer), song = UG.smf.toSong(parsed, { fileName:fileName });
      showImportReport({ read:[fileName, song.importedTracks.length + "トラック", song.importedMidiInfo.noteCount + "音"], filled:[], skipped:[], errors:[] });
      return applySongResult({ song:song, title:fileName.replace(/\.(mid|midi)$/i, ""), bpm:parsed.bpm, lyrics:(song.importedMidiInfo && song.importedMidiInfo.lyricText) || "", report:{ read:["MIDI", song.importedTracks.length + "トラック", song.importedMidiInfo.noteCount + "音"], filled:[], skipped:[], errors:[] } }, "MIDI", "", null);
    } catch (error) {
      showImportReport({ read:[], filled:[], skipped:[], errors:[error.message || "MIDIを読めません"] }); status($("importStatus"), error.message || "MIDIを読めません", "bad"); return false;
    }
  }
  function processFile(file) {
    var extension = (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
    if (extension === ".pdf") {
      showImportReport({ read:[], filled:[], skipped:["一般の五線譜PDFは正確に読めないため使用しません"], errors:["PDFには対応していません。AI曲シートかMusicXMLを使ってください"] });
      status($("importStatus"), "PDFには対応していません。曲シートかMusicXMLを使ってください。", "bad"); return Promise.resolve(false);
    }
    var limit = extension === ".mid" || extension === ".midi" ? 20 * 1024 * 1024
      : extension === ".musicxml" || extension === ".xml" ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > limit) {
      var limitMb = Math.round(limit / 1024 / 1024), message = "ファイルが大きすぎます（最大" + limitMb + "MB）。";
      showImportReport({ read:[], filled:[], skipped:[file.name], errors:[message] }); status($("importStatus"), message, "bad"); return Promise.resolve(false);
    }
    if ([".mid",".midi",".musicxml",".xml",".txt",".md",".json",".aiscore"].indexOf(extension) < 0) {
      showImportReport({ read:[], filled:[], skipped:[file.name], errors:["この種類のファイルには対応していません"] });
      status($("importStatus"), "TXT / MD / JSON / MIDI / MusicXMLを選んでください。", "bad"); return Promise.resolve(false);
    }
    if (extension === ".mid" || extension === ".midi") return readFile(file, true).then(function (buffer) { return loadMidiBuffer(buffer, file.name); });
    return readFile(file, false).then(function (text) {
      if (extension !== ".musicxml" && extension !== ".xml") $("blueprintText").value = text;
      return extension === ".musicxml" || extension === ".xml" ? applyMusicXmlText(text) : detectAndApplyText(text);
    });
  }

  function pipelineReset() { clearChildren($("pipelineProgress")); $("pipelineProgress").hidden = false; }
  function pipelineStep(message, kind) {
    var item = document.createElement("li"); item.textContent = message; if (kind) item.className = kind; $("pipelineProgress").appendChild(item); return item;
  }
  function processUnified(runAll) {
    if (state.importBusy) { toast("いまの読み込みが終わるまで待ってください"); return Promise.resolve(false); }
    var button = runAll ? $("allInOneBtn") : $("importOnlyBtn"), original = button.textContent;
    state.importBusy = true; $("importOnlyBtn").disabled = true; $("allInOneBtn").disabled = true; $("openUnifiedFileBtn").disabled = true; $("unifiedFile").disabled = true;
    pipelineReset(); pipelineStep("1. 入力形式を判別して読み込みます…");
    var action = state.selectedFile ? processFile(state.selectedFile) : Promise.resolve(detectAndApplyText($("blueprintText").value));
    return action.then(function (opened) {
      if (!opened || !state.song) throw new Error("曲を開けませんでした。読み込み報告を確認してください");
      $("pipelineProgress").lastChild.className = "done"; $("pipelineProgress").lastChild.textContent = "1. 曲を読み込みました";
      pipelineStep("2. 伴奏・演奏表現を確認しました", "done"); pipelineStep("3. 診断しました（" + currentReport().issues.length + "件）", "done");
      if (!runAll) return true;
      if (!hasSingingLyrics()) {
        pipelineStep("4. 歌詞の割当なし：歌声生成は省略します", "done");
        return exportMix(true).then(function () { pipelineStep("5. 楽器のみのWAVを保存しました", "done"); return true; });
      }
      var voiceStep = pipelineStep("4. NEUTRINOで歌声を生成しています…");
      return generateVoice().then(function () {
        voiceStep.className = "done"; voiceStep.textContent = "4. 歌声を生成しました";
        var mixStep = pipelineStep("5. 伴奏と歌声をWAVへ書き出しています…");
        return exportMix(true).then(function () { mixStep.className = "done"; mixStep.textContent = "5. 完成WAVを保存しました"; return true; });
      });
    }).catch(function (error) {
      pipelineStep("ここで停止: " + (error.message || error), "bad");
      status($("importStatus"), (state.song ? "途中までの曲は残しています。" : "曲を開けませんでした。") + (error.message || error) + " 読み込み報告を確認してください。", "bad"); return false;
    }).finally(function () {
      state.importBusy = false; $("importOnlyBtn").disabled = false; $("allInOneBtn").disabled = false; $("openUnifiedFileBtn").disabled = false; $("unifiedFile").disabled = false; button.textContent = original;
    });
  }

  function repair() {
    if (!state.song) return;
    var result = UG.midiDoctor.repair(state.song); if (!result.changed) { toast("直すところはありませんでした"); return; }
    invalidateVoice("音符を修復したため、古い歌声を外しました。"); updateSongRange(); commitCandidate();
    stage.setSong(state.song, state.song.key); renderDiagnosis(); snapshot(); toast(result.log.join(" / "));
  }
  function play() {
    if (!state.song) return; $("playBtn").textContent = "再生中…";
    UG.audio.play(state.song, state.bpm, playbackSettings(false), function (head) { stage.setHead(head); if (head < 0) $("playBtn").textContent = "▶ 再生"; })
      .catch(function (error) { $("playBtn").textContent = "▶ 再生"; toast(error.message || "再生できません"); });
  }
  function saveMidi() { if (state.song) download(UG.smf.build(state.song, state.bpm, playbackSettings(true)), "audio/midi", safeName() + ".mid"); }
  function saveXml() { try { download(UG.musicxml.build(state.song, state.bpm, state.title), "application/vnd.recordare.musicxml+xml", safeName() + ".musicxml"); } catch (error) { toast(error.message); } }
  function saveUstx() {
    try {
      if (!state.song) throw new Error("先に曲を作るか開いてください");
      download(UG.ustx.build(state.song, state.bpm, state.title), "application/x-openutau-project", safeName() + ".ustx");
      toast("OpenUtau用USTXを保存しました。OpenUtauで開いて歌声を選んでください");
    } catch (error) { toast(error.message || "USTXを保存できませんでした"); }
  }
  function saveProject() {
    if (!state.song) { toast("先に曲を開いてください"); return; }
    var value = projectV2.create({
      origin:"ai-score-studio", title:state.title, lyrics:state.lyrics, bpm:state.bpm, song:state.song,
      rendering:{ partMix:clone(state.partMix), customDrum:clone(state.customDrum), arrangementTemplateId:state.arrangementTemplateId },
      extensions:{ aiScore:{ sourceType:state.sourceType, sourceText:state.sourceText, blueprint:clone(state.blueprint), composition:{
        moodId:$("composeMood").value, styleId:$("composeStyle").value, seed:state.composeSeed,
        override:overrideFromControls(), activeCandidateIndex:state.activeCandidateIndex
      } } }
    });
    download(projectV2.encode(value), "application/json", safeName() + ".aiscore.json"); toast("共通Project v2を保存しました");
  }

  function loadVoices() {
    fetch("/api/voices", { cache:"no-store" }).then(function (response) { if (!response.ok) throw new Error("ローカル歌声サーバーへ接続できません"); return response.json(); }).then(function (payload) {
      var voices = payload.voices || [], select = $("voiceSelect"); clearChildren(select);
      voices.forEach(function (voice) { var node = option(voice.id, voice.label + "（" + voice.id + " / " + voice.version + "）"); if (voice.id === "AKANE") node.selected = true; select.appendChild(node); });
      status($("voiceStatus"), voices.length + "種類の歌声を使えます。歌詞付きの音符が必要です。", "good"); $("generateVoiceBtn").disabled = !voices.length || !hasSingingLyrics();
    }).catch(function (error) { $("voiceSelect").innerHTML = '<option value="">接続できません</option>'; status($("voiceStatus"), error.message, "bad"); });
  }
  function generateVoice() {
    if (!state.song) return Promise.reject(new Error("先に曲を開いてください"));
    if (!hasSingingLyrics()) return Promise.reject(new Error("歌詞の割当がありません。楽器曲として再生・WAV保存できます。"));
    var model = $("voiceSelect").value, xml;
    if (!model) return Promise.reject(new Error("歌声を選べません"));
    try { xml = UG.musicxml.build(state.song, state.bpm, state.title); } catch (error) { return Promise.reject(error); }
    if (state.voiceAbort) { try { state.voiceAbort.abort(); } catch (_) { /* already finished */ } }
    var revision = state.songRevision, requestId = ++state.voiceRequestId;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var vocalName = safeName() + "-" + model.toLowerCase() + ".wav";
    state.voiceAbort = controller;
    function assertCurrent() {
      if (revision !== state.songRevision || requestId !== state.voiceRequestId) {
        var stale = new Error("曲が変わったため、古い歌声生成を中止しました"); stale.code = "STALE_VOICE"; throw stale;
      }
    }
    $("generateVoiceBtn").disabled = true; status($("voiceStatus"), "歌声を生成しています。長い曲は数分かかります…");
    return fetch("/api/neutrino/render", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ model:model, musicxml:xml }), signal:controller ? controller.signal : undefined })
      .then(function (response) {
        if (response.ok) return response.blob();
        return response.json().catch(function () { return {}; }).then(function (payload) { throw new Error(payload.error || "歌声生成に失敗しました"); });
      }).then(function (blob) {
        assertCurrent(); return blob.arrayBuffer().then(function (buffer) { return { blob:blob, buffer:buffer }; });
      }).then(function (data) {
        assertCurrent(); state.vocalBlob = data.blob; state.vocalName = vocalName; return UG.audio.loadVocal(data.buffer, vocalName);
      })
      .then(function (info) {
        try { assertCurrent(); } catch (error) { UG.audio.clearVocal(); state.vocalBlob = null; state.vocalName = ""; throw error; }
        UG.audio.setVocalVolume(+$("voiceVolume").value / 100); $("saveVoiceBtn").disabled = false;
        status($("voiceStatus"), "歌声を生成しました（" + Math.round(info.duration) + "秒）。再生時はガイドメロディを自動で消します。", "good"); toast("歌声を生成しました"); return info;
      }).catch(function (error) {
        if (requestId === state.voiceRequestId) {
          var cancelled = error && (error.name === "AbortError" || error.code === "STALE_VOICE");
          status($("voiceStatus"), cancelled ? "曲が変わったため、古い歌声生成を中止しました。" : (error.message || "歌声生成に失敗しました"), cancelled ? "" : "bad");
        }
        throw error;
      }).finally(function () {
        if (requestId !== state.voiceRequestId) return;
        state.voiceAbort = null; $("generateVoiceBtn").disabled = !$("voiceSelect").value || !hasSingingLyrics();
      });
  }
  function exportMix(shouldDownload) {
    if (!state.song || !UG.audio.canExportMix()) return Promise.reject(new Error("SoundFontの準備が終わっていません"));
    var button = $("saveMixBtn"), original = button.textContent; button.disabled = true; button.textContent = "書き出し中…";
    return UG.audio.exportMix(state.song, state.bpm, playbackSettings(false)).then(function (result) {
      if (shouldDownload !== false) download(result.bytes, "audio/wav", safeName() + (result.hadVocal ? "-歌入り" : "-伴奏") + ".wav");
      toast("WAVを書き出しました"); return result;
    }).finally(function () { button.disabled = false; button.textContent = original; });
  }

  function resetSeparatedResults() {
    [$("separatedVocalAudio"), $("separatedBackingAudio")].forEach(function (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); });
    $("separatorResults").hidden = true; state.separation = null;
  }
  function selectSeparatorFile(file) {
    if (!file) return;
    var extension = (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
    if ([".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac"].indexOf(extension) < 0) { status($("separatorStatus"), "WAV / MP3 / FLAC / M4Aの音源を選んでください。", "bad"); return; }
    if (file.size > 300 * 1024 * 1024) { status($("separatorStatus"), "音源が大きすぎます（最大300MB）。", "bad"); return; }
    resetSeparatedResults(); state.separatorFile = file; $("separatorFileName").textContent = file.name; $("separateBtn").disabled = false;
    status($("separatorStatus"), Math.max(1, Math.round(file.size / 1024 / 1024)) + "MBの音源を選びました。", "good");
  }
  function separateAudio() {
    if (!state.separatorFile) return;
    var button = $("separateBtn"), file = state.separatorFile; button.disabled = true; button.textContent = "分離中…"; $("openSeparatorBtn").disabled = true;
    status($("separatorStatus"), "GPUで歌声と伴奏を分離しています。曲の長さにより数分かかります…");
    fetch("/api/separator/separate", { method:"POST", headers:{ "Content-Type":"application/octet-stream", "X-File-Name":encodeURIComponent(file.name) }, body:file })
      .then(function (response) { if (response.ok) return response.json(); return response.json().catch(function () { return {}; }).then(function (payload) { throw new Error(payload.error || "音源分離に失敗しました"); }); })
      .then(function (payload) {
        state.separation = payload; $("separatedVocalAudio").src = payload.stems.vocals.url; $("separatedBackingAudio").src = payload.stems.backing.url;
        $("separatorResults").hidden = false; status($("separatorStatus"), "分離できました。歌声と伴奏を試聴・保存できます。", "good"); toast("歌声を抽出しました");
      }).catch(function (error) { status($("separatorStatus"), error.message || "音源分離に失敗しました", "bad"); })
      .finally(function () { button.disabled = !state.separatorFile; button.textContent = "歌声を抽出"; $("openSeparatorBtn").disabled = false; });
  }
  function saveSeparated(stem) {
    var item = state.separation && state.separation.stems && state.separation.stems[stem]; if (!item) return;
    fetch(item.url).then(function (response) { if (!response.ok) throw new Error("分離音声を取得できません"); return response.blob(); })
      .then(function (blob) { download(blob, "audio/wav", item.name); toast(item.name + " を保存しました"); }).catch(function (error) { toast(error.message); });
  }
  function checkSeparator() {
    fetch("/api/health", { cache:"no-store" }).then(function (response) { return response.json(); }).then(function (payload) {
      if (!payload.separatorAvailable) { $("openSeparatorBtn").disabled = true; status($("separatorStatus"), "ローカル音源分離器が見つかりません。", "bad"); }
    }).catch(function () { /* voice status reports server failures */ });
  }
  function initAudio() {
    var built = window.UTA_GENKO_BUILTIN_SOUNDFONT;
    if (!built || typeof built.load !== "function") { status($("audioStatus"), "内蔵SoundFontが見つかりません。Current Synthを使います。", "bad"); return; }
    built.load().then(function (buffer) { return UG.audio.configureBackend("spessasynth", { soundFontBuffer:buffer, soundFontName:built.name }); }).then(function (result) {
      status($("audioStatus"), result.fallback ? "SoundFontを読めずCurrent Synthを使います。" : "内蔵SoundFont準備完了。楽器音で再生できます。", result.fallback ? "bad" : "good");
      $("saveMixBtn").disabled = !UG.audio.canExportMix();
    }).catch(function (error) { status($("audioStatus"), error.message || "音源を準備できません", "bad"); });
  }

  function bindEvents() {
    Array.from(document.querySelectorAll("[data-scroll-target]")).forEach(function (button) {
      button.onclick = function () { if (!this.disabled) scrollToPanel(this.getAttribute("data-scroll-target")); };
    });
    $("startComposeBtn").onclick = function () { scrollToPanel("createPanel"); $("composeTitle").focus(); };
    $("startImportBtn").onclick = function () { $("aiImportPanel").open = true; scrollToPanel("aiImportPanel"); };
    $("composeBtn").onclick = function () { composeFromLyrics({ newSeed:true }); };
    $("newCandidatesBtn").onclick = function () { if (state.compositionDraft) composeFromLyrics({ newSeed:true }); };
    $("motifBtn").onclick = function () {
      if (!state.song) return; invalidateVoice("メロディを変えたため、古い歌声を外しました。");
      var repeated = UG.songSketch.strengthenMotif(state.song, state.analysis); updateSongRange(); commitCandidate(); stage.setSong(state.song, state.song.key); renderDiagnosis();
      toast(repeated ? "似たフレーズの反復を強めました" : "反復できる近いフレーズがありませんでした");
    };
    $("chorusLiftBtn").onclick = function () {
      if (!state.song) return; invalidateVoice("メロディを変えたため、古い歌声を外しました。");
      var lifted = UG.songSketch.liftChorus(state.song, state.analysis); updateSongRange(); commitCandidate(); stage.setSong(state.song, state.song.key); renderDiagnosis();
      toast(lifted ? "サビ候補を少し高くしました" : "サビ候補が見つかりませんでした");
    };
    $("melodyOctaveDown").onclick = function () { shiftMelody(-12); }; $("melodyDown").onclick = function () { shiftMelody(-1); };
    $("melodyUp").onclick = function () { shiftMelody(1); }; $("melodyOctaveUp").onclick = function () { shiftMelody(12); };
    $("repairBtn").onclick = repair;

    $("composeMood").onchange = function () { state.partMix = partMixFromEnsemble(currentMood().ensemble); resetSetup(false); status($("composeStatus"), "雰囲気を変えました。作成ボタンで3案へ反映します。"); };
    $("composeStyle").onchange = function () { var style = currentStyle(), mood = currentMood(); $("progSel").value = style.overrides.progression || mood.progression; $("rhythmSel").value = style.overrides.rhythm || mood.rhythm; status($("composeStatus"), "音楽の型を変えました。作成ボタンで反映します。"); };
    $("bpmSel").oninput = function () { $("bpmVal").textContent = this.value + " BPM"; };
    $("resetTweak").onclick = function () { resetSetup(true); };
    $("arrangementTemplateSel").onchange = function () {
      state.arrangementTemplateId = this.value; var template = UG.arrangementTemplate.byId(this.value); $("arrangementTemplateNote").textContent = template.note;
      if (template.id !== "free") {
        $("keySel").value = template.key.root; $("modeSel").value = template.key.mode; $("progSel").value = template.progression; $("rhythmSel").value = template.rhythm;
        $("bpmSel").value = template.bpm; $("bpmVal").textContent = template.bpm + " BPM"; state.partMix = partMixFromEnsemble(template.ensemble);
        state.partMix.melody.instrument = template.melody; state.partMix.chord.instrument = template.chord; state.partMix.bass.instrument = template.bass; state.partMix.drum.kit = template.drum; syncPartControls();
      }
      status($("composeStatus"), "編曲テンプレートを選びました。作成ボタンで安全に作り直して反映します。");
    };

    $("ensembleSel").onchange = function () { state.partMix = partMixFromEnsemble(this.value); syncPartControls(); };
    ["melody", "chord", "bass"].forEach(function (part) {
      $(part + "Enabled").onchange = function () { state.partMix[part].enabled = this.checked; markCustomEnsemble(); };
      $(part + "Instrument").onchange = function () { state.partMix[part].instrument = this.value; markCustomEnsemble(); };
    });
    $("drumEnabled").onchange = function () { state.partMix.drum.enabled = this.checked; markCustomEnsemble(); };
    $("drumKit").onchange = function () { state.partMix.drum.kit = this.value; markCustomEnsemble(); };

    $("playBtn").onclick = play; $("stopBtn").onclick = function () { UG.audio.stop(); stage.setHead(-1); $("playBtn").textContent = "▶ 再生"; };
    $("saveMidiBtn").onclick = saveMidi; $("saveXmlBtn").onclick = saveXml; $("saveUstxBtn").onclick = saveUstx; $("saveProjectBtn").onclick = saveProject; $("saveMixBtn").onclick = function () { exportMix(true).catch(function (error) { toast(error.message); }); };
    $("generateVoiceBtn").onclick = function () { generateVoice().catch(function () {}); };
    $("voiceSelect").onchange = function () {
      beginSongChange("歌手を変更しました。この声で歌わせるボタンで作り直してください。");
      $("generateVoiceBtn").disabled = !$("voiceSelect").value || !hasSingingLyrics();
    };
    $("saveVoiceBtn").onclick = function () { if (state.vocalBlob) download(state.vocalBlob, "audio/wav", state.vocalName); };
    $("clearVoiceBtn").onclick = function () { clearVoice("歌声を外しました。"); };
    $("voiceVolume").oninput = function () { $("voiceVolumeOut").textContent = this.value + "%"; UG.audio.setVocalVolume(+this.value / 100); };

    $("copySongSheetPromptBtn").onclick = function () { copyText(UG.songSheet.prompt(), "AI曲シート用の指示をコピーしました"); };
    $("copyStandardPromptBtn").onclick = function () {
      copyText([
        "これから伝える希望に合わせて、オリジナルの曲を作ってください。ジャンル・構成・編成は希望に合わせて自由に選んでください。歌を頼んでいなければ歌詞は不要です。",
        "受け取り先はローカルのAI譜面スタジオです。専用JSONは不要です。",
        "ファイル生成ができる場合：楽器曲はトラック別の標準MIDI、歌ものは音符と読み仮名を対応させたMusicXMLを渡してください。両方作る場合は同じ譜面から出力してください。",
        "ファイル生成ができない場合：架空のダウンロードリンクを作らず、MusicXMLのテキストを省略せず出してください。長い曲はまず短い試聴用セクションから作ってください。",
        "このアプリのMIDIテンポ変化や細かな演奏制御の再現は未保証です。使用した拍子・テンポ変化・特殊な奏法は別途知らせてください。曲の音楽性を数値基準に無理に合わせる必要はありません。",
        "依頼内容：（ここへ作りたい曲の希望を書く）"
      ].join("\n\n"), "汎用の作曲依頼をコピーしました");
    };
    $("songSheetSampleBtn").onclick = function () { clearUnifiedSelection(false); $("blueprintText").value = UG.songSheet.sample(); status($("importStatus"), "曲シート見本を入れました。「読み込んで編集へ」で確認できます。"); };
    $("copyBlueprintPromptBtn").onclick = function () { copyText(UG.blueprint.prompt(), "Blueprint用の完全な指示をコピーしました"); };
    $("blueprintSampleBtn").onclick = function () { clearUnifiedSelection(false); $("blueprintText").value = UG.blueprint.sample(); status($("importStatus"), "Blueprint見本を入れました。"); };
    $("importOnlyBtn").onclick = function () { processUnified(false); }; $("allInOneBtn").onclick = function () { processUnified(true); };
    $("blueprintText").oninput = function () { clearUnifiedSelection(false); $("unifiedFileName").textContent = "貼り付けた曲シートを使います"; };
    $("openUnifiedFileBtn").onclick = function () { $("unifiedFile").click(); };
    $("clearUnifiedFileBtn").onclick = function () { clearUnifiedSelection(true); };
    $("unifiedFile").onchange = function () { selectUnifiedFile(this.files && this.files[0]); };
    $("unifiedFileDrop").ondragover = function (event) { event.preventDefault(); this.classList.add("drag"); };
    $("unifiedFileDrop").ondragleave = function () { this.classList.remove("drag"); };
    $("unifiedFileDrop").ondrop = function (event) { event.preventDefault(); this.classList.remove("drag"); var file = event.dataTransfer.files && event.dataTransfer.files[0]; if (!selectUnifiedFile(file)) return; processUnified(false); };
    $("applyMusicxmlPartBtn").onclick = function () {
      if (!state.pendingMusicXml) return; applyMusicXmlText(state.pendingMusicXml.source, $("musicxmlPartSelect").value);
    };

    $("openSeparatorBtn").onclick = function () { $("separatorFile").click(); }; $("separatorFile").onchange = function () { selectSeparatorFile(this.files && this.files[0]); };
    $("separatorDrop").ondragover = function (event) { event.preventDefault(); this.classList.add("drag"); }; $("separatorDrop").ondragleave = function () { this.classList.remove("drag"); };
    $("separatorDrop").ondrop = function (event) { event.preventDefault(); this.classList.remove("drag"); selectSeparatorFile(event.dataTransfer.files && event.dataTransfer.files[0]); };
    $("separateBtn").onclick = separateAudio; $("saveSeparatedVocalBtn").onclick = function () { saveSeparated("vocals"); }; $("saveSeparatedBackingBtn").onclick = function () { saveSeparated("backing"); };

    function openHelp() { var dialog = $("helpDialog"); if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
    function closeHelp() { var dialog = $("helpDialog"); if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
    $("helpBtn").onclick = openHelp; $("helpCloseBtn").onclick = closeHelp;
    $("helpStartBtn").onclick = function () { closeHelp(); $("composeLyrics").focus(); $("composeLyrics").scrollIntoView({ behavior:"smooth", block:"center" }); };
  }

  $("createPanel").insertAdjacentElement("beforebegin", $("aiImportPanel"));
  updateWorkflow(false);
  populateComposer(); bindEvents();
  stage.onEdit(function () {
    if (!state.song) return; invalidateVoice("ピアノロールを直したため、古い歌声を外しました。"); updateSongRange(); commitCandidate(); renderDiagnosis();
  });
  loadVoices(); initAudio(); checkSeparator();
  window.MVBridge = function () {
    if (!state.song) {
      return Promise.reject(new Error("先に曲を作るか読み込んでください。曲なしで映像だけ作る場合は、CC0素材を読み込んで下の「20秒プレビュー」を押してください。"));
    }
    return exportMix(false).then(function (result) {
      return { bytes:result.bytes, bpm:state.bpm, title:state.title || "song" };
    });
  };
  window.AIScoreStudio = {
    state:state,
    loadSample:function () { $("blueprintText").value = UG.songSheet.sample(); return detectAndApplyText($("blueprintText").value); },
    debug:function () { return { song:!!state.song, title:state.title, bpm:state.bpm, voices:$("voiceSelect").options.length, audio:UG.audio.debugState(), separator:!!state.separation, sourceType:state.sourceType }; }
  };
})();
