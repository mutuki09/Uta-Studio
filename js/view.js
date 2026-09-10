/* view.js — Canvas に原稿用紙とピアノロールを描く。
   上のマスに歌詞、下に音符。列がそろっているのがこのツールの見た目の核。 */
(function (root) {
  "use strict";

  var theory = root.theory;

  function create(canvas, scroller) {
    var g = canvas.getContext("2d");
    var CELL = 26;   /* 1 ステップぶんの横幅（px）。実際は半分ずつ使う */
    var ROW = 13;    /* 半音 1 つぶんの高さ（px） */
    var TOP = 72;    /* 上のコード名＋歌詞マスの高さ */

    var song = null, key = null, head = -1, onEdit = null;

    function metrics() {
      var steps = song ? Math.max(64, song.totalSteps + 8) : 64;
      var lo = song ? song.lo - 3 : 55;
      var hi = song ? song.hi + 3 : 79;
      return { steps: steps, lo: lo, hi: hi, half: CELL / 2,
               w: steps * CELL / 2, h: TOP + (hi - lo + 1) * ROW + 16 };
    }

    function resize() {
      var m = metrics();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = m.w * dpr;
      canvas.height = m.h * dpr;
      canvas.style.width = m.w + "px";
      canvas.style.height = m.h + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return m;
    }

    /** 文字がマスからはみ出さないように、幅に合わせて字を縮める */
    function fitText(text, maxW, baseSize) {
      var size = baseSize;
      g.font = size + 'px "Hiragino Mincho ProN","Yu Mincho",serif';
      while (size > 8 && g.measureText(text).width > maxW) {
        size -= 1;
        g.font = size + 'px "Hiragino Mincho ProN","Yu Mincho",serif';
      }
      return size;
    }

    function draw() {
      var m = resize();
      var s, x, y, isBar;

      g.fillStyle = "#F2ECDD";
      g.fillRect(0, 0, m.w, m.h);

      /* 縦線。原稿用紙のマスとピアノロールのグリッドは同じ列 */
      for (s = 0; s <= m.steps; s += 2) {
        x = s * m.half;
        isBar = (s % 16 === 0);
        g.strokeStyle = isBar ? "rgba(200,67,58,.42)" : "rgba(18,32,58,.09)";
        g.lineWidth = isBar ? 1.4 : 1;
        g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, m.h); g.stroke();
        if (isBar) {
          g.fillStyle = "rgba(200,67,58,.6)";
          g.font = "10px sans-serif";
          g.textBaseline = "alphabetic";
          g.fillText(String(s / 16 + 1), x + 4, 12);
        }
      }

      g.strokeStyle = "rgba(200,67,58,.5)";
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, TOP + 0.5); g.lineTo(m.w, TOP + 0.5); g.stroke();

      /* 横のしま模様。ドの行だけ線を引く */
      for (var mi = m.lo; mi <= m.hi; mi++) {
        y = TOP + (m.hi - mi) * ROW;
        var pc = (((mi % 12) + 12) % 12);
        if (pc === 0) {
          g.fillStyle = "rgba(18,32,58,.05)";
          g.fillRect(0, y, m.w, ROW);
          g.strokeStyle = "rgba(18,32,58,.16)";
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, y + ROW + 0.5); g.lineTo(m.w, y + ROW + 0.5); g.stroke();
        } else if (theory.NAMES[pc].indexOf("#") >= 0) {
          g.fillStyle = "rgba(18,32,58,.03)";
          g.fillRect(0, y, m.w, ROW);
        }
      }

      if (!song) {
        g.fillStyle = "rgba(18,32,58,.42)";
        g.font = '15px "Hiragino Mincho ProN", serif';
        g.textBaseline = "alphabetic";
        g.fillText("歌詞を書いて「曲をつくる」を押してください", 18, TOP + 42);
        return;
      }

      /* コード進行を譜面の一番上に置く。長い曲では同じ進行を繰り返す。 */
      var chordCount = song.chords && song.chords.length;
      if (chordCount) {
        for (s = 0; s < m.steps; s += 16) {
          var chord = song.chords[Math.floor(s / 16) % chordCount];
          x = s * m.half;
          g.fillStyle = Math.floor(s / 16) % 2 ? "rgba(69,86,203,.08)" : "rgba(69,86,203,.13)";
          g.fillRect(x, 0, 16 * m.half, 23);
          g.fillStyle = "#3444a6";
          g.font = '700 11px "Inter","Yu Gothic",sans-serif';
          g.textBaseline = "middle";
          g.fillText(theory.chordName(chord), x + 7, 12);
        }
      }

      /* 伴奏の和音を薄く敷く */
      g.fillStyle = "rgba(62,124,147,.13)";
      song.pad.forEach(function (p) {
        p.chord.forEach(function (pc) {
          var n = pc;
          while (n < m.lo) n += 12;
          while (n > m.hi) n -= 12;
          g.fillRect(p.s * m.half, TOP + (m.hi - n) * ROW + 1, p.d * m.half - 2, ROW - 2);
        });
      });

      /* メロディと歌詞 */
      song.melody.forEach(function (n) {
        var nx = n.s * m.half, nw = Math.max(4, n.d * m.half - 2);
        var ny = TOP + (m.hi - n.n) * ROW + 1;
        var on = head >= n.s && head < n.s + n.d;

        g.fillStyle = on ? "#C8433A" : "#12203A";
        roundRect(nx, ny, nw, ROW - 2, 3);
        g.fill();

        if (n.text) {
          g.strokeStyle = "rgba(200,67,58,.28)";
          g.lineWidth = 1;
          g.strokeRect(nx + 0.5, 28.5, nw, TOP - 35);
          var size = fitText(n.text, nw - 4, 18);
          g.fillStyle = on ? "#C8433A" : "#16202F";
          g.textBaseline = "middle";
          g.font = size + 'px "Hiragino Mincho ProN","Yu Mincho",serif';
          g.fillText(n.text, nx + 3, 48);
        }
      });

      if (head >= 0) {
        x = head * m.half;
        g.strokeStyle = "#C8433A";
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, m.h); g.stroke();
      }
    }

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    /* ---- 音符を上下にドラッグして直す ---- */
    var drag = null;

    function pick(ev) {
      if (!song) return null;
      var r = canvas.getBoundingClientRect();
      var pt = ev.touches ? ev.touches[0] : ev;
      var x = pt.clientX - r.left, y = pt.clientY - r.top;
      if (y < TOP) return null;
      var m = metrics();
      var step = x / m.half;
      for (var i = 0; i < song.melody.length; i++) {
        var n = song.melody[i];
        var ny = TOP + (m.hi - n.n) * ROW;
        if (step >= n.s && step < n.s + n.d && y >= ny && y < ny + ROW) {
          return { note: n, y0: y, n0: n.n };
        }
      }
      return null;
    }

    function onDown(e) { drag = pick(e); if (drag) e.preventDefault(); }
    function onMove(e) {
      if (!drag) return;
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      var pt = e.touches ? e.touches[0] : e;
      var want = drag.n0 - Math.round(((pt.clientY - r.top) - drag.y0) / ROW);
      drag.note.n = key ? theory.snapToScale(want, key) : want;
      var lo = 127, hi = 0;
      song.melody.forEach(function (n) { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); });
      song.lo = lo; song.hi = hi;
      draw();
      if (onEdit) onEdit();
    }
    function onUp() { drag = null; }

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("resize", function () { draw(); });

    return {
      setSong: function (s, k) { song = s; key = k; head = -1; draw(); },
      setHead: function (h) {
        head = h; draw();
        if (h >= 0 && scroller) {
          var x = h * CELL / 2;
          if (x > scroller.scrollLeft + scroller.clientWidth - 120 || x < scroller.scrollLeft) {
            scroller.scrollLeft = Math.max(0, x - 80);
          }
        }
      },
      onEdit: function (fn) { onEdit = fn; },
      redraw: draw
    };
  }

  root.view = { create: create };
})(typeof window !== "undefined" ? (window.UG = window.UG || {}) : (module.exports = {}));
