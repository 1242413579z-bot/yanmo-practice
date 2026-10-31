/* ============================================================================
   practice/js/modules/ipa.js — 国际音标编辑器（window.PRACTICE_MODULES.ipa）
   契约：CONTRACT.md §6 / §6.2；第五轮用户反馈版：
   · 音标面板默认收起，只留一条约 40px 标题栏（音标面板 · 展开 ▾ + 当前项提示）；
     点「展开」才显示符号区，展开后最大高度 230px（窄屏 34vh），内部可滚动。
   · 面板是文档流内元素，不 sticky / 不 fixed，不遮挡题目；点面板外、按 Esc 都会收起；
     折叠状态记在 localStorage。
   · 音标按「元音 / 辅音」分组（不再使用声母/韵母），另设「声调」「附加符号」；
     声调只保留 55/35/214/51/21 —— 轻声不标调，面板没有 0 按钮。
   · 删掉预设组合（复韵母/鼻韵母、常用整体、儿化/送气快捷），只保留
     元音/辅音/声调/附加符号按钮 + 底部操作（插入空格 / 退格 / 清空本项）。
   · 每个 items[i] 一张卡片：汉字 + 小徽标「N 音节」+ 音标输入框；subQuestions 用 textarea。
   · 点符号插入到当前聚焦输入框光标处；触屏失焦时按上次光标位置插入。
   只使用 textContent / UI.el 构建 DOM，不拼用户数据 innerHTML。
   ========================================================================== */
(function () {
  'use strict';

  window.PRACTICE_MODULES = window.PRACTICE_MODULES || {};

  var IPA = (window.GC && window.GC.IPA) || null;

  /* ---------------- 面板符号表（符号按钮即数据源） ---------------- */
  // 元音：国际音标常用元音表（A = 开央不圆唇元音；ɚ/ɿ/ʅ/ʮ 为汉语特殊元音；ɥ 按用户要求列在元音栏）
  var VOWELS = [
    'a', 'ɑ', 'ɒ', 'ɐ', 'æ', 'ɛ', 'e', 'ø', 'œ', 'ɶ', 'ɜ', 'ɞ', 'ə', 'ɘ', 'ɵ',
    'ɤ', 'o', 'ɔ', 'ʌ', 'ɪ', 'ʏ', 'ʊ', 'ɨ', 'ʉ', 'ɯ', 'u', 'i', 'y',
    'ɚ', 'ɿ', 'ʅ', 'ʮ', 'ɥ', 'A'
  ];
  // 辅音：普通话用到的 + 国际音标常见辅音（ŋ 只在这里，不再作为「声母」）
  var CONSONANTS_BASE = ['p', 'pʰ', 'm', 'f', 't', 'tʰ', 'n', 'l', 'k', 'kʰ', 'x', 'tɕ', 'tɕʰ', 'ɕ', 'ts', 'tsʰ', 's', 'ʈʂ', 'ʈʂʰ', 'ʂ', 'ʐ', 'ŋ'];
  var CONSONANTS_MORE = [
    'b', 'd', 'g', 'ɡ', 'ʔ', 'ɸ', 'β', 'v', 'θ', 'ð', 'z', 'ʒ', 'ʃ', 'ç', 'ʝ',
    'ɣ', 'ɦ', 'h', 'ɬ', 'ɮ', 'r', 'ɾ', 'ɽ', 'ʀ', 'j', 'w', 'ɻ', 'ɱ', 'ɴ',
    'ɲ', 'ɳ', 'ʈ', 'ɖ', 'ɟ', 'ʡ', 'ʕ', 'ʜ', 'ɺ', 'ʍ', 'ɰ'
  ];
  // 声调：轻声不标调 → 没有 0 / 轻声按钮
  var TONES = [
    { v: '55', n: '阴平' }, { v: '35', n: '阳平' }, { v: '214', n: '上声' },
    { v: '51', n: '去声' }, { v: '21', n: '半上' }
  ];
  var DIACRITICS = ['ʰ', 'ʲ', 'ʷ', '̃', '˞', 'ː'];

  var PANEL_KEY = 'yanmo.practice.ipaPanel.v1';

  var state = null;

  /* ---------------- 极简 DOM 工具（优先 UI.el，Node 下不执行） ---------------- */
  function mk(tag, cls) {
    var node = null;
    var ui = window.UI;
    if (ui && typeof ui.el === 'function') {
      try { node = ui.el(tag, cls ? { class: cls } : null); } catch (e) { node = null; }
    }
    if (!node) {
      node = document.createElement(tag);
      if (cls) node.className = cls;
    }
    return node;
  }
  function setText(node, s) {
    if (!node) return node;
    node.textContent = s == null ? '' : String(s);
    return node;
  }
  function mkText(tag, cls, text) { return setText(mk(tag, cls), text); }
  function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); return fn; }
  function hasClass(node, cls) { return !!(node && node.classList && node.classList.contains(cls)); }
  function toggleClass(node, cls, force) {
    if (!node || !node.classList) return;
    if (force == null) node.classList.toggle(cls);
    else if (force) node.classList.add(cls);
    else node.classList.remove(cls);
  }
  function safeStr(v) { return v == null ? '' : String(v); }
  function uniqArr(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (x) {
      var k = String(x);
      if (!seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  }

  /* ---------------- 轻声不标调：显示 & 等值判断 ---------------- */
  function toneNorm(t) {
    t = t == null ? '' : String(t);
    if (t === '0' || /轻/.test(t)) return '';
    return t;
  }
  // 解析页不显示 0：去掉音节末尾的调值 0（兼容 0 写在 ɚ/ɻ 之前）
  function stripNeutralZero(s) {
    var str = safeStr(s);
    if (!str) return '';
    return str.split(/(\s+)/).map(function (part) {
      if (!part) return part;
      if (/^\s+$/.test(part)) return part;
      var t = part;
      if (/0[ɚɻ]$/.test(t)) t = t.replace(/0([ɚɻ])$/, '$1');
      else if (/0$/.test(t)) t = t.replace(/0$/, '');
      return t;
    }).join('');
  }
  function splitTokens(s) {
    try {
      if (IPA && typeof IPA.splitSyllables === 'function') return IPA.splitSyllables(s);
    } catch (e) { /* ignore */ }
    return safeStr(s).trim().split(/\s+/).filter(Boolean);
  }
  function parseOne(tok) {
    if (!IPA || typeof IPA.parseSyllable !== 'function') return null;
    try { return IPA.parseSyllable(tok); } catch (e) { return null; }
  }
  function syllableEquivalent(x, y) {
    var a = safeStr(x), b = safeStr(y);
    if (a === b) return true;
    var pa = parseOne(a), pb = parseOne(b);
    if (pa && pb && pa.ok && pb.ok) {
      return pa.initial === pb.initial && pa.final === pb.final && toneNorm(pa.tone) === toneNorm(pb.tone);
    }
    return false;
  }
  // 两个音标串是否等同（允许 0 与无调值互认、允许方括号等归一化写法）
  function ipaEquivalent(a, b) {
    var x = safeStr(a).trim(), y = safeStr(b).trim();
    if (!x || !y) return false;
    if (normEq(x, y)) return true;
    var ta = splitTokens(x), tb = splitTokens(y);
    if (ta.length !== tb.length) return false;
    for (var i = 0; i < ta.length; i++) if (!syllableEquivalent(ta[i], tb[i])) return false;
    return true;
  }
  function normEq(a, b) {
    try {
      if (IPA && IPA.normalize) return IPA.normalize(a) === IPA.normalize(b);
    } catch (e) { /* ignore */ }
    return safeStr(a).trim() === safeStr(b).trim();
  }

  /* ---------------- 折叠状态记忆 ---------------- */
  function readPanelCollapsed() {
    try {
      var v = window.localStorage.getItem(PANEL_KEY);
      if (v === 'expanded') return false;
      if (v === 'collapsed') return true;
    } catch (e) { /* file:// 或隐私模式忽略 */ }
    return true; // 默认收起
  }
  function savePanelPref(collapsed) {
    try { window.localStorage.setItem(PANEL_KEY, collapsed ? 'collapsed' : 'expanded'); } catch (e) { /* ignore */ }
  }
  function nodeContains(root, node) {
    var n = node;
    while (n) {
      if (n === root) return true;
      n = n.parentNode;
    }
    return false;
  }
  function isStateInput(node) { return !!(state && node && state.inputs.indexOf(node) >= 0); }

  function setCollapsed(collapsed, opts) {
    if (!state || !state.palette) return;
    state.collapsed = !!collapsed;
    toggleClass(state.palette, 'is-collapsed', state.collapsed);
    if (state.paletteToggle) state.paletteToggle.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
    if (state.paletteStateText) setText(state.paletteStateText, state.collapsed ? '· 展开 ▾' : '');
    if (state.paletteCollapse) state.paletteCollapse.setAttribute('aria-hidden', state.collapsed ? 'true' : 'false');
    if (!opts || opts.persist !== false) savePanelPref(state.collapsed);
    updateTargetLabel();
  }
  function onDocPointerDown(e) {
    if (!state || state.collapsed) return;
    var t = e && e.target;
    if (!t) return;
    if (state.palette && nodeContains(state.palette, t)) return;
    if (isStateInput(t)) return; // 点输入框定位光标：面板保持展开
    setCollapsed(true);
  }
  function onDocKeydown(e) {
    if (!state || state.collapsed) return;
    if (e && (e.key === 'Escape' || e.keyCode === 27)) setCollapsed(true);
  }

  /* ---------------- 音节计数 ---------------- */
  function countSyllables(v) {
    var s = safeStr(v).trim();
    if (!s) return 0;
    try {
      if (IPA && typeof IPA.splitSyllables === 'function') return IPA.splitSyllables(s).length;
    } catch (e) { /* 退化为按空格数 */ }
    return s.split(/\s+/).filter(Boolean).length;
  }

  /* ---------------- 通知 app ---------------- */
  function notifyChange() {
    if (!state || state.dead) return;
    var cb = state.ctx && state.ctx.onChange;
    if (typeof cb === 'function') {
      try { cb(); } catch (e) { /* 不影响作答 */ }
    }
  }

  /* ---------------- 当前输入目标 ---------------- */
  function inputTarget() {
    if (!state) return null;
    var ae = document.activeElement;
    if (ae && state.inputs.indexOf(ae) >= 0) { state.lastInput = ae; return ae; }
    if (state.lastInput && state.inputs.indexOf(state.lastInput) >= 0) return state.lastInput;
    return state.inputs[0] || null;
  }
  function idxOf(inp) {
    if (!inp) return -1;
    var i = parseInt(inp.dataset && inp.dataset.idx, 10);
    return isNaN(i) ? state.inputs.indexOf(inp) : i;
  }

  /* ---------------- 插入/删除 ---------------- */
  // 记住光标位置：触屏点面板按钮会让输入框失焦，靠这里保住插入位置
  function saveCaret(inp) {
    if (!state || !inp) return;
    var val = inp.value || '';
    var start = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
    var end = typeof inp.selectionEnd === 'number' ? inp.selectionEnd : start;
    start = Math.max(0, Math.min(start, val.length));
    end = Math.max(0, Math.min(end, val.length));
    if (start > end) { var t = start; start = end; end = t; }
    state.caret = { inp: inp, start: start, end: end };
  }
  function caretOf(inp) {
    var val = inp.value || '';
    var focused = document.activeElement === inp;
    var start, end;
    if (focused) {
      start = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
      end = typeof inp.selectionEnd === 'number' ? inp.selectionEnd : start;
    } else if (state && state.caret && state.caret.inp === inp) {
      start = state.caret.start;
      end = state.caret.end;
    } else {
      start = end = val.length;
    }
    start = Math.max(0, Math.min(start, val.length));
    end = Math.max(0, Math.min(end, val.length));
    if (start > end) { var t = start; start = end; end = t; }
    return { start: start, end: end };
  }
  function applyEdit(inp, nextValue, caret) {
    if (!state || !inp) return;
    inp.value = nextValue;
    state.lastInput = inp;
    try {
      inp.focus();
      if (typeof inp.setSelectionRange === 'function') inp.setSelectionRange(caret, caret);
    } catch (e) { /* 某些环境不支持选区 */ }
    state.caret = { inp: inp, start: caret, end: caret };
    refreshItem(idxOf(inp));
    markFocus(inp);
    updateTargetLabel();
    notifyChange();
  }
  function insertText(str) {
    var inp = inputTarget();
    if (!inp) {
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast('先点一个音标输入框，再点符号', 'info');
      return;
    }
    var val = inp.value || '';
    var pos = caretOf(inp);
    var start = pos.start, end = pos.end;
    if (str === ' ') {
      var before = val.slice(0, start);
      var after = val.slice(end);
      if (!before.replace(/\s/g, '')) return;                 // 行首不插空格
      if (/\s$/.test(before) || /^\s/.test(after)) {           // 已有空格：只挪光标
        try { inp.focus(); if (inp.setSelectionRange) inp.setSelectionRange(start, start); } catch (e) {}
        return;
      }
    }
    var next = val.slice(0, start) + str + val.slice(end);
    applyEdit(inp, next, start + str.length);
  }
  function insertTone(digits) {
    var inp = inputTarget();
    if (!inp) { insertText(digits); return; }
    var val = inp.value || '';
    var pos = caretOf(inp);
    var before = val.slice(0, pos.start);
    // 光标前若已有调值（数字 / 调号 / 旧的 0）→ 替换，避免出现 5135 / 55214 这种废串
    var m = before.match(/(?:214|55|35|51|21|0|[˥˦˧˨˩]{1,5})$/);
    if (m) {
      var next = before.slice(0, before.length - m[0].length) + digits + val.slice(pos.end);
      applyEdit(inp, next, before.length - m[0].length + digits.length);
      return;
    }
    insertText(digits);
  }
  function deleteBack() {
    var inp = inputTarget();
    if (!inp) return;
    var val = inp.value || '';
    var pos = caretOf(inp);
    var start = pos.start, end = pos.end;
    if (start === end) {
      if (start === 0) return;
      start -= 1;
    }
    applyEdit(inp, val.slice(0, start) + val.slice(end), start);
  }
  function clearTarget() {
    var inp = inputTarget();
    if (!inp) return;
    applyEdit(inp, '', 0);
  }

  /* ---------------- 卡片刷新 / 焦点 ---------------- */
  function refreshItem(i) {
    if (!state) return;
    var rec = state.itemUi[i];
    if (!rec) return;
    var v = rec.input.value || '';
    var n = countSyllables(v);
    setText(rec.sylEl, n ? n + ' 音节' : '0 音节');
    toggleClass(rec.card, 'is-filled', !!v.trim());
  }
  function refreshAll() {
    if (!state) return;
    for (var i = 0; i < state.itemUi.length; i++) refreshItem(i);
  }
  function markFocus(inp) {
    if (!state) return;
    var i = idxOf(inp);
    for (var k = 0; k < state.itemUi.length; k++) {
      toggleClass(state.itemUi[k].card, 'is-focus', k === i);
    }
  }
  function updateTargetLabel() {
    if (!state || !state.paletteTarget) return;
    var focused = document.activeElement;
    var focusedIsInput = !!(focused && state.inputs.indexOf(focused) >= 0);
    if (!focusedIsInput && !state.lastInput) {
      setText(state.paletteTarget, '点输入框后，点符号插入光标处（默认第 1 项）');
      return;
    }
    var inp = inputTarget();
    if (!inp) { setText(state.paletteTarget, '点输入框后，点符号插入光标处'); return; }
    var i = idxOf(inp);
    var item = (state.question.items || [])[i] || {};
    setText(state.paletteTarget, '正在输入：第 ' + (i + 1) + ' 项' + (item.text ? '「' + item.text + '」' : ''));
  }
  function focusNext(i) {
    if (!state) return;
    if (state.inputs[i + 1]) { state.inputs[i + 1].focus(); return; }
    if (state.subInputs[0]) { state.subInputs[0].focus(); return; }
    if (state.inputs[i]) state.inputs[i].blur();
  }

  /* ---------------- 面板构建 ---------------- */
  function paletteKey(text, opts) {
    opts = opts || {};
    var cls = 'palette-key ip-key' + (opts.tone ? ' ip-tone-key' : '');
    var btn = mk('button', cls);
    btn.type = 'button';
    btn.title = opts.title || text;
    btn.setAttribute('aria-label', '插入 ' + (opts.title || text));
    if (opts.tone) {
      btn.appendChild(mkText('span', 'ip-tone-num', text));
      btn.appendChild(mkText('span', 'ip-tone-name', opts.title || ''));
    } else {
      setText(btn, text);
    }
    // 关键：按下不抢焦点，输入框光标/选区保持不变
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (opts.tone) insertTone(text);
      else insertText(text);
    });
    return btn;
  }
  function paletteGroup(label, keys, extraCls) {
    var g = mk('div', 'palette-group' + (extraCls ? ' ' + extraCls : ''));
    g.appendChild(mkText('div', 'palette-glabel', label));
    var row = mk('div', 'palette-keys');
    (keys || []).forEach(function (k) {
      if (typeof k === 'string') row.appendChild(paletteKey(k));
      else row.appendChild(paletteKey(k.text, k));
    });
    g.appendChild(row);
    return g;
  }
  function buildPalette() {
    var collapsed = !!state.collapsed;
    var pal = mk('div', 'palette ip-palette' + (collapsed ? ' is-collapsed' : ''));
    pal.setAttribute('role', 'group');
    pal.setAttribute('aria-label', '国际音标面板');

    var hd = mk('div', 'palette-hd ip-palette-hd');
    var titleBtn = mk('button', 'ip-palette-titlebtn');
    titleBtn.type = 'button';
    titleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    titleBtn.setAttribute('aria-controls', 'ip-palette-body');
    titleBtn.appendChild(mkText('span', 'ip-palette-title', '音标面板'));
    var stateText = mkText('span', 'ip-palette-state', collapsed ? '· 展开 ▾' : '');
    titleBtn.appendChild(stateText);
    on(titleBtn, 'click', function (e) {
      e.preventDefault();
      setCollapsed(!(state && state.collapsed));
    });

    var target = mkText('span', 'ip-target', '点输入框后，点符号插入光标处（默认第 1 项）');
    var collapseBtn = mkText('button', 'btn btn--primary btn--sm ip-palette-collapse', '收起 ▴');
    collapseBtn.type = 'button';
    on(collapseBtn, 'click', function (e) {
      e.preventDefault();
      setCollapsed(true);
    });

    hd.appendChild(titleBtn);
    hd.appendChild(target);
    hd.appendChild(collapseBtn);
    pal.appendChild(hd);

    var body = mk('div', 'palette-bd ip-palette-body');
    body.id = 'ip-palette-body';

    // 顶部控制条：声调（只 55/35/214/51/21，轻声不标调）+ 附加符号
    var strip = mk('div', 'ip-strip');
    strip.appendChild(paletteGroup('声调', TONES.map(function (t) {
      return { text: t.v, title: t.n, tone: true };
    }), 'ip-group--tones'));
    strip.appendChild(paletteGroup('附加符号', DIACRITICS, 'ip-group--diacritics'));
    body.appendChild(strip);

    // 元音 | 辅音 两栏
    var cols = mk('div', 'ip-cols');
    var vcol = mk('div', 'ip-col');
    vcol.appendChild(paletteGroup('元音', VOWELS, 'ip-group--vowels'));
    var ccol = mk('div', 'ip-col ip-col--cons');
    ccol.appendChild(paletteGroup('辅音 · 普通话', CONSONANTS_BASE, 'ip-group--consonants ip-group--cons-base'));
    ccol.appendChild(paletteGroup('辅音 · 国际音标常用', CONSONANTS_MORE, 'ip-group--consonants ip-group--cons-more'));
    cols.appendChild(vcol);
    cols.appendChild(ccol);
    body.appendChild(cols);
    pal.appendChild(body);

    // 底部操作
    var ft = mk('div', 'ip-palette-ft');
    var bSpace = mkText('button', 'btn btn--ghost btn--sm ip-op', '插入空格');
    bSpace.type = 'button';
    on(bSpace, 'click', function (e) { e.preventDefault(); insertText(' '); });
    var bDel = mkText('button', 'btn btn--ghost btn--sm ip-op', '⌫ 退格');
    bDel.type = 'button';
    on(bDel, 'click', function (e) { e.preventDefault(); deleteBack(); });
    var bClear = mkText('button', 'btn btn--ghost btn--sm ip-op', '清空本项');
    bClear.type = 'button';
    on(bClear, 'click', function (e) { e.preventDefault(); clearTarget(); });
    ft.appendChild(bSpace);
    ft.appendChild(bDel);
    ft.appendChild(bClear);
    pal.appendChild(ft);

    state.palette = pal;
    state.paletteBody = body;
    state.paletteTarget = target;
    state.paletteToggle = titleBtn;
    state.paletteStateText = stateText;
    state.paletteCollapse = collapseBtn;
    state.paletteFt = ft;
    return pal;
  }

  /* ---------------- 卡片构建 ---------------- */
  function buildItem(item, i) {
    var it = item || {};
    var card = mk('div', 'ip-item');
    card.dataset.idx = String(i);

    var hd = mk('div', 'ip-item-hd');
    var no = mkText('span', 'ip-item-no', String(i + 1));
    var hanzi = mkText('div', 'ip-hanzi' + (safeStr(it.text).length > 6 ? ' ip-hanzi--long' : ''), safeStr(it.text));
    hd.appendChild(no);
    hd.appendChild(hanzi);
    var noteText = safeStr(it.note);
    if (noteText && noteText.length <= 8) hd.appendChild(mkText('span', 'badge badge--gold ip-item-badge', noteText));
    card.appendChild(hd);

    var meta = mk('div', 'ip-item-meta');
    var sylEl = mkText('span', 'ip-syl', '0 音节');
    meta.appendChild(sylEl);
    card.appendChild(meta);

    var input = mk('input', 'input input--mono ip-input');
    input.type = 'text';
    input.setAttribute('inputmode', 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.placeholder = '如 pʰiɛn51；轻声不标调';
    input.dataset.idx = String(i);
    card.appendChild(input);

    if (noteText && noteText.length > 8) card.appendChild(mkText('div', 'ip-item-note faint', noteText));

    on(input, 'focus', function () {
      if (!state) return;
      state.lastInput = input;
      saveCaret(input);
      markFocus(input);
      updateTargetLabel();
      // 窄屏面板展开时把输入框滚到可见区（面板在文档流内，不会盖住输入框）
      if (window.innerWidth <= 620) {
        setTimeout(function () {
          try { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* 老浏览器忽略 */ }
        }, 120);
      }
    });
    on(input, 'input', function () {
      saveCaret(input);
      refreshItem(i);
      markFocus(input);
      updateTargetLabel();
      notifyChange();
    });
    on(input, 'keyup', function () { saveCaret(input); });
    on(input, 'click', function () { saveCaret(input); });
    on(input, 'select', function () { saveCaret(input); });
    on(input, 'blur', function () { saveCaret(input); });
    on(input, 'keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); focusNext(i); }
    });

    state.inputs.push(input);
    state.itemUi.push({ i: i, card: card, input: input, sylEl: sylEl });
    return card;
  }

  function charCount(s) {
    var t = safeStr(s).replace(/\s/g, '');
    return t.length;
  }
  function buildSub(sq, i) {
    var block = mk('div', 'ip-sub');
    var lab = mkText('label', 'label ip-sub-q', (i + 1) + '. ' + safeStr(sq && sq.q));
    var ta = mk('textarea', 'textarea ip-sub-input');
    ta.rows = 3;
    ta.placeholder = '分点写出要点即可（离线按关键词覆盖判分）';
    ta.setAttribute('spellcheck', 'false');
    ta.dataset.idx = String(i);
    var meta = mkText('div', 'ip-sub-meta faint', '0 字 · 建议分点作答');
    on(ta, 'focus', function () { if (state) state.lastSub = ta; });
    on(ta, 'input', function () {
      setText(meta, charCount(ta.value) + ' 字 · 建议分点作答');
      notifyChange();
    });
    block.appendChild(lab);
    block.appendChild(ta);
    block.appendChild(meta);
    state.subInputs.push(ta);
    state.subUi.push({ i: i, ta: ta, meta: meta });
    return block;
  }

  /* ---------------- 答案读写 ---------------- */
  function readUserAnswer(question, userAnswer) {
    var out = { items: [], subs: [] };
    var ua = userAnswer;
    if (typeof ua === 'string') out.items = [ua];
    else if (Array.isArray(ua)) out.items = ua.slice();
    else if (ua && typeof ua === 'object') {
      if (Array.isArray(ua.items)) out.items = ua.items.slice();
      if (Array.isArray(ua.subs)) out.subs = ua.subs.slice();
      else if (Array.isArray(ua.subQuestions)) out.subs = ua.subQuestions.slice();
    }
    function str(x) {
      if (x == null) return '';
      if (typeof x === 'string') return x;
      if (typeof x === 'number') return String(x);
      if (typeof x === 'object' && typeof x.value === 'string') return x.value;
      return '';
    }
    return { items: out.items.map(str), subs: out.subs.map(str) };
  }
  function applyAnswer(a) {
    if (!state || !a) return;
    var ua = readUserAnswer(state.question, a);
    for (var i = 0; i < state.inputs.length; i++) {
      if (i < ua.items.length) state.inputs[i].value = ua.items[i];
    }
    for (var j = 0; j < state.subInputs.length; j++) {
      if (j < ua.subs.length) state.subInputs[j].value = ua.subs[j];
    }
    for (var k = 0; k < state.subUi.length; k++) {
      setText(state.subUi[k].meta, charCount(state.subUi[k].ta.value) + ' 字 · 建议分点作答');
    }
    state.caret = null;
    refreshAll();
    updateTargetLabel();
  }
  function currentAnswer() {
    if (!state) return { items: [], subs: [] };
    return {
      items: state.inputs.map(function (inp) { return safeStr(inp.value).trim(); }),
      subs: state.subInputs.map(function (ta) { return safeStr(ta.value).trim(); })
    };
  }

  /* ---------------- 解析/对照 ---------------- */
  function sameAnswer(userText, answer, alternatives) {
    if (!safeStr(userText).trim()) return false;
    if (ipaEquivalent(userText, answer)) return true;
    for (var i = 0; i < (alternatives || []).length; i++) {
      if (ipaEquivalent(userText, alternatives[i])) return true;
    }
    return false;
  }
  function errName(code) {
    try {
      var m = window.errMeta && window.errMeta('ipa', code);
      if (m) return m.name || code;
    } catch (e) { /* ignore */ }
    return code;
  }

  function renderSolution(root, question, userAnswer) {
    if (!root || !root.appendChild) return;
    var q = question || {};
    var ua = readUserAnswer(q, userAnswer);
    var box = mk('div', 'ip-solution');
    var items = Array.isArray(q.items) ? q.items : [];
    items.forEach(function (it, i) {
      var rawAlts = Array.isArray(it.alternatives) ? it.alternatives : [];
      var row = mk('div', 'ip-sol-row');
      var hd = mk('div', 'ip-sol-hd');
      hd.appendChild(mkText('span', 'ip-sol-hanzi', safeStr(it.text)));
      hd.appendChild(mkText('span', 'ip-sol-std mono', stripNeutralZero(it.answer)));
      row.appendChild(hd);
      if (rawAlts.length) {
        row.appendChild(mkText('div', 'ip-sol-alt faint',
          '其他可接受读音：' + rawAlts.map(stripNeutralZero).join(' / ')));
      }
      var mineRaw = safeStr(ua.items[i]);
      if (mineRaw) {
        var ok = sameAnswer(mineRaw, it.answer, rawAlts);
        var ur = mk('div', 'ip-sol-user ' + (ok ? 'is-ok' : 'is-bad'));
        ur.appendChild(mkText('span', 'ip-sol-tag', ok ? '✓ 你的答案' : '✕ 你的答案'));
        ur.appendChild(mkText('span', 'mono', stripNeutralZero(mineRaw)));
        row.appendChild(ur);
      }
      if (it.note) row.appendChild(mkText('div', 'ip-item-note faint', safeStr(it.note)));
      box.appendChild(row);
    });
    var subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
    if (subs.length) {
      box.appendChild(mkText('div', 'ip-sol-subtitle', '音位分析 · 参考答案'));
      subs.forEach(function (sq, i) {
        var block = mk('div', 'ip-sol-sub');
        block.appendChild(mkText('div', 'ip-sol-q', (i + 1) + '. ' + safeStr(sq.q)));
        block.appendChild(mkText('div', 'ip-sol-ref', safeStr(sq.answer)));
        var kps = Array.isArray(sq.keyPoints) ? sq.keyPoints : [];
        if (kps.length) {
          var chips = mk('div', 'row-wrap ip-sol-kps');
          kps.forEach(function (kp) { chips.appendChild(mkText('span', 'chip chip--sm', safeStr(kp))); });
          block.appendChild(chips);
        }
        box.appendChild(block);
      });
    }
    root.appendChild(box);
  }

  function renderResultDetail(root, question, userAnswer, gradeResult) {
    if (!root || !root.appendChild) return;
    var review = gradeResult && gradeResult.review;
    if (!review) return;
    var hasItems = Array.isArray(review.items) && review.items.length;
    var hasSubs = Array.isArray(review.subs) && review.subs.length;
    if (!hasItems && !hasSubs) return;
    var box = mk('div', 'ip-detail');
    box.appendChild(mkText('div', 'ip-detail-title', '逐项对照'));

    if (hasItems) {
      review.items.forEach(function (rec) {
        var row = mk('div', 'ip-detail-item');
        var top = mk('div', 'ip-detail-top');
        top.appendChild(mkText('span', 'ip-detail-hanzi', safeStr(rec.text) || ('第 ' + (rec.idx + 1) + ' 项')));
        var pct = Math.round((rec.rate || 0) * 100);
        top.appendChild(mkText('span', 'ip-detail-score' + (pct >= 100 ? ' is-full' : (pct >= 60 ? '' : ' is-low')), pct + ' 分'));
        row.appendChild(top);
        var line1 = mk('div', 'ip-detail-line');
        line1.appendChild(mkText('span', 'ip-detail-lab', '标准'));
        line1.appendChild(mkText('span', 'mono', stripNeutralZero(rec.answer)));
        row.appendChild(line1);
        var line2 = mk('div', 'ip-detail-line');
        line2.appendChild(mkText('span', 'ip-detail-lab', '你的'));
        line2.appendChild(mkText('span', 'mono' + (safeStr(rec.user) ? '' : ' faint'), safeStr(rec.user) ? stripNeutralZero(rec.user) : '（空）'));
        row.appendChild(line2);
        if (Array.isArray(rec.syllables) && rec.syllables.length) {
          var syls = mk('div', 'ip-detail-syls');
          rec.syllables.forEach(function (s) {
            var chip = mk('span', 'ip-syl-chip' + (s.missing ? ' is-missing' : ''));
            if (s.missing) {
              setText(chip, s.std ? ('缺 ' + stripNeutralZero(s.std)) : ('多 ' + stripNeutralZero(s.user)));
            } else {
              chip.appendChild(mkText('span', 'mono', stripNeutralZero(s.std)));
              chip.appendChild(mkText('span', 'mono ip-syl-arrow', ' → ' + stripNeutralZero(s.user)));
              ['initial', 'final', 'tone'].forEach(function (k) {
                var label = { initial: '声', final: '韵', tone: '调' }[k];
                chip.appendChild(mkText('span', 'ip-el ip-el--' + k + (s[k] ? ' is-ok' : ' is-bad'), label + (s[k] ? '✓' : '✗')));
              });
            }
            syls.appendChild(chip);
          });
          row.appendChild(syls);
        }
        if (rec.normRate != null && rec.normRate < 1) {
          row.appendChild(mkText('div', 'ip-detail-note', '标写规范项扣分（' + Math.round((1 - rec.normRate) * 100) / 10 + ' 分）'));
        }
        var codes = uniqArr(rec.codes || []);
        if (codes.length) {
          var cbox = mk('div', 'row-wrap ip-detail-codes');
          codes.forEach(function (code) {
            cbox.appendChild(mkText('span', 'badge badge--red ip-code', errName(code)));
          });
          row.appendChild(cbox);
        }
        box.appendChild(row);
      });
    }
    if (hasSubs) {
      box.appendChild(mkText('div', 'ip-detail-subtitle', '音位小题'));
      review.subs.forEach(function (rec) {
        var row = mk('div', 'ip-detail-item');
        var top = mk('div', 'ip-detail-top');
        top.appendChild(mkText('span', 'ip-detail-hanzi ip-detail-q', safeStr(rec.q)));
        top.appendChild(mkText('span', 'ip-detail-score' + (rec.rate >= 1 ? ' is-full' : ''), Math.round((rec.rate || 0) * 100) + '%'));
        row.appendChild(top);
        var stats = [];
        if (typeof rec.cov === 'number') stats.push('关键词覆盖 ' + Math.round(rec.cov * 100) + '%');
        if (typeof rec.sim === 'number') stats.push('参考答案相似度 ' + Math.round(rec.sim * 100) + '%');
        if (stats.length) row.appendChild(mkText('div', 'ip-detail-stats', stats.join(' · ')));
        var hit = Array.isArray(rec.hit) ? rec.hit : [];
        var miss = Array.isArray(rec.miss) ? rec.miss : [];
        if (hit.length || miss.length) {
          var w = mk('div', 'row-wrap ip-detail-kps');
          hit.forEach(function (kp) { w.appendChild(mkText('span', 'chip chip--sm ip-kp-hit', '✓ ' + safeStr(kp))); });
          miss.forEach(function (kp) { w.appendChild(mkText('span', 'chip chip--sm ip-kp-miss', '✕ ' + safeStr(kp))); });
          row.appendChild(w);
        }
        if (safeStr(rec.user)) row.appendChild(mkText('div', 'ip-detail-line faint', '你的作答：' + safeStr(rec.user)));
        box.appendChild(row);
      });
    }
    root.appendChild(box);
  }

  /* ---------------- 生命周期 ---------------- */
  function destroy() {
    if (!state) return;
    try { document.removeEventListener('pointerdown', onDocPointerDown, true); } catch (e) { /* ignore */ }
    try { document.removeEventListener('keydown', onDocKeydown); } catch (e) { /* ignore */ }
    state.dead = true;
    state = null;
  }

  var api = {
    id: 'ipa',
    label: '国际音标',
    shortcuts: [
      { keys: '空格', desc: '分音节' },
      { keys: 'Enter', desc: '跳到下一项' }
    ],

    mount: function (root, ctx) {
      try {
        destroy();
        if (!root || !root.appendChild) return;
        var context = ctx || {};
        var q = context.question || {};
        state = {
          root: root, ctx: context, question: q,
          inputs: [], itemUi: [], subInputs: [], subUi: [],
          lastInput: null, lastSub: null, caret: null,
          palette: null, paletteBody: null, paletteTarget: null, paletteToggle: null,
          paletteStateText: null, paletteCollapse: null, paletteFt: null,
          collapsed: readPanelCollapsed(), dead: false
        };
        while (root.firstChild) root.removeChild(root.firstChild);
        var wrap = mk('div', 'ip-wrap ip-wrap--' + safeStr(q.kind || 'word'));
        var items = Array.isArray(q.items) ? q.items : [];
        var subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];

        if (items.length) wrap.appendChild(buildPalette());
        if (items.length) {
          wrap.appendChild(mkText('div', 'ip-global-hint',
            '可键盘直接输入；空格分音节；声调打 55/35/214/51/21，轻声不标调。点「音标面板 · 展开」选符号。'));
        }
        if (items.length) {
          var wide = q.kind === 'sentence' || q.kind === 'poem';
          var itemsWrap = mk('div', 'ip-items' + (wide ? ' ip-items--wide' : ''));
          for (var i = 0; i < items.length; i++) itemsWrap.appendChild(buildItem(items[i], i));
          wrap.appendChild(itemsWrap);
        }
        if (subs.length) {
          var subWrap = mk('div', 'ip-subs');
          subWrap.appendChild(mkText('div', 'ip-subs-title', '音位分析'));
          for (var j = 0; j < subs.length; j++) subWrap.appendChild(buildSub(subs[j], j));
          wrap.appendChild(subWrap);
        }
        if (!items.length && !subs.length) {
          wrap.appendChild(mkText('div', 'empty', '本题暂无需要作答的内容'));
        }
        root.appendChild(wrap);
        document.addEventListener('pointerdown', onDocPointerDown, true);
        document.addEventListener('keydown', onDocKeydown);
        refreshAll();
        if (context.savedAnswer) applyAnswer(context.savedAnswer);
        updateTargetLabel();
      } catch (e) {
        // 模块挂载异常不影响页面其它部分；把错误降到控制台
        try { if (window.console && console.error) console.error('[ipa module] mount 失败', e); } catch (e2) {}
      }
    },

    getAnswer: currentAnswer,

    setAnswer: function (a) { applyAnswer(a); },

    isAnswered: function () {
      if (!state) return false;
      for (var i = 0; i < state.inputs.length; i++) if (safeStr(state.inputs[i].value).trim()) return true;
      for (var j = 0; j < state.subInputs.length; j++) if (safeStr(state.subInputs[j].value).trim()) return true;
      return false;
    },

    reset: function () {
      if (!state) return;
      for (var i = 0; i < state.inputs.length; i++) state.inputs[i].value = '';
      for (var j = 0; j < state.subInputs.length; j++) state.subInputs[j].value = '';
      for (var k = 0; k < state.subUi.length; k++) setText(state.subUi[k].meta, '0 字 · 建议分点作答');
      state.lastInput = null;
      state.caret = null;
      refreshAll();
      for (var m = 0; m < state.itemUi.length; m++) toggleClass(state.itemUi[m].card, 'is-focus', false);
      updateTargetLabel();
      notifyChange();
    },

    renderSolution: renderSolution,
    renderResultDetail: renderResultDetail,

    destroy: destroy
  };

  window.PRACTICE_MODULES.ipa = api;
})();
