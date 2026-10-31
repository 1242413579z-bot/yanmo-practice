/* ============================================================================
   practice/js/modules/syntax.js — 句法分析编辑器（window.PRACTICE_MODULES.syntax）
   体验（对照契约 §6.1 + 传统层次分析图需求）：
   - 顶部：句子按单字展示，字缝可点落刀（.sx-slot / .sx-palette / [data-rel] 保持兼容）
   - 下方：实时「层次分析图」——每个结构一条横括号 + 括号上关系名 + 括号下成分角色
     （主谓→主/谓、述宾→动/宾、偏正→偏/正、中补→中/补、介宾→介/宾…），按层分行，
     每层左侧「第 N 层」徽标，不同层用不同颜色，当前待切层高亮，未切成分显示虚线占位。
   - 默认「逐层分析」（cuts 带 span，层次判分）；「整句快切」只判位置+关系、不计层次。
   - 撤销 / 清空 / 刀数+层数统计；键盘 1–9 选关系、Esc 取消、Backspace 撤销。
   ========================================================================== */
(function () {
  'use strict';

  var GC = window.GC;

  /* =========================================================================
     0. 基础工具
     ========================================================================= */
  function UIref() {
    return window.UI || null;
  }

  // 统一造元素：优先用 window.UI.el（契约 §4.3），不可用时回退原生 DOM
  function el(tag, cls, text) {
    var node = null;
    var UI = UIref();
    if (UI && typeof UI.el === 'function') {
      try { node = UI.el(tag, cls ? { class: cls } : undefined); } catch (e) { node = null; }
    }
    if (!node) {
      node = document.createElement(tag);
      if (cls) node.className = cls;
    } else if (cls) {
      node.className = cls;
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function clearNode(node) {
    if (!node) return;
    if ('textContent' in node) node.textContent = '';
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function data(node, key, val) {
    if (!node || !node.setAttribute) return;
    node.setAttribute('data-' + key, String(val));
  }

  function toast(msg, kind) {
    var UI = UIref();
    if (UI && typeof UI.toast === 'function') {
      try { UI.toast(msg, kind || 'info'); return; } catch (e) { /* ignore */ }
    }
  }

  function askConfirm(msg) {
    var UI = UIref();
    if (UI && typeof UI.confirm === 'function') {
      try { return Promise.resolve(UI.confirm(msg)); } catch (e) { /* ignore */ }
    }
    return Promise.resolve(true);
  }

  function closestTo(node, selector, stop) {
    var guard = 0;
    while (node && node !== stop && guard++ < 24) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function attrNum(node, name) {
    if (!node) return NaN;
    var v = null;
    if (node.getAttribute) v = node.getAttribute('data-' + name);
    else if (node.dataset) v = node.dataset[name];
    return parseInt(v, 10);
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* =========================================================================
     1. 关系词表 & 成分角色映射
     ========================================================================= */
  var BASE_SINGLE = ['主谓', '述宾', '偏正', '中补', '联合', '连谓', '兼语', '双宾', '介宾'];
  var EXTRA_SINGLE = ['数量', '方位', '同位', '的字短语', '比况', '量词', '定中', '状中'];

  function singleLabels(extra) {
    var list = BASE_SINGLE.slice();
    if (extra) list = list.concat(EXTRA_SINGLE);
    return list.filter(function (l) { return GC.REL_SINGLE.indexOf(l) >= 0; });
  }
  function compoundLabels() {
    return (GC.REL_COMPOUND || []).slice();
  }
  function isCompoundQuestion(q) {
    return !!(q && q.relations === 'compound');
  }

  // 括号下方「成分角色」：用户要求「偏正 → 前偏后正」这类标注
  var ROLE_MAP = {
    '主谓': ['主', '谓'],
    '述宾': ['动', '宾'],
    '偏正': ['偏', '正'],
    '定中': ['定', '中'],
    '状中': ['状', '中'],
    '中补': ['中', '补'],
    '介宾': ['介', '宾'],
    '数量': ['数', '量'],
    '量词': ['数', '量'],
    '方位': ['名', '方'],
    '同位': ['本', '同'],
    '的字短语': ['前', '的'],
    '比况': ['前', '比'],
    '兼语': ['动', '兼语', '谓'],
    '双宾': ['动', '近宾', '远宾']
  };
  var NUMBER_ROLES = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  function numberedRoles(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(NUMBER_ROLES[i] || String(i + 1));
    return out;
  }
  function roleLabels(rel, n) {
    var label = rel || '';
    if (label === '联合' || label === '连谓' || label === '动语') return numberedRoles(n);
    if ((GC.REL_COMPOUND || []).indexOf(label) >= 0) {
      return n === 2 ? ['前分句', '后分句'] : numberedRoles(n);
    }
    var base = ROLE_MAP[label];
    if (base) {
      if (base.length === n) return base;
      if (label === '兼语' && n === 2) return ['动', '兼语'];
      if (label === '双宾' && n === 2) return ['动', '宾'];
      if (n === 2) return [base[0], base[base.length - 1]];
      if (n < base.length) return base.slice(0, n);
      return base.concat(numberedRoles(n - base.length));
    }
    return n === 2 ? ['前', '后'] : numberedRoles(n);
  }

  /* =========================================================================
     2. 模块状态
     ========================================================================= */
  var st = {
    root: null,
    ctx: null,
    question: null,
    sentence: '',
    chars: [],
    length: 0,
    mode: 'layered',           // 'layered' 逐层分析（默认） | 'whole' 整句快切
    cuts: [],                  // 当前分析的 [{gap, rel, span?}]（工作副本）
    analyses: [],              // [{label, cuts, mode}] 多解：每份独立分析
    active: 0,                 // 当前分析下标
    readingsInfo: null,        // mount 时解析的 tree / readings 信息（多解提示用）
    history: [],
    selStart: 0,
    els: {},
    blockTree: null,
    selBlock: null,
    palette: null,
    paletteGap: null,
    paletteKind: 'add',
    paletteAnchor: null,
    paletteKeyMap: null,
    onKey: null,
    onDocDown: null,
    onResize: null
  };

  var MAX_HISTORY = 60;

  /* =========================================================================
     3. 答案读取 / 快照 / 小工具
     ========================================================================= */
  function cloneCuts(cuts) {
    return (cuts || []).map(function (c) {
      var o = { gap: c.gap, rel: c.rel || '' };
      if (Array.isArray(c.span) && c.span.length === 2) o.span = [c.span[0], c.span[1]];
      return o;
    });
  }

  function readAnswerCuts(answer, length) {
    if (!answer || !Array.isArray(answer.cuts)) return [];
    var seen = {};
    var out = [];
    answer.cuts.forEach(function (c) {
      if (!c || typeof c.gap !== 'number' || !isFinite(c.gap)) return;
      var gap = Math.round(c.gap);
      if (gap < 1 || gap > length - 1 || seen[gap]) return;
      seen[gap] = 1;
      var cut = { gap: gap, rel: c.rel == null ? '' : String(c.rel) };
      if (Array.isArray(c.span) && c.span.length === 2 &&
        isNum(c.span[0]) && isNum(c.span[1])) {
        cut.span = [Math.round(c.span[0]), Math.round(c.span[1])];
      }
      out.push(cut);
    });
    return out;
  }

  function pushHistory() {
    st.history.push(cloneCuts(st.cuts));
    while (st.history.length > MAX_HISTORY) st.history.shift();
  }

  function notifyChange() {
    try {
      if (st.ctx && typeof st.ctx.onChange === 'function') st.ctx.onChange();
    } catch (e) { /* 不把 app 的异常带进模块 */ }
  }

  function subText(start, end) {
    return st.chars.slice(start, end).join('');
  }

  function findCut(gap) {
    for (var i = 0; i < st.cuts.length; i++) {
      if (st.cuts[i].gap === gap) return st.cuts[i];
    }
    return null;
  }

  /* =========================================================================
     4. 分层结构树（由带 span 的刀位重建；每块带 depth）
     ========================================================================= */
  function buildBlockTree(length, cuts) {
    var root = { start: 0, end: length, cut: null, left: null, right: null, depth: 0 };
    var leaves = [root];
    var usable = (cuts || []).filter(function (c) {
      return c && Array.isArray(c.span) && c.span.length === 2 &&
        c.span[0] >= 0 && c.span[1] <= length && c.span[0] < c.gap && c.gap < c.span[1];
    });
    usable.slice().sort(function (a, b) {
      return (b.span[1] - b.span[0]) - (a.span[1] - a.span[0]);
    }).forEach(function (c) {
      for (var i = 0; i < leaves.length; i++) {
        var b = leaves[i];
        if (b.start === c.span[0] && b.end === c.span[1]) {
          b.cut = c;
          b.left = { start: b.start, end: c.gap, cut: null, left: null, right: null, depth: (b.depth || 0) + 1 };
          b.right = { start: c.gap, end: b.end, cut: null, left: null, right: null, depth: (b.depth || 0) + 1 };
          leaves.splice(i, 1, b.left, b.right);
          return;
        }
      }
    });
    return { root: root, leaves: leaves };
  }

  function findLeaf(leaves, start) {
    for (var i = 0; i < leaves.length; i++) {
      if (leaves[i].start === start) return leaves[i];
    }
    return null;
  }

  /* =========================================================================
     4.1 多份分析（多解 / 歧义）状态管理
     ========================================================================= */
  var CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function defaultAnalysisLabel(i) {
    return '分析' + (CN_DIGITS[i] || String(i + 1));
  }

  // 把当前工作副本写回当前分析
  function syncActiveAnalysis() {
    if (!st.analyses.length) {
      st.analyses.push({ label: defaultAnalysisLabel(0), cuts: [], mode: 'layered' });
      st.active = 0;
    }
    if (st.active < 0 || st.active >= st.analyses.length) st.active = 0;
    var a = st.analyses[st.active];
    a.cuts = cloneCuts(st.cuts);
    a.mode = st.mode === 'whole' ? 'whole' : 'layered';
  }

  // 切换到某份分析
  function loadAnalysis(index) {
    if (!st.analyses.length) {
      st.analyses.push({ label: defaultAnalysisLabel(0), cuts: [], mode: 'layered' });
    }
    if (index < 0 || index >= st.analyses.length) index = 0;
    st.active = index;
    var a = st.analyses[index];
    st.cuts = cloneCuts(a.cuts);
    st.mode = a.mode === 'whole' ? 'whole' : 'layered';
    st.history = [];
    st.selStart = 0;
    st.blockTree = null;
    st.selBlock = null;
  }

  function filledAnalysesCount() {
    var n = 0;
    st.analyses.forEach(function (a) { if (a && a.cuts && a.cuts.length) n++; });
    return n;
  }

  function switchAnalysis(index) {
    if (!st.root || index === st.active) return;
    syncActiveAnalysis();
    loadAnalysis(index);
    closePalette();
    render();
  }

  function addAnalysis() {
    syncActiveAnalysis();
    st.analyses.push({ label: defaultAnalysisLabel(st.analyses.length), cuts: [], mode: 'layered' });
    loadAnalysis(st.analyses.length - 1);
    closePalette();
    render();
    notifyChange();
    toast('已新增「' + st.analyses[st.active].label + '」，可以开始分析另一种读法', 'ok');
  }

  function deleteAnalysis() {
    if (st.analyses.length <= 1) {
      toast('至少保留一份分析', 'info');
      return;
    }
    syncActiveAnalysis();
    var removed = st.analyses.splice(st.active, 1)[0];
    st.active = Math.min(st.active, st.analyses.length - 1);
    loadAnalysis(st.active);
    closePalette();
    render();
    notifyChange();
    toast('已删除「' + (removed.label || '分析') + '」', 'info');
  }

  function renameActiveAnalysis(label) {
    syncActiveAnalysis();
    var a = st.analyses[st.active];
    if (!a) return;
    var next = String(label == null ? '' : label).trim().slice(0, 12);
    if (!next) next = defaultAnalysisLabel(st.active);
    a.label = next;
    renderTabs();
    toast('已重命名为「' + next + '」', 'ok');
  }

  function openRenameAnalysis() {
    syncActiveAnalysis();
    var cur = (st.analyses[st.active] && st.analyses[st.active].label) || defaultAnalysisLabel(st.active);
    var UI = UIref();
    if (UI && typeof UI.modal === 'function') {
      var input = el('input', 'input sx-rename-input');
      input.value = cur;
      if (input.setAttribute) input.setAttribute('maxlength', '12');
      var wrap = el('div', 'sx-rename-wrap');
      wrap.appendChild(el('div', 'hint', '给这份分析起个名字（默认「分析一 / 分析二…」）'));
      wrap.appendChild(input);
      try {
        UI.modal({
          title: '重命名分析',
          el: wrap,
          actions: [
            { label: '取消' },
            {
              label: '确定',
              kind: 'primary',
              onClick: function () { renameActiveAnalysis(input.value); }
            }
          ]
        });
        return;
      } catch (e) { /* fallback */ }
    }
    try {
      var v = window.prompt('重命名分析', cur);
      if (v != null) renameActiveAnalysis(v);
    } catch (e2) { /* ignore */ }
  }

  /* =========================================================================
     4.2 题目标准读法解析（单解 tree / 多解 readings）
     ========================================================================= */
  function readQuestionReadings(question) {
    if (!question || typeof question.sentence !== 'string' || !question.sentence) {
      return { ok: false, err: '题目缺少 sentence' };
    }
    var len = question.sentence.length;
    var readings = [];
    var multi = false;
    if (Array.isArray(question.readings) && question.readings.length) {
      multi = question.readings.length > 1;
      for (var i = 0; i < question.readings.length; i++) {
        var raw = question.readings[i] || {};
        if (typeof raw.tree !== 'string' || !raw.tree) {
          return { ok: false, err: '读法' + (i + 1) + '缺少标准树' };
        }
        var parsed = GC.parseTree(raw.tree);
        if (!parsed.ok) return { ok: false, err: '读法' + (i + 1) + '标准树无法解析：' + parsed.err };
        var leaves = GC.treeLeaves(parsed.root);
        if (leaves.join('') !== question.sentence) {
          return { ok: false, err: '读法' + (i + 1) + '的树叶子与句子不一致' };
        }
        readings.push({
          index: i,
          label: raw.label || ('读法' + (CN_DIGITS[i] || (i + 1))),
          meaning: raw.meaning || '',
          root: parsed.root,
          pretty: GC.treePretty(parsed.root),
          stdCuts: GC.treeCuts(parsed.root)
        });
      }
      return { ok: true, multi: multi, readings: readings, len: len };
    }
    if (typeof question.tree === 'string' && question.tree) {
      var one = GC.parseTree(question.tree);
      if (!one.ok) return { ok: false, err: '标准树无法解析：' + one.err };
      var oneLeaves = GC.treeLeaves(one.root);
      if (oneLeaves.join('') !== question.sentence) {
        return { ok: false, err: '标准树叶子与句子不一致' };
      }
      readings.push({
        index: 0,
        label: '标准答案',
        meaning: '',
        root: one.root,
        pretty: GC.treePretty(one.root),
        stdCuts: GC.treeCuts(one.root)
      });
      return { ok: true, multi: false, readings: readings, len: len };
    }
    return { ok: false, err: '缺少标准树：tree（单解）或 readings（多解）' };
  }

  // 当前用户树已切到第几层（= 最深内部节点层级）
  function treeLevels() {
    if (!st.cuts.length || st.mode !== 'layered') return 0;
    var tree = st.blockTree || buildBlockTree(st.length, st.cuts);
    function rec(block, level) {
      if (!block || !block.cut) return 0;
      var a = rec(block.left, level + 1);
      var b = rec(block.right, level + 1);
      return Math.max(level, a, b);
    }
    return rec(tree.root, 1);
  }

  /* =========================================================================
     5. 层次图数据模型
     ========================================================================= */
  function dtreeFromBlock(block, chars) {
    chars = chars || st.chars;
    if (!block) return { start: 0, end: 0, leaf: true, text: '' };
    if (!block.cut) {
      return { start: block.start, end: block.end, leaf: true, text: chars.slice(block.start, block.end).join('') };
    }
    return {
      start: block.start,
      end: block.end,
      leaf: false,
      label: block.cut.rel || '未标',
      gap: block.cut.gap,
      children: [dtreeFromBlock(block.left, chars), dtreeFromBlock(block.right, chars)]
    };
  }

  function dtreeFromParse(node, start) {
    if (typeof node === 'string') {
      return { start: start, end: start + node.length, leaf: true, text: node };
    }
    var acc = start;
    var children = node.children.map(function (child) {
      var d = dtreeFromParse(child, acc);
      acc = d.end;
      return d;
    });
    return { start: start, end: acc, leaf: false, label: node.label, children: children };
  }

  function collectDiagram(rootD) {
    var levels = [];
    var leaves = [];
    (function walk(node, depth) {
      if (node.leaf) {
        leaves.push({ start: node.start, end: node.end, depth: depth, text: node.text });
        return;
      }
      (levels[depth] || (levels[depth] = [])).push(node);
      node.children.forEach(function (c) { walk(c, depth + 1); });
    })(rootD, 0);
    return { levels: levels, leaves: leaves, maxLevel: levels.length, root: rootD };
  }

  /* =========================================================================
     6. 层次分析图渲染
     ========================================================================= */
  var DG_DEPTH_CLASSES = ['sx-dg-d0', 'sx-dg-d1', 'sx-dg-d2', 'sx-dg-d3', 'sx-dg-d4', 'sx-dg-d5'];

  function dgDepthClass(depth) {
    return DG_DEPTH_CLASSES[depth % DG_DEPTH_CLASSES.length];
  }

  function positionAbs(node, start, end, total) {
    var t = total || 1;
    node.style.left = (start / t * 100) + '%';
    node.style.width = Math.max(0.4, (end - start) / t * 100) + '%';
  }

  // 给叶子块标注「漏切虚影」：标准刀位落在该叶子内部 → 虚线 + 漏
  function decorateMiss(box, lf, opts) {
    if (!opts || !opts.diff || !opts.stdCuts) return;
    var missed = false;
    opts.stdCuts.forEach(function (sc) {
      if (sc.gap > lf.start && sc.gap < lf.end) {
        missed = true;
        var ghost = el('i', 'sx-dg-ghost');
        ghost.style.left = ((sc.gap - lf.start) / Math.max(1, lf.end - lf.start) * 100) + '%';
        ghost.title = '漏切：第 ' + sc.gap + ' 字后应切「' + sc.label + '」';
        ghost.appendChild(el('em', 'sx-dg-ghost-tag', '漏'));
        box.appendChild(ghost);
      }
    });
    if (missed) box.className += ' is-miss';
  }

  /**
   * 渲染层次分析图
   * @param {Object} rootD dtree 根
   * @param {Object} opts {totalLen, currentLevel, ghostSpan:[s,e], showSlots,
   *                       diff, stdCuts, gapStatus, onLeafClick}
   */
  function renderDiagram(rootD, opts) {
    opts = opts || {};
    var total = Math.max(1, opts.totalLen || (rootD.end - rootD.start) || 1);
    var model = collectDiagram(rootD);
    var wrap = el('div', 'sx-diagram');
    var tags = el('div', 'sx-dg-tags');
    var scroll = el('div', 'sx-dg-scroll');
    var body = el('div', 'sx-dg-body');
    body.style.width = total + 'em';

    /* --- 原文 / 叶子行 --- */
    var leafTag = el('div', 'sx-dg-tag sx-dg-tag--leaf');
    leafTag.appendChild(el('b', 'sx-dg-tag-name', '原文'));
    tags.appendChild(leafTag);
    var leafRow = el('div', 'sx-dg-row sx-dg-row--leaf');
    var leafPlot = el('div', 'sx-dg-plot');
    model.leaves.forEach(function (lf) {
      var box = el('div', 'sx-dg-leaf');
      positionAbs(box, lf.start, lf.end, total);
      box.textContent = lf.text;
      box.title = lf.text;
      decorateMiss(box, lf, opts);
      leafPlot.appendChild(box);
    });
    leafRow.appendChild(leafPlot);
    body.appendChild(leafRow);

    /* --- 每层：括号行 + 角色行 --- */
    for (var lv = 0; lv < model.maxLevel; lv++) {
      var nodes = model.levels[lv] || [];
      var levelNo = lv + 1;
      var row = el('div', 'sx-dg-row sx-dg-row--level');
      data(row, 'level', levelNo);
      var plot = el('div', 'sx-dg-plot');
      var relNames = [];

      nodes.forEach(function (node) {
        var colorCls = dgDepthClass(lv);
        var gapStatus = (opts.gapStatus && opts.gapStatus[node.gap]) || null;
        var status = gapStatus ? gapStatus.status : '';
        var bracketCls = 'sx-dg-node ' + colorCls;
        if (status === 'over' || status === 'inword') bracketCls += ' is-extra';
        else if (status === 'rel') bracketCls += ' is-wrong';
        var bracket = el('div', bracketCls);
        positionAbs(bracket, node.start, node.end, total);
        // 同层有多个结构时，括号之间留 2px 缝隙，避免相邻括号连成一条线看不清
        if (nodes.length > 1) {
          bracket.style.left = 'calc(' + (node.start / total * 100) + '% + 2px)';
          bracket.style.width = 'calc(' + ((node.end - node.start) / total * 100) + '% - 4px)';
        }
        data(bracket, 'gap', node.gap);
        data(bracket, 'level', levelNo);
        if (status) data(bracket, 'status', status);

        var relCls = 'sx-dg-rel' + (status === 'rel' ? ' is-wrong' : '') +
          (status === 'over' || status === 'inword' ? ' is-extra' : '');
        var relEl = el('span', relCls);
        if (status === 'rel' && gapStatus) {
          relEl.textContent = '你的：' + (gapStatus.got || '未标') + ' / 应为：' + (gapStatus.expected || node.label);
          relEl.title = '关系标错：你的「' + (gapStatus.got || '未标') + '」，标准「' + (gapStatus.expected || node.label) + '」';
        } else if (status === 'over' || status === 'inword') {
          relEl.textContent = (node.label || '未标') + '（多切）';
          relEl.title = '这一刀不在标准答案中';
        } else {
          relEl.textContent = node.label || '未标';
        }
        bracket.appendChild(relEl);

        // 作答视图里：点括号可改关系（比在句子行写关系名更清爽）
        if (opts.onNodeClick) {
          bracket.className += ' is-clickable';
          bracket.title = '关系「' + (node.label || '未标') + '」· 点击修改或删除';
          (function (g, elRef) {
            bracket.addEventListener('click', function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              opts.onNodeClick(g, elRef);
            });
          })(node.gap, bracket);
        }

        // 多项结构（联合/连谓等）：在子成分分界处画小竖线
        if (node.children.length > 2) {
          node.children.forEach(function (child, ci) {
            if (ci >= node.children.length - 1) return;
            var tick = el('i', 'sx-dg-tick');
            tick.style.left = ((child.end - node.start) / Math.max(1, node.end - node.start) * 100) + '%';
            bracket.appendChild(tick);
          });
        }
        plot.appendChild(bracket);

        // 括号下方：每个子成分正中标角色
        var roles = roleLabels(node.label, node.children.length);
        node.children.forEach(function (child, ci) {
          var roleCls = 'sx-dg-role ' + colorCls;
          if (status === 'rel' || status === 'over' || status === 'inword') roleCls += ' is-bad';
          var role = el('span', roleCls, roles[ci] || '');
          positionAbs(role, child.start, child.end, total);
          plot.appendChild(role);
        });

        var relName = node.label || '未标';
        if (relNames.indexOf(relName) < 0) relNames.push(relName);
      });

      row.appendChild(plot);
      body.appendChild(row);

      var tag = el('div', 'sx-dg-tag sx-dg-tag--level ' + dgDepthClass(lv));
      tag.appendChild(el('b', 'sx-dg-tag-name', '第 ' + levelNo + ' 层'));
      if (relNames.length) tag.appendChild(el('small', 'sx-dg-tag-rel', relNames.join(' / ')));
      tags.appendChild(tag);
      if (opts.currentLevel === levelNo) {
        row.className += ' is-current';
        tag.className += ' is-current';
      }
    }

    /* --- 当前待切层（该层还没有结构时，用虚线占位提示） --- */
    var ghost = opts.ghostSpan;
    if (ghost && opts.currentLevel > model.maxLevel) {
      var gLevel = opts.currentLevel;
      var gRow = el('div', 'sx-dg-row sx-dg-row--level is-ghost is-current');
      var gPlot = el('div', 'sx-dg-plot');
      var gNode = el('div', 'sx-dg-node is-ghost ' + dgDepthClass(gLevel - 1));
      positionAbs(gNode, ghost[0], ghost[1], total);
      gNode.appendChild(el('span', 'sx-dg-rel', '待切 · 第 ' + gLevel + ' 层'));
      gPlot.appendChild(gNode);
      gRow.appendChild(gPlot);
      body.appendChild(gRow);
      var gTag = el('div', 'sx-dg-tag sx-dg-tag--level is-current ' + dgDepthClass(gLevel - 1));
      gTag.appendChild(el('b', 'sx-dg-tag-name', '第 ' + gLevel + ' 层'));
      gTag.appendChild(el('small', 'sx-dg-tag-rel', '待切'));
      tags.appendChild(gTag);
    }

    /* --- 未切成分：虚线占位（点击提示还能继续切） --- */
    if (opts.showSlots) {
      var slotTag = el('div', 'sx-dg-tag sx-dg-tag--slots');
      slotTag.appendChild(el('b', 'sx-dg-tag-name', '待切'));
      slotTag.appendChild(el('small', 'sx-dg-tag-rel', '虚线块可继续切'));
      tags.appendChild(slotTag);
      var slotRow = el('div', 'sx-dg-row sx-dg-row--slots');
      var slotPlot = el('div', 'sx-dg-plot');
      model.leaves.forEach(function (lf) {
        var box = el('button', 'sx-dg-slot');
        box.type = 'button';
        data(box, 'start', lf.start);
        data(box, 'end', lf.end);
        positionAbs(box, lf.start, lf.end, total);
        box.textContent = lf.text;
        decorateMiss(box, lf, opts);
        if (opts.onLeafClick) {
          box.addEventListener('click', function () { opts.onLeafClick(lf); });
        }
        if (opts.selectedStart === lf.start) box.className += ' is-current';
        slotPlot.appendChild(box);
      });
      slotRow.appendChild(slotPlot);
      body.appendChild(slotRow);
    }

    scroll.appendChild(body);
    wrap.appendChild(tags);
    wrap.appendChild(scroll);
    return { el: wrap, maxLevel: model.maxLevel, model: model };
  }

  /* =========================================================================
     7. 整句快切模式的平铺刀位预览（不计层次）
     ========================================================================= */
  function previewFlatText() {
    if (st.mode !== 'whole' || !st.cuts.length) return '';
    return st.cuts.slice().sort(function (a, b) { return a.gap - b.gap; })
      .map(function (c) { return c.gap + ' ' + (c.rel || '未标'); })
      .join(' · ');
  }

  /* =========================================================================
     8. 句子渲染：整句快切 / 逐层分析
     ========================================================================= */
  function charEl(index) {
    var c = el('span', 'sx-char', st.chars[index]);
    data(c, 'index', index);
    return c;
  }

  function slotEl(gap, active, cut) {
    var tag = cut ? 'button' : (active ? 'button' : 'span');
    var cls = 'sx-slot';
    if (cut) cls += ' is-cut';
    else if (active) cls += ' is-active';
    else cls += ' is-static';
    var slot = el(tag, cls);
    data(slot, 'gap', gap);
    if (tag === 'button') slot.type = 'button';
    var label;
    if (cut) label = '第 ' + gap + ' 字后，关系「' + (cut.rel || '未标') + '」，点击修改或删除';
    else if (active) label = '第 ' + gap + ' 字后，点击落刀';
    else label = '第 ' + gap + ' 字后（未选中块）';
    if (slot.setAttribute) slot.setAttribute('aria-label', label);
    if (cut) {
      // 句子行只画刀线 + 小圆点（可点改关系）；关系名只出现在下方层次图的括号上
      slot.appendChild(el('i', 'sx-cutline'));
      slot.appendChild(el('i', 'sx-cutdot'));
      if (slot.setAttribute) slot.setAttribute('title', '关系「' + (cut.rel || '未标') + '」· 点击修改或删除');
    }
    return slot;
  }

  function renderWholeLine() {
    st.blockTree = null;
    st.selBlock = null;
    for (var i = 0; i < st.length; i++) {
      st.els.line.appendChild(charEl(i));
      if (i < st.length - 1) {
        st.els.line.appendChild(slotEl(i + 1, true, findCut(i + 1)));
      }
    }
  }

  function renderBlock(blk, sel) {
    if (!blk.cut) {
      var leaf = el('span', 'sx-block sx-block--leaf');
      data(leaf, 'start', blk.start);
      data(leaf, 'end', blk.end);
      var isSel = !!(sel && sel.start === blk.start);
      if (isSel) leaf.className += ' is-selected';
      if (blk.end - blk.start > 1) leaf.className += ' is-cuttable';
      for (var i = blk.start; i < blk.end; i++) {
        leaf.appendChild(charEl(i));
        if (i < blk.end - 1) leaf.appendChild(slotEl(i + 1, true, findCut(i + 1)));
      }
      return leaf;
    }
    var pair = el('span', 'sx-block sx-block--split');
    pair.appendChild(renderBlock(blk.left, sel));
    pair.appendChild(slotEl(blk.cut.gap, true, blk.cut));
    pair.appendChild(renderBlock(blk.right, sel));
    return pair;
  }

  function renderLayeredLine() {
    var tree = buildBlockTree(st.length, st.cuts);
    st.blockTree = tree;
    var sel = findLeaf(tree.leaves, st.selStart);
    // 自动跳过不可切的单字块，选中最近的可切块
    if (sel && (sel.end - sel.start) <= 1) {
      st.selStart = pickNextSelectable([st.selStart]);
      sel = findLeaf(tree.leaves, st.selStart) || sel;
    }
    if (!sel && tree.leaves.length) {
      sel = tree.leaves[0];
      st.selStart = sel.start;
    }
    st.selBlock = sel || null;
    st.els.line.appendChild(renderBlock(tree.root, sel));
  }

  function renderLine() {
    clearNode(st.els.line);
    st.els.line.className = 'sx-line sx-line--' + st.mode + (st.cuts.length ? ' has-cuts' : ' is-empty');
    if (!st.length) {
      st.els.line.appendChild(el('div', 'sx-empty-line', '题目缺少句子，无法作答。'));
      return;
    }
    if (st.mode === 'layered') renderLayeredLine();
    else renderWholeLine();
  }

  /* =========================================================================
     9. 状态栏 / 层次图 / 预览更新
     ========================================================================= */
  function selectedLeaf() {
    if (st.mode !== 'layered') return null;
    return st.selBlock || null;
  }

  function renderDiagramPanel() {
    var host = st.els.diagram;
    var panel = st.els.dgPanel;
    if (!host || !panel) return;
    clearNode(host);
    var show = st.mode === 'layered';
    panel.className = 'sx-diagram-panel' + (show ? '' : ' is-hidden');
    if (!show) return;
    if (!st.length) {
      host.appendChild(el('div', 'sx-dg-empty', '题目缺少句子。'));
      return;
    }
    if (!st.cuts.length) {
      host.appendChild(el('div', 'sx-dg-empty', '还没有切分：点句子里的字缝落第 1 刀，这里会实时画出层次分析图。'));
      if (st.els.dgNote) st.els.dgNote.textContent = '';
      return;
    }
    var tree = st.blockTree || buildBlockTree(st.length, st.cuts);
    var sel = selectedLeaf();
    var rootD = dtreeFromBlock(tree.root, st.chars);
    var curLevel = sel ? ((sel.depth || 0) + 1) : 1;
    var ghostSpan = (sel && (sel.end - sel.start) > 1) ? [sel.start, sel.end] : null;
    var info = renderDiagram(rootD, {
      totalLen: st.length,
      currentLevel: curLevel,
      ghostSpan: ghostSpan,
      showSlots: true,
      diff: false,
      selectedStart: sel ? sel.start : -1,
      onNodeClick: function (gap, nodeEl) {
        openPalette(gap, 'edit', nodeEl);
      },
      onLeafClick: function (lf) {
        if (lf.end - lf.start <= 1) {
          toast('这一块只有一个字，不能再切了', 'info');
          return;
        }
        st.selStart = lf.start;
        renderLine();
        renderChrome();
        toast('这一块还能继续切：点它的字缝落刀', 'info');
      }
    });
    host.appendChild(info.el);
    if (st.els.dgNote) st.els.dgNote.textContent = '共 ' + info.maxLevel + ' 层';
  }

  function renderPreview() {
    var wrap = st.els.previewWrap;
    if (!wrap) return;
    if (st.mode !== 'whole') {
      wrap.className = 'sx-preview is-hidden';
      return;
    }
    wrap.className = 'sx-preview';
    var pv = previewFlatText();
    if (!pv) {
      st.els.preview.textContent = '尚未落刀 —— 整句快切只按位置列出「刀位 + 关系」，不判定层次。';
      st.els.preview.className = 'sx-preview-body is-empty';
      st.els.pvNote.textContent = '';
      return;
    }
    st.els.preview.textContent = pv;
    st.els.preview.className = 'sx-preview-body';
    st.els.pvNote.textContent = '整句快切不计层次；层次判分请用「逐层分析」';
  }

  function renderChrome() {
    var hasCuts = st.cuts.length > 0;
    var levels = treeLevels();
    var n = st.cuts.length;

    var info = st.readingsInfo && st.readingsInfo.ok ? st.readingsInfo : null;
    var isMulti = !!(info && info.multi);
    var N = isMulti ? info.readings.length : 0;
    var filledCount = filledAnalysesCount();
    var activeLabel = (st.analyses[st.active] && st.analyses[st.active].label) || defaultAnalysisLabel(st.active);
    var analysisPrefix = st.analyses.length > 1 ? ('「' + activeLabel + '」· ') : '';

    st.els.modeBtns.forEach(function (btn) {
      var on = btn.getAttribute('data-mode') === st.mode;
      var cls = btn.className.replace(/\s*is-active/g, '');
      if (on) cls += ' is-active';
      btn.className = cls;
      if (btn.setAttribute) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    st.els.undoBtn.disabled = !hasCuts;
    st.els.clearBtn.disabled = !hasCuts;
    var countText = '已切 ' + n + ' 刀' +
      (st.mode === 'layered' ? ' / 共 ' + levels + ' 层' : '');
    if (st.analyses.length > 1) countText += ' · 分析 ' + (st.active + 1) + '/' + st.analyses.length;
    if (isMulti) countText += ' · 读法 ' + filledCount + '/' + N;
    st.els.count.textContent = countText;

    var sel = selectedLeaf();
    var cuttableCount = st.mode === 'layered' && st.blockTree
      ? st.blockTree.leaves.filter(function (b) { return b.end - b.start > 1; }).length
      : 0;
    var baseHint = '';
    var baseSel = '';
    if (!st.length) {
      baseHint = '题目缺少句子，无法作答。';
      baseSel = '';
    } else if (st.mode === 'whole') {
      baseHint = '整句快切：所有字缝都可落刀；只判位置 + 关系，不计层次。';
      baseSel = hasCuts
        ? '已切 ' + n + ' 刀 · 想看层次结构请切「逐层分析」'
        : '尚未落刀：点字缝落刀（快切模式）。';
    } else if (!hasCuts) {
      baseHint = '第 1 层：先点句子里的字缝，落全句第一刀（选好关系）。';
      baseSel = '已切 0 刀 / 共 0 层';
    } else if (!cuttableCount) {
      baseHint = '已完成所有切分（' + n + ' 刀 / ' + levels + ' 层）：可提交判分，或检查下方层次分析图。';
      baseSel = '已切 ' + n + ' 刀 / 共 ' + levels + ' 层 · 全部分析完成';
    } else if (sel && (sel.end - sel.start) > 1) {
      var nextLevel = (sel.depth || 0) + 1;
      baseHint = '第 ' + nextLevel + ' 层：点当前块「' + subText(sel.start, sel.end) +
        '」里的字缝继续切；也可以点其它虚线块（或点层次图括号改关系）。';
      baseSel = '已切 ' + n + ' 刀 / 共 ' + levels + ' 层 · 当前块：第 ' +
        (sel.start + 1) + '–' + sel.end + ' 字「' + subText(sel.start, sel.end) + '」';
    } else {
      baseHint = '点其它虚线块继续；也可以点下方层次图的括号修改关系。';
      baseSel = '已切 ' + n + ' 刀 / 共 ' + levels + ' 层';
    }

    var multiTip = '';
    if (isMulti) {
      var labels = info.readings.map(function (r) { return r.label; }).join(' / ');
      if (st.analyses.length === 1) {
        multiTip = ' 本题有 ' + N + ' 种读法（' + labels + '）：做完这一种后点「＋ 新增一种分析」做下一种。';
      } else if (filledCount < N) {
        multiTip = ' 已完成 ' + filledCount + '/' + N + ' 种读法，可点「＋ 新增一种分析」补齐（' + labels + '）。';
      } else {
        multiTip = ' 已完成 ' + filledCount + '/' + N + ' 种读法。';
      }
    }
    st.els.hint.textContent = analysisPrefix + baseHint + multiTip;

    var selText = baseSel;
    if (st.analyses.length > 1) selText += ' · ' + activeLabel;
    if (isMulti) selText += ' · 读法 ' + filledCount + '/' + N;
    st.els.sel.textContent = selText;

    renderTabs();
    renderDiagramPanel();
    renderPreview();
  }

  function render() {
    renderLine();
    renderChrome();
  }

  /* =========================================================================
     10. 关系浮层（palette）
     ========================================================================= */
  function relationGroups() {
    var groups = [];
    if (isCompoundQuestion(st.question)) {
      groups.push({ title: '复句关系（按关联词 / 逻辑判断）', items: compoundLabels(), primary: true, numbered: 9 });
      groups.push({ title: '分句内关系（层内再分析）', items: singleLabels(false), primary: false });
      groups.push({ title: '短语关系（补充）', items: EXTRA_SINGLE.filter(function (l) { return GC.REL_SINGLE.indexOf(l) >= 0; }), primary: false });
    } else {
      groups.push({ title: '基本关系（九种 · 按 1–9 快选）', items: singleLabels(false), primary: true, numbered: 9 });
      groups.push({ title: '短语关系（补充）', items: EXTRA_SINGLE.filter(function (l) { return GC.REL_SINGLE.indexOf(l) >= 0; }), primary: false });
    }
    return groups.filter(function (g) { return g.items.length > 0; });
  }

  function positionPalette(panel, anchor) {
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    var rect = anchor.getBoundingClientRect();
    var vw = window.innerWidth || 1024;
    var vh = window.innerHeight || 768;
    if (vw <= 620) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.bottom = '';
      return;
    }
    var pw = panel.offsetWidth || 380;
    var ph = panel.offsetHeight || 330;
    var left = Math.max(12, Math.min(vw - pw - 12, rect.left + rect.width / 2 - pw / 2));
    var top = rect.bottom + 14;
    if (top + ph > vh - 12) top = Math.max(12, rect.top - ph - 14);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function closePalette() {
    if (st.palette && st.palette.parentNode) {
      st.palette.parentNode.removeChild(st.palette);
    }
    if (st.paletteAnchor) {
      var cls = st.paletteAnchor.className || '';
      st.paletteAnchor.className = cls.replace(/\s*is-palette-open/g, '');
    }
    st.palette = null;
    st.paletteGap = null;
    st.paletteAnchor = null;
    st.paletteKeyMap = null;
    st.paletteKind = 'add';
  }

  function paletteCommit(rel) {
    if (st.paletteGap == null) return;
    var gap = st.paletteGap;
    var kind = st.paletteKind;
    if (kind === 'edit') updateCutRel(gap, rel);
    else addCut(gap, rel);
  }

  function onPaletteClick(ev) {
    var t = ev.target;
    var panel = st.palette;
    while (t && t !== panel) {
      if (t.getAttribute) {
        var rel = t.getAttribute('data-rel');
        if (rel) { ev.preventDefault(); paletteCommit(rel); return; }
        var act = t.getAttribute('data-act');
        if (act === 'delete') { ev.preventDefault(); deleteCut(st.paletteGap); return; }
        if (act === 'cancel') { ev.preventDefault(); closePalette(); return; }
      }
      t = t.parentNode;
    }
  }

  function openPalette(gap, kind, anchor) {
    if (st.palette && st.paletteGap === gap && st.paletteKind === kind) {
      closePalette();
      return;
    }
    closePalette();

    var cut = findCut(gap);
    if (kind === 'edit' && !cut) kind = 'add';
    if (!cut && kind !== 'add') kind = 'add';

    var panel = el('div', 'palette sx-palette');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '选择句法关系');
    panel.addEventListener('click', onPaletteClick);

    var hd = el('div', 'palette-hd');
    hd.appendChild(el('div', 'palette-title', (kind === 'edit' ? '修改关系' : '选择关系') + ' · 第 ' + gap + ' 字后'));
    if (kind === 'edit') {
      var del = el('button', 'btn btn--sm btn--danger sx-palette-del', '删除这一刀');
      del.type = 'button';
      data(del, 'act', 'delete');
      hd.appendChild(del);
    }
    var cancel = el('button', 'btn btn--sm btn--ghost sx-palette-cancel', '取消');
    cancel.type = 'button';
    data(cancel, 'act', 'cancel');
    hd.appendChild(cancel);
    panel.appendChild(hd);

    var bd = el('div', 'palette-bd');
    var keyMap = {};
    var keyNum = 0;
    relationGroups().forEach(function (group) {
      var grp = el('div', 'palette-group sx-palette-group');
      grp.appendChild(el('div', 'palette-glabel', group.title));
      var keys = el('div', 'palette-keys sx-rel-keys');
      group.items.forEach(function (label) {
        var btn = el('button', 'palette-key sx-rel-key');
        btn.type = 'button';
        data(btn, 'rel', label);
        btn.appendChild(el('span', 'sx-rel-name', label));
        if (group.primary && group.numbered && keyNum < group.numbered) {
          keyNum++;
          keyMap[String(keyNum)] = label;
          btn.appendChild(el('span', 'sx-rel-num', String(keyNum)));
        }
        if (cut && cut.rel && GC.relCanon(cut.rel) === GC.relCanon(label)) {
          btn.className += ' is-current';
        }
        keys.appendChild(btn);
      });
      grp.appendChild(keys);
      bd.appendChild(grp);
    });
    panel.appendChild(bd);

    var ft = el('div', 'sx-palette-ft');
    ft.appendChild(el('span', 'sx-palette-tip', '数字 1–9 快选 · Esc 取消'));
    panel.appendChild(ft);

    document.body.appendChild(panel);
    st.palette = panel;
    st.paletteGap = gap;
    st.paletteKind = kind;
    st.paletteAnchor = anchor;
    st.paletteKeyMap = keyMap;
    if (anchor && anchor.className) anchor.className += ' is-palette-open';
    positionPalette(panel, anchor);
  }

  /* =========================================================================
     11. 作答变更
     ========================================================================= */
  function afterMutate() {
    syncActiveAnalysis();
    closePalette();
    render();
    notifyChange();
  }

  // 找到包含某个字缝的未切块（逐层分析模式）
  function leafContaining(gap) {
    var tree = buildBlockTree(st.length, st.cuts);
    for (var i = 0; i < tree.leaves.length; i++) {
      var b = tree.leaves[i];
      if (b.start < gap && gap < b.end) return b;
    }
    return null;
  }

  // 自动选中「最近的可切块」：优先候选起点，其次按与候选点的距离；没有可切块时返回第一个叶子
  function pickNextSelectable(preferred) {
    var tree = buildBlockTree(st.length, st.cuts);
    var leaves = tree.leaves || [];
    var cuttable = leaves.filter(function (b) { return b.end - b.start > 1; });
    if (!cuttable.length) return leaves.length ? leaves[0].start : 0;
    var prefs = preferred || [];
    for (var i = 0; i < prefs.length; i++) {
      for (var j = 0; j < cuttable.length; j++) {
        if (cuttable[j].start === prefs[i]) return prefs[i];
      }
    }
    var ref = prefs.length ? prefs[0] : 0;
    cuttable.sort(function (a, b) {
      return Math.abs(a.start - ref) - Math.abs(b.start - ref);
    });
    return cuttable[0].start;
  }

  function addCut(gap, rel) {
    if (gap < 1 || gap > st.length - 1) return;
    if (findCut(gap)) { updateCutRel(gap, rel); return; }
    var cut = { gap: gap, rel: rel || '' };
    if (st.mode === 'layered') {
      var leaf = leafContaining(gap);
      if (!leaf) {
        toast('这里当前不能落刀，请先选中要切的块', 'bad');
        return;
      }
      cut.span = [leaf.start, leaf.end];
    }
    pushHistory();
    st.cuts.push(cut);
    if (st.mode === 'layered' && cut.span) {
      var leftLen = cut.gap - cut.span[0];
      var rightLen = cut.span[1] - cut.gap;
      // 优先较大的子块；若只剩 1 个字（不可切），自动跳到最近的可切块
      var prefs = leftLen >= rightLen ? [cut.span[0], cut.gap] : [cut.gap, cut.span[0]];
      st.selStart = pickNextSelectable(prefs);
    }
    afterMutate();
  }

  function updateCutRel(gap, rel) {
    var cut = findCut(gap);
    if (!cut) return;
    if (cut.rel === rel) { closePalette(); return; }
    pushHistory();
    cut.rel = rel || '';
    afterMutate();
  }

  function deleteCut(gap) {
    var idx = -1;
    for (var i = 0; i < st.cuts.length; i++) if (st.cuts[i].gap === gap) { idx = i; break; }
    if (idx < 0) { closePalette(); return; }
    pushHistory();
    var removed = st.cuts[idx];
    st.cuts.splice(idx, 1);
    if (st.mode === 'layered' && Array.isArray(removed.span)) {
      var s0 = removed.span[0], e0 = removed.span[1];
      st.cuts = st.cuts.filter(function (c) {
        if (!Array.isArray(c.span)) return true;
        return !(c.span[0] >= s0 && c.span[1] <= e0);
      });
      st.selStart = s0;
    }
    afterMutate();
  }

  function undo() {
    if (!st.history.length) {
      toast('没有可撤销的操作', 'info');
      return;
    }
    st.cuts = cloneCuts(st.history.pop());
    if (st.mode === 'layered') {
      st.cuts = st.cuts.filter(function (c) { return Array.isArray(c.span); });
    }
    st.selStart = 0;
    afterMutate();
  }

  function clearAll() {
    if (!st.cuts.length) return;
    askConfirm('清空所有已切的 ' + st.cuts.length + ' 刀？').then(function (ok) {
      if (!ok) return;
      pushHistory();
      st.cuts = [];
      st.selStart = 0;
      afterMutate();
    });
  }

  function setMode(mode) {
    if (mode === st.mode) return;
    if (mode === 'layered' && st.cuts.length) {
      askConfirm('逐层分析需要按层次重新切分，切换会清空当前 ' + st.cuts.length + ' 刀。继续？').then(function (ok) {
        if (!ok || st.mode !== 'whole') return;
        st.cuts = [];
        st.history = [];
        st.selStart = 0;
        st.mode = 'layered';
        afterMutate();
      });
      return;
    }
    if (mode === 'whole') {
      var kept = st.cuts.length;
      st.cuts = st.cuts.map(function (c) { return { gap: c.gap, rel: c.rel || '' }; });
      st.history = [];
      st.mode = 'whole';
      st.selStart = 0;
      afterMutate();
      if (kept) toast('已切到整句快切，保留 ' + kept + ' 刀（不计层次）', 'info');
      return;
    }
    st.mode = 'layered';
    afterMutate();
  }

  function selectBlock(start) {
    if (st.mode !== 'layered') return;
    if (st.selStart === start && st.selBlock) return;
    st.selStart = start;
    closePalette();
    renderLine();
    renderChrome();
  }

  /* =========================================================================
     12. 交互事件
     ========================================================================= */
  function onLineClick(ev) {
    if (!st.length) return;
    var target = ev.target;
    var slot = closestTo(target, '.sx-slot', st.els.line);

    if (slot) {
      var gap = attrNum(slot, 'gap');
      if (!isFinite(gap)) return;
      var isCut = slot.className.indexOf('is-cut') >= 0;
      var isActive = slot.className.indexOf('is-active') >= 0;
      if (isCut) {
        ev.preventDefault();
        ev.stopPropagation();
        openPalette(gap, 'edit', slot);
        return;
      }
      if (isActive) {
        ev.preventDefault();
        ev.stopPropagation();
        if (st.mode === 'layered') {
          // 直接点任意未切块里的字缝即可切这一块（不必先选中）
          var blk = closestTo(slot, '.sx-block--leaf', st.els.line);
          var s0 = blk ? attrNum(blk, 'start') : NaN;
          if (isFinite(s0) && s0 !== st.selStart) {
            st.selStart = s0;
            renderLine();
            renderChrome();
            slot = st.els.line.querySelector('.sx-slot[data-gap="' + gap + '"]') || slot;
          }
        }
        openPalette(gap, 'add', slot);
        return;
      }
      if (st.mode === 'layered') {
        var blk0 = closestTo(slot, '.sx-block--leaf', st.els.line);
        if (blk0) { selectBlock(attrNum(blk0, 'start')); return; }
      }
      return;
    }

    if (st.mode === 'layered') {
      var blk2 = closestTo(target, '.sx-block--leaf', st.els.line);
      if (blk2) selectBlock(attrNum(blk2, 'start'));
    }
  }

  function onWrapClick(ev) {
    var target = ev.target;
    var btn = closestTo(target, '[data-act]', st.els.wrap);
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'mode') {
      var m = btn.getAttribute('data-mode');
      if (m === 'whole' || m === 'layered') setMode(m);
    } else if (act === 'undo') {
      undo();
    } else if (act === 'clear') {
      clearAll();
    } else if (act === 'switch-analysis') {
      switchAnalysis(attrNum(btn, 'index'));
    } else if (act === 'add-analysis') {
      addAnalysis();
    } else if (act === 'rename-analysis') {
      openRenameAnalysis();
    } else if (act === 'delete-analysis') {
      deleteAnalysis();
    }
  }

  function moduleActive() {
    if (!st.root) return false;
    try {
      if (document.body && document.body.contains && !document.body.contains(st.root)) return false;
      if (st.root.getClientRects && st.root.getClientRects().length === 0) return false;
    } catch (e) { /* 环境不支持则按活跃处理 */ }
    return true;
  }

  function onDocKeydown(ev) {
    if (!moduleActive()) return;
    var t = ev.target;
    var tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' ||
      (t && (t.isContentEditable || t.getAttribute && t.getAttribute('contenteditable') === 'true'))) {
      return;
    }
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      if (st.palette) {
        ev.preventDefault();
        closePalette();
      }
      return;
    }
    if (st.palette && /^[1-9]$/.test(ev.key)) {
      var label = st.paletteKeyMap && st.paletteKeyMap[ev.key];
      if (label) {
        ev.preventDefault();
        paletteCommit(label);
        return;
      }
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete') {
      if (st.cuts.length || st.history.length) {
        ev.preventDefault();
        undo();
      }
    }
  }

  function onDocumentMousedown(ev) {
    if (!st.palette || !moduleActive()) return;
    if (st.palette === ev.target) return;
    if (st.palette.contains && st.palette.contains(ev.target)) return;
    if (st.paletteAnchor && st.paletteAnchor.contains && st.paletteAnchor.contains(ev.target)) return;
    closePalette();
  }

  function onWindowResize() {
    if (st.palette) closePalette();
  }

  /* =========================================================================
     13. 只读刀位行 / 对照清单（答案 diff 的辅助信息）
     ========================================================================= */
  function readonlyLine(sentence, marks) {
    var line = el('div', 'sx-ro-line');
    var map = {};
    (marks || []).forEach(function (m) { if (m && typeof m.gap === 'number') map[m.gap] = m; });
    for (var i = 0; i < sentence.length; i++) {
      line.appendChild(el('span', 'sx-ro-char', sentence.charAt(i)));
      if (i < sentence.length - 1) {
        var gap = i + 1;
        var m = map[gap];
        var slot = el('span', 'sx-slot sx-slot--ro');
        data(slot, 'gap', gap);
        if (!m) { line.appendChild(slot); continue; }
        slot.className += ' is-cut sx-ro--' + m.kind;
        if (m.kind === 'miss') slot.appendChild(el('i', 'sx-miss-ring'));
        slot.appendChild(el('i', 'sx-cutline'));
        var baseRow = (gap % 2 === 0) ? 0 : 19;
        var lab = el('b', 'sx-rel sx-rel--' + m.kind, m.label || '');
        lab.style.top = 'calc(100% + ' + (5 + baseRow) + 'px)';
        slot.appendChild(lab);
        if (m.got) {
          var got = el('b', 'sx-rel sx-rel--got', m.got);
          got.style.top = 'calc(100% + ' + (5 + baseRow + 38) + 'px)';
          slot.appendChild(got);
        }
        line.appendChild(slot);
      }
    }
    return line;
  }

  function diffMarks(cmp) {
    var marks = [];
    var stdByGap = {};
    (cmp.stdCuts || []).forEach(function (c) { stdByGap[c.gap] = c; });
    var status = cmp.gapStatus || {};
    Object.keys(status).map(Number).sort(function (a, b) { return a - b; }).forEach(function (gap) {
      var s = status[gap] || {};
      var std = stdByGap[gap];
      var user = cmp.userCuts ? cmp.userCuts[gap] : null;
      var userRel = user && user.rel;
      var stdLabel = std ? std.label : (s.expected && typeof s.expected === 'string' ? s.expected : '');
      if (s.status === 'miss') {
        marks.push({ gap: gap, kind: 'miss', label: '漏·' + stdLabel });
      } else if (s.status === 'over' || s.status === 'inword') {
        marks.push({ gap: gap, kind: 'extra', label: s.status === 'inword' ? '词内' : '多切' });
      } else if (s.status === 'rel') {
        marks.push({ gap: gap, kind: 'rel', label: '应·' + (s.expected || stdLabel), got: s.got || userRel || '未标' });
      } else if (s.status === 'level') {
        marks.push({ gap: gap, kind: 'level', label: '层·' + stdLabel, got: userRel || '未标' });
      } else {
        marks.push({ gap: gap, kind: 'ok', label: stdLabel });
      }
    });
    return marks;
  }

  var STATUS_TEXT = {
    miss: '漏切', over: '多切', inword: '词内误切', rel: '关系错', level: '层次错', ok: '正确'
  };

  function cmpList(cmp) {
    var list = el('div', 'sx-cmp-list');
    var rows = [];
    var stdByGap = {};
    (cmp.stdCuts || []).forEach(function (c) { stdByGap[c.gap] = c; });
    Object.keys(cmp.gapStatus || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (gap) {
      var s = cmp.gapStatus[gap];
      if (!s || s.status === 'ok') return;
      rows.push({ gap: gap, s: s, std: stdByGap[gap] });
    });
    if (!rows.length) {
      list.appendChild(el('div', 'sx-cmp-ok', '你的每一刀位置与关系都和标准答案一致。'));
      return list;
    }
    rows.forEach(function (r) {
      var row = el('div', 'sx-cmp-row sx-cmp-row--' + r.s.status);
      row.appendChild(el('span', 'sx-cmp-gap', '第 ' + r.gap + ' 字后'));
      row.appendChild(el('span', 'sx-cmp-status', STATUS_TEXT[r.s.status] || r.s.status));
      var detail = '';
      if (r.s.status === 'miss') detail = '标准应切「' + (r.std ? r.std.label : (r.s.expected || '')) + '」，你没有落刀';
      else if (r.s.status === 'over' || r.s.status === 'inword') detail = '标准答案这里不切，你标了「' + (r.s.got || '') + '」';
      else if (r.s.status === 'rel') detail = '标准是「' + (r.s.expected || '') + '」，你标的是「' + (r.s.got || '') + '」';
      else if (r.s.status === 'level') detail = '刀位对了，但挂错层次' + (r.std ? '（标准属于第 ' + (r.std.span[0] + 1) + '–' + r.std.span[1] + ' 字这一层）' : '');
      row.appendChild(el('span', 'sx-cmp-detail', detail));
      list.appendChild(row);
    });
    return list;
  }

  /* ---- 多解 / 单解：用户答案与标准读法的匹配（渲染用，与判分同口径） ---- */
  function analysesFromAnswer(userAnswer, length) {
    var out = [];
    if (userAnswer && Array.isArray(userAnswer.analyses)) {
      userAnswer.analyses.forEach(function (a, i) {
        var cuts = readAnswerCuts({ cuts: a && a.cuts }, length);
        out.push({
          index: i,
          label: defaultAnalysisLabel(i),
          cuts: cuts,
          mode: a && a.mode === 'whole' ? 'whole' : 'layered'
        });
      });
    } else if (userAnswer) {
      var cuts = readAnswerCuts({ cuts: userAnswer.cuts }, length);
      out.push({
        index: 0,
        label: defaultAnalysisLabel(0),
        cuts: cuts,
        mode: userAnswer.mode === 'whole' ? 'whole' : 'layered'
      });
    }
    return out;
  }

  // {ok, info, analyses, matches, extras}；matches 用与判分器相同的贪心匹配
  function buildReadingMatches(question, userAnswer) {
    var info = readQuestionReadings(question);
    if (!info.ok) return { ok: false, err: info.err };
    var analyses = analysesFromAnswer(userAnswer, info.len);
    var filled = analyses.filter(function (a) { return a.cuts.length > 0; });
    var used = {};
    var matches = [];
    info.readings.forEach(function (reading) {
      var pick = -1;
      var best = -1;
      var bestCmp = null;
      filled.forEach(function (a, ai) {
        if (used[ai]) return;
        var cmp = GC.compareSyntax(a.cuts, reading.root);
        if (cmp.score > best) { best = cmp.score; pick = ai; bestCmp = cmp; }
      });
      if (pick >= 0 && best > 0) {
        used[pick] = 1;
        matches.push({
          readingIndex: reading.index,
          label: reading.label,
          meaning: reading.meaning,
          readingRoot: reading.root,
          readingPretty: reading.pretty,
          analysis: filled[pick],
          analysisIndex: filled[pick].index,
          score: best,
          cmp: bestCmp
        });
      } else {
        matches.push({
          readingIndex: reading.index,
          label: reading.label,
          meaning: reading.meaning,
          readingRoot: reading.root,
          readingPretty: reading.pretty,
          analysis: null,
          analysisIndex: -1,
          score: 0,
          cmp: null
        });
      }
    });
    var matched = {};
    matches.forEach(function (m) { if (m.analysis) matched[m.analysisIndex] = 1; });
    var extras = filled.filter(function (a) { return !matched[a.index]; });
    return { ok: true, info: info, analyses: analyses, matches: matches, extras: extras };
  }

  // 用户某份分析 vs 某标准读法 的层次图（diff 标红）
  function renderAnalysisDiagram(cuts, sentence, readingRoot, cmp) {
    var tree = buildBlockTree(sentence.length, cuts);
    if (!tree.root.cut) return null;
    var rootD = dtreeFromBlock(tree.root, sentence.split(''));
    return renderDiagram(rootD, {
      totalLen: sentence.length,
      showSlots: false,
      diff: true,
      stdCuts: GC.treeCuts(readingRoot),
      gapStatus: cmp ? cmp.gapStatus : {}
    }).el;
  }

  function readingBlock(question, reading) {
    var block = el('div', 'sx-reading');
    var hd = el('div', 'sx-reading-hd');
    hd.appendChild(el('span', 'badge badge--gold', reading.label));
    if (reading.meaning) hd.appendChild(el('span', 'sx-reading-meaning', reading.meaning));
    block.appendChild(hd);
    var d = renderDiagram(dtreeFromParse(reading.root, 0), {
      totalLen: question.sentence.length,
      showSlots: false
    });
    block.appendChild(d.el);
    return block;
  }

  function matchBlock(box, question, match) {
    var head = el('div', 'sx-match-hd');
    if (match.analysis) {
      head.appendChild(el('span', 'sx-match-label', match.analysis.label));
      head.appendChild(el('span', 'sx-match-arrow', '↔'));
      head.appendChild(el('span', 'badge badge--jade', match.label));
      head.appendChild(el('span', 'tag', '匹配得分 ' + match.score));
    } else {
      head.appendChild(el('span', 'badge badge--mock', match.label));
      head.appendChild(el('span', 'sx-match-miss', '未分析'));
    }
    if (match.meaning) head.appendChild(el('span', 'sx-reading-meaning', match.meaning));
    box.appendChild(head);
    if (match.analysis && match.cmp) {
      var diag = renderAnalysisDiagram(match.analysis.cuts, question.sentence, match.readingRoot, match.cmp);
      if (diag) {
        box.appendChild(diag);
      } else {
        box.appendChild(readonlyLine(question.sentence, diffMarks(match.cmp)));
      }
    }
  }

  /* =========================================================================
     14. 答案解析 / 结果细节
     ========================================================================= */
  function renderSolution(root, question, userAnswer) {
    if (!root) return;
    clearNode(root);
    var box = el('div', 'sx-solution');
    var data = buildReadingMatches(question, userAnswer);
    if (!data || !data.ok) {
      box.appendChild(el('div', 'sx-sol-err', '标准答案解析失败：' + ((data && data.err) || '题目缺少 sentence / tree / readings')));
      root.appendChild(box);
      return;
    }
    var info = data.info;
    var N = info.readings.length;

    if (!info.multi) {
      // 单解：标准图 + 最佳分析图 + 刀位对照（保持原行为）
      box.appendChild(el('div', 'sx-block-label', '标准答案 · 层次分析图'));
      var stdD = renderDiagram(dtreeFromParse(info.readings[0].root, 0), {
        totalLen: question.sentence.length,
        showSlots: false
      });
      box.appendChild(stdD.el);
      box.appendChild(el('div', 'sx-legend', '每个括号 = 一个结构：括号上为关系名，括号下为成分角色（主/谓、动/宾、偏/正…）；左侧「第 N 层」即分析层次。'));
      var m0 = data.matches[0];
      if (!m0 || !m0.analysis) {
        box.appendChild(el('div', 'sx-sol-tip', '你没有作答，以上为标准分析。'));
        root.appendChild(box);
        return;
      }
      box.appendChild(el('div', 'sx-block-label', '你的分析图（红 = 错处）'));
      var diag0 = renderAnalysisDiagram(m0.analysis.cuts, question.sentence, info.readings[0].root, m0.cmp);
      if (diag0) {
        box.appendChild(diag0);
        box.appendChild(el('div', 'sx-legend', '红虚线括号 = 多切/词内误切 · 红色关系 = 标错（你的 / 应为） · 叶子里的虚影 = 漏切'));
      } else {
        box.appendChild(el('div', 'sx-sol-tip', '你的答案来自「整句快切」模式（没有层次 span），只能做刀位对照：'));
        box.appendChild(readonlyLine(question.sentence, diffMarks(m0.cmp)));
      }
      box.appendChild(cmpList(m0.cmp));
      root.appendChild(box);
      return;
    }

    /* ---- 多解题：逐种读法渲染标准层次图 ---- */
    box.appendChild(el('div', 'sx-block-label', '标准答案 · ' + N + ' 种读法'));
    info.readings.forEach(function (reading) {
      box.appendChild(readingBlock(question, reading));
    });
    box.appendChild(el('div', 'sx-legend', '每种读法一棵完整标准树：括号上为关系名，括号下为成分角色；左侧「第 N 层」即分析层次。'));

    /* ---- 用户分析：逐份渲染并标出对应读法 ---- */
    var filledN = data.analyses.filter(function (a) { return a.cuts.length > 0; }).length;
    box.appendChild(el('div', 'sx-block-label', '你的分析（' + filledN + ' 份 / 共 ' + N + ' 种读法）'));
    if (!data.analyses.length) {
      box.appendChild(el('div', 'sx-sol-tip', '你没有提交分析。'));
    } else {
      data.matches.forEach(function (mt) {
        matchBlock(box, question, mt);
      });
      if (data.extras.length) {
        var extraLine = el('div', 'sx-match-extra');
        extraLine.textContent = '其余 ' + data.extras.length + ' 份分析未匹配到读法（不计分）：' +
          data.extras.map(function (a) { return a.label; }).join('、');
        box.appendChild(extraLine);
      }
    }

    /* ---- 读法 × 刀位 对照 ---- */
    var anyCmp = data.matches.some(function (mt) { return !!mt.cmp; });
    if (anyCmp) {
      box.appendChild(el('div', 'sx-block-label', '刀位对照（读法 × 刀位）'));
      data.matches.forEach(function (mt) {
        if (!mt.cmp) return;
        var subHd = el('div', 'sx-cmp-subhd');
        subHd.appendChild(el('span', 'badge badge--gold', mt.label));
        if (mt.analysis) subHd.appendChild(el('span', 'tag', mt.analysis.label + ' · ' + mt.score + ' 分'));
        box.appendChild(subHd);
        box.appendChild(cmpList(mt.cmp));
      });
    }
    root.appendChild(box);
  }

  function renderResultDetail(root, question, userAnswer, gradeResult) {
    if (!root) return;
    clearNode(root);
    var box = el('div', 'sx-result-detail');
    var data = buildReadingMatches(question, userAnswer);
    if (!data || !data.ok) {
      box.appendChild(el('div', 'sx-sol-err', '标准答案解析失败，无法展示刀位 diff。'));
      root.appendChild(box);
      return;
    }
    var info = data.info;
    var sub = gradeResult && gradeResult.sub ? gradeResult.sub : null;
    var N = info.readings.length;

    if (!info.multi) {
      var m0 = data.matches[0];
      var hd0 = el('div', 'sx-detail-hd');
      hd0.appendChild(el('div', 'sx-block-label', '层次分析图 · 你的作答'));
      hd0.appendChild(el('span', 'badge badge--mock', '单解题'));
      if (data.analyses.length > 1) {
        hd0.appendChild(el('span', 'tag', '共 ' + data.analyses.length + ' 份分析 · 取最高分'));
      }
      if (sub) {
        hd0.appendChild(el('span', 'tag', '位置分 ' + sub[0].score + '/' + sub[0].max));
        hd0.appendChild(el('span', 'tag', '关系分 ' + sub[1].score + '/' + sub[1].max));
      }
      box.appendChild(hd0);
      if (m0 && m0.analysis) {
        var dg0 = renderAnalysisDiagram(m0.analysis.cuts, question.sentence, info.readings[0].root, m0.cmp);
        if (dg0) {
          box.appendChild(dg0);
          box.appendChild(el('div', 'sx-legend', '红虚线括号 = 多切/词内误切 · 红色关系 = 关系标错 · 叶子里红线 = 漏切 · 括号按层着色'));
        } else {
          box.appendChild(el('div', 'sx-sol-tip', '整句快切模式无层次 span，下面是刀位对照：'));
        }
        box.appendChild(el('div', 'sx-block-label', '刀位 diff'));
        box.appendChild(readonlyLine(question.sentence, diffMarks(m0.cmp)));
        box.appendChild(el('div', 'sx-legend', '虚线圈 = 漏切 · 红标 = 多切/词内误切 · 金标 = 标准 · 红标「你」= 你的标注'));
        box.appendChild(cmpList(m0.cmp));
      } else {
        box.appendChild(el('div', 'sx-sol-tip', '没有可对照的用户分析。'));
      }
      root.appendChild(box);
      return;
    }

    /* ---- 多解题结果区：主视觉 = 用户分析图 + 错处底色；按读法列刀位 diff ---- */
    var filledN = data.analyses.filter(function (a) { return a.cuts.length > 0; }).length;
    var hd = el('div', 'sx-detail-hd');
    hd.appendChild(el('div', 'sx-block-label', '多解题 · ' + N + ' 种读法 / 你分析了 ' + filledN + ' 种'));
    if (sub) {
      hd.appendChild(el('span', 'tag', '位置分 ' + sub[0].score + '/' + sub[0].max));
      hd.appendChild(el('span', 'tag', '关系分 ' + sub[1].score + '/' + sub[1].max));
    }
    box.appendChild(hd);
    if (filledN < N) {
      box.appendChild(el('div', 'notice',
        '本题有 ' + N + ' 种读法，你只分析了 ' + filledN + ' 种（' +
        info.readings.map(function (r) { return r.label; }).join(' / ') + '）。可点「＋ 新增一种分析」补齐。'));
    }

    data.matches.forEach(function (mt) {
      matchBlock(box, question, mt);
    });
    if (data.extras.length) {
      var extraLine = el('div', 'sx-match-extra');
      extraLine.textContent = '其余 ' + data.extras.length + ' 份分析未匹配到读法（不计分）：' +
        data.extras.map(function (a) { return a.label; }).join('、');
      box.appendChild(extraLine);
    }

    box.appendChild(el('div', 'sx-legend', '红虚线括号 = 多切/词内误切 · 红色关系 = 关系标错 · 叶子里红线 = 漏切 · 括号按层着色'));

    box.appendChild(el('div', 'sx-block-label', '刀位 diff（按读法）'));
    data.matches.forEach(function (mt) {
      if (!mt.cmp) return;
      var subHd = el('div', 'sx-cmp-subhd');
      subHd.appendChild(el('span', 'badge badge--gold', mt.label));
      if (mt.analysis) subHd.appendChild(el('span', 'tag', mt.analysis.label + ' · ' + mt.score + ' 分'));
      box.appendChild(subHd);
      box.appendChild(readonlyLine(question.sentence, diffMarks(mt.cmp)));
      box.appendChild(cmpList(mt.cmp));
    });
    box.appendChild(el('div', 'sx-legend', '虚线圈 = 漏切 · 红标 = 多切/词内误切 · 金标 = 标准 · 红标「你」= 你的标注'));
    root.appendChild(box);
  }

  /* =========================================================================
     15. 外壳构建 / 生命周期
     ========================================================================= */
  /* =========================================================================
     14.1 多份分析标签页（多解 / 歧义）
     ========================================================================= */
  function renderTabs() {
    var host = st.els.anTabs;
    if (!host) return;
    clearNode(host);
    st.analyses.forEach(function (a, i) {
      var tab = el('button', 'sx-analysis-tab' + (i === st.active ? ' is-active' : ''));
      tab.type = 'button';
      data(tab, 'act', 'switch-analysis');
      data(tab, 'index', i);
      if (i === st.active && tab.setAttribute) tab.setAttribute('aria-current', 'true');
      tab.appendChild(el('span', 'sx-analysis-tab-label', a.label || defaultAnalysisLabel(i)));
      var n = (a.cuts || []).length;
      tab.appendChild(el('span', 'sx-analysis-tab-count', n ? n + ' 刀' : '空'));
      host.appendChild(tab);
    });
    if (st.els.delAnalysisBtn) st.els.delAnalysisBtn.disabled = st.analyses.length <= 1;
    if (st.els.renameBtn) st.els.renameBtn.disabled = false;
  }

  function buildShell() {
    clearNode(st.root);
    var wrap = el('div', 'sx-editor');
    st.els.wrap = wrap;

    var head = el('div', 'sx-head');
    st.els.hint = el('div', 'sx-hint');
    head.appendChild(st.els.hint);
    wrap.appendChild(head);

    // 多解：分析标签页 + 新增 / 重命名 / 删除
    var anBar = el('div', 'sx-analyses');
    st.els.anTabs = el('div', 'sx-analysis-tabs');
    anBar.appendChild(st.els.anTabs);
    var anActions = el('div', 'sx-analysis-actions');
    st.els.addAnalysisBtn = el('button', 'btn btn--sm btn--ghost sx-add-analysis', '＋ 新增一种分析');
    st.els.addAnalysisBtn.type = 'button';
    data(st.els.addAnalysisBtn, 'act', 'add-analysis');
    st.els.addAnalysisBtn.setAttribute('title', '同一题允许多种读法：做完一种读法后点这里做下一种');
    anActions.appendChild(st.els.addAnalysisBtn);
    st.els.renameBtn = el('button', 'btn btn--sm btn--ghost', '重命名');
    st.els.renameBtn.type = 'button';
    data(st.els.renameBtn, 'act', 'rename-analysis');
    anActions.appendChild(st.els.renameBtn);
    st.els.delAnalysisBtn = el('button', 'btn btn--sm btn--ghost', '删除分析');
    st.els.delAnalysisBtn.type = 'button';
    data(st.els.delAnalysisBtn, 'act', 'delete-analysis');
    anActions.appendChild(st.els.delAnalysisBtn);
    anBar.appendChild(anActions);
    wrap.appendChild(anBar);

    var stage = el('div', 'sx-stage');
    var scroll = el('div', 'sx-scroll');
    st.els.line = el('div', 'sx-line sx-line--layered');
    scroll.appendChild(st.els.line);
    stage.appendChild(scroll);
    st.els.sel = el('div', 'sx-selhint');
    stage.appendChild(st.els.sel);
    wrap.appendChild(stage);

    // 层次分析图（逐层分析模式）
    var dgPanel = el('div', 'sx-diagram-panel');
    st.els.dgPanel = dgPanel;
    var dgHd = el('div', 'sx-diagram-hd');
    dgHd.appendChild(el('span', 'sx-diagram-title', '层次分析图'));
    st.els.dgNote = el('span', 'sx-diagram-note');
    dgHd.appendChild(st.els.dgNote);
    dgPanel.appendChild(dgHd);
    st.els.diagram = el('div', 'sx-diagram-host');
    dgPanel.appendChild(st.els.diagram);
    wrap.appendChild(dgPanel);

    // 整句快切的平铺刀位表
    var pv = el('div', 'sx-preview');
    st.els.previewWrap = pv;
    var pvhd = el('div', 'sx-preview-hd');
    pvhd.appendChild(el('span', 'sx-preview-title', '刀位一览'));
    st.els.pvNote = el('span', 'sx-preview-note');
    pvhd.appendChild(st.els.pvNote);
    pv.appendChild(pvhd);
    st.els.preview = el('div', 'sx-preview-body is-empty');
    pv.appendChild(st.els.preview);
    wrap.appendChild(pv);

    var bar = el('div', 'sx-toolbar');
    var seg = el('div', 'seg sx-modes');
    st.els.modeBtns = [];
    [['layered', '逐层分析'], ['whole', '整句快切']].forEach(function (pair) {
      var btn = el('button', 'seg-btn', pair[1]);
      btn.type = 'button';
      data(btn, 'act', 'mode');
      data(btn, 'mode', pair[0]);
      if (pair[0] === 'whole' && btn.setAttribute) btn.setAttribute('title', '只判位置 + 关系，不计层次');
      if (btn.setAttribute) btn.setAttribute('aria-pressed', 'false');
      seg.appendChild(btn);
      st.els.modeBtns.push(btn);
    });
    bar.appendChild(seg);

    st.els.undoBtn = el('button', 'btn btn--sm btn--ghost', '撤销');
    st.els.undoBtn.type = 'button';
    data(st.els.undoBtn, 'act', 'undo');
    bar.appendChild(st.els.undoBtn);

    st.els.clearBtn = el('button', 'btn btn--sm btn--ghost', '清空');
    st.els.clearBtn.type = 'button';
    data(st.els.clearBtn, 'act', 'clear');
    bar.appendChild(st.els.clearBtn);

    bar.appendChild(el('div', 'grow'));
    st.els.count = el('div', 'sx-count', '已切 0 刀 / 共 0 层');
    bar.appendChild(st.els.count);
    wrap.appendChild(bar);

    var kb = el('div', 'sx-kbdhint');
    kb.appendChild(el('span', 'sx-kbdhint-txt', '快捷键：1–9 选关系 · Esc 取消 · Backspace 撤销'));
    wrap.appendChild(kb);

    st.root.appendChild(wrap);

    st.els.line.addEventListener('click', onLineClick);
    st.els.wrap.addEventListener('click', onWrapClick);
    st.onKey = onDocKeydown;
    st.onDocDown = onDocumentMousedown;
    st.onResize = onWindowResize;
    if (document.addEventListener) {
      document.addEventListener('keydown', st.onKey);
      document.addEventListener('mousedown', st.onDocDown);
    }
    if (window.addEventListener) window.addEventListener('resize', st.onResize);
  }

  function applySavedAnswer(answer) {
    st.analyses = [];
    st.active = 0;
    st.history = [];
    st.selStart = 0;
    var len = st.length;

    function pushFrom(rawCuts, modeHint) {
      var cuts = readAnswerCuts({ cuts: rawCuts }, len);
      var mode = modeHint === 'whole' ? 'whole' : 'layered';
      if (mode === 'layered' && cuts.length > 0) {
        var allSpan = cuts.every(function (c) { return Array.isArray(c.span); });
        if (!allSpan) mode = 'whole';
      }
      if (mode === 'whole') cuts = cuts.map(function (c) { return { gap: c.gap, rel: c.rel }; });
      st.analyses.push({ label: defaultAnalysisLabel(st.analyses.length), cuts: cuts, mode: mode });
    }

    if (answer && Array.isArray(answer.analyses) && answer.analyses.length) {
      answer.analyses.forEach(function (a) { pushFrom(a && a.cuts, a && a.mode); });
    } else if (answer) {
      pushFrom(answer.cuts, answer.mode);
    }
    if (!st.analyses.length) {
      st.analyses.push({ label: defaultAnalysisLabel(0), cuts: [], mode: 'layered' });
    }
    loadAnalysis(0);
  }

  function mount(root, ctx) {
    if (!root) return;
    if (st.root) {
      try { api.destroy(); } catch (e) { /* ignore */ }
    }
    ctx = ctx || {};
    st.root = root;
    st.ctx = ctx;
    st.question = ctx.question || {};
    st.sentence = typeof st.question.sentence === 'string' ? st.question.sentence : '';
    st.chars = st.sentence.split('');
    st.length = st.chars.length;
    st.mode = 'layered';
    st.cuts = [];
    st.analyses = [];
    st.active = 0;
    st.readingsInfo = readQuestionReadings(st.question);
    st.history = [];
    st.selStart = 0;
    st.blockTree = null;
    st.selBlock = null;
    st.palette = null;
    st.paletteGap = null;
    st.paletteAnchor = null;
    applySavedAnswer(ctx.savedAnswer);
    buildShell();
    render();
  }

  function cutsForOutput(cuts, mode) {
    return cloneCuts(cuts).map(function (c) {
      var o = { gap: c.gap, rel: c.rel || '' };
      if (mode === 'layered' && Array.isArray(c.span)) o.span = [c.span[0], c.span[1]];
      return o;
    });
  }

  function getAnswer() {
    syncActiveAnalysis();
    var analyses = st.analyses.map(function (a) {
      var mode = a.mode === 'whole' ? 'whole' : 'layered';
      return { cuts: cutsForOutput(a.cuts, mode), mode: mode };
    });
    var active = analyses[st.active] || { cuts: [], mode: 'layered' };
    return { analyses: analyses, cuts: active.cuts, mode: active.mode };
  }

  function setAnswer(answer) {
    if (!st.root) return;
    closePalette();
    applySavedAnswer(answer);
    render();
  }

  function reset() {
    st.analyses = [{ label: defaultAnalysisLabel(0), cuts: [], mode: 'layered' }];
    st.active = 0;
    loadAnalysis(0);
    if (st.root) {
      closePalette();
      render();
      notifyChange();
    }
  }

  function destroy() {
    closePalette();
    if (document.removeEventListener) {
      if (st.onKey) document.removeEventListener('keydown', st.onKey);
      if (st.onDocDown) document.removeEventListener('mousedown', st.onDocDown);
    }
    if (window.removeEventListener && st.onResize) {
      window.removeEventListener('resize', st.onResize);
    }
    if (st.root) clearNode(st.root);
    st.root = null;
    st.ctx = null;
    st.question = null;
    st.chars = [];
    st.length = 0;
    st.cuts = [];
    st.analyses = [];
    st.active = 0;
    st.readingsInfo = null;
    st.history = [];
    st.blockTree = null;
    st.selBlock = null;
    st.els = {};
    st.onKey = null;
    st.onDocDown = null;
    st.onResize = null;
  }

  /* =========================================================================
     16. 注册模块
     ========================================================================= */
  var api = {
    id: 'syntax',
    label: '句法分析',
    mount: mount,
    getAnswer: getAnswer,
    setAnswer: setAnswer,
    isAnswered: function () {
      syncActiveAnalysis();
      return st.analyses.some(function (a) { return a && a.cuts && a.cuts.length > 0; });
    },
    reset: reset,
    renderSolution: renderSolution,
    renderResultDetail: renderResultDetail,
    destroy: destroy,
    shortcuts: [
      { keys: '1-9', desc: '选择关系' },
      { keys: 'Esc', desc: '取消关系选择' },
      { keys: 'Backspace', desc: '撤销上一刀' }
    ]
  };

  window.PRACTICE_MODULES = window.PRACTICE_MODULES || {};
  window.PRACTICE_MODULES.syntax = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
