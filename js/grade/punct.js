/* ============================================================
   practice/js/grade/punct.js — 句读标点判分
   ============================================================ */
(function () {
  'use strict';
  var GC = window.GC, U = window.util;

  function gapLabel(gap) {
    return '第 ' + gap + ' 字后';
  }
  function markClassCode(expected) {
    var cls = GC.PUNCT.punctClass(expected);
    if (cls === 'quote') return 'pu_quote';
    if (cls === 'title') return 'pu_title';
    if (cls === 'bracket') return 'pu_bracket';
    if (cls === 'end') return 'pu_ends';
    return 'pu_type';
  }

  function gradePunct(question, answer) {
    var result = { score: 0, passed: false, sub: [], errors: [], summary: '', review: null };
    var marks = (answer && answer.marks) || [];
    if (!marks.length) {
      result.errors.push(GC.err('common', 'cm_skip', { detail: '整题没有加任何标点' }));
      result.summary = '未作答';
      return result;
    }
    var cmp = GC.PUNCT.compare(question.answer, marks);
    var errors = [];
    cmp.miss.forEach(function (x) {
      errors.push(GC.err('punct', 'pu_miss', {
        gap: x.gap,
        detail: gapLabel(x.gap) + '漏断：标准应加「' + x.expected + '」'
      }));
    });
    cmp.over.forEach(function (x) {
      errors.push(GC.err('punct', 'pu_over', {
        gap: x.gap,
        detail: gapLabel(x.gap) + '多断：不应加「' + x.got + '」'
      }));
    });
    cmp.typeWrong.forEach(function (x) {
      var code = markClassCode(x.expected);
      errors.push(GC.err('punct', code, {
        gap: x.gap,
        expected: x.expected,
        got: x.got,
        detail: gapLabel(x.gap) + '标点类型不对：应为「' + x.expected + '」，你加的是「' + x.got + '」'
      }));
    });
    // 句末无标点
    var lastGap = (question.text || '').length;
    if (!cmp.userMap[lastGap] && !/[。！？]/.test(cmp.stdMap[lastGap] || '')) { /* 标准无句末标点也无妨 */ }
    if (cmp.stdMap[lastGap] && !cmp.userMap[lastGap]) {
      var dup = errors.some(function (e) { return e.gap === lastGap; });
      if (!dup) errors.push(GC.err('punct', 'pu_ends', { gap: lastGap, detail: '全文末尾缺少句末标点' }));
    }

    var score = U.clamp(Math.round(cmp.positionScore + cmp.typeScore), 0, 100);
    if (!errors.length) score = 100;
    result.score = score;
    result.passed = score >= 80;
    result.sub = [
      { name: '断点位置', score: cmp.positionScore, max: 60 },
      { name: '标点类型', score: cmp.typeScore, max: 40 }
    ];
    result.errors = GC.uniqueErrors(errors);
    result.summary = GC.summarize(result.errors) || '断点与标点都正确';
    result.review = { stdMap: cmp.stdMap, userMap: cmp.userMap, lastGap: lastGap };
    return result;
  }

  window.GRADERS = window.GRADERS || {};
  window.GRADERS.punct = gradePunct;
})();
