/* ============================================================
   practice/js/pages/assistant.js — AI 助教（内置提示词/Skill 库 + 离线方法库）
   ============================================================ */
(function () {
  'use strict';
  window.PAGES = window.PAGES || {};
  var U = window.util, S = window.Store, UI = window.UI;

  PAGES.assistant = function (root) {
    var page = UI.el('div', { class: 'page assistant-page' });
    var head = UI.el('div', { class: 'page-head' }, [
      UI.el('div', {}, [
        UI.el('h2', { class: 'page-title' }, 'AI 助教'),
        UI.el('div', { class: 'page-sub' }, '内置提示词（Skills）会按题目自动调用；也可以在这里自由提问。为省 token，问答不保留历史、单次回答不超过 300 字。')
      ])
    ]);
    page.appendChild(head);

    /* 状态 + 提问 */
    var chatCard = UI.el('div', { class: 'card' });
    var st = UI.el('div', { class: 'row-wrap' });
    var ok = window.AI && AI.configured();
    st.appendChild(UI.el('span', { class: 'badge ' + (ok ? 'badge--jade' : 'badge--red') }, ok ? 'AI 已连接 · ' + (S.settings.ai.model || 'deepseek-chat') : '未配置 API Key'));
    st.appendChild(UI.el('span', { class: 'tiny faint' }, '已调用 ' + S.aiUsage().calls + ' 次 · 缓存 ' + S.aiCacheCount() + ' 条'));
    if (!ok) st.appendChild(UI.el('a', { class: 'btn btn--sm btn--gold', href: '#/settings' }, '去配置 →'));
    chatCard.appendChild(st);
    chatCard.appendChild(UI.el('div', { class: 'card-sub', style: { marginTop: '10px' } }, '例如：「主谓谓语句怎么判断？」「三重复句怎么找第一层？」「/a/ 音位有哪些变体？」'));
    var ta = UI.el('textarea', { class: 'textarea', rows: 3, placeholder: '输入语言学问题…（Ctrl+Enter 发送）', style: { minHeight: '84px' } });
    chatCard.appendChild(ta);
    var bar = UI.el('div', { class: 'row', style: { marginTop: '10px' } });
    var sendBtn = UI.el('button', { class: 'btn btn--primary' }, '提问');
    bar.appendChild(sendBtn);
    bar.appendChild(UI.el('span', { class: 'tiny faint' }, '回答为 AI 生成，仅作思路参考，以教材/真题答案为准'));
    chatCard.appendChild(bar);
    var answerWrap = UI.el('div', { class: 'ai-area', style: { marginTop: '14px' } });
    chatCard.appendChild(answerWrap);
    sendBtn.addEventListener('click', send);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
    });
    function send() {
      var q = ta.value.trim();
      if (!q) { UI.toast('先写问题'); return; }
      if (!ok) { UI.toast('先在设置页配置 DeepSeek API Key', 'bad'); return; }
      UI.clear(answerWrap);
      var box = UI.el('div', { class: 'ai-box' }, [
        UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), '思考中…']),
        UI.el('div', { class: 'ai-loading' }, [UI.el('span', { class: 'spinner' }), '一次问答通常 300–600 tokens'])
      ]);
      answerWrap.appendChild(box);
      AI.chat(q).then(function (r) {
        UI.clear(answerWrap);
        if (!r || !r.ok) {
          answerWrap.appendChild(UI.el('div', { class: 'notice notice--bad' }, 'AI 回答失败：' + (r && r.message || '未知错误')));
          return;
        }
        var b = UI.el('div', { class: 'ai-box' }, [
          UI.el('div', { class: 'ai-hd' }, [UI.el('span', { class: 'spark' }, '✦'), 'AI 助教']),
          UI.el('div', { class: 'ai-body', style: { whiteSpace: 'pre-wrap' } }, r.text || '')
        ]);
        if (r.usage && r.usage.total_tokens) b.appendChild(UI.el('div', { class: 'tiny faint' }, r.usage.total_tokens + ' tokens'));
        answerWrap.appendChild(b);
      });
    }
    page.appendChild(chatCard);

    /* 内置 Skills */
    page.appendChild(UI.el('div', { class: 'section-title', style: { marginTop: '18px' } }, ['内置提示词 Skills（自动调用）', UI.el('small', {}, '点开可看系统提示词原文')]));
    var skillList = UI.el('div', { class: 'skill-list' });
    Object.keys(window.SKILLS).forEach(function (id) {
      var sk = window.SKILLS[id];
      var card = UI.el('div', { class: 'card card--tight skill-card' });
      var hd = UI.el('div', { class: 'skill-hd' }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'skill-title' }, sk.title),
          UI.el('div', { class: 'tiny faint' }, sk.desc)
        ]),
        UI.el('span', { class: 'badge' }, '~' + (sk.maxTokens || 600) + ' tokens')
      ]);
      card.appendChild(hd);
      card.appendChild(UI.el('div', { class: 'skill-when' }, '触发：' + (sk.when || '按需')));
      var more = UI.el('button', { class: 'btn btn--sm btn--ghost', style: { marginTop: '8px' } }, '查看提示词');
      var pre = UI.el('pre', { class: 'skill-prompt hidden' }, (typeof sk.system === 'function' ? safeSys(sk) : sk.system));
      more.addEventListener('click', function () {
        pre.classList.toggle('hidden');
        more.textContent = pre.classList.contains('hidden') ? '查看提示词' : '收起';
      });
      card.appendChild(more);
      card.appendChild(pre);
      skillList.appendChild(card);
    });
    page.appendChild(skillList);

    /* 离线方法库 */
    page.appendChild(UI.el('div', { class: 'section-title', style: { marginTop: '18px' } }, ['离线方法库', UI.el('small', {}, '不联网也能查的答题套路')]));
    var methodGrid = UI.el('div', { class: 'method-grid' });
    (window.METHODS || []).forEach(function (m) {
      var card = UI.el('div', { class: 'card card--tight method-card' });
      var hd = UI.el('div', { class: 'method-hd' }, [
        UI.el('span', { class: 'method-tag' }, m.tag),
        UI.el('span', { class: 'method-title' }, m.title)
      ]);
      card.appendChild(hd);
      var body = UI.el('div', { class: 'method-body' });
      (m.body || []).forEach(function (line) { body.appendChild(UI.el('p', {}, line)); });
      card.appendChild(body);
      methodGrid.appendChild(card);
    });
    page.appendChild(methodGrid);

    root.appendChild(page);
  };

  function safeSys(sk) {
    try { return sk.system({ type: 'syntax' }); } catch (e) { return String(sk.system); }
  }
})();
