/* ============================================================================
   practice/js/core/ui.js — DOM 工具 + 通用组件（无依赖）
   ========================================================================== */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /**
   * UI.el(tag, attrs?, children?)
   * attrs: class / style(Object|string) / dataset / html / text / on{Event} / 其他 DOM 属性
   * children: string | Node | array（可嵌套）
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'style') {
          if (typeof v === 'string') node.setAttribute('style', v);
          else Object.keys(v).forEach(function (s) { node.style[s] = v[s]; });
        } else if (k === 'dataset') {
          Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        } else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'ref' && typeof v === 'function') v(node);
        else node.setAttribute(k, v);
      });
    }
    appendChildren(node, children);
    return node;
  }
  function appendChildren(node, children) {
    if (children == null || children === false) return;
    if (Array.isArray(children)) { children.forEach(function (c) { appendChildren(node, c); }); return; }
    if (children instanceof Node) { node.appendChild(children); return; }
    node.appendChild(document.createTextNode(String(children)));
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function text(s) { return document.createTextNode(String(s == null ? '' : s)); }

  /* ---------------- Toast ---------------- */
  var toastWrap = null;
  function toast(msg, kind) {
    if (!toastWrap) {
      toastWrap = el('div', { class: 'toast-wrap', id: 'toast-root' });
      document.body.appendChild(toastWrap);
    }
    var t = el('div', { class: 'toast' + (kind ? ' toast--' + kind : '') }, [
      el('span', {}, kind === 'ok' ? '✓' : kind === 'bad' ? '✕' : '·'),
      el('span', {}, msg)
    ]);
    toastWrap.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
    }, kind === 'bad' ? 2600 : 2000);
  }

  /* ---------------- Modal ---------------- */
  function modal(opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'modal-wrap' });
    var scrim = el('div', { class: 'scrim' });
    var body;
    if (opts.el) body = opts.el;
    else if (opts.html) { body = el('div', { class: 'modal-bd' }); body.innerHTML = opts.html; }
    else body = el('div', { class: 'modal-bd' }, opts.body || '');
    var card = el('div', { class: 'modal' + (opts.wide ? ' modal--wide' : '') }, [
      el('div', { class: 'modal-hd' }, [
        el('div', { class: 'modal-title' }, opts.title || ''),
        el('button', { class: 'btn btn--icon btn--ghost btn--sm', title: '关闭', onclick: close }, '✕')
      ]),
      body
    ]);
    var actions = opts.actions || [];
    if (actions.length) {
      var ft = el('div', { class: 'modal-ft' });
      actions.forEach(function (a) {
        var b = el('button', { class: 'btn ' + (a.kind === 'primary' ? 'btn--primary' : a.kind === 'danger' ? 'btn--danger' : 'btn--ghost') }, a.label || '确定');
        b.addEventListener('click', function () {
          var keep = a.onClick ? a.onClick({ close: close, root: card }) : false;
          if (keep !== false && !a.keepOpen) close();
        });
        ft.appendChild(b);
      });
      card.appendChild(ft);
    }
    wrap.appendChild(card);
    document.body.appendChild(scrim);
    document.body.appendChild(wrap);
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    function close() {
      document.removeEventListener('keydown', onKey);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      if (opts.onClose) opts.onClose();
    }
    scrim.addEventListener('click', close);
    var f = card.querySelector('input,textarea,button.btn--primary');
    if (f && opts.autofocus !== false) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
    return { close: close, card: card };
  }

  function confirm(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      modal({
        title: opts.title || '确认',
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.8' } }, msg),
        actions: [
          { label: opts.cancelLabel || '取消', onClick: function () { resolve(false); } },
          { label: opts.okLabel || '确定', kind: opts.danger ? 'danger' : 'primary', onClick: function () { resolve(true); } }
        ]
      });
    });
  }

  /* ---------------- chips ---------------- */
  function chips(list, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'chip-group' });
    var picked = {};
    (opts.selected || []).forEach(function (v) { picked[v] = true; });
    (list || []).forEach(function (item) {
      var value = typeof item === 'object' ? item.value : item;
      var label = typeof item === 'object' ? item.label : item;
      var b = el('button', {
        class: 'chip' + (picked[value] ? ' is-active' : '') + (opts.cls ? ' ' + opts.cls : ''),
        type: 'button',
        'aria-pressed': picked[value] ? 'true' : 'false'
      }, label);
      b.addEventListener('click', function () {
        if (opts.multi) {
          picked[value] = !picked[value];
          b.classList.toggle('is-active', !!picked[value]);
          b.setAttribute('aria-pressed', picked[value] ? 'true' : 'false');
          if (opts.onPick) opts.onPick(value, !!picked[value], wrap);
        } else {
          $$('.chip', wrap).forEach(function (x) { x.classList.remove('is-active'); x.setAttribute('aria-pressed', 'false'); });
          b.classList.add('is-active');
          b.setAttribute('aria-pressed', 'true');
          if (opts.onPick) opts.onPick(value, true, wrap);
        }
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------------- badge / ring / progress ---------------- */
  function badge(text, kind) {
    return el('span', { class: 'badge' + (kind ? ' badge--' + kind : '') }, text);
  }
  function ring(score, size) {
    var cls = score >= 80 ? 'is-good' : score >= 60 ? 'is-warn' : 'is-bad';
    var r = el('div', { class: 'score-ring ' + cls, style: { '--pct': score } });
    r.appendChild(el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } }, [
      el('div', { class: 'score-num' }, String(score)),
      el('div', { class: 'score-unit' }, '分')
    ]));
    if (size) { r.style.width = size + 'px'; r.style.height = size + 'px'; r.style.flexBasis = size + 'px'; }
    return r;
  }
  function progress(pct, kind) {
    return el('div', { class: 'progress' + (kind ? ' progress--' + kind : '') }, [
      el('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } })
    ]);
  }

  /* ---------------- 小工具 ---------------- */
  function copy(str) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(function () { toast('已复制', 'ok'); }, function () { fallbackCopy(str); });
      } else fallbackCopy(str);
    } catch (e) { fallbackCopy(str); }
  }
  function fallbackCopy(str) {
    var ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = str;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制', 'ok'); } catch (e) { toast('复制失败', 'bad'); }
    document.body.removeChild(ta);
  }
  function storageEstimate() {
    try {
      var total = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        total += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
      return total;
    } catch (e) { return 0; }
  }
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function seg(options, value, onChange) {
    var wrap = el('div', { class: 'seg' });
    (options || []).forEach(function (o) {
      var v = typeof o === 'object' ? o.value : o;
      var label = typeof o === 'object' ? o.label : o;
      var b = el('button', { class: 'seg-btn' + (v === value ? ' is-active' : ''), type: 'button' }, label);
      b.addEventListener('click', function () {
        $$('.seg-btn', wrap).forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        onChange(v);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function switchEl(checked, onChange, label) {
    var input = el('input', { type: 'checkbox', checked: !!checked });
    var wrap = el('label', { class: 'switch', title: label || '' }, [input, el('i')]);
    input.addEventListener('change', function () { onChange(!!input.checked); });
    return wrap;
  }
  function empty(title, sub, icon) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-ico' }, icon || '🍃'),
      el('div', { class: 'empty-title' }, title || '暂无内容'),
      sub ? el('div', { class: 'small faint' }, sub) : null
    ]);
  }

  /* ---------------- 图标（内联 SVG，无外链） ---------------- */
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
    syntax: '<path d="M4 5h16"/><path d="M4 12h7"/><path d="M13 12h7"/><path d="M4 19h4"/><path d="M10 19h10"/>',
    ipa: '<path d="M4 9v6"/><path d="M8 6v12"/><path d="M12 4v16"/><path d="M16 7v10"/><path d="M20 10v4"/>',
    sememe: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M9 9v11"/><path d="M15 9v11"/>',
    translate: '<path d="M4 6h8"/><path d="M8 6c0 5-2 8-5 10"/><path d="M5 11c2 3 4.5 4.5 7 5"/><path d="M13 20l4-10 4 10"/><path d="M14.5 16.5h5"/>',
    punct: '<path d="M5 5v14"/><path d="M5 12h14"/><circle cx="17" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    review: '<path d="M4 5h11a4 4 0 0 1 4 4v2"/><path d="M4 5v14h9"/><path d="M2.5 12h5"/><path d="M5 9.5 8.5 12 5 14.5"/><path d="M19 11v6a2 2 0 0 1-2 2h-4"/>',
    stats: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    assistant: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18.5 15.5 19.6 18l2.4 1-2.4 1-1.1 2.5-1-2.5-2.5-1 2.5-1z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
    spark: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h11l-2 3.5L16 12H5"/>'
  };
  function icon(name, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'nav-ico ' + (cls || ''));
    svg.innerHTML = ICONS[name] || ICONS.book;
    return svg;
  }

  // 轻量 debounce
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 120);
    };
  }
  function once(fn) { var done = false; return function () { if (done) return; done = true; return fn.apply(this, arguments); }; }

  window.UI = {
    $: $, $$: $$, el: el, clear: clear, esc: esc, text: text,
    toast: toast, modal: modal, confirm: confirm, chips: chips,
    badge: badge, ring: ring, progress: progress,
    copy: copy, storageEstimate: storageEstimate, formatBytes: formatBytes,
    seg: seg, switch: switchEl, empty: empty, icon: icon, ICONS: ICONS,
    debounce: debounce, once: once
  };
})();
