/* ============================================================================
   practice/js/grade/translate.js — 古文翻译判分器（纯函数 · 无 DOM · 无网络）
   注册 window.GRADERS.translate(question, userAnswer) -> 契约 §7 结果

   判分口径：
   - 采分点得分 = 采分点关键词覆盖率（GC.coverage，按 points[].score 加权）
   - 总分 = 覆盖率 × 100（四舍五入）→ 0–100 整数
   - 未命中的采分点逐条给「疑似漏译」（tr_miss）
   - 空答案：0 分，只给 cm_skip，不逐点重复
   - 译文少于原文 1/3 字数：追加 tr_complete（不额外扣分）
   - 错误码只用 ERROR_TAXONOMY 里已有的 code（tr_*，通用 cm_skip）
   - 任何输入都不抛异常；边界（points 缺失等）退还 0 分 + 结构化错误
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 小工具（纯函数） ---------------- */

  // 兼容 {text, ...} / 纯字符串 / null
  function answerText(userAnswer) {
    if (userAnswer == null) return '';
    if (typeof userAnswer === 'string') return userAnswer;
    if (typeof userAnswer.text === 'string') return userAnswer.text;
    if (typeof userAnswer.answer === 'string') return userAnswer.answer;
    return '';
  }

  // 只保留结构完整的采分点（seg / ref / keywords 至少有一个）
  function pickPoints(question) {
    var arr = question && Array.isArray(question.points) ? question.points : [];
    return arr.filter(function (p) {
      return !!p && typeof p === 'object' &&
        (p.seg || (p.keywords && p.keywords.length) || p.ref);
    });
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

  function trunc(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // GC 本身不导出 clamp（只有 util.clamp），这里做兼容取值
  function clampNum(n, lo, hi) {
    if (typeof window !== 'undefined' && window.util && typeof window.util.clamp === 'function') {
      return window.util.clamp(n, lo, hi);
    }
    return Math.max(lo, Math.min(hi, n));
  }

  function baseSub(score) {
    return [{ name: '采分点', score: score, max: 100 }];
  }

  /* ---------------- 判分主函数 ---------------- */

  function translateGrader(question, userAnswer) {
    var GC = (typeof window !== 'undefined' && window.GC) ? window.GC : null;
    var q = question || {};
    var passScore = q.passScore;
    var review = {
      hitPoints: [], missPoints: [],
      coverage: 0, coveragePct: 0,
      hitCount: 0, missCount: 0, total: 0,
      pointStatus: []
    };

    // 公共判分库没加载：不抛异常，返回契约形状的 0 分结果
    if (!GC) {
      return {
        score: 0,
        passed: false,
        sub: baseSub(0),
        errors: [{
          code: 'tr_miss', name: '判分异常', short: '判分异常', severity: 'high',
          detail: '判分公共库（js/core/grade-common.js）未加载，无法判分。'
        }],
        summary: '判分库未加载',
        review: review
      };
    }

    try {
      var text = answerText(userAnswer);
      var hasText = !!String(text).replace(/\s+/g, '').length;
      var points = pickPoints(q);

      /* 边界 1：题目没有采分点 → 退还 0 分 + 一条数据异常错误 */
      if (!points.length) {
        return GC.makeResult({
          score: 0,
          passScore: passScore,
          sub: baseSub(0),
          errors: [GC.err('translate', 'tr_miss', {
            name: '题目异常',
            detail: '本题缺少采分点配置，无法采分（已按 0 分处理；请联系题库维护者）。'
          })],
          summary: '题目缺少采分点，无法判分',
          review: review
        });
      }

      /* 1) 采分点覆盖率 */
      var cov = GC.coverage(points, text);
      var pct = Math.round(cov.rate * 100);
      review.hitPoints = cov.hitPoints.slice();
      review.missPoints = cov.missPoints.slice();
      review.coverage = cov.rate;
      review.coveragePct = pct;
      review.hitCount = cov.hitPoints.length;
      review.missCount = cov.missPoints.length;
      review.total = points.length;
      review.pointStatus = points.map(function (p) {
        return {
          seg: pointLabel(p),
          ref: pointRef(p),
          score: p.score || 1,
          hit: cov.hitPoints.indexOf(p) >= 0,
          keywords: (p.keywords || []).slice()
        };
      });

      /* 2) 空答案：0 分 + cm_skip，只报一条，不逐点重复 */
      if (!hasText) {
        return GC.makeResult({
          score: 0,
          passScore: passScore,
          sub: baseSub(0),
          errors: [GC.err('translate', 'cm_skip', { detail: '整题留空，未作答。' })],
          summary: '未作答',
          review: review
        });
      }

      /* 3) 逐条「疑似漏译」 */
      var errors = [];
      cov.missPoints.forEach(function (p) {
        var seg = pointLabel(p);
        var ref = pointRef(p);
        errors.push(GC.err('translate', 'tr_miss', {
          detail: '疑似漏译：『' + trunc(seg, 30) + '』（参考：' + trunc(ref || '见参考译文', 40) + '）',
          seg: seg,
          expected: ref,
          keywords: (p.keywords || []).slice(),
          score: p.score || 1
        }));
      });

      /* 4) 译文是否明显没译完（< 原文 1/3 字数），只提示不扣分 */
      var srcLen = GC.plainText(q.text || '').length;
      var ansLen = GC.plainText(text).length;
      var tooShort = srcLen > 0 && ansLen < srcLen / 3;
      if (tooShort) {
        errors.push(GC.err('translate', 'tr_complete', {
          detail: '译文约 ' + ansLen + ' 字，原文 ' + srcLen + ' 字，疑似没有译完（先把每句译完整，再润色）。'
        }));
      }

      /* 5) 分数与摘要：覆盖率 × 100，四舍五入；覆盖率 0 也给 0 分（无「有作答分」） */
      var score = clampNum(Math.round(cov.rate * 100), 0, 100);
      var summary;
      if (!cov.missPoints.length && !tooShort) {
        summary = '采分点全部命中，译文完整。';
      } else {
        summary = '采分点命中 ' + cov.hitPoints.length + ' / ' + points.length +
          '（覆盖率 ' + pct + '%）';
        if (cov.missPoints.length) summary += ' · 疑似漏译 ' + cov.missPoints.length + ' 处';
        if (tooShort) summary += ' · 译文偏短';
      }

      return GC.makeResult({
        score: score,
        passScore: passScore,
        sub: baseSub(score),
        errors: errors,
        summary: summary,
        review: review
      });
    } catch (e) {
      /* 兜底：判分异常也不抛出，按 0 分返回契约形状 */
      return GC.makeResult({
        score: 0,
        passScore: passScore,
        sub: baseSub(0),
        errors: [GC.err('translate', 'tr_miss', {
          name: '判分异常',
          detail: '判分过程出现异常，已按 0 分处理：' + (e && e.message ? e.message : String(e))
        })],
        summary: '判分异常，请重试或反馈',
        review: review
      });
    }
  }

  /* ---------------- 注册与导出 ---------------- */
  window.GRADERS = window.GRADERS || {};
  window.GRADERS.translate = translateGrader;

  // 契约 §7：文件末尾加 CommonJS 出口，便于 Node 直接调用（不用 ESM）
  if (typeof module !== 'undefined' && module.exports) module.exports = translateGrader;
})();
