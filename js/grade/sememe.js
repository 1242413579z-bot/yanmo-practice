/* ============================================================
   practice/js/grade/sememe.js — 义素分析判分
   ============================================================ */
(function () {
  'use strict';
  var GC = window.GC, U = window.util;

  function normName(s) {
    return U.norm(String(s || ''))
      .replace(/[\[\]【】()（）+\-＋－±\s]/g, '')
      .replace(/性$/, '')
      .toLowerCase();
  }
  // 标准义素可接受的用户写法集合（名称 + aliases）
  function namesOf(std) {
    var set = {};
    set[normName(std.name)] = 1;
    (std.aliases || []).forEach(function (a) { set[normName(a)] = 1; });
    return set;
  }

  function gradeSememe(question, answer) {
    var words = question.words || [];
    var stds = question.sememes || [];
    var userCols = ((answer && answer.sememes) || []).filter(function (c) { return c && U.norm(c.name); });
    var result = { score: 0, passed: false, sub: [], errors: [], summary: '', review: null };
    if (!stds.length) {
      result.errors.push(GC.err('sememe', 'sm_field', { detail: '这道题缺少标准义素数据' }));
      return result;
    }
    if (!userCols.length) {
      result.errors.push(GC.err('common', 'cm_skip', { detail: '没有填任何义素列' }));
      result.summary = '未作答';
      return result;
    }

    var used = {};   // std index → user column index
    var userMatched = {};
    stds.forEach(function (std, si) {
      var set = namesOf(std);
      for (var ui = 0; ui < userCols.length; ui++) {
        if (userMatched[ui]) continue;
        if (set[normName(userCols[ui].name)]) { used[si] = ui; userMatched[ui] = true; break; }
      }
    });

    var required = question.required && question.required.length ? question.required : stds.map(function (s) { return s.name; });
    var matchedRequired = 0, cellTotal = 0, cellOk = 0;
    var errors = [];

    required.forEach(function (reqName) {
      var si = -1;
      stds.forEach(function (s, i) { if (s.name === reqName) si = i; });
      if (si < 0) return;
      var std = stds[si];
      var ui = used[si];
      if (ui == null) {
        errors.push(GC.err('sememe', 'sm_missing', {
          sememe: std.name,
          detail: '缺义素「' + std.name + '」（没有设出这一区别特征）'
        }));
        cellTotal += words.length;
        return;
      }
      matchedRequired += 1;
      var vals = userCols[ui].values || [];
      words.forEach(function (w, wi) {
        cellTotal += 1;
        var exp = std.values[wi];
        var got = vals[wi] == null ? '' : String(vals[wi]);
        if (got === exp) cellOk += 1;
        else {
          var wName = w;
          errors.push(GC.err('sememe', 'sm_value', {
            word: wName, sememe: std.name,
            expected: exp, got: got || '空',
            detail: '「' + wName + '」的「' + std.name + '」应为 ' + exp + '，你填 ' + (got || '空')
          }));
        }
      });
    });

    // 冗余列
    var extra = 0;
    userCols.forEach(function (c, ui) {
      if (userMatched[ui]) return;
      extra += 1;
      errors.push(GC.err('sememe', 'sm_redundant', {
        sememe: c.name,
        detail: '义素「' + c.name + '」不在本题必要区别特征内（可能是冗余，或命名与标准不同名）'
      }));
    });
    // 整行空
    words.forEach(function (w, wi) {
      var any = userCols.some(function (c) { return c.values && c.values[wi] && c.values[wi] !== ''; });
      if (!any) errors.push(GC.err('sememe', 'sm_coverage', { word: w, detail: '「' + w + '」这一行没有填任何取值' }));
    });

    var covScore = required.length ? matchedRequired / required.length : 1;
    var cellAcc = cellTotal ? cellOk / cellTotal : 0;
    var extraPenalty = userCols.length ? Math.min(1, extra / userCols.length) : 0;
    var score = Math.round(30 * covScore + 60 * cellAcc + 10 * (1 - extraPenalty));
    score = U.clamp(score, 0, 100);
    if (!errors.length) score = 100;

    result.score = score;
    result.passed = score >= 80;
    result.sub = [
      { name: '义素覆盖', score: Math.round(30 * covScore), max: 30 },
      { name: '取值准确', score: Math.round(60 * cellAcc), max: 60 },
      { name: '无冗杂', score: Math.round(10 * (1 - extraPenalty)), max: 10 }
    ];
    result.errors = GC.uniqueErrors(errors);
    result.summary = GC.summarize(result.errors) || '全部正确';
    result.review = {
      matched: used,
      required: required,
      matchedRequired: matchedRequired,
      extraColumns: userCols.filter(function (c, ui) { return !userMatched[ui]; }).map(function (c) { return c.name; }),
      std: stds
    };
    return result;
  }

  window.GRADERS = window.GRADERS || {};
  window.GRADERS.sememe = gradeSememe;
})();
