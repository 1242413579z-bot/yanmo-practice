/* ============================================================
   practice/js/modules/punct.js — 句读标点编辑器（标点弹窗）
   ============================================================ */
(function () {
  'use strict';
  var U = window.util, UI = window.UI;

  var PALETTE_GROUPS = [
    { label: '句末标点', marks: ['。', '？', '！'] },
    { label: '句中停顿', marks: ['，', '、', '；', '：'] },
    { label: '标号', marks: ['——', '……', '·'] },
    { label: '引号', marks: ['“', '”', '‘', '’', '「', '」', '『', '』'] },
    { label: '书名号', marks: ['《', '》', '〈', '〉'] },
    { label: '括号', marks: ['（', '）', '【', '】'] }
  ];

  var inst = null;

  function mount(root, ctx) {
    var q = ctx.question || {};
    var text = q.text || '';
    var marks = {};               // gap → mark string
    var palette = null;
    var curGap = null;

    var wrap = UI.el('div', { class: 'pu-wrap' });
    root.appendChild(wrap);

    /* ---------- 顶部工具条 ---------- */
    var bar = UI.el('div', { class: 'pu-bar' });
    wrap.appendChild(bar);

    var sentence = UI.el('div', { class: 'pu-sentence' });
    wrap.appendChild(sentence);

    var preview = UI.el('div', { class: 'pu-preview' });
    wrap.appendChild(preview);

    var tip = UI.el('div', { class: 'notice pu-tip' }, [
      UI.el('b', {}, '怎么加标点：'), '点击字与字之间的空白位置 → 弹出标点面板 → 选择符号；同一位置可连续加（如 。”）。点已加的标点可以改或删。'
    ]);
    wrap.appendChild(tip);

    function markCount() {
      var n = 0;
      Object.keys(marks).forEach(function (g) { n += 1; });
      return n;
    }

    function refreshBar() {
      UI.clear(bar);
      bar.appendChild(UI.el('span', { class: 'small muted' }, '已加 ' + markCount() + ' 处标点'));
      bar.appendChild(UI.el('span', { class: 'grow' }));
      var clearBtn = UI.el('button', { class: 'btn btn--sm btn--ghost' }, '清空');
      clearBtn.addEventListener('click', function () {
        if (!markCount()) return;
        marks = {};
        rerender();
        if (ctx.onChange) ctx.onChange();
      });
      bar.appendChild(clearBtn);
    }

    function buildGap(gap) {
      var g = UI.el('button', { class: 'pu-gap' + (marks[gap] ? ' has-mark' : ''), title: '第 ' + gap + ' 字后', type: 'button' });
      if (marks[gap]) {
        g.appendChild(UI.el('span', { class: 'pu-mark' }, marks[gap]));
      } else {
        g.appendChild(UI.el('span', { class: 'pu-gap-dot' }, '·'));
      }
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        openPalette(gap, g);
      });
      return g;
    }

    function rerender() {
      UI.clear(sentence);
      for (var i = 0; i <= text.length; i++) {
        if (i > 0) sentence.appendChild(UI.el('span', { class: 'pu-char' }, text[i - 1]));
        sentence.appendChild(buildGap(i));
      }
      UI.clear(preview);
      preview.appendChild(UI.el('span', { class: 'tiny faint' }, '已加标点预览：'));
      preview.appendChild(renderPunctedText(text, marks, 'accent'));
      refreshBar();
      if (palette && curGap != null) updatePaletteHead();
    }

    /* ---------- 标点面板 ---------- */
    function closePalette() {
      if (palette && palette.parentNode) palette.parentNode.removeChild(palette);
      palette = null; curGap = null;
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (!palette) return;
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'Backspace') { e.preventDefault(); deleteLast(); }
    }
    function deleteLast() {
      if (curGap == null) return;
      var s = marks[curGap] || '';
      if (!s) return;
      // 多字标点整体删除
      var two = s.slice(-2);
      if (two === '——' || two === '……') s = s.slice(0, -2);
      else s = s.slice(0, -1);
      if (s) marks[curGap] = s; else delete marks[curGap];
      rerender();
      if (ctx.onChange) ctx.onChange();
    }
    function deleteGap() {
      if (curGap == null) return;
      delete marks[curGap];
      rerender();
      if (ctx.onChange) ctx.onChange();
    }
    function updatePaletteHead() {
      if (!palette) return;
      var hd = palette.querySelector('.pu-palette-head-text');
      if (hd) hd.textContent = '第 ' + curGap + ' 字后' + (marks[curGap] ? ' · 当前：' + marks[curGap] : ' · 未加标点');
    }
    function insertMark(mark) {
      if (curGap == null) return;
      marks[curGap] = (marks[curGap] || '') + mark;
      rerender();
      if (ctx.onChange) ctx.onChange();
    }
    function openPalette(gap, anchor) {
      if (palette) closePalette();
      curGap = gap;
      palette = UI.el('div', { class: 'palette pu-palette' });
      var isMobile = window.innerWidth <= 620;
      if (isMobile) palette.classList.add('pu-palette--sheet');

      var hd = UI.el('div', { class: 'palette-hd' }, [
        UI.el('div', { class: 'palette-title' }, [
          UI.el('span', { class: 'pu-palette-head-text' }, ''),
          UI.el('span', { class: 'tiny faint', style: { marginLeft: '8px' } }, '点符号即插入')
        ]),
        UI.el('button', { class: 'btn btn--icon btn--ghost btn--sm', title: '关闭', onclick: closePalette }, '✕')
      ]);
      palette.appendChild(hd);
      var bd = UI.el('div', { class: 'palette-bd' });
      PALETTE_GROUPS.forEach(function (g) {
        var grp = UI.el('div', { class: 'palette-group' });
        grp.appendChild(UI.el('div', { class: 'palette-glabel' }, g.label));
        var keys = UI.el('div', { class: 'palette-keys' });
        g.marks.forEach(function (m) {
          var b = UI.el('button', { class: 'palette-key' + (m.length > 1 ? ' palette-key--wide' : ''), title: '插入 ' + m }, m);
          b.addEventListener('click', function () { insertMark(m); });
          keys.appendChild(b);
        });
        grp.appendChild(keys);
        bd.appendChild(grp);
      });
      var ft = UI.el('div', { class: 'pu-palette-ft' }, [
        UI.el('button', { class: 'btn btn--sm btn--ghost', onclick: function () { deleteLast(); } }, '删除最后'),
        UI.el('button', { class: 'btn btn--sm btn--ghost', onclick: function () { deleteGap(); } }, '清空此位置'),
        UI.el('button', { class: 'btn btn--sm btn--primary', onclick: closePalette }, '完成')
      ]);
      bd.appendChild(ft);
      palette.appendChild(bd);
      document.body.appendChild(palette);
      updatePaletteHead();
      positionPalette(anchor);
      document.addEventListener('keydown', onKey);
    }
    function positionPalette(anchor) {
      if (!palette || palette.classList.contains('pu-palette--sheet')) return;
      var r = anchor.getBoundingClientRect();
      var pw = palette.offsetWidth || 360;
      var ph = palette.offsetHeight || 340;
      var left = U.clamp(r.left + r.width / 2 - pw / 2, 10, window.innerWidth - pw - 10);
      var top = r.bottom + 10;
      if (top + ph > window.innerHeight - 12) top = Math.max(10, r.top - ph - 10);
      palette.style.left = left + 'px';
      palette.style.top = top + 'px';
      palette.style.bottom = 'auto';
    }

    /* ---------- 渲染答案文本 ---------- */
    function renderPunctedText(tx, map, cls, diff) {
      var box = UI.el('span', { class: 'pu-text ' + (cls ? 'pu-text--' + cls : '') });
      for (var i = 0; i <= tx.length; i++) {
        var mk = map[i];
        if (mk) {
          var markCls = 'pu-mark-inline';
          if (diff) {
            var st = diff[i] || '';
            if (st === 'ok') markCls += ' is-ok';
            else if (st === 'bad') markCls += ' is-bad';
            else if (st === 'miss') markCls += ' is-miss';
          }
          box.appendChild(UI.el('span', { class: markCls }, mk));
        }
        if (i < tx.length) box.appendChild(UI.el('span', { class: 'pu-text-char' }, tx[i]));
      }
      return box;
    }

    /* ---------- 生命周期 ---------- */
    function getAnswer() {
      var arr = [];
      Object.keys(marks).map(Number).sort(function (a, b) { return a - b; }).forEach(function (g) {
        arr.push({ gap: g, mark: marks[g] });
      });
      var out = '';
      for (var i = 0; i <= text.length; i++) {
        if (marks[i]) out += marks[i];
        if (i < text.length) out += text[i];
      }
      return { marks: arr, text: out };
    }

    function setAnswer(a) {
      marks = {};
      if (a && a.marks) {
        a.marks.forEach(function (m) { if (m && typeof m.gap === 'number') marks[m.gap] = m.mark || ''; });
      }
      closePalette();
      rerender();
    }

    rerender();

    var handle = {
      getAnswer: getAnswer,
      setAnswer: setAnswer,
      isAnswered: function () { return markCount() > 0; },
      reset: function () { marks = {}; closePalette(); rerender(); },
      renderSolution: function (rootEl, question, userAnswer) {
        var card = UI.el('div', { class: 'pu-sol' });
        card.appendChild(UI.el('div', { class: 'panel-title' }, '标准答案（新式标点）'));
        card.appendChild(renderPunctedText(question.text || '', GC.PUNCT.marksToMap(GC.PUNCT.marksOf(question.answer || '')), 'std'));
        if (userAnswer && userAnswer.marks && userAnswer.marks.length) {
          card.appendChild(UI.el('div', { class: 'panel-title', style: { marginTop: '16px' } }, '你的答案'));
          var um = {};
          userAnswer.marks.forEach(function (m) { um[m.gap] = (um[m.gap] || '') + (m.mark || ''); });
          card.appendChild(renderPunctedText(question.text || '', um, 'user'));
          // 差异表
          var cmp = GC.PUNCT.compare(question.answer || '', userAnswer.marks);
          var table = UI.el('table', { class: 'table pu-diff-table' });
          var thead = UI.el('thead');
          var htr = UI.el('tr');
          ['位置', '标准', '你的', '判定'].forEach(function (h) { htr.appendChild(UI.el('th', {}, h)); });
          thead.appendChild(htr);
          table.appendChild(thead);
          var tbody = UI.el('tbody');
          function row(gap, std, mine, verdict, cls) {
            var tr = UI.el('tr', { class: cls || '' });
            tr.appendChild(UI.el('td', {}, '第 ' + gap + ' 字后'));
            tr.appendChild(UI.el('td', { class: 'mono' }, std || '—'));
            tr.appendChild(UI.el('td', { class: 'mono' }, mine || '—'));
            tr.appendChild(UI.el('td', {}, verdict));
            tbody.appendChild(tr);
          }
          cmp.miss.forEach(function (x) { row(x.gap, x.expected, '', '漏断', 'is-bad'); });
          cmp.over.forEach(function (x) { row(x.gap, '', x.got, '多断', 'is-bad'); });
          cmp.typeWrong.forEach(function (x) { row(x.gap, x.expected, x.got, '标点类型不对', 'is-warn'); });
          if (!cmp.miss.length && !cmp.over.length && !cmp.typeWrong.length) {
            row('—', '', '', '完全一致', 'is-ok');
          }
          table.appendChild(tbody);
          card.appendChild(UI.el('div', { class: 'panel-title', style: { marginTop: '16px' } }, '逐处对照'));
          card.appendChild(table);
        }
        if (question.reference) {
          card.appendChild(UI.el('div', { class: 'panel-title', style: { marginTop: '16px' } }, '参考译文'));
          card.appendChild(UI.el('p', { class: 'small muted', style: { lineHeight: '1.9' } }, question.reference));
        }
        rootEl.appendChild(card);
      },
      renderResultDetail: function (rootEl, question, userAnswer, grade) {
        if (!userAnswer || !userAnswer.marks) return;
        var cmp = GC.PUNCT.compare(question.answer || '', userAnswer.marks);
        var diff = {};
        cmp.ok.forEach(function (g) { diff[g] = 'ok'; });
        cmp.miss.forEach(function (x) { diff[x.gap] = 'miss'; });
        cmp.over.forEach(function (x) { diff[x.gap] = 'bad'; });
        cmp.typeWrong.forEach(function (x) { diff[x.gap] = 'bad'; });
        var um = {};
        userAnswer.marks.forEach(function (m) { um[m.gap] = (um[m.gap] || '') + (m.mark || ''); });
        // 漏断的标准标点以虚影显示
        cmp.miss.forEach(function (x) { um[x.gap] = '〔' + x.expected + '〕'; });
        var box = UI.el('div', { class: 'pu-diff' });
        box.appendChild(UI.el('div', { class: 'tiny faint', style: { marginBottom: '6px' } }, '逐标点对照（绿色=对，朱红=错，〔〕=漏断）'));
        box.appendChild(renderPunctedText(question.text || '', um, 'diff', diff));
        rootEl.appendChild(box);
      },
      destroy: function () { closePalette(); UI.clear(wrap); }
    };
    inst = handle;
    return handle;
  }

  window.PRACTICE_MODULES = window.PRACTICE_MODULES || {};
  window.PRACTICE_MODULES.punct = {
    id: 'punct',
    label: '句读标点',
    mount: mount,
    getAnswer: function () { return inst && inst.getAnswer(); },
    setAnswer: function (a) { return inst && inst.setAnswer(a); },
    isAnswered: function () { return !!(inst && inst.isAnswered()); },
    reset: function () { return inst && inst.reset(); },
    renderSolution: function (rootEl, q, a) { return inst && inst.renderSolution(rootEl, q, a); },
    renderResultDetail: function (rootEl, q, a, g) { return inst && inst.renderResultDetail(rootEl, q, a, g); },
    destroy: function () { return inst && inst.destroy(); }
  };
})();
