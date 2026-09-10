/* Independent experimental rules. No textbook/site content is bundled. */
(function (root) {
  'use strict';
  var lab = root.harmonyLab = { enabled: true };
  var pc = function (n) { return ((n % 12) + 12) % 12; };
  // Ordered voice matching, with explicit insertion/deletion cost for changing chord sizes.
  lab.distance = function (a, b) {
    var dp = Array.from({length:a.length + 1}, function () { return []; });
    for (var i = 0; i <= a.length; i++) dp[i][0] = i * 7;
    for (var j = 0; j <= b.length; j++) dp[0][j] = j * 7;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i-1][j-1] + Math.abs(a[i-1]-b[j-1]), dp[i-1][j]+7, dp[i][j-1]+7);
    }
    return dp[a.length][b.length];
  };
  lab.voice = function (chord, previous) {
    var original = root.theory.chordVoicing(chord, 48);
    if (!previous || !previous.length) return original;
    var pcs = Array.from(new Set(root.theory.chordPitches(chord))).sort(function(a,b){return a-b;});
    var candidates = [original];
    // Closed inversions across a bounded accompaniment register. Root remains in the bass part.
    for (var start = 48; start <= 71; start++) {
      if (pcs.indexOf(pc(start)) < 0) continue;
      var candidate = [start], used = [pc(start)];
      for (var n = start + 1; n <= 84 && candidate.length < pcs.length; n++) {
        if (pcs.indexOf(pc(n)) >= 0 && used.indexOf(pc(n)) < 0) { candidate.push(n); used.push(pc(n)); }
      }
      if (candidate.length === pcs.length) candidates.push(candidate);
    }
    return candidates.reduce(function (best, candidate) {
      return lab.distance(previous, candidate) < lab.distance(previous, best) ? candidate : best;
    }, original).slice();
  };
  lab.context = function (song, key) {
    var notes = (song.melody || []).slice().sort(function(a,b){return a.s-b.s;});
    return notes.map(function(note, i) {
      var prev = notes[i-1], next = notes[i+1], kind = '要試聴';
      var contiguous = prev && next && prev.s + prev.d === note.s && note.s + note.d === next.s;
      var a = prev ? note.n-prev.n : 0, b = next ? next.n-note.n : 0;
      var stepwise = Math.abs(a) >= 1 && Math.abs(a) <= 2 && Math.abs(b) >= 1 && Math.abs(b) <= 2;
      // Conservative: short, weak-beat, contiguous, scale-tone endpoints; no claim of harmonic certainty.
      if (contiguous && note.d <= 2 && note.s % 4 !== 0 && stepwise &&
          root.theory.inScale(prev.n,key) && root.theory.inScale(next.n,key)) {
        if (a*b > 0) kind = '経過音候補';
        else if (prev.n === next.n) kind = '隣接音候補';
      }
      return {step:note.s, pitch:note.n, outside:!root.theory.inScale(note.n,key), kind:kind};
    }).filter(function(n){return n.outside;});
  };
  var diagnose = root.midiDoctor.diagnose, repair = root.midiDoctor.repair;
  root.midiDoctor.diagnose = function(song, bpm) {
    var report = diagnose(song,bpm);
    if (!lab.enabled || !report.key) return report;
    var context = lab.context(song,report.key);
    report.harmonyContext = context;
    report.issues = report.issues.filter(function(issue){return issue.id !== 'offscale';});
    if (context.length) report.issues.push({id:'harmony-context', level:'warn', fixable:false,
      text:'調外音 '+context.length+'音。'+context.map(function(n){return (Math.floor(n.step/16)+1)+'小節目 '+n.kind;}).slice(0,12).join('、')+
        '。推定調だけでは誤りと判定できません。前後と伴奏を聴いて確認してください。'});
    report.issues.forEach(function(issue){
      if(issue.id === 'chordtone') issue.text = '小節頭のコード構成音率は '+Math.round(report.metrics.chordToneRatio*100)+'%。非和声音やテンションの可能性もあるため、伴奏と試聴して判断してください。';
    });
    report.ok = !report.issues.some(function(issue){return issue.level === 'error';});
    report.repairable = report.issues.some(function(issue){return issue.fixable;});
    return report;
  };
  root.midiDoctor.repair = function(song, options) {
    if (!lab.enabled) return repair(song,options);
    // Diagnostic suggestions must not silently quantize expressive chromatic notes.
    return repair(song,Object.assign({},options,{offScale:false}));
  };
})(window.UG);
