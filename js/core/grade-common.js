/* ============================================================================
   practice/js/core/grade-common.js — 判分公共库（纯函数，可被 Node 单测）
   - 关系标签归一/兼容
   - 层次分析树解析、刀位提取、用户答案 vs 标准树比较
   - 国际音标归一与音节解析
   - 标点序列解析与比较
   - 采分点覆盖率
   ========================================================================== */
(function () {
  'use strict';
  var U = window.util;

  /* ---------------- 关系标签 ---------------- */
  var REL_SINGLE = ['主谓', '述宾', '偏正', '中补', '联合', '连谓', '兼语', '双宾', '介宾', '数量', '方位', '同位', '的字短语', '比况', '量词', '定中', '状中', '动语'];
  var REL_COMPOUND = ['并列', '承接', '递进', '选择', '转折', '因果', '假设', '条件', '目的', '让步', '解说', '总分', '分总'];

  // 每个标准标签可接受的用户写法（归一后）
  var REL_ALIAS = {
    '主谓': ['主谓', '主谓结构', '主谓句', '主谓短语'],
    '述宾': ['述宾', '动宾', '述宾结构', '动宾结构', '述宾短语', '动宾短语', '宾语', '述语'],
    '偏正': ['偏正', '偏正结构', '偏正短语', '定中', '状中', '定中结构', '状中结构', '修饰'],
    '定中': ['定中', '偏正', '定语', '定中结构'],
    '状中': ['状中', '偏正', '状语', '状中结构'],
    '中补': ['中补', '述补', '动补', '中补结构', '述补结构', '动补结构', '补语'],
    '联合': ['联合', '联合结构', '联合短语', '并列', '并列结构'],
    '连谓': ['连谓', '连动', '连谓结构', '连动结构', '连谓短语'],
    '兼语': ['兼语', '兼语式', '兼语结构', '兼语短语'],
    '双宾': ['双宾', '双宾语', '双宾句', '双宾结构'],
    '介宾': ['介宾', '介词短语', '介词结构', '介宾短语', '介宾结构'],
    '数量': ['数量', '数量短语', '数量词', '数量结构', '数量名'],
    '方位': ['方位', '方位短语', '方位结构', '方位词'],
    '同位': ['同位', '同位短语', '同位语', '复指', '复指短语'],
    '的字短语': ['的字短语', '的字结构', '字短语', '“的”字短语', '所字短语'],
    '比况': ['比况', '比况短语', '比况结构'],
    '量词': ['量词', '量词短语', '数量'],
    '并列': ['并列', '并列关系', '联合'],
    '承接': ['承接', '顺承', '连贯', '承接关系'],
    '递进': ['递进', '递进关系'],
    '选择': ['选择', '选择关系'],
    '转折': ['转折', '转折关系'],
    '因果': ['因果', '因果关系', '原因', '结果'],
    '假设': ['假设', '假设关系', '条件假设'],
    '条件': ['条件', '条件关系'],
    '目的': ['目的', '目的关系'],
    '让步': ['让步', '让步关系', '让步转折'],
    '解说': ['解说', '解说关系', '总分', '分总'],
    '总分': ['总分', '总说分说', '解说'],
    '分总': ['分总', '分说总说', '解说']
  };
  function cleanRel(label) {
    return U.norm(label || '').replace(/[（）()【】\[\]「」『』:：]/g, '').replace(/结构|短语|关系/g, '').trim();
  }
  function relCanon(label) {
    var c = cleanRel(label);
    if (REL_SINGLE.indexOf(c) >= 0 || REL_COMPOUND.indexOf(c) >= 0) return c;
    // 常见别名
    var map = {
      '动宾': '述宾', '述补': '中补', '动补': '中补', '连动': '连谓', '兼语式': '兼语',
      '双宾语': '双宾', '介词短语': '介宾', '的字结构': '的字短语', '定语': '定中', '状语': '状中',
      '中补结构': '中补', '联合结构': '联合', '偏正结构': '偏正', '主谓结构': '主谓'
    };
    return map[c] || c;
  }
  function relCompatible(stdLabel, userLabel) {
    var std = relCanon(stdLabel), user = relCanon(userLabel);
    if (!std || !user) return false;
    if (std === user) return true;
    var aliases = REL_ALIAS[stdLabel] || REL_ALIAS[std] || [];
    for (var i = 0; i < aliases.length; i++) {
      if (relCanon(aliases[i]) === user) return true;
    }
    // 细类 → 粗类：标准写「定中/状中」，用户写「偏正」也接受
    if ((std === '定中' || std === '状中') && user === '偏正') return true;
    return false;
  }

  /* ---------------- 层次分析树 ---------------- */
  function parseTree(src) {
    var tokens = String(src || '').match(/[()]|[^\s()]+/g);
    if (!tokens || !tokens.length) return { ok: false, err: '空树' };
    var i = 0;
    function node() {
      if (tokens[i] !== '(') throw new Error('应为 "("');
      i++;
      var label = tokens[i++];
      if (!label) throw new Error('缺少标签');
      var children = [];
      while (tokens[i] && tokens[i] !== ')') {
        if (tokens[i] === '(') children.push(node());
        else children.push(tokens[i++]);
      }
      if (tokens[i] !== ')') throw new Error('括号不匹配');
      i++;
      if (children.length < 2) throw new Error('节点「' + label + '」子节点不足');
      return { label: label, children: children };
    }
    try {
      var root = node();
      if (i !== tokens.length) throw new Error('树后有多余内容');
      return { ok: true, root: root };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }
  function treeLeaves(root, out) {
    out = out || [];
    (function walk(n) {
      if (typeof n === 'string') { out.push(n); return; }
      n.children.forEach(walk);
    })(root);
    return out;
  }
  // 刀位：{gap: 字偏移, label, span:[start,end], nary}
  function treeCuts(root) {
    var out = [];
    function spanInfo(n) {
      if (typeof n === 'string') return { leaves: 1, chars: n.length };
      var l = 0, c = 0;
      n.children.forEach(function (ch) { var s = spanInfo(ch); l += s.leaves; c += s.chars; });
      return { leaves: l, chars: c };
    }
    function rec(n, charStart) {
      if (typeof n === 'string') return;
      var infos = n.children.map(spanInfo);
      var total = infos.reduce(function (s, x) { return s + x.chars; }, 0);
      var acc = 0;
      for (var k = 0; k < n.children.length; k++) {
        if (k > 0) out.push({ gap: charStart + acc, label: n.label, span: [charStart, charStart + total], nary: n.children.length > 2 });
        rec(n.children[k], charStart + acc);
        acc += infos[k].chars;
      }
    }
    rec(root, 0);
    return out;
  }
  function wordBoundaries(root) {
    var leaves = treeLeaves(root), out = [], pos = 0;
    for (var i = 0; i < leaves.length - 1; i++) { pos += leaves[i].length; out.push(pos); }
    return out;
  }
  // 括号式美化输出：「主谓[ 我们 大家 | 述宾[ ... ] ]」
  function treePretty(node, depth) {
    depth = depth || 0;
    if (typeof node === 'string') return node;
    var inner = node.children.map(function (c) { return treePretty(c, depth + 1); }).join(' | ');
    return node.label + '[' + inner + ']';
  }
  // 结果树（用于渲染）：{label, children} → 扁平节点列表
  function treeNodes(root) {
    var out = [];
    (function walk(n, depth, charStart, spanChars) {
      if (typeof n === 'string') return;
      var infos = n.children.map(function (c) {
        var leaves = treeLeaves(c);
        return { chars: leaves.join('').length, leaves: leaves.length };
      });
      var total = infos.reduce(function (s, x) { return s + x.chars; }, 0);
      out.push({ label: n.label, depth: depth, span: [charStart, charStart + total], chars: total, nary: n.children.length > 2 });
      var acc = 0;
      n.children.forEach(function (c, k) {
        walk(c, depth + 1, charStart + acc, infos[k].chars);
        acc += infos[k].chars;
      });
    })(root, 0, 0);
    return out;
  }

  /**
   * 句法判分核心：比较用户刀位与标准树
   * @param {Array} userCuts [{gap, rel, span?}]
   * @param {Object} root 标准树 root
   */
  function compareSyntax(userCuts, root) {
    var stdCuts = treeCuts(root);
    var wordB = wordBoundaries(root);
    // 叶子区间：用于区分「词内误切」与「多切（切到分句/短语内部、超出分析深度）」
    var leaves = treeLeaves(root);
    var leafSpans = [], pos = 0;
    for (var li = 0; li < leaves.length; li++) {
      leafSpans.push({ start: pos, end: pos + leaves[li].length, len: leaves[li].length, text: leaves[li] });
      pos += leaves[li].length;
    }
    function leafAt(gap) {
      for (var i = 0; i < leafSpans.length; i++) if (gap > leafSpans[i].start && gap < leafSpans[i].end) return leafSpans[i];
      return null;
    }
    var stdMap = {}, userMap = {};
    stdCuts.forEach(function (c) { stdMap[c.gap] = c; });
    (userCuts || []).forEach(function (c) {
      if (!c || typeof c.gap !== 'number') return;
      if (!userMap[c.gap]) userMap[c.gap] = { gap: c.gap, rel: c.rel, span: c.span };
    });
    var allGaps = {};
    Object.keys(stdMap).forEach(function (g) { allGaps[g] = 1; });
    Object.keys(userMap).forEach(function (g) { allGaps[g] = 1; });
    var miss = [], over = [], inword = [], relWrong = [], levelWrong = [], matched = [];
    Object.keys(allGaps).map(Number).sort(function (a, b) { return a - b; }).forEach(function (gap) {
      var s = stdMap[gap], u = userMap[gap];
      if (s && !u) { miss.push({ gap: gap, expected: s.label }); return; }
      if (!s && u) {
        var lf = leafAt(gap);
        // 短叶子（≤6 字，通常是一个词）内部落刀 → 词内误切；长叶子（分句/长短语）内部落刀 → 多切
        if (lf && lf.len <= 6) inword.push({ gap: gap, got: u.rel, leaf: lf.text });
        else over.push({ gap: gap, got: u.rel, leaf: lf ? lf.text : '' });
        return;
      }
      matched.push(gap);
      if (!relCompatible(s.label, u.rel)) relWrong.push({ gap: gap, expected: s.label, got: u.rel });
      if (s && u && u.span && s.span && !s.nary) {
        if (u.span[0] !== s.span[0] || u.span[1] !== s.span[1]) levelWrong.push({ gap: gap, expected: s.span, got: u.span });
      }
    });
    var stdN = stdCuts.length || 1;
    var posRate = (matched.length - 0.5 * over.length - 0.5 * inword.length) / stdN;
    posRate = U.clamp(posRate, 0, 1);
    // 关系分：标签错 + 层次错（同一刀位不重复扣）
    var badGaps = {};
    relWrong.forEach(function (x) { badGaps[x.gap] = 1; });
    levelWrong.forEach(function (x) { badGaps[x.gap] = 1; });
    var badN = Object.keys(badGaps).length;
    var relRate = matched.length ? (matched.length - badN) / matched.length : 0;
    relRate = U.clamp(relRate, 0, 1);
    var positionScore = Math.round(60 * posRate);
    var relationScore = Math.round(40 * relRate);
    var gapStatus = {};
    miss.forEach(function (x) { gapStatus[x.gap] = { status: 'miss', expected: x.expected }; });
    over.forEach(function (x) { gapStatus[x.gap] = { status: 'over', got: x.got }; });
    inword.forEach(function (x) { gapStatus[x.gap] = { status: 'inword', got: x.got }; });
    matched.forEach(function (g) { gapStatus[g] = gapStatus[g] || { status: 'ok' }; });
    relWrong.forEach(function (x) { gapStatus[x.gap] = Object.assign({}, gapStatus[x.gap], { status: 'rel', expected: x.expected, got: x.got }); });
    levelWrong.forEach(function (x) { gapStatus[x.gap] = Object.assign({}, gapStatus[x.gap], { status: 'level', expected: x.expected, got: x.got }); if (gapStatus[x.gap].status === 'rel') gapStatus[x.gap].alsoLevel = true; });
    return {
      stdCuts: stdCuts, userCuts: userMap, wordBoundaries: wordB, leaves: treeLeaves(root),
      miss: miss, over: over, inword: inword, relWrong: relWrong, levelWrong: levelWrong, matched: matched,
      positionScore: positionScore, relationScore: relationScore,
      score: U.clamp(positionScore + relationScore, 0, 100),
      gapStatus: gapStatus
    };
  }

  /* ---------------- 国际音标 ---------------- */
  var IPA_INITIALS = ['tɕʰ', 'tɕ', 'ʈʂʰ', 'ʈʂ', 'tsʰ', 'ts', 'pʰ', 'tʰ', 'kʰ', 'ɖʐ', 'p', 'm', 'f', 't', 'n', 'l', 'k', 'x', 'ɕ', 's', 'ʂ', 'ʐ', 'ŋ', 'ɻ', 'j', 'w', 'ɥ'];
  // 元音符号（含国际音标全元音表常用符号；A 为开央不圆唇元音）
  var IPA_VOWEL_SYMBOLS = 'aiyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒAɚɿʅʮɥ'.split('');
  var IPA_FINAL_CHARS = IPA_VOWEL_SYMBOLS.concat('nŋmɻ̃˞ɹ'.split(''));
  var IPA_VOWELS = IPA_VOWEL_SYMBOLS;
  var TONE_DIGIT_RE = /(214|55|35|51|21|0|1|2|3|4|5)$/;
  function toneToDigits(t) {
    if (!t) return '';
    if (/轻/.test(t)) return '';
    var map = { '˥': '5', '˦': '4', '˧': '3', '˨': '2', '˩': '1' };
    var out = '';
    for (var i = 0; i < t.length; i++) out += (map[t[i]] || (/[0-9]/.test(t[i]) ? t[i] : ''));
    if (out === '0') return ''; // 轻声不标调
    return out;
  }
  function normalizeIPA(s) {
    if (s == null) return '';
    s = String(s).trim();
    s = s.replace(/^[\[【/／\\]+|[\]】/／\\]+$/g, '');
    s = s.replace(/ː/g, '').replace(/\u02D0/g, '');
    s = s.replace(/[，,、;；]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }
  // 'pʰiɛn51' → {initial:'pʰ', final:'iɛn', tone:'51'}
  // 支持儿化写法的两种顺序：'xua55ɚ'（声调在 ɚ 前）与 'xuaɚ55'（声调在末尾）
  // 轻声不标调：没有调值数字时 tone 为空字符串（与旧写法 '0' 等价）
  function parseSyllable(tok) {
    tok = String(tok || '').trim();
    if (!tok) return { ok: false, err: '空音节', raw: tok };
    var erhua = '';
    if (/(ɚ|ɻ)$/.test(tok)) { erhua = tok.slice(-1); tok = tok.slice(0, -1); }
    var tone = '';
    var m = tok.match(/(˥˥|˧˥|˨˩˦|˥˩|˨˩|˥˦|˧˨|˦˨|˨˦|˩˧|[˥˦˧˨˩]{1,5}|214|55|35|51|21|0)$/);
    var body = tok;
    if (m) {
      tone = toneToDigits(m[1]);
      body = tok.slice(0, tok.length - m[1].length).trim();
    }
    if (!tone && !m) {
      // 轻声标记 ʰ? 常见写法 tok 末尾 '.'
      if (/[·.]$/.test(body)) { body = body.replace(/[·.]$/, ''); }
    }
    var initial = '';
    for (var i = 0; i < IPA_INITIALS.length; i++) {
      if (body.indexOf(IPA_INITIALS[i]) === 0) { initial = IPA_INITIALS[i]; body = body.slice(initial.length); break; }
    }
    var final = body + erhua;
    var okChars = final.split('').every(function (c) { return IPA_FINAL_CHARS.indexOf(c) >= 0 || c === 'ʰ'; });
    var hasVowel = IPA_VOWELS.some(function (v) { return final.indexOf(v) >= 0; });
    return {
      ok: !!final && okChars && hasVowel,
      raw: tok + erhua, initial: initial, final: final, tone: tone, erhua: !!erhua,
      neutral: !tone,
      err: !final ? '缺韵母' : (!okChars ? '含非音标字符:' + final : (!hasVowel ? '缺元音' : ''))
    };
  }
  function compareSyllable(std, user) {
    var s = typeof std === 'string' ? parseSyllable(std) : std;
    var u = typeof user === 'string' ? parseSyllable(user) : user;
    var res = { initial: false, final: false, tone: false, normalized: false, parsed: u.ok, std: s, user: u };
    if (!u.ok) {
      // 未解析成功：整体字符串相近也给部分宽容
      res.normalized = normalizeIPA(std.raw || '') === normalizeIPA(user.raw || '');
      return res;
    }
    res.initial = s.initial === u.initial;
    res.final = s.final === u.final;
    res.tone = (s.tone || '') === (u.tone || '');
    res.normalized = res.initial && res.final && res.tone;
    return res;
  }
  // 音节串 → 数组（按空格分）
  function splitSyllables(str) {
    return normalizeIPA(str).split(/\s+/).filter(Boolean);
  }

  /* ---------------- 标点（句读） ---------------- */
  var PUNCT_CLASS = {
    '。': 'end', '！': 'end', '？': 'end',
    '，': 'mid', '；': 'mid', '：': 'mid', '、': 'mid',
    '“': 'quote', '”': 'quote', '‘': 'quote', '’': 'quote', '「': 'quote', '」': 'quote', '『': 'quote', '』': 'quote',
    '《': 'title', '》': 'title', '〈': 'title', '〉': 'title',
    '（': 'bracket', '）': 'bracket', '【': 'bracket', '】': 'bracket',
    '—': 'dash', '…': 'ellipsis', '·': 'dot', '"': 'quote', "'": 'quote'
  };
  var ALL_MARKS = Object.keys(PUNCT_CLASS).join('');
  function isPunct(c) { return !!PUNCT_CLASS[c]; }
  function punctClass(mark) {
    if (!mark) return '';
    for (var i = 0; i < mark.length; i++) {
      var cls = PUNCT_CLASS[mark[i]];
      if (cls) return cls;
    }
    return '';
  }
  function stripPunct(s) {
    var out = '';
    for (var i = 0; i < String(s || '').length; i++) if (!isPunct(s[i])) out += s[i];
    return out;
  }
  // '郢人有遗燕相国书者，夜书。' → {gap:7, marks:'，'}
  function marksOf(answer) {
    var arr = [], gap = 0, buf = '', res = [];
    for (var i = 0; i < String(answer || '').length; i++) {
      var c = answer[i];
      if (isPunct(c)) { buf += c; continue; }
      if (buf) { res.push({ gap: gap, mark: buf }); buf = ''; }
      gap++;
    }
    if (buf) res.push({ gap: gap, mark: buf });
    return res;
  }
  function marksToMap(list) {
    var map = {};
    (list || []).forEach(function (x) {
      var g = x.gap;
      map[g] = (map[g] || '') + (x.mark || '');
    });
    return map;
  }
  function compareMarks(stdAnswer, userMarks) {
    var stdMap = marksToMap(marksOf(stdAnswer));
    var userMap = marksToMap(userMarks);
    var gaps = {};
    Object.keys(stdMap).forEach(function (g) { gaps[g] = 1; });
    Object.keys(userMap).forEach(function (g) { gaps[g] = 1; });
    var miss = [], over = [], typeWrong = [], ok = [];
    Object.keys(gaps).map(Number).sort(function (a, b) { return a - b; }).forEach(function (gap) {
      var s = stdMap[gap] || '', u = userMap[gap] || '';
      if (s && !u) { miss.push({ gap: gap, expected: s }); return; }
      if (!s && u) { over.push({ gap: gap, got: u }); return; }
      if (s === u) { ok.push(gap); return; }
      var sc = punctClass(s), uc = punctClass(u);
      if (sc === uc) { typeWrong.push({ gap: gap, expected: s, got: u, partial: 0.75 }); }
      else { typeWrong.push({ gap: gap, expected: s, got: u, partial: 0 }); }
    });
    var stdBreaks = Object.keys(stdMap).length || 1;
    var posRate = U.clamp((ok.length + typeWrong.length - 0.6 * over.length) / stdBreaks, 0, 1);
    var typeRate = (ok.length + typeWrong.length) ? (ok.length + typeWrong.reduce(function (s, x) { return s + x.partial; }, 0)) / (ok.length + typeWrong.length) : 0;
    return {
      stdMap: stdMap, userMap: userMap, miss: miss, over: over, typeWrong: typeWrong, ok: ok,
      positionScore: Math.round(60 * posRate), typeScore: Math.round(40 * typeRate),
      score: U.clamp(Math.round(60 * posRate) + Math.round(40 * typeRate), 0, 100)
    };
  }

  /* ---------------- 翻译采分点 ---------------- */
  function plainText(s) { return U.norm(s).replace(/[\s，。；：？！、“”‘’（）《》〈〉【】…—·]/g, ''); }
  function coverage(points, userText) {
    var u = plainText(userText);
    var total = 0, got = 0, hitPoints = [], missPoints = [];
    (points || []).forEach(function (p) {
      var w = p.score || 1;
      total += w;
      var kws = (p.keywords || []).concat(p.ref ? [p.ref] : []);
      var hit = kws.some(function (k) { return k && u.indexOf(plainText(k)) >= 0; });
      if (!hit && p.seg && u.indexOf(plainText(p.seg)) >= 0) hit = true;
      if (hit) { got += w; hitPoints.push(p); } else missPoints.push(p);
    });
    return {
      total: total, got: got,
      rate: total ? got / total : 0,
      hitPoints: hitPoints, missPoints: missPoints
    };
  }

  /* ---------------- 通用结果构造 ---------------- */
  function err(type, code, extra) {
    var meta = window.errMeta ? window.errMeta(type, code) : null;
    var e = {
      code: code,
      name: (meta && meta.name) || code,
      short: (meta && meta.short) || code,
      severity: (meta && meta.severity) || 'mid'
    };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function makeResult(opts) {
    var score = U.clamp(Math.round(opts.score || 0), 0, 100);
    var r = {
      score: score,
      passed: score >= (opts.passScore == null ? 80 : opts.passScore),
      sub: opts.sub || [],
      errors: opts.errors || [],
      summary: opts.summary || '',
      review: opts.review || null
    };
    return r;
  }
  // 错因计数摘要：errors → '漏切 1 · 关系错 2'
  function summarize(errors) {
    var m = {};
    (errors || []).forEach(function (e) { var k = e.short || e.name || e.code; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return k + ' ' + m[k]; }).join(' · ');
  }
  function band(score) {
    if (score >= 95) return { tag: '满分', kind: 'gold' };
    if (score >= 80) return { tag: '过关', kind: 'ok' };
    if (score >= 60) return { tag: '差一点', kind: 'warn' };
    return { tag: '需重练', kind: 'bad' };
  }
  function uniqueErrors(errors) {
    var seen = {}, out = [];
    (errors || []).forEach(function (e) {
      var k = e.code + '|' + (e.gap == null ? '' : e.gap) + '|' + (e.detail || '');
      if (!seen[k]) { seen[k] = 1; out.push(e); }
    });
    return out;
  }

  window.GC = {
    REL_SINGLE: REL_SINGLE, REL_COMPOUND: REL_COMPOUND,
    cleanRel: cleanRel, relCanon: relCanon, relCompatible: relCompatible,
    parseTree: parseTree, treeLeaves: treeLeaves, treeCuts: treeCuts, wordBoundaries: wordBoundaries,
    treePretty: treePretty, treeNodes: treeNodes, compareSyntax: compareSyntax,
    IPA: {
      INITIALS: IPA_INITIALS, VOWELS: IPA_VOWELS,
      normalize: normalizeIPA, parseSyllable: parseSyllable, compareSyllable: compareSyllable,
      splitSyllables: splitSyllables, toneToDigits: toneToDigits
    },
    PUNCT: {
      ALL_MARKS: ALL_MARKS, CLASS: PUNCT_CLASS,
      isPunct: isPunct, punctClass: punctClass, stripPunct: stripPunct,
      marksOf: marksOf, marksToMap: marksToMap, compare: compareMarks
    },
    coverage: coverage, plainText: plainText,
    err: err, makeResult: makeResult, summarize: summarize, band: band, uniqueErrors: uniqueErrors
  };
})();
