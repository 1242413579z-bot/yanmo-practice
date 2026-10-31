/* ============================================================
   practice/js/pages/stats.js — 统计复盘
   ============================================================ */
(function () {
  'use strict';
  window.PAGES = window.PAGES || {};
  var U = window.util, S = window.Store, UI = window.UI;
  var TYPES = ['syntax', 'ipa', 'sememe', 'translate', 'punct'];
  var LABEL = { syntax: '句法分析', ipa: '国际音标', sememe: '义素分析', translate: '古文翻译', punct: '句读标点' };

  PAGES.stats = function (root) {
    var page = UI.el('div', { class: 'page stats-page' });
    var stats = S.stats();
    var attempts = S.state.attempts;

    var head = UI.el('div', { class: 'page-head' }, [
      UI.el('div', {}, [
        UI.el('h2', { class: 'page-title' }, '统计复盘'),
        UI.el('div', { class: 'page-sub' }, '每次提交都会记录：分数、错因、用时。数据只存在这台电脑的浏览器里。')
      ])
    ]);
    page.appendChild(head);

    /* KPI */
    var kpis = UI.el('div', { class: 'kpi-grid' });
    var avg = stats.total ? Math.round(stats.correct / stats.total * 100) : 0;
    var totalMs = attempts.reduce(function (s, a) { return s + (a.timeMs || 0); }, 0);
    kpis.appendChild(kpi('累计作答', stats.total, '次'));
    kpis.appendChild(kpi('平均正确率', stats.total ? avg : '—', '%'));
    kpis.appendChild(kpi('连续练习', S.streak(), '天'));
    kpis.appendChild(kpi('待巩固错题', S.wrongList().length, '道'));
    kpis.appendChild(kpi('累计用时', Math.round(totalMs / 60000), '分钟'));
    page.appendChild(kpis);

    /* 两列：题型正确率 + 近 14 天 */
    var two = UI.el('div', { class: 'grid-2', style: { marginTop: '4px' } });
    two.appendChild(typeRateCard(stats));
    two.appendChild(dayCard());
    page.appendChild(two);

    /* 错误类型分布 */
    page.appendChild(errCard(stats));

    /* 考点掌握度 */
    page.appendChild(tagCard());

    root.appendChild(page);
  };

  function kpi(label, value, unit) {
    return UI.el('div', { class: 'kpi' }, [
      UI.el('div', { class: 'kpi-label' }, label),
      UI.el('div', { class: 'kpi-value' }, [String(value), UI.el('small', {}, unit)])
    ]);
  }

  function typeRateCard(stats) {
    var card = UI.el('div', { class: 'card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, '各题型正确率'));
    TYPES.forEach(function (t) {
      var s = stats.byType[t];
      if (!s) {
        card.appendChild(UI.el('div', { class: 'hbar' }, [
          UI.el('span', { class: 'hbar-label' }, LABEL[t]),
          UI.el('div', { class: 'hbar-track' }, UI.el('i', { style: { width: '0%' } })),
          UI.el('span', { class: 'hbar-val faint' }, '未做')
        ]));
        return;
      }
      var rate = Math.round(s.c / s.n * 100);
      card.appendChild(UI.el('div', { class: 'hbar' }, [
        UI.el('span', { class: 'hbar-label' }, LABEL[t]),
        UI.el('div', { class: 'hbar-track' }, UI.el('i', { class: rate >= 80 ? 'good' : rate >= 60 ? 'warn' : 'bad', style: { width: rate + '%' } })),
        UI.el('span', { class: 'hbar-val' }, rate + '%'),
        UI.el('span', { class: 'tiny faint' }, '(' + s.n + ' 次)')
      ]));
    });
    return card;
  }

  function dayCard() {
    var card = UI.el('div', { class: 'card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, '近 14 天练习量'));
    var days = S.recentDays(14);
    var max = Math.max.apply(null, days.map(function (d) { return d.count; }).concat([1]));
    var bars = UI.el('div', { class: 'daybars' });
    days.forEach(function (d) {
      var h = Math.round(d.count / max * 100);
      var col = UI.el('div', { class: 'daybar', title: d.key + '：' + d.count + ' 题' }, [
        UI.el('div', { class: 'daybar-fill' + (d.count ? '' : ' is-empty'), style: { height: Math.max(2, h) + '%' } }),
        UI.el('div', { class: 'daybar-label' }, d.key.slice(5))
      ]);
      bars.appendChild(col);
    });
    card.appendChild(bars);
    var total = days.reduce(function (s, d) { return s + d.count; }, 0);
    card.appendChild(UI.el('div', { class: 'tiny faint', style: { marginTop: '8px' } }, '14 天共 ' + total + ' 题' + (total ? '，日均 ' + (total / 14).toFixed(1) + ' 题' : '')));
    return card;
  }

  function errCard(stats) {
    var card = UI.el('div', { class: 'card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, ['错误类型分布', UI.el('small', { class: 'tiny faint' }, '按提交次数统计，一次作答可命中多个错因')]));
    var entries = Object.keys(stats.byCode).map(function (code) {
      var meta = null, owner = null;
      Object.keys(LABEL).forEach(function (t) { if (!meta) { var m = window.errMeta(t, code); if (m) { meta = m; owner = t; } } });
      if (!meta) { meta = window.errMeta('common', code); owner = 'common'; }
      return { code: code, name: (meta && meta.name) || code, type: owner, n: stats.byCode[code], meta: meta };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 14);
    if (!entries.length) {
      card.appendChild(UI.empty('还没有错因数据', '做错几道题后这里会显示错因分布'));
      return card;
    }
    var max = entries[0].n;
    entries.forEach(function (e) {
      var row = UI.el('div', { class: 'hbar' }, [
        UI.el('span', { class: 'hbar-label err-label' }, e.name),
        UI.el('div', { class: 'hbar-track' }, UI.el('i', { class: 'bad', style: { width: Math.round(e.n / max * 100) + '%' } })),
        UI.el('span', { class: 'hbar-val' }, e.n + ' 次'),
        UI.el('span', { class: 'badge tiny' }, e.type === 'common' ? '通用' : (LABEL[e.type] || e.type))
      ]);
      row.title = (e.meta && e.meta.desc) || '';
      card.appendChild(row);
    });
    card.appendChild(UI.el('p', { class: 'small faint', style: { marginTop: '10px' } }, '点开错题本可以看到每个错因对应的具体题目。'));
    return card;
  }

  function tagCard() {
    var card = UI.el('div', { class: 'card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, ['考点掌握度', UI.el('small', { class: 'tiny faint' }, '按题目标签汇总，颜色越绿掌握越好，朱红=待巩固')]));
    var map = {};
    Object.keys(window.PRACTICE_DATA || {}).forEach(function (t) {
      (window.PRACTICE_DATA[t] || []).forEach(function (q) {
        var ids = S.state.attempts.filter(function (a) { return a.qid === q.id; });
        if (!ids.length) return;
        var correct = ids.filter(function (a) { return a.correct; }).length;
        (q.tags || []).forEach(function (tag) {
          var key = tag;
          var m = map[key] || { n: 0, c: 0, type: t };
          m.n += ids.length; m.c += correct;
          map[key] = m;
        });
      });
    });
    var keys = Object.keys(map).sort(function (a, b) { return map[b].n - map[a].n; });
    if (!keys.length) { card.appendChild(UI.empty('还没有考点数据', '做过题后这里会显示各考点掌握度', '🎯')); return card; }
    var grid = UI.el('div', { class: 'tag-heat' });
    keys.slice(0, 30).forEach(function (k) {
      var m = map[k], rate = Math.round(m.c / m.n * 100);
      var cls = rate >= 85 ? 'lv4' : rate >= 70 ? 'lv3' : rate >= 50 ? 'lv2' : 'lv1';
      grid.appendChild(UI.el('div', { class: 'tag-heat-item ' + cls, title: k + '：' + m.n + ' 次，正确率 ' + rate + '%' }, [
        UI.el('span', {}, k),
        UI.el('b', {}, rate + '%')
      ]));
    });
    card.appendChild(grid);
    return card;
  }
})();
