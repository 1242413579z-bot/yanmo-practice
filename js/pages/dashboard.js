/* ============================================================
   practice/js/pages/dashboard.js — 首页
   ============================================================ */
(function () {
  'use strict';
  window.PAGES = window.PAGES || {};
  var U = window.util, S = window.Store, UI = window.UI;

  var TYPES = ['syntax', 'ipa', 'sememe', 'translate', 'punct'];
  var META = {
    syntax: { label: '句法分析', sub: '层次分析法 · 逐刀判分', icon: 'syntax', desc: '位置分 + 关系分分开给，漏切/多切/词内误切/关系错/层次错逐处列出' },
    ipa: { label: '国际音标', sub: '注音 + 音位分析', icon: 'ipa', desc: '音标面板点选 + 数字声调，词语/句子/诗歌注音，含音位变体与发音特征小题' },
    sememe: { label: '义素分析', sub: '义素矩阵 · 逐列比对', icon: 'sememe', desc: '自己设义素列、点格子填 +/−，与标准矩阵逐列对照' },
    translate: { label: '古文翻译', sub: '采分点判分', icon: 'translate', desc: '原文与译文对照，按采分点覆盖率即时判分' },
    punct: { label: '句读标点', sub: '标点弹窗 · 断点判分', icon: 'punct', desc: '点字缝弹标点面板，断点位置分 + 标点类型分' }
  };

  function typeStats(type) {
    var all = (window.PRACTICE_DATA[type] || []);
    var done = 0, attempts = 0, correct = 0;
    all.forEach(function (q) {
      var st = S.qstat(q.id);
      if (st) { done += 1; attempts += st.attempts; correct += st.correct; }
    });
    return {
      total: all.length, done: done,
      rate: attempts ? Math.round(correct / attempts * 100) : null,
      wrong: S.wrongList(type).length
    };
  }

  PAGES.home = function (root) {
    var page = UI.el('div', { class: 'page home-page' });
    var today = S.today();
    var stats = S.stats();

    /* Hero */
    var hero = UI.el('div', { class: 'home-hero' });
    var heroL = UI.el('div', { class: 'hero-main' });
    heroL.appendChild(UI.el('div', { class: 'hero-kicker' }, '语言学考研 · 五大操作题'));
    heroL.appendChild(UI.el('h1', { class: 'hero-title' }, ['研墨', UI.el('span', { class: 'hero-accent' }, ' · 把每一刀切明白')]));
    heroL.appendChild(UI.el('p', { class: 'hero-sub' }, '句法分析 / 义素分析 / 国际音标 / 古文翻译 / 句读标点。内置题库、逐刀判分、错因归类，离线也能刷。'));
    var heroBtns = UI.el('div', { class: 'btn-row', style: { marginTop: '16px' } });
    var startType = pickStartType();
    heroBtns.appendChild(UI.el('a', { class: 'btn btn--primary btn--lg', href: '#/' + startType.type }, '继续刷题 · ' + META[startType.type].label));
    heroBtns.appendChild(UI.el('a', { class: 'btn btn--ghost', href: '#/review' }, '错题重练（' + S.wrongList().length + '）'));
    heroBtns.appendChild(UI.el('a', { class: 'btn btn--ghost', href: '#/stats' }, '统计复盘'));
    heroL.appendChild(heroBtns);
    hero.appendChild(heroL);

    var heroR = UI.el('div', { class: 'hero-side' });
    heroR.appendChild(kpiBox('今日练习', today.count, '题'));
    heroR.appendChild(kpiBox('今日正确率', today.count ? Math.round(today.correct / today.count * 100) : '—', '%'));
    heroR.appendChild(kpiBox('连续练习', S.streak(), '天'));
    hero.appendChild(heroR);
    page.appendChild(hero);

    /* 题型分区 */
    page.appendChild(UI.el('div', { class: 'section-title' }, ['五大题型', UI.el('small', {}, '按考点/来源筛选，真题均已标注学校年份')]));
    var grid = UI.el('div', { class: 'type-grid' });
    TYPES.forEach(function (t) {
      var m = META[t], st = typeStats(t);
      var card = UI.el('a', { class: 'card type-card type-card--' + t, href: '#/' + t });
      var hd = UI.el('div', { class: 'type-card-hd' }, [
        UI.el('div', { class: 'type-ico' }, UI.icon(m.icon)),
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'type-name' }, m.label),
          UI.el('div', { class: 'tiny faint' }, m.sub)
        ]),
        UI.el('span', { class: 'badge' }, st.total + ' 题')
      ]);
      card.appendChild(hd);
      card.appendChild(UI.el('p', { class: 'type-desc' }, m.desc));
      var meta = UI.el('div', { class: 'type-meta' });
      meta.appendChild(UI.el('span', {}, '已做 ' + st.done + ' / ' + st.total));
      if (st.rate != null) meta.appendChild(UI.el('span', { class: 'ok-chip' }, '正确率 ' + st.rate + '%'));
      if (st.wrong) meta.appendChild(UI.el('span', { class: 'badge badge--red' }, '错题 ' + st.wrong));
      card.appendChild(meta);
      card.appendChild(UI.progress(st.total ? Math.round(st.done / st.total * 100) : 0, 'good'));
      grid.appendChild(card);
    });
    page.appendChild(grid);

    /* 两条：最近 / 建议 */
    var two = UI.el('div', { class: 'grid-2', style: { marginTop: '18px' } });
    two.appendChild(recentCard());
    two.appendChild(adviceCard(stats));
    page.appendChild(two);

    /* 题库构成 */
    var notice = UI.el('div', { class: 'notice', style: { marginTop: '18px' } });
    notice.appendChild(UI.el('div', {}, [
      UI.el('b', {}, '题库构成：'),
      '真题标注学校、年份与科目代码；教材题标注教材版次与章节题号；其余为模拟题。完整来源清单见 docs/真题来源.md。',
      UI.el('a', { href: '#/settings', style: { marginLeft: '6px' } }, '查看完整说明 →')
    ]));
    page.appendChild(notice);

    root.appendChild(page);
  };

  function pickStartType() {
    var best = { type: 'syntax', done: 0 };
    TYPES.forEach(function (t) {
      var st = typeStats(t);
      if (st.done < st.total) {
        // 优先继续做过但没刷完的题型
        if (st.done > 0) { if (st.done > best.done) best = { type: t, done: st.done }; }
      }
    });
    return best;
  }

  function kpiBox(label, value, unit) {
    return UI.el('div', { class: 'kpi hero-kpi' }, [
      UI.el('div', { class: 'kpi-label' }, label),
      UI.el('div', { class: 'kpi-value' }, [String(value), UI.el('small', {}, unit || '')])
    ]);
  }

  function recentCard() {
    var card = UI.el('div', { class: 'card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, ['最近练习', UI.el('small', { class: 'tiny faint' }, '最近 8 条记录')]));
    var attempts = S.state.attempts.slice(-8).reverse();
    if (!attempts.length) {
      card.appendChild(UI.empty('还没有练习记录', '从任意一个题型开始吧', '🖌️'));
      return card;
    }
    var list = UI.el('div', { class: 'list' });
    var qmap = {};
    TYPES.forEach(function (t) { (window.PRACTICE_DATA[t] || []).forEach(function (q) { qmap[q.id] = q; }); });
    attempts.forEach(function (a) {
      var q = qmap[a.qid];
      var title = q ? (q.sentence || q.text || (q.words || []).join('、') || q.prompt || a.qid) : a.qid;
      list.appendChild(UI.el('div', { class: 'list-item' }, [
        UI.el('div', { class: 'list-main' }, [
          UI.el('div', { class: 'list-title' }, '[' + (META[a.type] ? META[a.type].label : a.type) + '] ' + String(title).slice(0, 30)),
          UI.el('div', { class: 'list-sub' }, U.formatDateTime(a.ts) + (a.errors && a.errors.length ? ' · ' + a.errors.length + ' 处问题' : ''))
        ]),
        UI.el('span', { class: 'badge ' + (a.correct ? 'badge--jade' : 'badge--red') }, a.score + ' 分')
      ]));
    });
    card.appendChild(list);
    return card;
  }

  function adviceCard(stats) {
    var card = UI.el('div', { class: 'card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, ['今天练什么', UI.el('small', { class: 'tiny faint' }, '根据你的错题自动建议')]));
    var wrong = S.wrongList();
    if (!wrong.length && !stats.total) {
      card.appendChild(UI.el('p', { class: 'small muted' }, '先各做几道，系统据作答生成薄弱点建议。'));
      card.appendChild(UI.el('a', { class: 'btn btn--primary', href: '#/syntax', style: { marginTop: '10px' } }, '从「句法分析」开始'));
      return card;
    }
    if (wrong.length) {
      var byType = {};
      wrong.forEach(function (w) { byType[w.type] = (byType[w.type] || 0) + 1; });
      var arr = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; });
      card.appendChild(UI.el('p', { class: 'small muted' }, '当前待巩固 ' + wrong.length + ' 道，集中在：' + arr.map(function (t) { return (META[t] ? META[t].label : t) + ' ' + byType[t]; }).join('、')));
      card.appendChild(UI.el('a', { class: 'btn btn--primary btn--sm', href: '#/review', style: { marginTop: '10px' } }, '去错题重练'));
    }
    // 错因 top
    var codeCount = {};
    S.state.attempts.slice(-80).forEach(function (a) { (a.codes || []).forEach(function (c) { codeCount[c] = (codeCount[c] || 0) + 1; }); });
    var top = Object.keys(codeCount).sort(function (a, b) { return codeCount[b] - codeCount[a]; }).slice(0, 4);
    if (top.length) {
      var wrap = UI.el('div', { class: 'chip-group', style: { marginTop: '12px' } });
      top.forEach(function (code) {
        var meta = null;
        TYPES.forEach(function (t) { meta = meta || window.errMeta(t, code); });
        meta = meta || window.errMeta('common', code);
        wrap.appendChild(UI.el('span', { class: 'badge badge--red' }, (meta && meta.name || code) + ' ×' + codeCount[code]));
      });
      card.appendChild(UI.el('div', { class: 'tiny faint', style: { marginTop: '12px' } }, '近期高频错因'));
      card.appendChild(wrap);
    }
    return card;
  }
})();
