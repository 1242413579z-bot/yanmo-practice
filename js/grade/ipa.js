/* ============================================================================
   practice/js/grade/ipa.js — 国际音标判分器（纯函数，可被 Node 直接调用）
   契约：CONTRACT.md §7 / §7.2
   ----------------------------------------------------------------------------
   判分口径：
   · 注音项（question.items）：每项等分；每项得分 = 音节平均（声母 30% +
     韵母 40% + 声调 20%）+ 标注规范 10%。
   · 音位小题（question.subQuestions）：每题等分；得分 = max(keyPoints 关键词覆盖率,
     用户答案与 subQuestion.answer 的字符二元组 Dice 相似度)。
     这样「照抄参考答案」= 相似度 1 ⇒ 满分；写自己的话但覆盖关键词也能拿分；
     keyPoints 不必是 answer 文本的子串（数据侧概念式 keyPoints 亦可）。
   · 两组同时存在 → 两组各占 50%；只有一组 → 该组占 100%。
   · 轻声不标调：调值 '' 与旧写法 '0' 等价。标准是轻声而用户写了调值 → ip_neutral；
     标准有声调而用户没写 → ip_tone（漏标声调，不归「轻声标错」）。解析页不显示 0。
   · 空答案 → 0 + cm_skip；答案无法解析为规范音标 → 整项 0 + ip_norm。
   · 错误码只用 taxonomy.js 的 ipa 组：ip_initial / ip_final / ip_tone /
     ip_sandhi / ip_neutral / ip_erhua / ip_syllable / ip_norm / ip_phoneme /
     ip_feature / ip_incomplete + 通用 cm_skip / cm_concept。
   边界：任何输入都不抛出异常。
   ========================================================================== */
(function () {
  'use strict';

  var U = window.util;
  var GC = window.GC;
  var MAX_ERRORS = 40;

  /* ---------------- 小工具 ---------------- */
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function safeStr(v) { return v == null ? '' : String(v); }
  function normIPA(s) {
    try { return GC.IPA.normalize(s); } catch (e) { return safeStr(s).trim(); }
  }
  function splitIPA(s) {
    try { return GC.IPA.splitSyllables(s); } catch (e) { return normIPA(s).split(/\s+/).filter(Boolean); }
  }

  // 纯声调 token：用于兼容「pʰiɛn 51」这种把声调与音节用空格隔开的写法
  var TONE_TOKEN_RE = /^(?:214|55|35|51|21|0|[˥˦˧˨˩]{1,5})$/;
  var ERHUA_RE = /[ɚɻ]/;
  var R_AS_ERHUA_RE = /r(?=(?:[0-9]|˥|˦|˧|˨|˩|$))/g;
  var TONE_TAIL_RE = /(?:214|55|35|51|21|0|[˥˦˧˨˩]{1,5})$/;

  // 音标音节解析：主路径直接用 GC.IPA.parseSyllable（已支持 xua55ɚ / xuaɚ55 等
  // 儿化两种顺序）。下面只补 GC 未覆盖的容错写法：
  //   ① 用 r 代替 ɻ：ʂər51 → ʂəɻ51
  //   ② 儿化符号抖到声调前：xuaɚ55 → xua55ɚ（GC 已能解析，作为兜底保留）
  function tryParse(t) {
    try { return GC.IPA.parseSyllable(t); } catch (e) { return { ok: false, raw: t, err: '解析异常' }; }
  }
  function parseSyl(tok) {
    var raw = safeStr(tok).trim();
    if (!raw) return { ok: false, raw: raw, err: '空音节' };
    var cands = [raw];
    var rFixed = raw.replace(R_AS_ERHUA_RE, 'ɻ');
    if (rFixed !== raw) cands.push(rFixed);
    // 儿化符号写在声调前：xuaɚ55 → xua55ɚ
    var mE = raw.match(/^(.*?)([ɚɻ])((?:214|55|35|51|21|0|[˥˦˧˨˩]+))$/);
    if (mE && mE[1]) cands.push(mE[1] + mE[3] + mE[2]);
    var i, p;
    for (i = 0; i < cands.length; i++) {
      p = tryParse(cands[i]);
      if (p && p.ok) { p.raw = raw; p.erhua = ERHUA_RE.test(raw); return p; }
    }
    // 声调之后再加 ɚ/ɻ：xua55ɚ → base xua55 + ɚ
    var m = raw.match(/^(.*?)([ɚɻ])$/);
    if (m && m[1]) {
      var bases = [m[1]];
      var bFix = m[1].replace(R_AS_ERHUA_RE, 'ɻ');
      if (bFix !== m[1]) bases.push(bFix);
      for (i = 0; i < bases.length; i++) {
        var bp = tryParse(bases[i]);
        if (bp && bp.ok) {
          return {
            ok: true, raw: raw, initial: bp.initial,
            final: bp.final + m[2], tone: bp.tone, erhua: true
          };
        }
      }
    }
    return { ok: false, raw: raw, err: (p && p.err) || '解析失败' };
  }

  // 音节数组：splitSyllables + 把「纯声调」并回前一音节
  function tokensOf(str) {
    var toks = splitIPA(str);
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (out.length && TONE_TOKEN_RE.test(t)) out[out.length - 1] += t;
      else out.push(t);
    }
    return out;
  }
  function tokensEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ---------------- 标写规范（10%） ----------------
     括号 [ ] / / 【 】 属于契约允许的写法，归一化时直接剥掉 → 不扣分；
     扣分项：多余/首尾空白、中文标点分隔、拼音字母混用、大写字母。
     返回 1 / 0.5 / 0。 */
  function normRateOf(raw) {
    var s = safeStr(raw);
    var t = s.trim();
    if (!t) return 1;
    var issues = 0;
    if (/\s{2,}/.test(t)) issues++;                     // 连续空格（首尾单空格已统一 trim，不计）
    if (/\t|\n/.test(t)) issues++;                      // 换行/制表
    if (/[，,、;；]/.test(t)) issues++;                  // 中文标点当分隔符
    // r 用作儿化/卷舌（ʂər51）不算拼音混用；其余 r 以及 b d g q z c ü 计一笔
    var probe = t.replace(/r(?=(?:[0-9]|˥|˦|˧|˨|˩|$))/g, '');
    if (/[bdgqzcrü]/i.test(probe.replace(/[0-9\s]/g, ''))) issues++; // 拼音字母混用
    if (/[A-Z]/.test(t)) issues++;                      // 大写
    return clamp(1 - 0.5 * issues, 0, 1);
  }

  function isErhuaPair(s, u) {
    return !!(s && u && (ERHUA_RE.test(s.raw || '') || ERHUA_RE.test(s.final || '') ||
      ERHUA_RE.test(u.raw || '') || ERHUA_RE.test(u.final || '')));
  }
  function looksSandhi(stdTone, item, question) {
    if (stdTone === '21') return true;                  // 21 只可能是上声变调（半上）
    if (stdTone !== '35' && stdTone !== '51') return false;
    var notes = safeStr(item && item.note) + ' ' + safeStr(question && question.note);
    return /变调|实际读音|语流音变/.test(notes);
  }
  /* 轻声不标调：调值 '' 与旧写法 '0' 等价（GC 已归一为 ''，这里再兜一层） */
  function toneNorm(t) {
    t = t == null ? '' : String(t);
    if (t === '0' || /轻/.test(t)) return '';
    return t;
  }
  function toneErrCode(std, user, item, question) {
    var sTone = toneNorm(std && std.tone), uTone = toneNorm(user && user.tone);
    if (!sTone) return 'ip_neutral';     // 标准是轻声，用户却写了调值 → 轻声标错
    if (!uTone) return 'ip_tone';        // 标准有声调，用户漏标 → 归「声调标错」（不是把轻声标错）
    if (looksSandhi(sTone, item, question)) return 'ip_sandhi';
    return 'ip_tone';
  }
  function toneDisplay(t) {
    var t2 = toneNorm(t);
    return t2 || '轻声（不标调）';
  }

  /* ---------------- 单个注音项 ---------------- */
  // 整项全等时也补出逐音节对照（便于模块 renderResultDetail 显示 声/韵/调 ✓）
  function fillExactSyllables(rec, stdToks, userToks, altHit) {
    var n = Math.max(stdToks.length, userToks.length);
    for (var i = 0; i < n; i++) {
      var sTok = stdToks[i], uTok = userToks[i];
      var ok = !!(sTok && uTok);
      rec.syllables.push({
        i: i, std: safeStr(sTok), user: safeStr(uTok),
        initial: ok, final: ok, tone: ok,
        missing: !ok, alt: !!altHit, weighted: ok ? 0.9 : 0
      });
    }
  }
  function scoreItem(item, rawUser, idx, question, errors, reviewItems) {
    var text = safeStr(item && item.text);
    var answer = safeStr(item && item.answer);
    var raw = safeStr(rawUser).trim();
    var label = text || ('第 ' + (idx + 1) + ' 项');
    var rec = { idx: idx, text: text, answer: answer, user: raw, rate: 0, normRate: 1, syllables: [], codes: [], altHit: false };

    if (!raw) {
      rec.codes.push('cm_skip');
      reviewItems.push(rec);
      errors.push(GC.err('ipa', 'cm_skip', {
        item: idx, text: text, expected: answer,
        detail: '「' + label + '」未作答'
      }));
      return 0;
    }
    if (!answer) {
      rec.codes.push('ip_norm');
      reviewItems.push(rec);
      errors.push(GC.err('ipa', 'ip_norm', {
        item: idx, text: text, detail: '「' + label + '」标准答案缺失，无法判分'
      }));
      return 0;
    }

    var userToks = tokensOf(raw);
    var stdToks = tokensOf(answer);
    var alts = (Array.isArray(item.alternatives) ? item.alternatives : []).map(tokensOf);
    var normRate = normRateOf(raw);
    rec.normRate = normRate;

    function finish(rate, normDeducted) {
      rec.rate = clamp(rate, 0, 1);
      if (normDeducted) {
        rec.codes.push('ip_norm');
        errors.push(GC.err('ipa', 'ip_norm', {
          item: idx, text: text,
          detail: '「' + label + '」标写不够规范（多余空格 / 中文标点分隔 / 拼音字母混用等），已按 10% 扣分'
        }));
      }
      reviewItems.push(rec);
      return rec.rate;
    }

    // ① 与标准答案或 alternatives 完全一致（含允许的方括号/斜杠/空格声调写法）
    var exact = raw === answer || normIPA(raw) === normIPA(answer) ||
      tokensEqual(userToks, stdToks) || tokensEqual(userToks, tokensOf(answer));
    if (!exact) {
      for (var a0 = 0; a0 < alts.length; a0++) {
        var altRaw = safeStr(item.alternatives[a0]);
        if (raw === altRaw || normIPA(raw) === normIPA(altRaw) || tokensEqual(userToks, alts[a0])) { exact = true; rec.altHit = true; break; }
      }
    }
    if (exact) {
      // 规范项仍可扣分：完全一致但空格/标点异常时给 90%+10%*normRate
      fillExactSyllables(rec, stdToks, userToks, rec.altHit);
      return finish(normRate >= 1 ? 1 : 0.9 + 0.1 * normRate, normRate < 1);
    }

    // ② 解析用户音节；任何一个解析失败 → 整项 0 + ip_norm
    var parsedUser = [];
    var badUser = null;
    for (var i0 = 0; i0 < userToks.length; i0++) {
      var pu = parseSyl(userToks[i0]);
      parsedUser.push(pu);
      if (!pu.ok && !badUser) badUser = pu;
    }
    if (!parsedUser.length || badUser) {
      rec.codes.push('ip_norm');
      reviewItems.push(rec);
      errors.push(GC.err('ipa', 'ip_norm', {
        item: idx, text: text, expected: answer, got: raw,
        detail: '「' + label + '」无法解析为规范国际音标（' + ((badUser && badUser.err) || '空音节') + '），整项不得分'
      }));
      return 0;
    }

    var n = Math.max(stdToks.length, userToks.length);
    var countDiff = stdToks.length !== userToks.length;
    if (countDiff) {
      rec.codes.push('ip_syllable');
      errors.push(GC.err('ipa', 'ip_syllable', {
        item: idx, text: text,
        expected: stdToks.length + ' 个音节（' + stdToks.join(' ') + '）',
        got: userToks.length + ' 个音节（' + userToks.join(' ') + '）',
        detail: '「' + label + '」应分 ' + stdToks.length + ' 个音节，你写了 ' + userToks.length + ' 个'
      }));
    }

    var sum = 0;
    for (var i = 0; i < n; i++) {
      var sTok = stdToks[i], uTok = userToks[i];
      var sylRec = { i: i, std: safeStr(sTok), user: safeStr(uTok), initial: false, final: false, tone: false, missing: false, alt: false, weighted: 0 };
      if (i >= stdToks.length || i >= userToks.length) {
        sylRec.missing = true;
        rec.syllables.push(sylRec);
        continue;
      }
      // 该音节是否与某条 alternatives 的对应位置全等 → 该音节满分
      var altSylHit = false;
      for (var a = 0; a < alts.length; a++) {
        if (alts[a].length === userToks.length && alts[a][i] === uTok) { altSylHit = true; break; }
      }
      var cmp;
      var sP = null;
      if (altSylHit) {
        cmp = { initial: true, final: true, tone: true };
      } else {
        sP = parseSyl(sTok);
        if (!sP.ok) {
          // 标准答案自身解析失败（数据异常）：退化为字符串比较，不报要素错误
          var same = normIPA(sTok) === normIPA(uTok);
          sylRec.initial = sylRec.final = sylRec.tone = same;
          sylRec.weighted = same ? 0.9 : 0;
          sum += sylRec.weighted;
          rec.syllables.push(sylRec);
          continue;
        }
        cmp = GC.IPA.compareSyllable(sP, parsedUser[i]);
        // 轻声不标调：'' 与旧写法 '0' 等价（GC 已归一，这里再兜一层）
        cmp.tone = toneNorm(sP.tone) === toneNorm(parsedUser[i].tone);
      }
      var w = 0.3 * (cmp.initial ? 1 : 0) + 0.4 * (cmp.final ? 1 : 0) + 0.2 * (cmp.tone ? 1 : 0);
      sylRec.initial = !!cmp.initial;
      sylRec.final = !!cmp.final;
      sylRec.tone = !!cmp.tone;
      sylRec.alt = altSylHit;
      sylRec.weighted = round2(w);
      sum += w;
      rec.syllables.push(sylRec);

      // 逐要素错误码（音节数不同时对齐不可靠，只保留 ip_syllable）
      if (!altSylHit && !countDiff) {
        var sylNo = i + 1;
        if (!cmp.initial) {
          rec.codes.push('ip_initial');
          errors.push(GC.err('ipa', 'ip_initial', {
            item: idx, syllable: i, text: text,
            expected: safeStr(sP.initial) || '零声母',
            got: safeStr(parsedUser[i].initial) || '零声母',
            detail: '「' + label + '」第 ' + sylNo + ' 音节声母应为 ' + (sP.initial || '零声母') + '，你写的是 ' + (parsedUser[i].initial || '零声母')
          }));
        }
        if (!cmp.final) {
          var fCode = isErhuaPair(sP, parsedUser[i]) ? 'ip_erhua' : 'ip_final';
          rec.codes.push(fCode);
          errors.push(GC.err('ipa', fCode, {
            item: idx, syllable: i, text: text,
            expected: safeStr(sP.final) || '（缺韵母）',
            got: safeStr(parsedUser[i].final) || '（缺韵母）',
            detail: '「' + label + '」第 ' + sylNo + ' 音节' + (fCode === 'ip_erhua' ? '儿化韵' : '韵母') + '应为 ' + sP.final + '，你写的是 ' + parsedUser[i].final
          }));
        }
        if (!cmp.tone) {
          var tCode = toneErrCode(sP, parsedUser[i], item, question);
          var expTone = toneDisplay(sP.tone), gotTone = toneNorm(parsedUser[i].tone) || '未标调';
          rec.codes.push(tCode);
          errors.push(GC.err('ipa', tCode, {
            item: idx, syllable: i, text: text,
            expected: expTone, got: gotTone,
            detail: '「' + label + '」第 ' + sylNo + ' 音节调值应为 ' + expTone + '，你写的是 ' + gotTone
          }));
        }
      }
    }

    var base = n ? sum / n : 0;
    return finish(base + 0.1 * normRate, normRate < 1);
  }

  /* ---------------- 音位小题 ---------------- */
  function plain(s) {
    return safeStr(U && U.norm ? U.norm(s) : s)
      .replace(/[\s，。；：？！、“”‘’（）《》〈〉【】…—·、,.;:!?'"()\[\]{}<>\/\\]/g, '')
      .toLowerCase();
  }
  function subErrCode(qText) {
    // 契约：q 文本含「音位」→ ip_phoneme；否则（发音特征类）→ ip_feature
    return /音位/.test(safeStr(qText)) ? 'ip_phoneme' : 'ip_feature';
  }
  // 字符二元组 Dice 系数：用户答案与参考答案的相似度（0–1）
  // 解决「keyPoints 不一定是 answer 的子串」时照抄参考答案也拿不到满分的问题。
  function bigramDice(a, b) {
    var x = plain(a), y = plain(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    function grams(s) {
      var m = {};
      if (s.length < 2) { m[s] = 1; return m; }
      for (var i = 0; i < s.length - 1; i++) {
        var g = s.slice(i, i + 2);
        m[g] = (m[g] || 0) + 1;
      }
      return m;
    }
    var A = grams(x), B = grams(y);
    var inter = 0, total = 0, k;
    for (k in A) { if (!Object.prototype.hasOwnProperty.call(A, k)) continue; total += A[k]; if (B[k]) inter += Math.min(A[k], B[k]); }
    for (k in B) { if (!Object.prototype.hasOwnProperty.call(B, k)) continue; total += B[k]; }
    return total ? (2 * inter) / total : 0;
  }
  function scoreSub(sq, rawUser, idx, errors, subRecs) {
    var qText = safeStr(sq && sq.q);
    var answer = safeStr(sq && sq.answer);
    var uText = safeStr(rawUser);
    var rec = { idx: idx, q: qText, answer: answer, user: uText, rate: 0, cov: 0, sim: 0, hit: [], miss: [], codes: [] };
    if (!uText.trim()) {
      rec.codes.push('cm_skip');
      subRecs.push(rec);
      errors.push(GC.err('ipa', 'cm_skip', { sub: idx, q: qText, detail: '音位小题 ' + (idx + 1) + ' 未作答' }));
      return 0;
    }
    var kps = Array.isArray(sq && sq.keyPoints) ? sq.keyPoints.slice() : [];
    var u = plain(uText);
    var sim = bigramDice(uText, answer);          // 与参考答案的字符二元组相似度
    rec.sim = round2(sim);
    if (!kps.length) {
      // 无 keyPoints：能判的只有与参考答案的相似度；答了就给分
      rec.rate = answer ? Math.max(sim, 0.5) : 1;
      rec.cov = rec.rate;
      subRecs.push(rec);
      return rec.rate;
    }
    var code = subErrCode(qText);
    for (var i = 0; i < kps.length; i++) {
      var kp = safeStr(kps[i]);
      var variants = kp.split(/[|/、;；]/).map(plain).filter(Boolean);
      var hit = false;
      for (var v = 0; v < variants.length; v++) {
        if (variants[v] && u.indexOf(variants[v]) >= 0) { hit = true; break; }
      }
      if (hit) rec.hit.push(kp);
      else rec.miss.push(kp);
    }
    var cov = rec.hit.length / kps.length;
    rec.cov = round2(cov);
    // 判分：关键词覆盖率与参考答案相似度取较大值（照抄参考答案 = 相似度 1 → 满分）
    rec.rate = clamp(Math.max(cov, sim), 0, 1);
    // 近似照抄参考答案（相似度 ≥ 0.98）：视为已覆盖全部要点，不再报要点错
    var nearCopy = sim >= 0.98;
    if (nearCopy) {
      rec.hit = kps.slice();
      rec.miss = [];
    } else {
      rec.miss.forEach(function (kp) {
        rec.codes.push(code);
        errors.push(GC.err('ipa', code, {
          sub: idx, q: qText, expected: kp,
          detail: '音位小题 ' + (idx + 1) + ' 未覆盖要点「' + kp + '」（关键词覆盖 ' + rec.hit.length + '/' + kps.length + '，与参考答案相似度 ' + Math.round(sim * 100) + '%）'
        }));
      });
    }
    subRecs.push(rec);
    return rec.rate;
  }

  /* ---------------- 读取用户答案 ---------------- */
  function readAnswer(question, userAnswer) {
    var out = { items: [], subs: [] };
    var ua = userAnswer;
    if (typeof ua === 'string') out.items = [ua];
    else if (Array.isArray(ua)) out.items = ua.slice();
    else if (ua && typeof ua === 'object') {
      if (Array.isArray(ua.items)) out.items = ua.items.slice();
      if (Array.isArray(ua.subs)) out.subs = ua.subs.slice();
      else if (Array.isArray(ua.subQuestions)) out.subs = ua.subQuestions.slice();
      else if (Array.isArray(ua.texts)) out.subs = ua.texts.slice();
    }
    function toStr(x) {
      if (x == null) return '';
      if (typeof x === 'string') return x;
      if (typeof x === 'number') return String(x);
      if (typeof x === 'object') {
        if (typeof x.value === 'string') return x.value;
        if (typeof x.text === 'string') return x.text;
      }
      return '';
    }
    out.items = out.items.map(toStr);
    out.subs = out.subs.map(toStr);
    var nItems = (question && Array.isArray(question.items)) ? question.items.length : 0;
    var nSubs = (question && Array.isArray(question.subQuestions)) ? question.subQuestions.length : 0;
    while (out.items.length < nItems) out.items.push('');
    while (out.subs.length < nSubs) out.subs.push('');
    return out;
  }

  /* ---------------- 主判分 ---------------- */
  function gradeInner(question, userAnswer) {
    var q = question && typeof question === 'object' ? question : {};
    var items = Array.isArray(q.items) ? q.items : [];
    var subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
    var ans = readAnswer(q, userAnswer);
    var errors = [];
    var review = { items: [], subs: [], groups: [] };
    var passScore = q.passScore == null ? 80 : q.passScore;
    var nItems = items.length;
    var nSubs = subs.length;

    function groupEntries(itemPct, subPct) {
      var subList = [];
      var score;
      if (nItems && nSubs) {
        var s1 = Math.round(itemPct * 50);
        var s2 = Math.round(subPct * 50);
        subList = [{ name: '注音项', score: s1, max: 50 }, { name: '音位小题', score: s2, max: 50 }];
        review.groups = [{ name: '注音项', pct: round2(itemPct) }, { name: '音位小题', pct: round2(subPct) }];
        score = s1 + s2;
      } else if (nItems) {
        score = Math.round(itemPct * 100);
        subList = [{ name: '注音项', score: score, max: 100 }];
        review.groups = [{ name: '注音项', pct: round2(itemPct) }];
      } else if (nSubs) {
        score = Math.round(subPct * 100);
        subList = [{ name: '音位小题', score: score, max: 100 }];
        review.groups = [{ name: '音位小题', pct: round2(subPct) }];
      } else {
        score = 0;
      }
      return { sub: subList, score: score };
    }

    // 整题空答案：0 + cm_skip（不逐项刷错误）
    var allEmpty = true;
    for (var e0 = 0; e0 < ans.items.length; e0++) if (safeStr(ans.items[e0]).trim()) { allEmpty = false; break; }
    if (allEmpty) {
      for (var e1 = 0; e1 < ans.subs.length; e1++) if (safeStr(ans.subs[e1]).trim()) { allEmpty = false; break; }
    }
    if (allEmpty) {
      errors.push(GC.err('ipa', 'cm_skip', { detail: '整题未作答' }));
      if (nItems || nSubs) review.groups = (nItems && nSubs)
        ? [{ name: '注音项', pct: 0 }, { name: '音位小题', pct: 0 }]
        : [{ name: nItems ? '注音项' : '音位小题', pct: 0 }];
      var emptySub = groupEntries(0, 0).sub;
      return GC.makeResult({
        score: 0, passScore: passScore, sub: emptySub,
        errors: errors, summary: '未作答', review: review
      });
    }

    // ① 注音项
    var itemRates = [];
    for (var i = 0; i < nItems; i++) {
      var rate = 0;
      try {
        rate = scoreItem(items[i] || {}, ans.items[i], i, q, errors, review.items);
      } catch (eItem) {
        rate = 0;
        errors.push(GC.err('ipa', 'ip_norm', { item: i, detail: '第 ' + (i + 1) + ' 项判分异常：' + (eItem && eItem.message) }));
      }
      itemRates.push(clamp(rate, 0, 1));
    }
    // ② 音位小题
    var subRates = [];
    for (var j = 0; j < nSubs; j++) {
      var r2 = 0;
      try {
        r2 = scoreSub(subs[j] || {}, ans.subs[j], j, errors, review.subs);
      } catch (eSub) {
        r2 = 0;
        errors.push(GC.err('ipa', 'ip_feature', { sub: j, detail: '音位小题 ' + (j + 1) + ' 判分异常：' + (eSub && eSub.message) }));
      }
      subRates.push(clamp(r2, 0, 1));
    }

    function avg(arr) {
      if (!arr.length) return 0;
      var s = 0;
      for (var k = 0; k < arr.length; k++) s += arr[k];
      return s / arr.length;
    }
    var itemPct = avg(itemRates);
    var subPct = avg(subRates);
    var g = groupEntries(itemPct, subPct);
    var score = clamp(Math.round(g.score), 0, 100);

    // 错误去重 + 截断
    var uniq = GC.uniqueErrors ? GC.uniqueErrors(errors) : errors;
    if (uniq.length > MAX_ERRORS) {
      var dropped = uniq.length - MAX_ERRORS;
      uniq = uniq.slice(0, MAX_ERRORS);
      uniq.push(GC.err('ipa', 'cm_partial', { detail: '另有 ' + dropped + ' 处差异未逐条列出，请对照「解析」逐项核对' }));
    }
    var summary;
    if (score >= 100) summary = '全部正确';
    else summary = '错 ' + uniq.length + ' 处：' + GC.summarize(uniq);

    return GC.makeResult({
      score: score, passScore: passScore, sub: g.sub,
      errors: uniq, summary: summary, review: review
    });
  }

  function grade(question, userAnswer) {
    try {
      return gradeInner(question, userAnswer);
    } catch (e) {
      try {
        var errs = [GC.err('ipa', 'cm_concept', { detail: '判分异常：' + (e && e.message ? e.message : String(e)) })];
        return GC.makeResult({ score: 0, errors: errs, summary: '判分异常（已安全兜底）', review: null });
      } catch (e2) {
        return {
          score: 0, passed: false, sub: [],
          errors: [{ code: 'cm_concept', name: '概念不清', short: '概念', severity: 'high', detail: '判分异常' }],
          summary: '判分异常', review: null
        };
      }
    }
  }

  window.GRADERS = window.GRADERS || {};
  window.GRADERS.ipa = grade;
  if (typeof module !== 'undefined' && module.exports) module.exports = grade;
})();
