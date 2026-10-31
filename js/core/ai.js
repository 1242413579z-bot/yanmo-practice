/* ============================================================================
   practice/js/core/ai.js — DeepSeek 直连（OpenAI 兼容）+ 缓存 + 预算控制
   设计目标：只在「提交后判错」时调用一次；同一份答案命中缓存不再花钱。
   ========================================================================== */
(function () {
  'use strict';

  var CACHE_PREFIX = '1';
  var inFlight = {};

  function cfg() { return window.Store.settings.ai; }
  function configured() {
    var c = cfg();
    return !!(c && c.enabled && c.key && c.key.trim());
  }
  function endpoint() {
    var base = (cfg().base || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(base)) return base;
    if (/\/v1$/.test(base)) return base + '/chat/completions';
    return base + '/chat/completions';
  }
  function maskError(status, bodyText) {
    var msg = '';
    try {
      var j = JSON.parse(bodyText);
      msg = (j.error && (j.error.message || j.error.code)) || j.message || '';
    } catch (e) { msg = String(bodyText || '').slice(0, 160); }
    if (status === 401) return 'API Key 无效（401），请到设置页检查。';
    if (status === 402) return '账户余额不足（402）。';
    if (status === 429) return '请求太频繁（429），稍后再试。';
    if (status === 400) return '请求被拒绝（400）：' + msg;
    return '请求失败（' + status + '）：' + (msg || '未知错误');
  }

  /**
   * 底层请求（不缓存）
   * opts: {maxTokens, temperature, json, timeout}
   */
  async function request(messages, opts) {
    opts = opts || {};
    if (!configured()) return { ok: false, error: 'no-key', message: '未配置 DeepSeek API Key（设置 → AI 精析）' };
    var body = {
      model: cfg().model || 'deepseek-chat',
      messages: messages,
      temperature: opts.temperature == null ? 0.1 : opts.temperature,
      max_tokens: Math.min(opts.maxTokens || cfg().maxTokens || 800, 2000),
      stream: false
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opts.timeout || 26000);
    var t0 = Date.now();
    try {
      var res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg().key.trim() },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
      var raw = await res.text();
      if (!res.ok) {
        var errMsg = maskError(res.status, raw);
        // 429/5xx 重试一次
        if ((res.status === 429 || res.status >= 500) && !opts._retried) {
          await sleep(900);
          return request(messages, Object.assign({}, opts, { _retried: true }));
        }
        return { ok: false, error: 'http-' + res.status, message: errMsg };
      }
      var data = JSON.parse(raw);
      var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      var usage = data.usage || {};
      window.Store.addAIUsage(usage);
      return { ok: true, text: text, usage: usage, ms: Date.now() - t0 };
    } catch (e) {
      var msg = e && e.name === 'AbortError' ? '请求超时（26 秒），请检查网络或稍后再试。' : '网络错误：' + (e && e.message ? e.message : e);
      return { ok: false, error: 'network', message: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // 哈希负载（用于缓存）
  function payloadKey(skillId, payload) {
    return CACHE_PREFIX + ':' + skillId + ':' + window.util.hash(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }

  /**
   * 调用一个内置 skill
   * @param {string} skillId
   * @param {object} ctx  技能上下文
   * @param {object} opts {force, maxTokens}
   */
  async function callSkill(skillId, ctx, opts) {
    opts = opts || {};
    var skill = window.SKILLS[skillId];
    if (!skill) return { ok: false, error: 'no-skill', message: '未知技能：' + skillId };
    if (!configured()) return { ok: false, error: 'no-key', message: '未配置 DeepSeek API Key（设置 → AI 精析）' };

    var userContent = skill.build(ctx);
    var sys = typeof skill.system === 'function' ? skill.system(ctx) : skill.system;
    var key = payloadKey(skillId, { s: sys, u: userContent });
    if (!opts.force) {
      var hit = window.Store.aiCacheGet(key);
      if (hit && hit.result) {
        return Object.assign({}, hit.result, { cached: true, ok: true, skills: skillId });
      }
    }
    if (inFlight[key]) return inFlight[key];

    var messages = [{ role: 'system', content: sys }, { role: 'user', content: userContent }];
    var p = request(messages, { maxTokens: opts.maxTokens || skill.maxTokens || 800, temperature: skill.temperature, json: skill.json })
      .then(function (r) {
        if (!r.ok) return r;
        var parsed = skill.parse ? skill.parse(r.text) : { text: r.text };
        var result = {
          ok: true, skill: skillId, json: parsed, text: r.text,
          usage: r.usage, cached: false, ms: r.ms
        };
        window.Store.aiCacheSet(key, result);
        delete inFlight[key];
        return result;
      });
    inFlight[key] = p;
    return p;
  }

  /* ---------------- 高层 API ---------------- */
  // 错因归类（app 在判错后调用）
  async function analyze(params) {
    var p = params || {};
    var type = p.type;
    var q = p.question || {};
    var userAnswer = p.userAnswer;
    var grade = p.gradeResult || {};
    // 只传差异，不传整棵树，省 token
    var diff = {
      score: grade.score,
      errors: (grade.errors || []).slice(0, 8).map(function (e) {
        return { code: e.code, where: e.gap != null ? '第' + (e.gap + 1) + '字后' : (e.where || ''), detail: e.detail || '', expected: e.expected, got: e.got };
      })
    };
    var standard = null;
    if (type === 'syntax' && q.tree) standard = q.tree;
    else if (type === 'ipa') standard = (q.items || []).map(function (it) { return { text: it.text, answer: it.answer }; });
    else if (type === 'sememe') standard = (q.sememes || []).map(function (s) { return s.name; });
    else if (type === 'punct') standard = q.answer;
    else if (type === 'translate') standard = q.reference;
    var ctx = {
      type: type, question: q, userAnswer: userAnswer,
      standard: standard, diff: diff, score: grade.score
    };
    var r = await callSkill('classify', ctx, { maxTokens: 700 });
    if (r.ok) {
      // 过滤非法错误码
      var json = r.json || {};
      if (json.errors && json.errors.length) {
        var valid = {};
        (window.ERROR_TAXONOMY[type] || []).forEach(function (e) { valid[e.code] = 1; });
        (window.ERROR_TAXONOMY.common || []).forEach(function (e) { valid[e.code] = 1; });
        json.errors = json.errors.filter(function (e) { return e && valid[e.code]; });
      }
      r.json = json;
    }
    return r;
  }

  // 翻译精评
  async function reviewTranslate(params) {
    var q = params.question || {};
    return callSkill('translate_review', { question: q, userText: params.userText || '' }, { maxTokens: 900, force: params.force });
  }

  // 音标兜底
  async function assistIPA(params) {
    return callSkill('ipa_assist', { standard: params.standard, user: params.user }, { maxTokens: 400 });
  }
  // 义素命名
  async function assistSememe(params) {
    return callSkill('sememe_naming', {
      standardSememes: params.standardSememes, userSememes: params.userSememes, words: params.words
    }, { maxTokens: 400 });
  }
  // 断句争议
  async function assistPunct(params) {
    return callSkill('punct_assist', { text: params.text, answer: params.answer, userAnswer: params.userAnswer }, { maxTokens: 300 });
  }
  // 本题精讲
  async function explain(params) {
    return callSkill('explain', { type: params.type, question: params.question, userAnswer: params.userAnswer }, { maxTokens: 600, force: params.force });
  }
  // 歧义多解
  async function ambiguity(sentence) {
    return callSkill('ambiguity', { sentence: sentence }, { maxTokens: 500 });
  }
  // 复习计划
  async function reviewPlan(summary, recent) {
    return callSkill('review_plan', { summary: summary, recent: recent }, { maxTokens: 700, force: true });
  }
  // 自由问答（AI 助教）
  async function chat(question, opts) {
    opts = opts || {};
    if (!configured()) return { ok: false, error: 'no-key', message: '未配置 API Key' };
    var sys = window.SKILLS.concept_qa.system({});
    return request([{ role: 'system', content: sys }, { role: 'user', content: question }], { maxTokens: opts.maxTokens || 600, temperature: 0.3, json: false });
  }

  window.AI = {
    configured: configured,
    endpoint: endpoint,
    request: request,
    callSkill: callSkill,
    analyze: analyze,
    reviewTranslate: reviewTranslate,
    assistIPA: assistIPA,
    assistSememe: assistSememe,
    assistPunct: assistPunct,
    explain: explain,
    ambiguity: ambiguity,
    reviewPlan: reviewPlan,
    chat: chat,
    usage: function () { return window.Store.aiUsage(); },
    clearCache: function () { window.Store.aiCacheClear(); },
    cacheCount: function () { return window.Store.aiCacheCount(); },
    _test: { payloadKey: payloadKey, maskError: maskError }
  };
})();
