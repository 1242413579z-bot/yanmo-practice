/* ============================================================================
   practice/js/core/util.js — 小工具库（无依赖）
   ========================================================================== */
(function () {
  'use strict';

  function hash(str) {
    // FNV-1a 32bit → base36
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  function deepClone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = deepClone(obj[k]);
    return out;
  }

  // 全角→半角、去首尾空白、连续空白归一
  function norm(str) {
    if (str == null) return '';
    return String(str)
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 调值归一：'51' / '˥˩' / '51.' / '5 1' → '51'；轻声 '0' / '·' / '轻声' → '0'
  var TONE_LETTERS = { '˥': '5', '˦': '4', '˧': '3', '˨': '2', '˩': '1' };
  function normTone(str) {
    if (str == null) return '';
    var s = String(str).trim();
    if (!s) return '';
    if (/^(轻声|輕聲|neutral|0|·|\.)$/i.test(s)) return '0';
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (TONE_LETTERS[c]) out += TONE_LETTERS[c];
      else if (/[0-9]/.test(c)) out += c;
    }
    if (!out) return s;
    // 双数字调值（55/35/214/51）标准化
    if (out === '55' || out === '35' || out === '214' || out === '51' || out === '0') return out;
    return out;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function uniq(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (x) { var k = typeof x + ':' + String(x); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }
  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function escapeRe(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function isMobile() {
    try {
      return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || (window.innerWidth <= 720);
    } catch (e) { return false; }
  }
  // 简单稳定排序键：字符串
  function pick(obj, keys) {
    var out = {};
    (keys || []).forEach(function (k) { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
    return out;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function formatMs(ms) {
    if (ms == null || isNaN(ms)) return '—';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' 秒';
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return m + ' 分' + (r ? ' ' + r + ' 秒' : '');
    var h = Math.floor(m / 60);
    return h + ' 时 ' + (m % 60) + ' 分';
  }
  function formatDate(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function formatDateTime(ts) {
    var d = new Date(ts || Date.now());
    return formatDate(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function dayKey(ts) { return formatDate(ts); }

  // 顶层分割：忽略括号/引号内的分隔符（供解析用户输入的 IPA、括号串等）
  function splitTop(str, seps) {
    var set = (seps || ',').split('');
    var depth = 0, quote = null, out = [], buf = '';
    for (var i = 0; i < String(str).length; i++) {
      var c = str[i];
      if (quote) { buf += c; if (c === quote) quote = null; continue; }
      if (c === '"' || c === '“' || c === '”' || c === "'") { quote = c; buf += c; continue; }
      if (c === '(' || c === '[' || c === '／') { depth++; buf += c; continue; }
      if (c === ')' || c === ']') { depth--; buf += c; continue; }
      if (depth === 0 && set.indexOf(c) >= 0) { out.push(buf); buf = ''; continue; }
      buf += c;
    }
    out.push(buf);
    return out;
  }

  window.util = {
    hash: hash,
    deepClone: deepClone,
    norm: norm,
    normTone: normTone,
    clamp: clamp,
    uniq: uniq,
    shuffle: shuffle,
    escapeRe: escapeRe,
    isMobile: isMobile,
    pick: pick,
    formatMs: formatMs,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    dayKey: dayKey,
    splitTop: splitTop,
    pad2: pad2
  };
})();
