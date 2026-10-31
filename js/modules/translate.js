/* ============================================================================
   practice/js/modules/translate.js — 古文翻译编辑器（mod-classical）
   注册 window.PRACTICE_MODULES.translate；不碰全局布局/顶栏/判分面板；不联网。
   AI 精评由 app 统一提供：本模块只读 AI.configured() 决定提示文案，绝不自己 fetch。
   DOM 一律 textContent / createElement 构建，不拼用户内容 innerHTML。
   ========================================================================== */
(function () {
  'use strict';

  var TA_MIN = 160;   // textarea 最小高度（与 CSS 一致）
  var TA_MAX = 560;   // 自适应上限，超过后内部滚动

  /* ---------------- DOM / 文本小工具 ---------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function add(parent, child) {
    if (parent && child) parent.appendChild(child);
    return child;
  }

  // 清掉本模块上一次渲染的内容（避免 app 复用容器时重复堆叠）
  function removePrevious(root, sel) {
    try {
      if (root && typeof root.querySelector === 'function') {
        var old = root.querySelector(sel);
        if (old && old.parentNode) old.parentNode.removeChild(old);
      }
    } catch (e) { /* 忽略：某些测试环境无 DOM */ }
  }

  function countChars(text) {
    return String(text == null ? '' : text).replace(/\s+/g, '').length;
  }

  function answerText(a) {
    if (a == null) return '';
    if (typeof a === 'string') return a;
    return typeof a.text === 'string' ? a.text : '';
  }

  // 参考译文分段：按句号/问号/叹号/分号切句，换行视为硬分段
  function splitSentences(text) {
    var out = [];
    String(text == null ? '' : text).split(/\n+/).forEach(function (para) {
      var buf = '';
      for (var i = 0; i < para.length; i++) {
        buf += para[i];
        if (/[。！？；]/.test(para[i])) {
          if (buf.trim()) out.push(buf.trim());
          buf = '';
        }
      }
      if (buf.trim()) out.push(buf.trim());
    });
    return out;
  }

  // 「逐句拆行」：仅在展示时把句号/问号/叹号后换成换行（不改数据）
  function lineBySentence(text) {
    return String(text == null ? '' : text)
      .replace(/([。！？])/g, '$1\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/\n+$/, '');
  }

  function segNo(i) {
    var marks = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
    return i < marks.length ? marks.charAt(i) : '(' + (i + 1) + ')';
  }

  function aiConfigured() {
    try {
      var AI = window.AI;
      return !!(AI && typeof AI.configured === 'function' && AI.configured());
    } catch (e) {
      return false;
    }
  }

  function confirmClear() {
    try {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm('清空当前译文？');
      }
    } catch (e) { /* 忽略 */ }
    return true;
  }

  function pointRef(p) {
    if (!p) return '';
    if (p.ref) return String(p.ref);
    if (p.keywords && p.keywords.length) return p.keywords.join(' / ');
    return '';
  }

  function pointLabel(p) {
    if (!p) return '（未命名采分点）';
    return String(p.seg || (p.keywords && p.keywords[0]) || pointRef(p) || '（未命名采分点）');
  }

  function plainLoose(s) {
    return String(s == null ? '' : s).replace(
      /[\s，。；：？！、“”‘’（）《》〈〉【】…—·,.;:?!"'()\[\]<>\/\\]/g, ''
    );
  }

  // 覆盖率：正常走 GC.coverage；公共库缺失时退化为朴素包含（保证页面不白屏）
  function coverageOf(points, userText) {
    var GC = (typeof window !== 'undefined' && window.GC) ? window.GC : null;
    if (GC && typeof GC.coverage === 'function') return GC.coverage(points, userText);
    var total = 0;
    var got = 0;
    var hitPoints = [];
    var missPoints = [];
    var u = plainLoose(userText);
    (points || []).forEach(function (p) {
      var w = (p && p.score) || 1;
      total += w;
      var kws = ((p && p.keywords) || []).slice();
      if (p && p.ref) kws.push(p.ref);
      var hit = kws.some(function (k) { return k && u.indexOf(plainLoose(k)) >= 0; });
      if (!hit && p && p.seg && u.indexOf(plainLoose(p.seg)) >= 0) hit = true;
      if (hit) { got += w; hitPoints.push(p); } else missPoints.push(p);
    });
    return {
      total: total, got: got, rate: total ? got / total : 0,
      hitPoints: hitPoints, missPoints: missPoints
    };
  }

  // 用户译文里命中的关键词（用于采分点表第三列展示）
  function matchedKeyword(p, userText) {
    var GC = (typeof window !== 'undefined' && window.GC) ? window.GC : null;
    var norm = (GC && typeof GC.plainText === 'function') ? GC.plainText : plainLoose;
    var u = norm(userText);
    if (!u || !p) return '';
    var kws = (p.keywords || []).slice();
    if (p.ref) kws.push(p.ref);
    for (var i = 0; i < kws.length; i++) {
      var k = kws[i];
      if (k && u.indexOf(norm(k)) >= 0) return String(k);
    }
    if (p.seg && u.indexOf(norm(p.seg)) >= 0) return String(p.seg);
    return '';
  }

  function inList(p, list) {
    if (!p || !Array.isArray(list)) return false;
    if (list.indexOf(p) >= 0) return true;
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (x && x.seg === p.seg && (x.ref || '') === (p.ref || '')) return true;
    }
    return false;
  }

  function cardTitle(text) {
    return el('div', 'card-title', text);
  }

  function pickPoints(question) {
    var arr = question && Array.isArray(question.points) ? question.points : [];
    return arr.filter(function (p) { return !!p && typeof p === 'object'; });
  }

  /* ---------------- 模块状态 ---------------- */

  var state = null;

  var mod = {
    id: 'translate',
    label: '古文翻译',

    /* ======== 生命周期：构建交互区 ======== */
    mount: function (root, ctx) {
      if (!root) return mod;
      mod.destroy();
      ctx = ctx || {};
      var question = ctx.question || {};

      var st = state = {
        root: root, ctx: ctx, question: question,
        text: '', split: false,
        wrap: null, ta: null, srcText: null, countEl: null, splitInput: null,
        setText: null
      };

      var wrap = el('div', 'tr-editor');

      /* --- 上半：原文卡片 --- */
      var srcPanel = el('div', 'panel tr-source');
      var srcHd = el('div', 'tr-source-hd');
      add(srcHd, el('span', 'tr-panel-label', '原文'));
      add(srcHd, el('span', 'badge badge--gold', '古文'));
      add(srcPanel, srcHd);
      var srcText = el('div', 'tr-source-text');
      srcText.textContent = String(question.text || '（原文缺失）');
      add(srcPanel, srcText);
      add(wrap, srcPanel);

      /* --- 下半：译文输入区 --- */
      var writing = el('div', 'tr-writing');
      var ta = document.createElement('textarea');
      ta.className = 'textarea tr-input';
      ta.placeholder = '在此写下你的译文…';
      ta.rows = 5;
      ta.setAttribute('aria-label', '译文');
      add(writing, ta);

      var toolbar = el('div', 'tr-toolbar');
      var countEl = el('span', 'tr-count', '已写 0 字');
      add(toolbar, countEl);

      var tools = el('div', 'tr-tools');
      var splitLabel = el('label', 'tr-split');
      var sw = el('span', 'switch');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      add(sw, cb);
      add(sw, el('i'));
      add(splitLabel, sw);
      add(splitLabel, el('span', 'tr-split-label', '逐句拆行'));
      add(tools, splitLabel);

      var clearBtn = el('button', 'btn btn--sm btn--ghost tr-clear', '清空');
      clearBtn.type = 'button';
      add(tools, clearBtn);
      add(toolbar, tools);
      add(writing, toolbar);
      add(wrap, writing);

      root.appendChild(wrap);

      st.wrap = wrap;
      st.ta = ta;
      st.countEl = countEl;
      st.splitInput = cb;
      st.srcText = srcText;

      function refreshCount() {
        countEl.textContent = '已写 ' + countChars(st.text) + ' 字';
      }

      function autoSize() {
        ta.style.height = 'auto';
        var h = ta.scrollHeight || TA_MIN;
        ta.style.height = Math.min(Math.max(h, TA_MIN), TA_MAX) + 'px';
      }

      function applySplit() {
        var base = String(st.question.text || '（原文缺失）');
        srcText.textContent = st.split ? lineBySentence(base) : base;
      }

      function notify() {
        if (typeof st.ctx.onChange === 'function') {
          try { st.ctx.onChange(); } catch (e) { /* 业务回调异常不打断输入 */ }
        }
      }

      function setText(v, fire) {
        st.text = v == null ? '' : String(v);
        if (ta.value !== st.text) ta.value = st.text;
        refreshCount();
        autoSize();
        if (fire) notify();
      }
      st.setText = setText;

      ta.addEventListener('input', function () { setText(ta.value, true); });

      cb.addEventListener('change', function () {
        st.split = !!cb.checked;
        applySplit();   // 纯展示辅助，不改答案、不触发 onChange
      });

      clearBtn.addEventListener('click', function () {
        if (countChars(st.text) && !confirmClear()) return;
        setText('', true);
        try { ta.focus(); } catch (e) { /* 忽略 */ }
      });

      // 回填历史作答（不触发 onChange，由 app 自己决定提交按钮状态）
      var saved = ctx.savedAnswer;
      var initial = '';
      if (saved && typeof saved === 'object' && typeof saved.text === 'string') initial = saved.text;
      else if (typeof saved === 'string') initial = saved;
      setText(initial, false);

      return mod;
    },

    /* ======== 答案读写 ======== */
    getAnswer: function () {
      return { text: state ? state.text : '' };
    },

    setAnswer: function (a) {
      if (!state || typeof state.setText !== 'function') return;
      state.setText(answerText(a), false);
    },

    isAnswered: function () {
      return !!state && countChars(state.text) > 0;
    },

    reset: function () {
      if (!state || typeof state.setText !== 'function') return;
      state.setText('', true);
    },

    /* ======== 解析区：参考译文 + 采分点对照 + 译文对照 ======== */
    renderSolution: function (root, question, userAnswer) {
      if (!root) return;
      var q = question || {};
      var userText = answerText(userAnswer);
      var points = pickPoints(q);
      var cov = coverageOf(points, userText);

      removePrevious(root, '.tr-solution');
      var box = el('div', 'tr-solution');

      /* --- 参考译文卡片（分段显示） --- */
      var refCard = el('div', 'card tr-refcard');
      add(refCard, cardTitle('参考译文'));
      var refBody = el('div', 'tr-refbody');
      var segs = splitSentences(q.reference);
      if (!segs.length) {
        add(refBody, el('div', 'tr-empty', '（暂无参考译文）'));
      } else {
        segs.forEach(function (s, i) {
          var seg = el('div', 'tr-refseg');
          add(seg, el('span', 'tr-segno', segNo(i)));
          add(seg, el('span', 'tr-refseg-text', s));
          add(refBody, seg);
        });
      }
      add(refCard, refBody);
      add(box, refCard);

      /* --- 采分点对照表 --- */
      var ptsCard = el('div', 'card tr-pointscard');
      add(ptsCard, cardTitle('采分点对照'));
      if (!points.length) {
        add(ptsCard, el('div', 'notice', '本题未配置采分点（题库数据缺失），可直接对照参考译文自评。'));
      } else {
        add(ptsCard, el('div', 'tr-points-sum',
          '命中 ' + cov.hitPoints.length + ' / ' + points.length +
          ' 个采分点 · 覆盖率 ' + Math.round(cov.rate * 100) + '%'));
        var tw = el('div', 'tr-tablewrap');
        var table = el('table', 'table tr-points');
        var thead = el('thead');
        var headRow = el('tr');
        ['采分点', '参考译法', '你的译文'].forEach(function (t) {
          add(headRow, el('th', '', t));
        });
        add(thead, headRow);
        add(table, thead);
        var tbody = el('tbody');
        points.forEach(function (p) {
          var isHit = inList(p, cov.hitPoints);
          var tr = el('tr', 'tr-point ' + (isHit ? 'is-hit' : 'is-miss'));
          add(tr, el('td', 'tr-seg', pointLabel(p)));
          add(tr, el('td', 'tr-refcell', pointRef(p) || '—'));
          var statusTd = el('td', 'tr-statuscell');
          if (isHit) {
            add(statusTd, el('span', 'tr-mark tr-mark--hit', '✓ 已译出'));
            var kw = matchedKeyword(p, userText);
            if (kw) add(statusTd, el('span', 'tr-kw', '命中「' + kw + '」'));
          } else {
            add(statusTd, el('span', 'tr-mark tr-mark--miss', '疑似漏译'));
            add(statusTd, el('span', 'tr-miss-hint', '对照参考译法'));
          }
          add(tr, statusTd);
          add(tbody, tr);
        });
        add(table, tbody);
        add(tw, table);
        add(ptsCard, tw);
      }
      add(box, ptsCard);

      /* --- 我的译文（只读，与上方参考译文上下对照） --- */
      var mineCard = el('div', 'card tr-mine');
      add(mineCard, cardTitle('我的译文（只读）'));
      var mineText = String(userText || '').trim();
      var mine = el('div', 'tr-usertext' + (mineText ? '' : ' is-empty'), mineText || '（未作答）');
      add(mineCard, mine);
      add(mineCard, el('div', 'hint', '与上方「参考译文」逐句对照：看漏译、看语序、看虚词是否落实。'));
      add(box, mineCard);

      root.appendChild(box);
    },

    /* ======== 判分结果细节：命中 / 疑似漏译 + AI 提示 ======== */
    renderResultDetail: function (root, question, userAnswer, gradeResult) {
      if (!root) return;
      var q = question || {};
      var userText = answerText(userAnswer);
      var points = pickPoints(q);
      var review = gradeResult && gradeResult.review;

      var hitList = [];
      var missList = [];
      var rate = 0;
      if (review && Array.isArray(review.hitPoints) && Array.isArray(review.missPoints)) {
        hitList = review.hitPoints;
        missList = review.missPoints;
        if (typeof review.coverage === 'number') {
          rate = review.coverage;
        } else {
          var n0 = points.length || (hitList.length + missList.length);
          rate = n0 ? hitList.length / n0 : 0;
        }
      } else if (points.length) {
        var cov = coverageOf(points, userText);
        hitList = cov.hitPoints;
        missList = cov.missPoints;
        rate = cov.rate;
      }
      hitList = hitList.filter(function (p) { return !!p && typeof p === 'object'; });
      missList = missList.filter(function (p) { return !!p && typeof p === 'object'; });
      var totalN = points.length || (hitList.length + missList.length);

      removePrevious(root, '.tr-result-detail');
      var box = el('div', 'tr-result-detail');

      var head = el('div', 'tr-rd-hd');
      add(head, el('span', 'tr-rd-hd-label', '采分点命中'));
      add(head, el('b', 'num', hitList.length + ' / ' + totalN));
      add(head, el('span', 'faint small', '覆盖率 ' + Math.round(rate * 100) + '%'));
      add(box, head);

      function pointList(title, kind, list) {
        var col = el('div', 'tr-rd-col tr-rd-col--' + kind);
        var hd = el('div', 'tr-rd-coltitle');
        add(hd, el('span', 'tr-rd-ico', kind === 'hit' ? '✓' : '!'));
        add(hd, el('span', '', title + '（' + list.length + '）'));
        add(col, hd);
        if (!list.length) {
          add(col, el('div', 'tr-rd-empty', kind === 'hit' ? '暂无命中采分点' : '没有发现漏译'));
          return col;
        }
        var ul = el('ul', 'tr-rd-list');
        list.forEach(function (p) {
          var li = el('li', 'tr-rd-item');
          add(li, el('span', 'tr-rd-seg', pointLabel(p)));
          var rf = pointRef(p);
          if (rf) add(li, el('span', 'tr-rd-ref', '参考：' + rf));
          if (kind === 'miss') add(li, el('span', 'tr-rd-tip', '疑似漏译，对照参考译法'));
          add(ul, li);
        });
        add(col, ul);
        return col;
      }

      var grid = el('div', 'tr-rd-grid');
      add(grid, pointList('已命中', 'hit', hitList));
      add(grid, pointList('疑似漏译', 'miss', missList));
      add(box, grid);

      // AI 精评提示：app 统一提供 AI 入口，模块只负责提示（契约 §7.3）
      var score = gradeResult && typeof gradeResult.score === 'number' ? gradeResult.score : null;
      var isFull = score != null && score >= 100;
      var hint = el('div', 'notice tr-aihint');
      if (aiConfigured()) {
        hint.textContent = isFull
          ? '采分点全部命中。若想进一步打磨译文（语气、连贯、用典），可点「AI 精评」逐句对照。'
          : '内置判分只看采分点关键词，意译到位但用词不同的答案可能被低估。建议先点「AI 精评」，获取逐句批改与错因归类。';
      } else {
        hint.textContent = isFull
          ? '采分点全部命中。AI 精评尚未启用：到「设置」页填入 DeepSeek API Key 后，可获取逐句润色建议。'
          : '内置判分按采分点关键词给分，AI 精评尚未启用：请先对照参考译文自评；如需逐句批改，到「设置」页填入 DeepSeek API Key 后再点「AI 精评」。';
      }
      add(box, hint);

      root.appendChild(box);
    },

    /* ======== 销毁 ======== */
    destroy: function () {
      if (!state) return;
      var wrap = state.wrap;
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      state = null;
    }
  };

  window.PRACTICE_MODULES = window.PRACTICE_MODULES || {};
  window.PRACTICE_MODULES.translate = mod;
})();
