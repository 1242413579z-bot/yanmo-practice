/* ============================================================
   practice/js/pages/review.js — 错题重练
   ============================================================ */
(function () {
  'use strict';
  window.PAGES = window.PAGES || {};
  var U = window.util, S = window.Store, UI = window.UI;
  var LABEL = { syntax: '句法分析', ipa: '国际音标', sememe: '义素分析', translate: '古文翻译', punct: '句读标点' };
  var qmap = null;
  function buildMap() {
    qmap = {};
    Object.keys(window.PRACTICE_DATA || {}).forEach(function (t) {
      (window.PRACTICE_DATA[t] || []).forEach(function (q) { qmap[q.id] = q; });
    });
    return qmap;
  }

  PAGES.review = function (root) {
    buildMap();
    var page = UI.el('div', { class: 'page review-page' });
    var wrong = S.wrongList();
    var byType = {};
    wrong.forEach(function (w) { byType[w.type] = (byType[w.type] || 0) + 1; });

    var head = UI.el('div', { class: 'page-head' }, [
      UI.el('div', {}, [
        UI.el('h2', { class: 'page-title' }, '错题重练'),
        UI.el('div', { class: 'page-sub' }, '低于满分自动进队列；某题连续两次满分后自动移出。队列 ' + wrong.length + ' 道。')
      ]),
      UI.el('div', { class: 'spacer' })
    ]);
    var aiBtn = UI.el('button', { class: 'btn btn--gold' }, '✦ AI 生成复习计划');
    aiBtn.addEventListener('click', function () { runPlan(aiWrap); });
    head.appendChild(aiBtn);
    page.appendChild(head);

    // 筛选
    var filter = { type: 'all', code: 'all' };
    var bar = UI.el('div', { class: 'review-bar' });
    var chipsWrap = UI.el('div', { class: 'chip-group' });
    function renderChips() {
      UI.clear(chipsWrap);
      chipsWrap.appendChild(makeChip('全部 ' + wrong.length, 'all', filter.type === 'all', function () { filter.type = 'all'; renderChips(); renderList(); }));
      Object.keys(byType).forEach(function (t) {
        chipsWrap.appendChild(makeChip((LABEL[t] || t) + ' ' + byType[t], t, filter.type === t, function () { filter.type = t; renderChips(); renderList(); }));
      });
    }
    function makeChip(label, value, active, onPick) {
      var b = UI.el('button', { class: 'chip' + (active ? ' is-active' : '') }, label);
      b.addEventListener('click', onPick);
      return b;
    }
    renderChips();
    bar.appendChild(chipsWrap);
    page.appendChild(bar);

    var aiWrap = UI.el('div', { class: 'ai-area' });
    page.appendChild(aiWrap);

    var listWrap = UI.el('div', { class: 'review-list' });
    page.appendChild(listWrap);

    function renderList() {
      UI.clear(listWrap);
      var list = wrong.filter(function (w) { return filter.type === 'all' || w.type === filter.type; });
      if (!list.length) {
        listWrap.appendChild(UI.el('div', { class: 'card' }, [UI.empty('错题本是空的', '去刷几道题，错题会自动进队', '📖')]));
        return;
      }
      var card = UI.el('div', { class: 'card card--tight' });
      list.forEach(function (w) {
        var q = qmap[w.qid];
        if (!q) return;
        var title = q.sentence || q.text || ((q.words || []).join('、')) || q.prompt || w.qid;
        var codes = (w.codes || []).slice(0, 4).map(function (code) {
          var meta = (window.errMeta && window.errMeta(w.type, code)) || (window.errMeta && window.errMeta('common', code));
          return UI.el('span', { class: 'badge badge--red' }, (meta && meta.name) || code);
        });
        var item = UI.el('div', { class: 'review-item' }, [
          UI.el('div', { class: 'review-main' }, [
            UI.el('div', { class: 'row-wrap' }, [
              UI.el('span', { class: 'badge badge--solid' }, LABEL[w.type] || w.type),
              UI.el('span', { class: 'badge' }, '最近 ' + w.score + ' 分'),
              q.source && q.source.real ? UI.el('span', { class: 'badge badge--real' }, (q.source.school || '') + ' ' + (q.source.year || '')) : UI.el('span', { class: 'badge badge--mock' }, '模拟'),
              UI.el('span', { class: 'tiny faint' }, '练过 ' + w.attempts + ' 次 · ' + U.formatDate(w.ts))
            ]),
            UI.el('div', { class: 'review-title' }, String(title).slice(0, 60)),
            UI.el('div', { class: 'chip-group', style: { marginTop: '6px' } }, codes)
          ]),
          UI.el('div', { class: 'list-side' }, [
            UI.el('button', {
              class: 'btn btn--sm btn--primary',
              onclick: function () { window.App.go(w.type, q.id); }
            }, '重练'),
            UI.el('button', {
              class: 'btn btn--sm btn--ghost',
              title: '移出错题本',
              onclick: function () {
                S.removeWrong(w.qid);
                UI.toast('已移出队列');
                PAGES.review(root);
              }
            }, '移出')
          ])
        ]);
        card.appendChild(item);
      });
      listWrap.appendChild(card);
    }
    renderList();
    root.appendChild(page);
  };

  function runPlan(aiWrap) {
    var wrong = S.wrongList();
    if (!wrong.length) { UI.toast('错题本是空的，先错几道再来', 'bad'); return; }
    var summary = { total: wrong.length, byType: {}, byCode: {} };
    wrong.forEach(function (w) {
      summary.byType[w.type] = (summary.byType[w.type] || 0) + 1;
      (w.codes || []).forEach(function (c) { summary.byCode[c] = (summary.byCode[c] || 0) + 1; });
    });
    var recent = wrong.slice(0, 12).map(function (w) {
      var q = qmap && qmap[w.qid];
      return { type: w.type, score: w.score, codes: w.codes, text: String((q && (q.sentence || q.text || q.words || q.prompt)) || '').slice(0, 40) };
    });
    UI.clear(aiWrap);
    if (!window.AI || !AI.configured()) {
      // 离线版建议
      var top = Object.keys(summary.byCode).sort(function (a, b) { return summary.byCode[b] - summary.byCode[a]; }).slice(0, 3);
      aiWrap.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-title' }, '离线诊断'),
        UI.el('p', { class: 'small muted' }, '错题集中在：' + Object.keys(summary.byType).map(function (t) { return (LABEL[t] || t) + ' ' + summary.byType[t]; }).join('、')),
        UI.el('p', { class: 'small muted' }, '高频错因：' + top.map(function (c) {
          var meta = null;
          Object.keys(LABEL).forEach(function (t) { meta = meta || window.errMeta(t, c); });
          return (meta && meta.name || c) + '×' + summary.byCode[c];
        }).join('、')),
        UI.el('p', { class: 'small faint' }, '配好 DeepSeek API Key 后可生成针对性 3 天计划。')
      ]));
      return;
    }
    var box = UI.el('div', { class: 'ai-box' });
    box.appendChild(UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), 'AI 正在诊断…']));
    aiWrap.appendChild(box);
    AI.reviewPlan(summary, recent).then(function (r) {
      UI.clear(aiWrap);
      if (!r || !r.ok) {
        aiWrap.appendChild(UI.el('div', { class: 'notice notice--bad' }, (r && r.message) || 'AI 不可用'));
        return;
      }
      var j = r.json || {};
      var card = UI.el('div', { class: 'card ai-box' });
      card.appendChild(UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), 'AI 复习诊断']));
      if (j.diagnosis) card.appendChild(UI.el('p', { class: 'bold' }, j.diagnosis));
      if (j.focus && j.focus.length) card.appendChild(UI.el('div', { class: 'chip-group', style: { margin: '8px 0' } }, j.focus.map(function (f) { return UI.el('span', { class: 'tag' }, f); })));
      (j.plan || []).forEach(function (p) {
        card.appendChild(UI.el('div', { class: 'kv' }, [UI.el('span', { class: 'k' }, p.day || ''), UI.el('span', { class: 'v' }, p.task || '')]));
      });
      if (j.tip) card.appendChild(UI.el('p', { class: 'small faint', style: { marginTop: '8px' } }, j.tip));
      aiWrap.appendChild(card);
    });
  }
})();
