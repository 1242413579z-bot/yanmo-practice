/* ============================================================
   practice/js/modules/sememe.js — 义素分析矩阵编辑器
   ============================================================ */
(function () {
  'use strict';
  var U = window.util, UI = window.UI;

  function mount(root, ctx) {
    var q = ctx.question;
    var words = q.words || [];
    var state = { cols: [] };
    var solution = null;

    function blankCol() { return { name: '', values: words.map(function () { return ''; }) }; }
    function addCol(name) {
      if (state.cols.length >= 8) { UI.toast('义素列最多 8 个，够用就好'); return; }
      var c = blankCol();
      if (name) c.name = name;
      state.cols.push(c);
      render();
      if (ctx.onChange) ctx.onChange();
    }
    state.cols = [blankCol(), blankCol(), blankCol(), blankCol()];

    var wrap = UI.el('div', { class: 'sm-wrap' });
    root.appendChild(wrap);

    function cycle(v) {
      if (!v) return '+';
      if (v === '+') return '-';
      if (v === '-') return '±';
      return '';
    }

    function render() {
      UI.clear(wrap);
      var tip = UI.el('div', { class: 'notice sm-tip' }, [
        UI.el('b', {}, '怎么填：'), '点「＋义素」新建一列并命名（用肯定项，如「成年」「男性」）；再点格子循环填 ',
        UI.el('span', { class: 'mono' }, '+'), ' / ', UI.el('span', { class: 'mono' }, '−'), ' / ', UI.el('span', { class: 'mono' }, '±'),
        '，空格表示不填。标准答案按「能区分本组全部词的最小义素集合」评分，义素的设置与命名都由你来定。'
      ]);
      wrap.appendChild(tip);

      var scroller = UI.el('div', { class: 'sm-scroller' });
      var table = UI.el('table', { class: 'table sm-table' });
      var thead = UI.el('thead');
      var tr = UI.el('tr');
      tr.appendChild(UI.el('th', { class: 'sm-corner' }, '词 \\ 义素'));
      state.cols.forEach(function (c, ci) {
        var th = UI.el('th', { class: 'sm-th' });
        var inner = UI.el('div', { class: 'sm-th-inner' });
        var input = UI.el('input', {
          class: 'sm-head-input', value: c.name, placeholder: '义素名',
          oninput: function () { c.name = input.value; if (ctx.onChange) ctx.onChange(); }
        });
        inner.appendChild(input);
        var del = UI.el('button', { class: 'sm-del', title: '删除这一列', onclick: function () {
          state.cols.splice(ci, 1);
          if (!state.cols.length) state.cols.push(blankCol());
          render(); if (ctx.onChange) ctx.onChange();
        } }, '×');
        inner.appendChild(del);
        th.appendChild(inner);
        tr.appendChild(th);
      });
      tr.appendChild(UI.el('th', { class: 'sm-th-add' }, UI.el('button', { class: 'btn btn--sm btn--ghost', onclick: function () { addCol(); } }, '＋义素')));
      thead.appendChild(tr);
      table.appendChild(thead);

      var tbody = UI.el('tbody');
      words.forEach(function (w, wi) {
        var row = UI.el('tr');
        row.appendChild(UI.el('th', { class: 'sm-word' }, w));
        state.cols.forEach(function (c, ci) {
          var v = c.values[wi] || '';
          var btn = UI.el('button', {
            class: 'sm-cell' + (v ? ' has-val val-' + (v === '+' ? 'plus' : v === '-' ? 'minus' : 'pm') : ''),
            title: '点击切换 ' + w + ' 的「' + (c.name || '未命名') + '」',
            onclick: function () {
              c.values[wi] = cycle(c.values[wi]);
              render(); if (ctx.onChange) ctx.onChange();
            }
          }, v || '·');
          row.appendChild(UI.el('td', {}, btn));
        });
        row.appendChild(UI.el('td'));
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      scroller.appendChild(table);
      wrap.appendChild(scroller);

      // 不再提供「常用义素」快捷 chip：义素要自己找，这才是义素分析的考点
      var bar = UI.el('div', { class: 'row sm-bar' });
      bar.appendChild(UI.el('button', { class: 'btn btn--sm btn--ghost', onclick: function () {
        state.cols = [blankCol(), blankCol(), blankCol(), blankCol()]; render(); if (ctx.onChange) ctx.onChange();
      } }, '清空重做'));
      bar.appendChild(UI.el('span', { class: 'tiny faint grow' }, '提示：全表同一概念用同一个名字；' + words.length + ' 个词目前 ' + state.cols.length + ' 列，列数按“能区分全部词”的最小集合来定'));
      wrap.appendChild(bar);
    }
    render();

    function getAnswer() {
      return {
        sememes: state.cols.filter(function (c) { return U.norm(c.name); }).map(function (c) {
          return { name: c.name, values: c.values.slice() };
        }),
        words: words.slice()
      };
    }

    return {
      id: 'sememe',
      mount: mount,
      getAnswer: getAnswer,
      setAnswer: function (a) {
        if (!a || !a.sememes) return;
        state.cols = a.sememes.map(function (c) {
          return { name: c.name || '', values: words.map(function (w, i) { return (c.values && c.values[i]) || ''; }) };
        });
        if (!state.cols.length) state.cols = [blankCol()];
        render();
      },
      isAnswered: function () {
        return getAnswer().sememes.some(function (c) { return c.values.some(function (v) { return v; }); });
      },
      reset: function () { state.cols = [blankCol(), blankCol(), blankCol(), blankCol()]; render(); },
      renderSolution: function (rootEl, question, userAnswer) { renderSolution(rootEl, question, userAnswer); },
      renderResultDetail: function (rootEl, question, userAnswer, grade) { renderDetail(rootEl, question, userAnswer, grade); },
      destroy: function () { UI.clear(wrap); }
    };
  }

  function matrixTable(words, cols, opts) {
    opts = opts || {};
    var table = UI.el('table', { class: 'table table--center sm-sol-table' });
    var thead = UI.el('thead');
    var tr = UI.el('tr');
    tr.appendChild(UI.el('th', {}, '词'));
    cols.forEach(function (c) {
      var th = UI.el('th', {}, c.name || '（未命名）');
      if (c.required) th.appendChild(UI.el('span', { class: 'badge badge--gold', style: { marginLeft: '4px' } }, '必答'));
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = UI.el('tbody');
    words.forEach(function (w, wi) {
      var row = UI.el('tr');
      row.appendChild(UI.el('th', {}, w));
      cols.forEach(function (c) {
        var v = (c.values && c.values[wi]) || '';
        row.appendChild(UI.el('td', {}, UI.el('span', { class: 'sm-sym ' + (v === '+' ? 'plus' : v === '-' ? 'minus' : v === '±' ? 'pm' : '') }, v || '—')));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    return table;
  }

  function renderSolution(rootEl, question, userAnswer) {
    var stdCols = (question.sememes || []).map(function (s) {
      return { name: s.name, values: s.values, required: (question.required || []).indexOf(s.name) >= 0 };
    });
    var card = UI.el('div', { class: 'sm-sol' });
    card.appendChild(UI.el('div', { class: 'panel-title' }, '标准义素矩阵'));
    var scroller = UI.el('div', { class: 'sm-scroller' });
    scroller.appendChild(matrixTable(question.words || [], stdCols));
    card.appendChild(scroller);

    if (userAnswer && userAnswer.sememes && userAnswer.sememes.length) {
      var grade = window.GRADERS.sememe(question, userAnswer);
      var review = grade.review || {};
      card.appendChild(UI.el('div', { class: 'panel-title', style: { marginTop: '16px' } }, '你的义素 vs 标准义素'));
      var rows = UI.el('div', { class: 'sm-compare' });
      (question.sememes || []).forEach(function (s, si) {
        var ui = review.matched ? review.matched[si] : null;
        var userName = ui != null && userAnswer.sememes[ui] ? userAnswer.sememes[ui].name : null;
        var badCells = 0;
        if (ui != null && userAnswer.sememes[ui]) {
          var vals = userAnswer.sememes[ui].values || [];
          s.values.forEach(function (v, wi) { if ((vals[wi] || '') !== v) badCells += 1; });
        }
        var status = ui == null ? '缺失' : badCells ? '取值差 ' + badCells + ' 处' : '一致';
        var kind = ui == null ? 'bad' : badCells ? 'warn' : 'ok';
        rows.appendChild(UI.el('div', { class: 'sm-compare-row' }, [
          UI.el('div', { class: 'sm-compare-k' }, '标准「' + s.name + '」'),
          UI.el('div', { class: 'sm-compare-v' }, userName ? '你的「' + userName + '」' : '（没有对应列）'),
          UI.el('span', { class: 'badge ' + (kind === 'ok' ? 'badge--jade' : kind === 'bad' ? 'badge--red' : 'badge--gold') }, status)
        ]));
      });
      if (review.extraColumns && review.extraColumns.length) {
        rows.appendChild(UI.el('div', { class: 'notice', style: { marginTop: '8px' } }, '多出来的列（可能是冗余，或命名与标准不同名）：' + review.extraColumns.join('、')));
      }
      card.appendChild(rows);
    }
    rootEl.appendChild(card);
  }

  function renderDetail(rootEl, question, userAnswer, grade) {
    var review = grade.review || {};
    if (!question.sememes) return;
    var table = UI.el('table', { class: 'table table--center sm-diff-table' });
    var thead = UI.el('thead');
    var tr = UI.el('tr');
    tr.appendChild(UI.el('th', {}, '词'));
    question.sememes.forEach(function (s, si) {
      tr.appendChild(UI.el('th', {}, s.name));
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = UI.el('tbody');
    (question.words || []).forEach(function (w, wi) {
      var row = UI.el('tr');
      row.appendChild(UI.el('th', {}, w));
      question.sememes.forEach(function (s, si) {
        var ui = review.matched ? review.matched[si] : null;
        var userVal = ui != null && userAnswer && userAnswer.sememes[ui] ? (userAnswer.sememes[ui].values[wi] || '') : '';
        var exp = s.values[wi];
        var ok = userVal === exp;
        row.appendChild(UI.el('td', {}, UI.el('span', {
          class: 'sm-sym ' + (ok ? 'ok' : 'bad'),
          title: ok ? '对' : '应为 ' + exp + '，你填 ' + (userVal || '空')
        }, (userVal || '—') + (ok ? '' : ' → ' + exp))));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    var scroller = UI.el('div', { class: 'sm-scroller' });
    scroller.appendChild(table);
    rootEl.appendChild(scroller);
  }

  window.PRACTICE_MODULES = window.PRACTICE_MODULES || {};
  window.PRACTICE_MODULES.sememe = {
    id: 'sememe',
    label: '义素分析',
    mount: function (rootEl, ctx) { var handle = mount(rootEl, ctx); window.__currentModule = handle; return handle; },
    getAnswer: function () { return window.__currentModule.getAnswer(); },
    setAnswer: function (a) { return window.__currentModule.setAnswer(a); },
    isAnswered: function () { return window.__currentModule.isAnswered(); },
    reset: function () { return window.__currentModule.reset(); },
    renderSolution: function (rootEl, q, a) { return window.__currentModule.renderSolution(rootEl, q, a); },
    renderResultDetail: function (rootEl, q, a, g) { return window.__currentModule.renderResultDetail(rootEl, q, a, g); },
    destroy: function () { if (window.__currentModule) window.__currentModule.destroy(); },
    _mount: mount
  };
})();

