/* ============================================================================
   practice/js/core/store.js — 本地状态与统计（localStorage，无网络）
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'yanmo.practice.v1';
  var AI_CACHE_KEY = 'yanmo.practice.aicache.v1';
  var MAX_ATTEMPTS = 4000;
  var MAX_AI_CACHE = 240;

  function defaults() {
    return {
      version: 1,
      createdAt: Date.now(),
      settings: {
        theme: 'auto',
        fontScale: 1,
        ai: {
          enabled: true,
          base: 'https://api.deepseek.com',
          model: 'deepseek-chat',
          key: '',
          maxTokens: 800,
          autoAnalyze: true
        },
        practice: { order: 'seq', showTimer: true, autoNext: false, paletteAutoOpen: true }
      },
      attempts: [],            // {id, qid, type, score, correct, errors:[{code,name,detail}], codes:[], answerHash, timeMs, ts, idxInType}
      qstats: {},              // qid -> {attempts, correct, lastScore, lastTs, fav, streak}
      wrong: {},               // qid -> {type, score, ts, codes:[], attempts}
      days: {},                // 'YYYY-MM-DD' -> {count, correct, ms, byType:{type:{n,c}}}
      aiUsage: { calls: 0, promptTokens: 0, completionTokens: 0, cachedHits: 0 },
      syncAt: 0
    };
  }

  var state;
  try {
    state = JSON.parse(localStorage.getItem(KEY) || 'null') || defaults();
  } catch (e) { state = defaults(); }
  // 兼容与补全
  (function migrate() {
    var d = defaults();
    Object.keys(d).forEach(function (k) { if (state[k] === undefined) state[k] = d[k]; });
    Object.keys(d.settings).forEach(function (k) { if (state.settings[k] === undefined) state.settings[k] = d.settings[k]; });
    Object.keys(d.settings.ai).forEach(function (k) { if (state.settings.ai[k] === undefined) state.settings.ai[k] = d.settings.ai[k]; });
    Object.keys(d.settings.practice).forEach(function (k) { if (state.settings.practice[k] === undefined) state.settings.practice[k] = d.settings.practice[k]; });
  })();

  var subs = [];
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) {
        // 空间不足：砍旧 attempts 再试
        state.attempts = state.attempts.slice(-Math.floor(MAX_ATTEMPTS / 2));
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) {}
      }
    }, 60);
  }
  function saveNow() { clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function notify(evt) { subs.forEach(function (fn) { try { fn(evt, state); } catch (e) {} }); }

  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function dayKey(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }

  function passScore(type) {
    if (type === 'translate') return 80;
    return 80;
  }

  /**
   * 记录一次作答
   * attempt: {qid, type, score, answerHash, timeMs, errors, answer?}
   */
  function saveAttempt(a) {
    var ts = Date.now();
    var correct = a.score >= passScore(a.type);
    var codes = [];
    (a.errors || []).forEach(function (e) { if (e && e.code && codes.indexOf(e.code) < 0) codes.push(e.code); });
    var rec = {
      id: uid(), qid: a.qid, type: a.type, score: a.score, correct: correct,
      errors: (a.errors || []).map(function (e) { return { code: e.code, name: e.name || e.code, detail: e.detail || '' }; }).slice(0, 30),
      codes: codes, answerHash: a.answerHash || '',
      timeMs: a.timeMs || 0, ts: ts, answer: a.answer === undefined ? null : a.answer
    };
    state.attempts.push(rec);
    if (state.attempts.length > MAX_ATTEMPTS) state.attempts = state.attempts.slice(-MAX_ATTEMPTS);

    var qs = state.qstats[a.qid] || { attempts: 0, correct: 0, lastScore: null, lastTs: 0, fav: false, streak: 0 };
    qs.attempts += 1;
    if (correct) qs.correct += 1;
    qs.lastScore = a.score;
    qs.lastTs = ts;
    if (correct) qs.streak = (qs.streak || 0) + 1; else qs.streak = 0;
    state.qstats[a.qid] = qs;

    // 错题队列：低于满分进队；连续 2 次满分移出
    if (a.score < 100) {
      var w = state.wrong[a.qid] || { type: a.type, attempts: 0, codes: [], best: a.score };
      w.type = a.type;
      w.score = a.score;
      w.ts = ts;
      w.attempts = (w.attempts || 0) + 1;
      w.best = Math.max(w.best || 0, a.score);
      (a.errors || []).forEach(function (e) { if (e && e.code && w.codes.indexOf(e.code) < 0) w.codes.push(e.code); });
      state.wrong[a.qid] = w;
    } else if (qs.streak >= 2) {
      delete state.wrong[a.qid];
    }

    var dk = dayKey(ts);
    var day = state.days[dk] || { count: 0, correct: 0, ms: 0, byType: {} };
    day.count += 1;
    if (correct) day.correct += 1;
    day.ms += rec.timeMs;
    var bt = day.byType[a.type] || { n: 0, c: 0 };
    bt.n += 1; if (correct) bt.c += 1;
    day.byType[a.type] = bt;
    state.days[dk] = day;

    save(); notify({ type: 'attempt', attempt: rec });
    return rec;
  }

  function getAttempt(qid) {
    for (var i = state.attempts.length - 1; i >= 0; i--) if (state.attempts[i].qid === qid) return state.attempts[i];
    return null;
  }
  function attemptsOf(qid) { return state.attempts.filter(function (a) { return a.qid === qid; }); }
  function attemptsOfType(type) { return state.attempts.filter(function (a) { return a.type === type; }); }
  function qstat(qid) { return state.qstats[qid] || null; }

  function toggleFav(qid) {
    var qs = state.qstats[qid] || { attempts: 0, correct: 0, lastScore: null, lastTs: 0, fav: false, streak: 0 };
    qs.fav = !qs.fav;
    state.qstats[qid] = qs;
    save(); notify({ type: 'fav', qid: qid, fav: qs.fav });
    return qs.fav;
  }

  function wrongList(type) {
    var out = [];
    Object.keys(state.wrong).forEach(function (qid) {
      var w = state.wrong[qid];
      if (type && w.type !== type) return;
      out.push(Object.assign({ qid: qid }, w));
    });
    out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return out;
  }

  // 统计汇总
  function stats() {
    var s = { total: 0, correct: 0, byType: {}, byCode: {}, byDay: {}, byTag: {}, wrong: Object.keys(state.wrong).length, fav: 0 };
    state.attempts.forEach(function (a) {
      s.total += 1;
      if (a.correct) s.correct += 1;
      var t = s.byType[a.type] || { n: 0, c: 0, scoreSum: 0 };
      t.n += 1; if (a.correct) t.c += 1; t.scoreSum += a.score;
      s.byType[a.type] = t;
      (a.codes || []).forEach(function (c) { s.byCode[c] = (s.byCode[c] || 0) + 1; });
      var dk = dayKey(a.ts);
      s.byDay[dk] = (s.byDay[dk] || 0) + 1;
    });
    Object.keys(state.qstats).forEach(function (qid) { if (state.qstats[qid].fav) s.fav += 1; });
    Object.keys(s.byType).forEach(function (t) { s.byType[t].avg = s.byType[t].n ? Math.round(s.byType[t].scoreSum / s.byType[t].n) : 0; });
    return s;
  }

  function removeWrong(qid) {
    if (state.wrong[qid]) { delete state.wrong[qid]; save(); notify({ type: 'wrong-remove', qid: qid }); }
  }
  function clearWrong(type) {
    Object.keys(state.wrong).forEach(function (qid) {
      if (!type || state.wrong[qid].type === type) delete state.wrong[qid];
    });
    save(); notify({ type: 'wrong-clear' });
  }

  // 连续打卡天数（今天或昨天有记录起算）
  function streak() {
    var d = new Date();
    var keys = Object.keys(state.days);
    if (!keys.length) return 0;
    function has(dt) { return !!state.days[dayKey(dt.getTime())]; }
    if (!has(d)) {
      d.setDate(d.getDate() - 1);
      if (!has(d)) return 0;
    }
    var n = 0;
    while (has(d)) { n += 1; d.setDate(d.getDate() - 1); }
    return n;
  }
  function today() { return state.days[dayKey(Date.now())] || { count: 0, correct: 0, ms: 0, byType: {} }; }
  function recentDays(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = dayKey(d.getTime());
      out.push({ key: k, count: (state.days[k] || {}).count || 0, correct: (state.days[k] || {}).correct || 0, date: d });
    }
    return out;
  }

  /* ---------------- 设置 ---------------- */
  function setSettings(patch) {
    function merge(dst, src) {
      Object.keys(src).forEach(function (k) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k]) merge(dst[k], src[k]);
        else dst[k] = src[k];
      });
    }
    merge(state.settings, patch || {});
    save(); notify({ type: 'settings', settings: state.settings });
    return state.settings;
  }

  /* ---------------- AI 缓存/用量 ---------------- */
  var cache = {};
  var cacheFlushTimer = null;
  try { cache = JSON.parse(localStorage.getItem(AI_CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  var cacheDirty = false;
  function aiCacheGet(hash) {
    var hit = cache[hash];
    if (hit) state.aiUsage.cachedHits += 1;
    return hit || null;
  }
  function aiCacheSet(hash, result) {
    cache[hash] = { ts: Date.now(), result: result };
    var keys = Object.keys(cache);
    if (keys.length > MAX_AI_CACHE) {
      keys.sort(function (a, b) { return cache[a].ts - cache[b].ts; });
      keys.slice(0, keys.length - MAX_AI_CACHE).forEach(function (k) { delete cache[k]; });
    }
    cacheDirty = true;
    clearTimeout(cacheFlushTimer);
    cacheFlushTimer = setTimeout(flushCache, 200);
  }
  function flushCache() {
    if (!cacheDirty) return;
    try { localStorage.setItem(AI_CACHE_KEY, JSON.stringify(cache)); cacheDirty = false; } catch (e) {}
  }
  function aiCacheClear() {
    cache = {}; cacheDirty = true; flushCache();
    notify({ type: 'aicache' });
  }
  function aiCacheCount() { return Object.keys(cache).length; }
  function addAIUsage(usage) {
    if (!usage) return;
    state.aiUsage.calls += 1;
    state.aiUsage.promptTokens += usage.prompt_tokens || 0;
    state.aiUsage.completionTokens += usage.completion_tokens || 0;
    save();
  }
  function aiUsage() { return Object.assign({}, state.aiUsage, { cacheCount: aiCacheCount() }); }

  /* ---------------- 导入导出 ---------------- */
  function exportJSON() {
    var copy = JSON.parse(JSON.stringify(state));
    if (copy.settings && copy.settings.ai) copy.settings.ai.key = '';
    if (copy.settings && copy.settings.cloud) copy.settings.cloud.token = '';;
    return JSON.stringify({ app: 'yanmo-practice', version: 1, exportedAt: new Date().toISOString(), state: copy }, null, 1);
  }
  function importJSON(str, opts) {
    var obj = JSON.parse(str);
    var s = obj.state || obj;
    if (!s || !s.settings) throw new Error('文件格式不对');
    if (!s.attempts) s.attempts = [];
    if (!s.qstats) s.qstats = {};
    if (!s.wrong) s.wrong = {};
    if (!s.days) s.days = {};
    var key = state.settings.ai.key, base = state.settings.ai.base, model = state.settings.ai.model;
    if (opts && opts.merge) {
      // 合并导入：保留本机设置与 Key，只合并练习记录/统计/错题/收藏
      mergeImport(state, s);
    } else {
      state = s;
    }
    state.settings.ai.key = key || state.settings.ai.key || '';
    if (!state.settings.ai.base) state.settings.ai.base = base;
    if (!state.settings.ai.model) state.settings.ai.model = model;
    saveNow(); notify({ type: 'import' });
    return true;
  }
  // 合并两份记录：attempts 去重、qstats 取大、wrong 并集、days 取大、favorites 并集
  function mergeImport(dst, src) {
    var seen = {};
    var list = (dst.attempts || []).concat(src.attempts || []);
    dst.attempts = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var k = (a && (a.id || (a.qid + '@' + a.ts)));
      if (!a) continue;
      k = String(k);
      if (seen[k]) continue;
      seen[k] = 1; dst.attempts.push(a);
    }
    dst.attempts.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });
    var qs = src.qstats || {};
    for (var qid in qs) {
      if (!Object.prototype.hasOwnProperty.call(qs, qid)) continue;
      var r = qs[qid], l = dst.qstats[qid];
      if (!l) { dst.qstats[qid] = r; continue; }
      for (var f in r) {
        if (f === 'fav') l.fav = !!(l.fav || r.fav);
        else if (f === 'lastScore' || f === 'lastResult' || f === 'lastTs') continue;
        else if (typeof r[f] === 'number') l[f] = Math.max(l[f] || 0, r[f]);
        else if (l[f] == null) l[f] = r[f];
      }
      if ((r.lastTs || 0) > (l.lastTs || 0)) { l.lastTs = r.lastTs; l.lastScore = r.lastScore; if (r.lastResult != null) l.lastResult = r.lastResult; }
    }
    var wr = src.wrong || {};
    for (var w in wr) if (Object.prototype.hasOwnProperty.call(wr, w)) dst.wrong[w] = wr[w];
    var dy = src.days || {};
    for (var d in dy) if (Object.prototype.hasOwnProperty.call(dy, d)) {
      var r2 = dy[d], l2 = dst.days[d];
      if (!l2) { dst.days[d] = r2; continue; }
      for (var f2 in r2) if (typeof r2[f2] === 'number') l2[f2] = Math.max(l2[f2] || 0, r2[f2]);
    }
    if (Array.isArray(src.favorites)) {
      dst.favorites = dst.favorites || [];
      for (var j = 0; j < src.favorites.length; j++) if (dst.favorites.indexOf(src.favorites[j]) < 0) dst.favorites.push(src.favorites[j]);
    }
  }
  function resetAll() {
    state = defaults();
    saveNow();
    try { localStorage.removeItem(AI_CACHE_KEY); } catch (e) {}
    cache = {};
    notify({ type: 'reset' });
  }
  function resetProgress() {
    state.attempts = []; state.qstats = {}; state.wrong = {}; state.days = {}; state.aiUsage = { calls: 0, promptTokens: 0, completionTokens: 0, cachedHits: 0 };
    saveNow(); notify({ type: 'reset-progress' });
  }

  window.Store = {
    get state() { return state; },
    get settings() { return state.settings; },
    save: save,
    saveNow: saveNow,
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    saveAttempt: saveAttempt,
    getAttempt: getAttempt,
    attemptsOfType: attemptsOfType,
    attemptsOf: attemptsOf,
    qstat: qstat,
    toggleFav: toggleFav,
    wrongList: wrongList,
    removeWrong: removeWrong,
    clearWrong: clearWrong,
    stats: stats,
    streak: streak,
    today: today,
    recentDays: recentDays,
    dayKey: dayKey,
    setSettings: setSettings,
    aiCacheGet: aiCacheGet,
    aiCacheSet: aiCacheSet,
    aiCacheClear: aiCacheClear,
    aiCacheCount: aiCacheCount,
    addAIUsage: addAIUsage,
    aiUsage: aiUsage,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    resetProgress: resetProgress,
    passScore: passScore
  };
})();

