/* ============================================================================
   practice/js/grade/syntax.js — 句法分析判分器（window.GRADERS.syntax）
   - 纯函数：无 DOM / 无网络，可被 Node 直接调用（tests/test-syntax.mjs）
   - 位置分 60：GC.compareSyntax 的刀位集合比较（漏切 / 多切 / 词内误切）
   - 关系分 40：两边都落刀的刀位比较关系标签（同义归一由 GC.relCompatible 负责）
   - 层次：分层模式下两边都带 span 的刀位比较跨度，报 sx_level（按契约 §7.1 只提示，
     不重复扣位置分，是否扣分由总分口径决定）
   - 多解（歧义）题：question.readings → 每种读法在用户 analyses 里贪心匹配最高分的一份
     （同一份分析只能匹配一种读法）；总分 = 各读法得分平均；缺读法报 sx_ambig（§7.1）
   - 单解题：用户提交多份分析时取最高分那份计分（多给不扣分）
   - 结果形状按契约 §7；多解时 review 含 readingMatch / stdTrees / readings
   ========================================================================== */
(function () {
  'use strict';
  var GC = window.GC;

  /* ---------------- 小工具 ---------------- */
  function zeroSub() {
    return [
      { name: '位置分', score: 0, max: 60 },
      { name: '关系分', score: 0, max: 40 }
    ];
  }

  function gapPos(gap) {
    return '第 ' + gap + ' 字后';
  }

  function relText(rel) {
    if (!rel) return '（未标关系）';
    return '「' + String(rel) + '」';
  }

  function passScoreOf(question) {
    return question && question.passScore != null ? question.passScore : 80;
  }

  function cnNum(n) {
    var names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    return names[n - 1] || String(n);
  }

  function makeZero(errors, summary, review, question) {
    return GC.makeResult({
      score: 0,
      passScore: passScoreOf(question),
      sub: zeroSub(),
      errors: errors,
      summary: summary,
      review: review || { gaps: {}, stdTree: '' }
    });
  }

  /* ---------------- 标准读法解析（单解 tree / 多解 readings） ---------------- */
  function readReadings(question) {
    if (!question || typeof question !== 'object') return { ok: false, err: '题目对象为空' };
    if (typeof question.sentence !== 'string' || !question.sentence) {
      return { ok: false, err: '题目缺少 sentence' };
    }
    var len = question.sentence.length;
    var readings = [];
    var multi = false;

    if (Array.isArray(question.readings) && question.readings.length) {
      multi = true;
      for (var i = 0; i < question.readings.length; i++) {
        var raw = question.readings[i] || {};
        var no = i + 1;
        if (typeof raw.tree !== 'string' || !raw.tree) {
          return { ok: false, err: '读法' + cnNum(no) + '缺少标准树 tree' };
        }
        var parsed = GC.parseTree(raw.tree);
        if (!parsed.ok) {
          return { ok: false, err: '读法' + cnNum(no) + '标准树无法解析：' + parsed.err };
        }
        var leaves = GC.treeLeaves(parsed.root);
        if (leaves.join('') !== question.sentence) {
          return { ok: false, err: '读法' + cnNum(no) + '的标准树叶子与 sentence 不一致' };
        }
        readings.push({
          index: i,
          label: raw.label || ('读法' + cnNum(no)),
          meaning: raw.meaning || '',
          root: parsed.root,
          pretty: GC.treePretty(parsed.root),
          stdCuts: GC.treeCuts(parsed.root),
          leaves: leaves
        });
      }
      return { ok: true, multi: true, readings: readings, len: len };
    }

    if (typeof question.tree !== 'string' || !question.tree) {
      return { ok: false, err: '题目缺少标准树：tree（单解）或 readings（多解）' };
    }
    var one = GC.parseTree(question.tree);
    if (!one.ok) return { ok: false, err: '标准树无法解析：' + one.err };
    var oneLeaves = GC.treeLeaves(one.root);
    if (oneLeaves.join('') !== question.sentence) {
      return { ok: false, err: '标准树叶子与 sentence 不一致（叶子拼接 ≠ 原句）' };
    }
    readings.push({
      index: 0,
      label: '标准答案',
      meaning: '',
      root: one.root,
      pretty: GC.treePretty(one.root),
      stdCuts: GC.treeCuts(one.root),
      leaves: oneLeaves
    });
    return { ok: true, multi: false, readings: readings, len: len };
  }

  /* ---------------- 用户分析整理 ---------------- */
  function readCuts(raw, sentenceLength) {
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var out = [];
    raw.forEach(function (c) {
      if (!c || typeof c.gap !== 'number' || !isFinite(c.gap)) return;
      var gap = Math.round(c.gap);
      if (gap < 1 || gap > sentenceLength - 1 || seen[gap]) return;
      seen[gap] = 1;
      var cut = { gap: gap, rel: c.rel == null ? '' : String(c.rel) };
      if (Array.isArray(c.span) && c.span.length === 2 &&
        typeof c.span[0] === 'number' && typeof c.span[1] === 'number') {
        cut.span = [Math.round(c.span[0]), Math.round(c.span[1])];
      }
      out.push(cut);
    });
    return out;
  }

  // 统一成 [{cuts, mode, index, filled}]；兼容旧答案 {cuts, mode}
  function normalizeAnalyses(userAnswer, sentenceLength) {
    var list = [];
    if (userAnswer && Array.isArray(userAnswer.analyses)) {
      userAnswer.analyses.forEach(function (a) {
        var cuts = readCuts(a && a.cuts, sentenceLength);
        list.push({
          index: list.length,
          cuts: cuts,
          mode: a && a.mode === 'whole' ? 'whole' : 'layered',
          filled: cuts.length > 0
        });
      });
    } else if (userAnswer) {
      var cuts = readCuts(userAnswer.cuts, sentenceLength);
      list.push({
        index: 0,
        cuts: cuts,
        mode: userAnswer.mode === 'whole' ? 'whole' : 'layered',
        filled: cuts.length > 0
      });
    }
    if (!list.length) list.push({ index: 0, cuts: [], mode: 'layered', filled: false });
    return list;
  }

  /* ---------------- 比较结果 → 错误列表 ---------------- */
  function buildErrors(cmp, reading) {
    var byGap = {};

    function put(gap, e) { byGap[gap] = e; }

    (cmp.miss || []).forEach(function (x) {
      put(x.gap, GC.err('syntax', 'sx_miss', {
        gap: x.gap,
        expected: x.expected,
        detail: gapPos(x.gap) + '应切' + relText(x.expected) + '，这里没有落刀'
      }));
    });
    (cmp.over || []).forEach(function (x) {
      var leafTxt = x.leaf ? '「' + x.leaf + '」是整体成分，题目不要求再往下切' : '题目不要求切到这里';
      put(x.gap, GC.err('syntax', 'sx_over', {
        gap: x.gap,
        got: x.got,
        leaf: x.leaf || '',
        detail: gapPos(x.gap) + '是多切（' + leafTxt + '），你标了' + relText(x.got)
      }));
    });
    (cmp.inword || []).forEach(function (x) {
      var leafTxt = x.leaf ? '「' + x.leaf + '」是词内位置' : '这里是词内位置';
      put(x.gap, GC.err('syntax', 'sx_inword', {
        gap: x.gap,
        got: x.got,
        leaf: x.leaf || '',
        detail: gapPos(x.gap) + leafTxt + '，不能落刀（你标了' + relText(x.got) + '）'
      }));
    });
    (cmp.relWrong || []).forEach(function (x) {
      put(x.gap, GC.err('syntax', 'sx_rel', {
        gap: x.gap,
        expected: x.expected,
        got: x.got,
        detail: gapPos(x.gap) + '应为' + relText(x.expected) + '，你标的是' + relText(x.got)
      }));
    });
    (cmp.levelWrong || []).forEach(function (x) {
      var spanTxt = '';
      if (Array.isArray(x.expected) && Array.isArray(x.got)) {
        spanTxt = '（标准属于第 ' + (x.expected[0] + 1) + '–' + x.expected[1] + ' 字这一层，' +
          '你把它挂到了第 ' + (x.got[0] + 1) + '–' + x.got[1] + ' 字那一层）';
      }
      if (byGap[x.gap]) {
        var main = byGap[x.gap];
        main.extraCodes = main.extraCodes || [];
        main.extraCodes.push('sx_level');
        if (spanTxt && main.detail) main.detail += '；层次也不对' + spanTxt;
        return;
      }
      put(x.gap, GC.err('syntax', 'sx_level', {
        gap: x.gap,
        expected: x.expected,
        got: x.got,
        detail: gapPos(x.gap) + '关系对了，但挂错层次' + spanTxt
      }));
    });

    var errors = Object.keys(byGap)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (gap) { return byGap[gap]; });

    // 多解：给错误标上读法来源，方便解析页按读法展示
    if (reading) {
      errors.forEach(function (e) {
        e.readingIndex = reading.index;
        e.readingLabel = reading.label;
        e.detail = '【' + reading.label + '】' + e.detail;
      });
    }
    return errors;
  }

  function scorePair(analysis, reading) {
    var cmp = GC.compareSyntax(analysis.cuts, reading.root);
    return {
      cmp: cmp,
      score: cmp.score,
      positionScore: cmp.positionScore,
      relationScore: cmp.relationScore
    };
  }

  function subOf(positionScore, relationScore) {
    return [
      { name: '位置分', score: positionScore, max: 60 },
      { name: '关系分', score: relationScore, max: 40 }
    ];
  }

  /* ---------------- 主判分函数 ---------------- */
  function gradeSyntax(question, userAnswer) {
    var R = readReadings(question);
    var passScore = passScoreOf(question);

    // 1) 题目数据坏掉：不抛异常，0 分 + sx_format
    if (!R.ok) {
      var stdTree = '';
      if (question && typeof question.tree === 'string') {
        var probe = GC.parseTree(question.tree);
        if (probe.ok) stdTree = GC.treePretty(probe.root);
      }
      return makeZero(
        [GC.err('syntax', 'sx_format', { detail: '题目标准树有问题：' + R.err })],
        '题目数据异常：' + R.err,
        { gaps: {}, stdTree: stdTree },
        question
      );
    }

    var analyses = normalizeAnalyses(userAnswer, R.len);
    var filled = analyses.filter(function (a) { return a.filled; });
    var N = R.readings.length;

    // 2) 完全没有作答：0 分 + cm_skip
    if (!filled.length) {
      var skip = GC.err('syntax', 'cm_skip', {
        detail: R.multi
          ? '还没有提交分析。本题有 ' + N + ' 种读法（' + R.readings.map(function (r) { return r.label; }).join(' / ') +
            '），先分析一种，再点「＋ 新增一种分析」做下一种。'
          : '还没有落刀。先判断全句第一层在哪儿切开，再逐层往下。'
      });
      return makeZero(
        [skip],
        '未作答',
        {
          gaps: {},
          stdTree: R.multi ? '' : R.readings[0].pretty,
          stdTrees: R.multi ? R.readings.map(function (r) { return r.pretty; }) : undefined,
          readings: R.multi ? R.readings.map(function (r) {
            return { index: r.index, label: r.label, meaning: r.meaning };
          }) : undefined
        },
        question
      );
    }

    // 3) 每份分析 × 每种读法的得分矩阵
    var matrix = filled.map(function (analysis) {
      return R.readings.map(function (reading) { return scorePair(analysis, reading); });
    });

    /* ---- 单解题：取用户多份分析中的最高分 ---- */
    if (!R.multi) {
      var bestIdx = 0;
      for (var i = 1; i < filled.length; i++) {
        if (matrix[i][0].score > matrix[bestIdx][0].score) bestIdx = i;
      }
      var m = matrix[bestIdx][0];
      var errors = buildErrors(m.cmp);
      var summary = errors.length ? GC.summarize(errors) : '全部正确';
      return GC.makeResult({
        score: m.score,
        passScore: passScore,
        sub: subOf(m.positionScore, m.relationScore),
        errors: errors,
        summary: summary,
        review: {
          gaps: m.cmp.gapStatus,
          stdTree: R.readings[0].pretty,
          analysisIndex: filled[bestIdx].index,
          analysisCount: filled.length
        }
      });
    }

    /* ---- 多解题：每种读法贪心匹配一份未用过的分析（取最高分） ---- */
    var used = {};
    var match = [];
    var sumScore = 0;
    var sumPos = 0;
    var sumRel = 0;

    R.readings.forEach(function (reading) {
      var pick = -1;
      var pickScore = -1;
      for (var ai = 0; ai < filled.length; ai++) {
        if (used[ai]) continue;
        var sc = matrix[ai][reading.index].score;
        if (sc > pickScore) {
          pickScore = sc;
          pick = ai;
        }
      }
      if (pick >= 0 && pickScore > 0) {
        used[pick] = 1;
        var sm = matrix[pick][reading.index];
        match.push({
          readingIndex: reading.index,
          label: reading.label,
          analysisIndex: filled[pick].index,
          score: sm.score,
          positionScore: sm.positionScore,
          relationScore: sm.relationScore,
          cmp: sm.cmp
        });
        sumScore += sm.score;
        sumPos += sm.positionScore;
        sumRel += sm.relationScore;
      } else {
        match.push({
          readingIndex: reading.index,
          label: reading.label,
          analysisIndex: -1,
          score: 0,
          positionScore: 0,
          relationScore: 0,
          cmp: null
        });
      }
    });

    var total = Math.round(sumScore / N);
    var subPos = Math.round(sumPos / N);
    var subRel = Math.round(sumRel / N);

    var allErrors = [];
    match.forEach(function (mt) {
      if (mt.cmp) {
        allErrors = allErrors.concat(buildErrors(mt.cmp, R.readings[mt.readingIndex]));
      }
    });

    // k < N：追加 sx_ambig（k=0 已在上面按空答处理）
    if (filled.length < N) {
      allErrors.push(GC.err('syntax', 'sx_ambig', {
        detail: '本题有 ' + N + ' 种读法，你只分析了 ' + filled.length + ' 种（' +
          R.readings.map(function (r) { return r.label; }).join(' / ') + '）。可点「＋ 新增一种分析」补齐。',
        expected: N,
        got: filled.length
      }));
    }

    return GC.makeResult({
      score: total,
      passScore: passScore,
      sub: subOf(subPos, subRel),
      errors: allErrors,
      summary: allErrors.length ? GC.summarize(allErrors) : '全部正确',
      review: {
        readingMatch: match.map(function (mt) {
          return {
            readingIndex: mt.readingIndex,
            label: mt.label,
            analysisIndex: mt.analysisIndex,
            score: mt.score
          };
        }),
        stdTrees: R.readings.map(function (r) { return r.pretty; }),
        readings: R.readings.map(function (r) {
          return { index: r.index, label: r.label, meaning: r.meaning };
        }),
        analysisCount: filled.length,
        readingCount: N,
        // 兼容：app 若用 review.gaps 做简单高亮，就给第一种读法匹配分析的
        gaps: (match[0] && match[0].cmp) ? match[0].cmp.gapStatus : {},
        stdTree: R.readings[0] ? R.readings[0].pretty : ''
      }
    });
  }

  window.GRADERS = window.GRADERS || {};
  window.GRADERS.syntax = gradeSyntax;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = gradeSyntax;
  }
})();
