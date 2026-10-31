/* ============================================================================
   practice/js/app.js — 路由、题目流、判分结果面板、AI 挂接
   ========================================================================== */
(function () {
  'use strict';
  var U = window.util;
  var S = window.Store;
  var UI = window.UI;

  var TYPES = ['syntax', 'ipa', 'sememe', 'translate', 'punct'];
  var TYPE_META = {
    syntax: { label: '句法分析', short: '句法', icon: 'syntax', desc: '层次分析法 · 逐刀判分', color: 'jade' },
    ipa: { label: '国际音标', short: '音标', icon: 'ipa', desc: '注音 + 音位分析', color: 'gold' },
    sememe: { label: '义素分析', short: '义素', icon: 'sememe', desc: '义素矩阵 · 逐列比对', color: 'accent' },
    translate: { label: '古文翻译', short: '翻译', icon: 'translate', desc: '采分点判分 + AI 精评', color: 'accent' },
    punct: { label: '句读标点', short: '句读', icon: 'punct', desc: '标点弹窗 · 断点判分', color: 'jade' }
  };
  var PAGE_TITLE = {
    home: '首页', review: '错题重练', stats: '统计复盘', assistant: 'AI 助教', settings: '设置与说明'
  };

  var App = {
    route: 'home',
    type: null,
    list: [],
    idx: 0,
    filter: { source: 'all', tag: 'all', order: 'seq' },
    q: null,
    mod: null,
    startedAt: 0,
    submitted: null,
    timerId: null,
    root: null,
    stage: null,
    actions: null,
    resultWrap: null,
    solutionWrap: null,
    aiWrap: null,
    metaWrap: null
  };
  window.App = App;

  /* ================= 数据与过滤 ================= */
  function allOf(type) {
    return (window.PRACTICE_DATA && window.PRACTICE_DATA[type]) || [];
  }
  function tagsOf(type) {
    var m = {};
    allOf(type).forEach(function (q) { (q.tags || []).forEach(function (t) { m[t] = (m[t] || 0) + 1; }); });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (t) { return { tag: t, n: m[t] }; });
  }
  function buildList(type, filter, keepOrder) {
    var list = allOf(type).slice();
    if (filter.source === 'real') list = list.filter(function (q) { return q.source && q.source.real; });
    if (filter.source === 'mock') list = list.filter(function (q) { return !(q.source && q.source.real); });
    if (filter.tag && filter.tag !== 'all') list = list.filter(function (q) { return (q.tags || []).indexOf(filter.tag) >= 0; });
    if (filter.order === 'random') list = U.shuffle(list);
    else if (filter.order === 'todo') {
      var todo = [], done = [];
      list.forEach(function (q) { (S.getAttempt(q.id) ? done : todo).push(q); });
      list = todo.concat(done);
    }
    if (!keepOrder) {
      var st = sessionStorage.getItem('yanmo.filter.' + type);
      if (st) { /* 过滤器已由 UI 状态恢复 */ }
    }
    return list;
  }
  App.buildList = buildList;
  App.allOf = allOf;

  /* ================= 外壳 ================= */
  function initIcons() {
    UI.$$('.nav-item, .tab').forEach(function (a) {
      var slot = a.querySelector('.nav-ico-slot');
      if (!slot) return;
      var r = a.dataset.route;
      var name = TYPE_META[r] ? TYPE_META[r].icon : (r === 'review' ? 'review' : r === 'stats' ? 'stats' : r === 'assistant' ? 'assistant' : r === 'settings' ? 'settings' : 'home');
      slot.replaceWith(UI.icon(name));
    });
  }

  function currentTheme() {
    var t = S.settings.theme || 'auto';
    if (t === 'auto') return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return t;
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme());
    var btn = document.getElementById('theme-btn');
    if (btn) {
      var t = S.settings.theme || 'auto';
      btn.textContent = t === 'auto' ? '◐' : t === 'dark' ? '☾' : '☀';
      btn.title = '主题：' + (t === 'auto' ? '跟随系统' : t === 'dark' ? '深色' : '浅色') + '（点击切换）';
    }
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var i = order.indexOf(S.settings.theme || 'auto');
    var next = order[(i + 1) % order.length];
    S.setSettings({ theme: next });
    applyTheme();
    if (App.route === 'settings' && window.PAGES && PAGES.settings) render();
    UI.toast('主题：' + (next === 'auto' ? '跟随系统' : next === 'dark' ? '深色' : '浅色'));
  }

  function updateChrome() {
    var today = S.today();
    var st = S.stats();
    var rate = today.count ? Math.round(today.correct / today.count * 100) + '%' : '—';
    var e = document.getElementById('foot-today'); if (e) e.textContent = today.count;
    e = document.getElementById('foot-rate'); if (e) e.textContent = rate;
    e = document.getElementById('foot-streak'); if (e) e.textContent = S.streak();
    e = document.getElementById('ai-pill');
    if (e) {
      var ok = window.AI && AI.configured();
      e.className = 'badge ' + (ok ? 'badge--jade' : 'badge--mock');
      e.textContent = ok ? 'AI 已连接' : 'AI 未配置';
      e.title = ok ? ('模型：' + (S.settings.ai.model || 'deepseek-chat')) : '到「设置与说明」填入 DeepSeek API Key';
    }
    // 题型计数
    TYPES.forEach(function (t) {
      var el = document.querySelector('[data-count="' + t + '"]');
      if (el) el.textContent = allOf(t).length;
    });
    var wl = document.querySelector('[data-count="wrong"]');
    if (wl) wl.textContent = S.wrongList().length;
    // 复习完成度小字（侧栏底部第二行）
    var footRate = document.getElementById('foot-rate');
    if (footRate) footRate.title = '累计 ' + st.total + ' 次作答，平均正确率 ' + (st.total ? Math.round(st.correct / st.total * 100) : 0) + '%';
  }

  function setActiveNav(route) {
    UI.$$('.nav-item').forEach(function (a) { a.classList.toggle('is-active', a.dataset.route === route); });
    UI.$$('.tab').forEach(function (a) { a.classList.toggle('is-active', a.dataset.route === route); });
  }

  function crumb(text, sub) {
    var c = document.getElementById('crumb');
    if (!c) return;
    c.textContent = '';
    c.appendChild(UI.el('b', {}, text));
    if (sub) c.appendChild(UI.el('span', {}, '· ' + sub));
  }

  function closeSidebar() { var s = document.getElementById('sidebar'); if (s) s.classList.remove('is-open'); }

  /* ================= 路由 ================= */
  function parseRoute() {
    var h = (location.hash || '#/home').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    var route = parts[0] || 'home';
    if (TYPES.indexOf(route) < 0 && !PAGE_TITLE[route]) route = 'home';
    return { route: route, param: parts[1] || null };
  }
  function render() {
    var r = parseRoute();
    App.route = r.route;
    setActiveNav(TYPES.indexOf(r.route) >= 0 ? r.route : r.route);
    closeSidebar();
    var root = document.getElementById('page-root');
    if (!root) { console.warn('[app] 找不到 #page-root，跳过渲染'); return; }
    // 路由切换前销毁旧模块，避免 document 级监听残留
    if (App.mod && typeof App.mod.destroy === 'function') {
      try { App.mod.destroy(); } catch (e) { console.warn('[app] module destroy failed', e); }
      App.mod = null;
    }
    UI.clear(root);
    App.root = root;
    App.mod = null;
    App.submitted = null;
    if (App.timerId) { clearInterval(App.timerId); App.timerId = null; }
    if (TYPES.indexOf(r.route) >= 0) {
      App.type = r.route;
      restoreFilter(App.type);
      if (r.param) {
        var list = buildList(App.type, App.filter);
        var i = list.findIndex(function (q) { return q.id === r.param; });
        if (i >= 0) {
          App.idx = i;
          App.lastType = App.type;   // 参数指定了题目位置，避免被“题型位置恢复”覆盖
        }
      }
      renderPractice();
    } else {
      App.type = null;
      var page = window.PAGES && PAGES[r.route];
      crumb(PAGE_TITLE[r.route] || '首页');
      if (page) {
        try { page(root); } catch (e) { renderError(root, e); }
      } else {
        root.appendChild(UI.empty('页面还没准备好', '稍后刷新试试'));
      }
    }
    updateChrome();
    window.scrollTo(0, 0);
  }
  function restoreFilter(type) {
    try {
      var f = JSON.parse(sessionStorage.getItem('yanmo.filter.' + type) || 'null');
      if (f) App.filter = Object.assign({ source: 'all', tag: 'all', order: 'seq' }, f);
    } catch (e) {}
  }
  function renderError(root, e) {
    root.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('div', { class: 'card-title' }, '页面渲染出错'),
      UI.el('pre', { class: 'small muted', style: { whiteSpace: 'pre-wrap' } }, String(e && e.stack || e))
    ]));
  }
  function go(route, param) {
    location.hash = '#/' + route + (param ? '/' + encodeURIComponent(param) : '');
  }
  App.go = go;

  /* ================= 练习页 ================= */
  function posKey(type) { return 'yanmo.pos.' + type; }
  function savePos(type, idx) { try { sessionStorage.setItem(posKey(type), String(idx)); } catch (e) {} }
  function loadPos(type) { try { return parseInt(sessionStorage.getItem(posKey(type)) || '0', 10) || 0; } catch (e) { return 0; } }

  function renderPractice() {
    var type = App.type;
    var meta = TYPE_META[type];
    // 重新渲染前：销毁旧模块、清空容器，避免筛选/切题时页面重复堆叠
    if (App.mod && typeof App.mod.destroy === 'function') {
      try { App.mod.destroy(); } catch (e) { console.warn('[app] destroy', e); }
    }
    App.mod = null;
    if (App.root) UI.clear(App.root);
    restoreFilter(type);
    // 切题型时：过滤标签若不属于本题型则重置；位置回到该题型上次的位置
    if (App.lastType !== type) {
      var tagOk = !App.filter.tag || App.filter.tag === 'all' ||
        tagsOf(type).some(function (t) { return t.tag === App.filter.tag; });
      if (!tagOk) { App.filter.tag = 'all'; saveFilter(type); }
      App.idx = loadPos(type);
      App.lastType = type;
    }
    var list = buildList(type, App.filter);
    App.list = list;
    if (!list.length) {
      crumb(meta.label, '暂无题目');
      App.root.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title' }, '题库为空'),
        UI.el('p', { class: 'small muted' }, '这一类题目还没有生成或过滤后为空。试试切换「来源」筛选。')
      ]));
      return;
    }
    if (App.idx >= list.length) App.idx = list.length - 1;
    if (App.idx < 0) App.idx = 0;
    var q = list[App.idx];
    App.q = q;
    App.submitted = null;
    App.startedAt = Date.now();
    savePos(type, App.idx);
    crumb(meta.label, '第 ' + (App.idx + 1) + ' / ' + list.length + ' 题');

    var page = UI.el('div', { class: 'page practice-page', 'data-type': type });

    /* --- 顶部信息栏 --- */
    page.appendChild(renderPracticeHead(type, meta, list, q));

    /* --- 题目卡 --- */
    var qCard = UI.el('div', { class: 'card practice-card' });
    qCard.appendChild(renderQuestionHead(q, meta));
    App.stage = UI.el('div', { class: 'stage' });
    qCard.appendChild(App.stage);
    App.actions = UI.el('div', { class: 'btn-row practice-actions' });
    qCard.appendChild(App.actions);
    page.appendChild(qCard);

    /* --- 结果卡 / 解析卡 --- */
    App.resultWrap = UI.el('div', { class: 'result-wrap hidden' });
    App.solutionWrap = UI.el('div', { class: 'solution-wrap hidden' });
    page.appendChild(App.resultWrap);
    page.appendChild(App.solutionWrap);

    App.root.appendChild(page);

    /* --- 挂载模块 --- */
    mountModule(q);
    renderActions();
    updateChrome();
  }

  function renderPracticeHead(type, meta, list, q) {
    var head = UI.el('div', { class: 'practice-head' });
    var left = UI.el('div', { class: 'practice-head-left' });
    left.appendChild(UI.el('div', { class: 'row' }, [
      UI.el('span', { class: 'badge badge--solid' }, meta.label),
      UI.el('span', { class: 'small faint' }, meta.desc)
    ]));
    // 题号进度
    var pct = Math.round((App.idx + 1) / list.length * 100);
    left.appendChild(UI.el('div', { class: 'progress-row' }, [
      UI.el('div', { class: 'small faint nowrap' }, (App.idx + 1) + ' / ' + list.length),
      UI.progress(pct, 'good')
    ]));
    head.appendChild(left);

    var right = UI.el('div', { class: 'practice-filters' });
    // 来源筛选
    right.appendChild(UI.el('div', { class: 'filter-line' }, [
      UI.el('span', { class: 'filter-label' }, '来源'),
      UI.seg([
        { value: 'all', label: '全部' }, { value: 'real', label: '真题' }, { value: 'mock', label: '模拟' }
      ], App.filter.source, function (v) {
        App.filter.source = v; App.idx = 0; saveFilter(type); renderPractice();
      })
    ]));
    // 考点筛选
    var tagSel = UI.el('select', { class: 'select filter-select' });
    tagSel.appendChild(UI.el('option', { value: 'all' }, '全部考点'));
    tagsOf(type).forEach(function (t) {
      var opt = UI.el('option', { value: t.tag }, t.tag + '（' + t.n + '）');
      if (App.filter.tag === t.tag) opt.selected = true;
      tagSel.appendChild(opt);
    });
    tagSel.addEventListener('change', function () {
      App.filter.tag = tagSel.value; App.idx = 0; saveFilter(type); renderPractice();
    });
    right.appendChild(UI.el('div', { class: 'filter-line' }, [
      UI.el('span', { class: 'filter-label' }, '考点'), tagSel
    ]));
    // 顺序
    right.appendChild(UI.el('div', { class: 'filter-line' }, [
      UI.el('span', { class: 'filter-label' }, '顺序'),
      UI.seg([
        { value: 'seq', label: '顺序' }, { value: 'random', label: '随机' }, { value: 'todo', label: '未做优先' }
      ], App.filter.order, function (v) {
        App.filter.order = v; App.idx = 0; saveFilter(type); renderPractice();
      })
    ]));
    head.appendChild(right);
    return head;
  }
  function saveFilter(type) {
    try { sessionStorage.setItem('yanmo.filter.' + type, JSON.stringify(App.filter)); } catch (e) {}
  }

  function renderQuestionHead(q, meta) {
    var head = UI.el('div', { class: 'q-head' });
    var srcLine = UI.el('div', { class: 'source-line' });
    var s = q.source || {};
    if (s.real) {
      srcLine.appendChild(UI.el('span', { class: 'badge badge--real' }, '真题'));
      srcLine.appendChild(UI.el('span', { class: 'badge' }, [s.school || '', s.year ? s.year + ' 年' : '', s.code ? s.code : ''].filter(Boolean).join(' ')));
      if (s.detail) srcLine.appendChild(UI.el('span', { class: 'tiny faint' }, s.detail));
    } else {
      srcLine.appendChild(UI.el('span', { class: 'badge badge--mock' }, '模拟题'));
    }
    (q.tags || []).forEach(function (t) { srcLine.appendChild(UI.el('span', { class: 'tag' }, t)); });
    var last = S.getAttempt(q.id);
    if (last) {
      srcLine.appendChild(UI.el('span', { class: 'badge ' + (last.correct ? 'badge--jade' : 'badge--red') }, '上次 ' + last.score + ' 分'));
    }
    if (q.source && q.source.real && !s.school) srcLine.appendChild(UI.el('span', { class: 'tiny faint' }, '来源待补'));
    head.appendChild(srcLine);

    var prompt = q.prompt || '';
    var promptEl = UI.el('div', { class: 'prompt-text', style: { marginTop: '8px' } }, prompt);
    head.appendChild(promptEl);
    return head;
  }

  function mountModule(q) {
    var mod = window.PRACTICE_MODULES && window.PRACTICE_MODULES[q.type];
    UI.clear(App.stage);
    if (!mod) {
      App.stage.appendChild(UI.el('div', { class: 'notice notice--bad' }, '「' + (TYPE_META[q.type].label) + '」模块脚本未加载（js/modules/' + q.type + '.js）。'));
      return;
    }
    App.mod = mod;
    var last = S.getAttempt(q.id);
    try {
      mod.mount(App.stage, {
        question: q,
        savedAnswer: null,
        onChange: function () { refreshSubmitState(); }
      });
    } catch (e) {
      App.stage.appendChild(UI.el('div', { class: 'notice notice--bad' }, '模块渲染失败：' + (e && e.message ? e.message : e)));
      console.error(e);
    }
    refreshSubmitState();
  }

  function refreshSubmitState() {
    if (!App.actions) return;
    var submit = App.actions.querySelector('[data-act="submit"]');
    if (!submit) return;
    var ok = false;
    try { ok = !!(App.mod && App.mod.isAnswered && App.mod.isAnswered()); } catch (e) { ok = false; }
    submit.disabled = !ok || !!App.submitted;
    submit.classList.toggle('is-disabled', !ok);
  }

  function actionBtn(label, act, kind, opts) {
    opts = opts || {};
    var b = UI.el('button', { class: 'btn ' + (kind ? 'btn--' + kind : '') + (opts.sm ? ' btn--sm' : ''), 'data-act': act }, label);
    if (opts.title) b.title = opts.title;
    b.addEventListener('click', function () { handleAction(act); });
    return b;
  }
  function renderActions() {
    var type = App.type;
    var a = App.actions;
    UI.clear(a);
    var fav = S.qstat(App.q.id) && S.qstat(App.q.id).fav;
    a.appendChild(actionBtn('提交判分', 'submit', 'primary'));
    a.appendChild(actionBtn('看答案解析', 'solution', 'ghost'));
    a.appendChild(actionBtn('重做', 'redo', 'ghost'));
    if (type === 'translate') a.appendChild(actionBtn('AI 精评', 'ai-translate', 'gold'));
    if (type === 'syntax' && (App.q.tags || []).indexOf('歧义') >= 0) a.appendChild(actionBtn('歧义多解', 'ambiguity', 'ghost'));
    a.appendChild(actionBtn(fav ? '★ 已收藏' : '☆ 收藏', 'fav', 'ghost'));
    var spacer = UI.el('span', { class: 'grow' });
    a.appendChild(spacer);
    a.appendChild(actionBtn('‹ 上一题', 'prev', 'ghost', { sm: true }));
    a.appendChild(actionBtn('下一题 ›', 'next', 'ghost', { sm: true }));
    refreshSubmitState();
  }

  function handleAction(act) {
    if (act === 'submit') return submitAnswer();
    if (act === 'solution') return toggleSolution();
    if (act === 'redo') return redoQuestion();
    if (act === 'fav') {
      var fav = S.toggleFav(App.q.id);
      UI.toast(fav ? '已加入收藏' : '已取消收藏', fav ? 'ok' : null);
      renderActions();
      return;
    }
    if (act === 'prev') return gotoOffset(-1);
    if (act === 'next') return gotoOffset(1);
    if (act === 'ai-translate') return runTranslateAI();
    if (act === 'ambiguity') return runAmbiguity();
  }
  App.handleAction = handleAction;
  App.submitAnswer = submitAnswer;
  App.toggleSolution = toggleSolution;
  App.render = render;
  App.gotoOffset = gotoOffset;

  function gotoOffset(d) {
    var i = App.idx + d;
    if (i < 0) { UI.toast('已经是第一题了'); return; }
    if (i >= App.list.length) { UI.toast('这一类的题刷完了，去别的题型看看吧', 'ok'); return; }
    App.idx = i;
    savePos(App.type, i);
    renderPractice();
  }

  function compactAnswer(type, ans) {
    if (!ans) return '';
    if (type === 'translate') return ans.text;
    if (type === 'ipa') return ans.items;
    if (type === 'sememe') return ans.sememes;
    if (type === 'punct') return ans.marks;
    if (type === 'syntax') return ans.analyses ? ans.analyses.map(function (a) { return a.cuts; }) : ans.cuts;
    return ans;
  }

  function submitAnswer() {
    if (App.submitted) return;
    var q = App.q;
    var type = App.type;
    var grader = window.GRADERS && window.GRADERS[type];
    if (!grader) { UI.toast('判分器未加载', 'bad'); return; }
    var ans;
    try { ans = App.mod.getAnswer(); } catch (e) { UI.toast('读取答案失败', 'bad'); return; }
    var grade;
    try { grade = grader(q, ans); } catch (e) {
      console.error(e);
      UI.toast('判分出错：' + (e && e.message || e), 'bad');
      return;
    }
    var timeMs = Date.now() - App.startedAt;
    var answerHash = U.hash(JSON.stringify(ans));
    App.submitted = { answer: ans, grade: grade, hash: answerHash };
    S.saveAttempt({
      qid: q.id, type: type, score: grade.score, answerHash: answerHash,
      timeMs: timeMs, errors: grade.errors, answer: ans
    });
    App.answer = ans;
    renderResult();
    renderActions();
    refreshSubmitState();
    // 滚动到结果
    setTimeout(function () {
      if (App.resultWrap) App.resultWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    // 自动 AI 归因
    if (grade.score < 100 && S.settings.ai.autoAnalyze) maybeAnalyze(grade, ans);
    updateChrome();
  }

  function renderResult() {
    var q = App.q, type = App.type;
    var grade = App.submitted.grade;
    var ans = App.submitted.answer;
    var wrap = App.resultWrap;
    UI.clear(wrap);
    wrap.classList.remove('hidden');
    var band = grade.score >= 80 ? 'good' : grade.score >= 60 ? 'warn' : 'bad';
    var card = UI.el('div', { class: 'card result-card is-' + band });
    var hd = UI.el('div', { class: 'result-hd' });
    hd.appendChild(UI.ring(grade.score));
    var meta = UI.el('div', { class: 'score-meta' });
    var title = UI.el('div', { class: 'score-title' });
    title.appendChild(UI.el('span', {}, grade.score >= 100 ? '满分，漂亮！' : grade.score >= 80 ? '过关' : grade.score >= 60 ? '差一点' : '需要重练'));
    title.appendChild(UI.el('span', { class: 'badge badge--' + (band === 'good' ? 'jade' : band === 'warn' ? 'gold' : 'red') }, GC.band(grade.score).tag));
    if (App.submitted && grade.summary) title.appendChild(UI.el('span', { class: 'small faint' }, '· ' + grade.summary));
    meta.appendChild(title);
    if (grade.sub && grade.sub.length) {
      var subs = UI.el('div', { class: 'sub-scores' });
      grade.sub.forEach(function (s) {
        subs.appendChild(UI.el('span', { class: 'sub-score' }, [UI.el('span', {}, s.name), UI.el('b', {}, String(s.score)), UI.el('span', { class: 'faint' }, '/ ' + s.max)]));
      });
      meta.appendChild(subs);
    }
    meta.appendChild(UI.el('div', { class: 'tiny faint' }, '用时 ' + U.formatMs(App.startedAt ? Date.now() - App.startedAt : 0) + ' · 已存入练习记录'));
    hd.appendChild(meta);
    card.appendChild(hd);

    // 错误列表
    if (grade.errors && grade.errors.length) {
      var list = UI.el('div', { class: 'err-list', style: { marginTop: '14px' } });
      grade.errors.slice(0, 14).forEach(function (e) {
        var metaErr = window.errMeta ? window.errMeta(type, e.code) : null;
        var item = UI.el('div', { class: 'err-item' + (e.severity === 'low' || (metaErr && metaErr.severity === 'low') ? ' lev-low' : '') }, [
          UI.el('span', { class: 'err-code' }, e.short || e.name || e.code),
          UI.el('div', { class: 'err-body' }, [
            UI.el('div', { class: 'err-name' }, (e.name || (metaErr && metaErr.name) || e.code)),
            e.detail ? UI.el('div', { class: 'err-detail' }, e.detail) : null
          ])
        ]);
        list.appendChild(item);
      });
      if (grade.errors.length > 14) list.appendChild(UI.el('div', { class: 'tiny faint' }, '还有 ' + (grade.errors.length - 14) + ' 处小问题…'));
      card.appendChild(list);
    } else if (grade.score >= 100) {
      card.appendChild(UI.el('div', { class: 'ok-chip', style: { marginTop: '12px' } }, '✓ 这一题没有发现错误'));
    }

    // 模块专属细节
    if (App.mod && App.mod.renderResultDetail) {
      var detail = UI.el('div', { class: 'result-detail', style: { marginTop: '14px' } });
      card.appendChild(detail);
      try { App.mod.renderResultDetail(detail, q, ans, grade); } catch (e) { console.error(e); }
    }

    // AI 分析区
    App.aiWrap = UI.el('div', { class: 'ai-area', style: { marginTop: '16px' } });
    card.appendChild(App.aiWrap);
    wrap.appendChild(card);

    // 若未开启/未配置 AI，给一句提示（不打扰）
    if (grade.score < 100) renderAIHint();
  }

  function renderAIHint() {
    if (!App.aiWrap) return;
    UI.clear(App.aiWrap);
    var ok = window.AI && AI.configured();
    var enabled = S.settings.ai.autoAnalyze;
    if (!enabled) {
      App.aiWrap.appendChild(UI.el('div', { class: 'tiny faint' }, 'AI 归因已关闭（可在设置里打开）。'));
      return;
    }
    if (!ok) {
      App.aiWrap.appendChild(UI.el('div', { class: 'notice' }, [
        UI.el('span', {}, '💡 '),
        UI.el('span', {}, ['配好 DeepSeek API Key 后，做错的题会自动', UI.el('b', {}, '归类错因 + 给一句话点拨'), '，并且同一答案只花一次 token。'],
          UI.el('a', { href: '#/settings', style: { marginLeft: '6px' } }, '去设置 →'))
      ]));
    }
  }

  function renderAILoading(label) {
    if (!App.aiWrap) return;
    UI.clear(App.aiWrap);
    App.aiWrap.appendChild(UI.el('div', { class: 'ai-box' }, [
      UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), UI.el('span', {}, label || 'AI 正在归类错因…')]),
      UI.el('div', { class: 'ai-loading' }, [UI.el('span', { class: 'spinner' }), UI.el('span', {}, '对比你的答案与标准答案（结果会缓存，不重复计费）')])
    ]));
  }

  function maybeAnalyze(grade, ans) {
    if (!window.AI || !AI.configured()) { renderAIHint(); return; }
    renderAILoading();
    AI.analyze({
      type: App.type, question: App.q,
      userAnswer: compactAnswer(App.type, ans),
      gradeResult: grade
    }).then(function (r) {
      if (!App.aiWrap) return;
      UI.clear(App.aiWrap);
      if (!r || !r.ok) {
        App.aiWrap.appendChild(UI.el('div', { class: 'notice notice--bad' }, 'AI 分析不可用：' + (r && r.message ? r.message : '未知错误') + '（离线判分结果不受影响）'));
        return;
      }
      App.aiWrap.appendChild(renderAIResult(r, 'AI 错因归类'));
    }, function (e) {
      if (!App.aiWrap) return;
      UI.clear(App.aiWrap);
      App.aiWrap.appendChild(UI.el('div', { class: 'notice notice--bad' }, 'AI 分析失败：' + (e && e.message || e)));
    });
  }

  function renderAIResult(r, title) {
    var j = r.json || {};
    var box = UI.el('div', { class: 'ai-box' });
    var hd = UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), UI.el('span', {}, title || 'AI 分析')]);
    if (r.cached) hd.appendChild(UI.el('span', { class: 'badge' }, '缓存'));
    if (r.usage && r.usage.total_tokens) hd.appendChild(UI.el('span', { class: 'tiny faint' }, r.usage.total_tokens + ' tokens'));
    box.appendChild(hd);
    var body = UI.el('div', { class: 'ai-body' });

    if (j.oneLine) body.appendChild(UI.el('p', { class: 'bold' }, '💡 ' + j.oneLine));
    if (j.errors && j.errors.length) {
      var ul = UI.el('div', { class: 'ai-errors' });
      j.errors.forEach(function (e) {
        var meta = window.errMeta ? window.errMeta(App.type, e.code) : null;
        ul.appendChild(UI.el('div', { class: 'ai-err' }, [
          UI.el('span', { class: 'err-code' }, (meta && meta.short) || e.code),
          UI.el('span', { class: 'ai-err-text' }, [
            e.where ? UI.el('b', {}, e.where + '：') : null,
            e.why ? UI.el('span', {}, e.why) : null,
            e.fix ? UI.el('span', { class: 'ai-fix' }, ' → ' + e.fix) : null
          ])
        ]));
      });
      body.appendChild(ul);
    }
    if (j.drill) body.appendChild(UI.el('p', { class: 'small muted', style: { marginTop: '8px' } }, '▸ 下一步：' + j.drill));
    if (j.raw) body.appendChild(UI.el('pre', { class: 'small muted', style: { whiteSpace: 'pre-wrap' } }, j.raw));
    box.appendChild(body);
    box.appendChild(UI.el('div', { class: 'ai-foot' }, [
      UI.el('a', { href: '#/stats' }, '查看错因统计 →')
    ]));
    return box;
  }

  function runTranslateAI() {
    if (!window.AI || !AI.configured()) { UI.toast('请先在设置页配置 DeepSeek API Key', 'bad'); go('settings'); return; }
    var ans = App.submitted ? App.submitted.answer : App.mod.getAnswer();
    if (!ans || !ans.text || ans.text.trim().length < 5) { UI.toast('先写一段译文再点 AI 精评'); return; }
    renderAILoading('AI 正在逐句批改译文…');
    AI.reviewTranslate({ question: App.q, userText: ans.text }).then(function (r) {
      if (!App.aiWrap) return;
      UI.clear(App.aiWrap);
      if (!r || !r.ok) {
        App.aiWrap.appendChild(UI.el('div', { class: 'notice notice--bad' }, 'AI 精评不可用：' + (r && r.message ? r.message : '未知错误')));
        return;
      }
      var j = r.json || {};
      var box = UI.el('div', { class: 'ai-box' });
      var hd = UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), UI.el('span', {}, 'AI 翻译精评')]);
      if (r.cached) hd.appendChild(UI.el('span', { class: 'badge' }, '缓存'));
      box.appendChild(hd);
      if (j.score != null) {
        box.appendChild(UI.el('div', { class: 'row', style: { margin: '4px 0 8px' } }, [
          UI.el('span', { class: 'ai-score' }, String(j.score)),
          UI.el('span', { class: 'small muted' }, '分 · ' + (j.comment || ''))
        ]));
      }
      if (j.errors && j.errors.length) {
        var list = UI.el('div', { class: 'err-list' });
        j.errors.forEach(function (e) {
          var meta = window.errMeta ? window.errMeta('translate', e.code) : null;
          list.appendChild(UI.el('div', { class: 'err-item lev-low' }, [
            UI.el('span', { class: 'err-code' }, (meta && meta.short) || e.code),
            UI.el('div', { class: 'err-body' }, [
              UI.el('div', { class: 'err-name' }, (e.where ? '「' + e.where + '」' : '') + (e.why || '')),
              e.fix ? UI.el('div', { class: 'err-detail' }, '改：' + e.fix) : null
            ])
          ]));
        });
        box.appendChild(list);
      }
      if (j.punchlines && j.punchlines.length) {
        box.appendChild(UI.el('div', { class: 'small muted', style: { marginTop: '8px' } }, '▸ 记住：' + j.punchlines.join('／')));
      }
      App.aiWrap.appendChild(box);
    });
  }

  function runAmbiguity() {
    if (!window.AI || !AI.configured()) { UI.toast('请先在设置页配置 API Key', 'bad'); return; }
    renderAILoading('AI 正在分析歧义结构…');
    AI.ambiguity(App.q.sentence || '').then(function (r) {
      if (!App.aiWrap) return;
      UI.clear(App.aiWrap);
      if (!r || !r.ok) { App.aiWrap.appendChild(UI.el('div', { class: 'notice notice--bad' }, (r && r.message) || 'AI 不可用')); return; }
      var j = r.json || {};
      var box = UI.el('div', { class: 'ai-box' });
      box.appendChild(UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), UI.el('span', {}, '歧义多解')]));
      var body = UI.el('div', { class: 'ai-body' });
      (j.readings || []).forEach(function (rd, i) {
        body.appendChild(UI.el('p', {}, [UI.el('b', {}, '解' + (i + 1) + '：'), rd.sense || '', UI.el('span', { class: 'small faint' }, '　' + (rd.structure || ''))]));
      });
      if (j.how) body.appendChild(UI.el('p', { class: 'small muted' }, '分化：' + j.how));
      box.appendChild(body);
      App.aiWrap.appendChild(box);
    });
  }

  function toggleSolution() {
    var wrap = App.solutionWrap;
    if (!wrap) return;
    if (!wrap.classList.contains('hidden')) { wrap.classList.add('hidden'); return; }
    UI.clear(wrap);
    wrap.classList.remove('hidden');
    var ans = App.submitted ? App.submitted.answer : null;
    var card = UI.el('div', { class: 'card solution-card' });
    var hd = UI.el('div', { class: 'card-hd' }, [
      UI.el('div', { class: 'grow' }, [
        UI.el('div', { class: 'section-title', style: { margin: '0' } }, '答案与解析'),
        UI.el('div', { class: 'card-sub' }, App.q.note || '参考答案')
      ]),
      UI.el('button', { class: 'btn btn--sm btn--ghost', onclick: function () { wrap.classList.add('hidden'); } }, '收起')
    ]);
    card.appendChild(hd);
    var body = UI.el('div', { class: 'solution-body' });
    card.appendChild(body);
    wrap.appendChild(card);
    var mod = window.PRACTICE_MODULES[App.type];
    if (mod && mod.renderSolution) {
      try { mod.renderSolution(body, App.q, ans); } catch (e) {
        body.appendChild(UI.el('div', { class: 'notice notice--bad' }, '解析渲染失败：' + (e.message || e)));
        console.error(e);
      }
    } else {
      body.appendChild(UI.el('div', { class: 'notice' }, '参考答案：' + (App.q.tree || App.q.answer || App.q.reference || JSON.stringify(App.q.sememes || []))));
    }
    setTimeout(function () { wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }

  function redoQuestion() {
    App.submitted = null;
    App.answer = null;
    App.startedAt = Date.now();
    if (App.resultWrap) { UI.clear(App.resultWrap); App.resultWrap.classList.add('hidden'); }
    if (App.solutionWrap) { UI.clear(App.solutionWrap); App.solutionWrap.classList.add('hidden'); }
    mountModule(App.q);
    renderActions();
    updateChrome();
    UI.toast('已清空，重新做一遍');
  }
  App.redo = redoQuestion;

  /* ================= 启动 ================= */
  function bindShell() {
    var menu = document.getElementById('menu-btn');
    if (menu) menu.addEventListener('click', function () {
      var s = document.getElementById('sidebar');
      if (s) s.classList.toggle('is-open');
    });
    var themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', cycleTheme);
    UI.$$('.nav-item, .tab').forEach(function (a) {
      a.addEventListener('click', function (e) {
        // 让 hash 路由处理；点当前页时强制重渲染
        if (('#' + location.hash.split('#')[1]) === a.getAttribute('href')) { e.preventDefault(); render(); }
      });
    });
    window.addEventListener('hashchange', render);
    window.addEventListener('resize', UI.debounce(function () {
      if (App.route === 'stats' && window.PAGES && PAGES.stats) render();
    }, 400));
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
      if (document.querySelector('.modal-wrap, .palette')) return;
      if (e.key === 'Enter' && App.q && !App.submitted) { e.preventDefault(); submitAnswer(); }
      else if (e.key === 'ArrowRight' && App.type) { e.preventDefault(); gotoOffset(1); }
      else if (e.key === 'ArrowLeft' && App.type) { e.preventDefault(); gotoOffset(-1); }
      else if (e.key === 'Escape') {
        var s = document.getElementById('sidebar'); if (s) s.classList.remove('is-open');
      }
    });
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.addEventListener) mq.addEventListener('change', function () { if ((S.settings.theme || 'auto') === 'auto') applyTheme(); });
    } catch (e) {}
    S.subscribe(function (evt) {
      updateChrome();
      if (evt && evt.type === 'settings') applyTheme();
    });
  }

  function boot() {
    initIcons();
    bindShell();
    applyTheme();
    render();
    updateChrome();
    // 数据体检提示
    var total = TYPES.reduce(function (s, t) { return s + allOf(t).length; }, 0);
    if (total === 0) {
      UI.toast('题库还没加载：请确认 js/data/*.js 已生成', 'bad');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
