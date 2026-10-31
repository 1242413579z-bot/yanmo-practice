/* ============================================================
   practice/js/pages/settings.js — 设置与说明
   ============================================================ */
(function () {
  'use strict';
  window.PAGES = window.PAGES || {};
  var U = window.util, S = window.Store, UI = window.UI;

  PAGES.settings = function (root) {
    var page = UI.el('div', { class: 'page settings-page' });
    page.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', {}, [
        UI.el('h2', { class: 'page-title' }, '设置与说明'),
        UI.el('div', { class: 'page-sub' }, '所有数据只存在这台电脑的浏览器 localStorage 里，不上传。')
      ])
    ]));

    page.appendChild(themeCard());
    page.appendChild(aiCard());
    page.appendChild(practiceCard());
    page.appendChild(cloudCard());
    page.appendChild(syncCard());
    page.appendChild(installCard());
    page.appendChild(aboutCard());
    root.appendChild(page);
  };

  function section(title, sub) {
    var card = UI.el('div', { class: 'card settings-card' });
    card.appendChild(UI.el('div', { class: 'card-title' }, [title, sub ? UI.el('small', { class: 'tiny faint' }, sub) : null]));
    return card;
  }
  function row(label, control, hint) {
    return UI.el('div', { class: 'settings-row' }, [
      UI.el('div', { class: 'settings-label' }, [UI.el('div', {}, label), hint ? UI.el('div', { class: 'tiny faint' }, hint) : null]),
      UI.el('div', { class: 'settings-ctrl' }, control)
    ]);
  }

  function themeCard() {
    var card = section('外观');
    var theme;
    function render() {
      theme = UI.seg([
        { value: 'auto', label: '跟随系统' }, { value: 'light', label: '宣纸' }, { value: 'dark', label: '墨晶' }
      ], S.settings.theme || 'auto', function (v) {
        S.setSettings({ theme: v });
        document.documentElement.setAttribute('data-theme', v === 'auto' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : v);
        UI.toast('已切换主题');
      });
      if (card._themeRow) card._themeRow.replaceWith(row('主题', theme));
      else { card._themeRow = row('主题', theme); card.appendChild(card._themeRow); }
    }
    render();
    return card;
  }

  function aiCard() {
    var card = section('AI 精析（DeepSeek 直连）', '只在做错后调用，命中缓存不重复计费');
    var ai = S.settings.ai;
    var enabled = UI.switch(ai.enabled, function (v) { S.setSettings({ ai: { enabled: v } }); UI.toast(v ? 'AI 已开启' : 'AI 已关闭'); });
    card.appendChild(row('启用 AI 分析', enabled, '关闭后完全离线判分，不发出任何请求'));

    var base = UI.el('input', { class: 'input input--mono', value: ai.base || 'https://api.deepseek.com', placeholder: 'https://api.deepseek.com' });
    base.addEventListener('change', function () { S.setSettings({ ai: { base: base.value.trim() } }); });
    card.appendChild(row('API Base URL', base, 'OpenAI 兼容接口；DeepSeek 填 https://api.deepseek.com 即可'));

    var model = UI.el('input', { class: 'input input--mono', value: ai.model || 'deepseek-chat' });
    model.addEventListener('change', function () { S.setSettings({ ai: { model: model.value.trim() } }); });
    card.appendChild(row('模型', model, '推荐 deepseek-chat（便宜、快、中文好）'));

    var keyWrap = UI.el('div', { class: 'row', style: { width: '100%' } });
    var key = UI.el('input', { class: 'input input--mono grow', type: 'password', value: ai.key || '', placeholder: 'sk-…', autocomplete: 'off' });
    key.addEventListener('change', function () { S.setSettings({ ai: { key: key.value.trim() } }); UI.toast('Key 已保存在本机浏览器', 'ok'); });
    var show = UI.el('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, '显示');
    show.addEventListener('click', function () {
      key.type = key.type === 'password' ? 'text' : 'password';
      show.textContent = key.type === 'password' ? '显示' : '隐藏';
    });
    keyWrap.appendChild(key);
    keyWrap.appendChild(show);
    card.appendChild(row('API Key', keyWrap, '只保存在本机 localStorage；导出备份时会自动去掉 Key'));

    var maxTok = UI.el('input', { class: 'input', type: 'number', min: 200, max: 2000, step: 100, value: ai.maxTokens || 800, style: { width: '120px' } });
    maxTok.addEventListener('change', function () { S.setSettings({ ai: { maxTokens: Math.max(200, Math.min(2000, parseInt(maxTok.value, 10) || 800)) } }); });
    card.appendChild(row('单次最大 tokens', maxTok, '越小越省；700–900 足够做错因归类'));

    var auto = UI.switch(ai.autoAnalyze, function (v) { S.setSettings({ ai: { autoAnalyze: v } }); });
    card.appendChild(row('做错后自动归类错因', auto, '关闭后只在点「AI 精评/AI 分析」时调用'));

    // 用量 & 测试
    var usage = UI.el('div', { class: 'panel', style: { marginTop: '10px' } });
    function refreshUsage() {
      UI.clear(usage);
      var u = S.aiUsage();
      usage.appendChild(UI.el('div', { class: 'kv' }, [UI.el('span', { class: 'k' }, '调用次数'), UI.el('span', { class: 'v' }, String(u.calls))]));
      usage.appendChild(UI.el('div', { class: 'kv' }, [UI.el('span', { class: 'k' }, '输入 tokens'), UI.el('span', { class: 'v' }, String(u.promptTokens))]));
      usage.appendChild(UI.el('div', { class: 'kv' }, [UI.el('span', { class: 'k' }, '输出 tokens'), UI.el('span', { class: 'v' }, String(u.completionTokens))]));
      usage.appendChild(UI.el('div', { class: 'kv' }, [UI.el('span', { class: 'k' }, '缓存命中'), UI.el('span', { class: 'v' }, String(u.cachedHits))]));
      usage.appendChild(UI.el('div', { class: 'row', style: { marginTop: '8px' } }, [
        UI.el('span', { class: 'tiny faint grow' }, '缓存 ' + S.aiCacheCount() + ' 条 · 约 ' + UI.formatBytes(UI.storageEstimate()) + ' 本地数据'),
        UI.el('button', {
          class: 'btn btn--sm btn--ghost', onclick: function () { AI.clearCache(); UI.toast('AI 缓存已清空'); refreshUsage(); }
        }, '清空 AI 缓存')
      ]));
    }
    refreshUsage();
    card.appendChild(usage);

    var testOut = UI.el('div', { class: 'tiny', style: { marginTop: '6px' } });
    var testBtn = UI.el('button', { class: 'btn btn--sm btn--gold' }, '测试连接');
    testBtn.addEventListener('click', function () {
      if (!window.AI || !AI.configured()) { UI.toast('先填 API Key', 'bad'); return; }
      testBtn.disabled = true;
      UI.clear(testOut);
      testOut.appendChild(UI.el('span', { class: 'ai-loading' }, [UI.el('span', { class: 'spinner' }), '正在请求…']));
      AI.chat('请回复两个字：正常').then(function (r) {
        testBtn.disabled = false;
        UI.clear(testOut);
        if (r && r.ok) { testOut.appendChild(UI.el('span', { class: 'ok-chip' }, '✓ 连接正常：' + String(r.text || '').slice(0, 30))); refreshUsage(); }
        else testOut.appendChild(UI.el('span', { style: { color: 'var(--bad)' } }, '✕ ' + (r && r.message || '失败')));
      });
    });
    card.appendChild(UI.el('div', { class: 'row', style: { marginTop: '8px' } }, [testBtn, testOut]));
    card.appendChild(UI.el('div', { class: 'notice', style: { marginTop: '12px' } }, [
      UI.el('b', {}, '费用提示：'), '每次做错约 300–700 tokens（一次约 0.001–0.003 元）；同一道题同一份答案只调用一次（缓存 240 条）。想更省就把「做错后自动归类」关掉，只点按钮时才调用。'
    ]));
    return card;
  }

  function practiceCard() {
    var card = section('练习设置');
    var order = UI.seg([
      { value: 'seq', label: '顺序' }, { value: 'random', label: '随机' }, { value: 'todo', label: '未做优先' }
    ], S.settings.practice.order || 'seq', function (v) { S.setSettings({ practice: { order: v } }); });
    card.appendChild(row('默认出题顺序', order, '每个题型页也可以临时切换'));
    var showTimer = UI.switch(S.settings.practice.showTimer, function (v) { S.setSettings({ practice: { showTimer: v } }); });
    card.appendChild(row('记录每道题用时', showTimer, '统计页会显示累计用时'));
    var palette = UI.switch(S.settings.practice.paletteAutoOpen !== false, function (v) { S.setSettings({ practice: { paletteAutoOpen: v } }); });
    card.appendChild(row('音标/标点面板默认展开', palette, '关闭后点输入框才展开'));
    return card;
  }

  function cloudCard() {
    var card = section('云同步（GitHub Gist，可选）', '两台设备共用一个私有 Gist；Token 只存本机，不会出现在网页源码或仓库里');
    card.appendChild(UI.el('div', { class: 'tiny faint', style: { marginBottom: '10px', lineHeight: '1.8' } },
      '在 GitHub → Settings → Developer settings → Personal access tokens 生成 fine-grained token，只勾「Gists: Read and write」（不需要任何仓库权限）。把 Token 填在这里，首次点「创建/上传到云」会自动建一个私密 Gist；另一台设备填同一个 Token 和 Gist ID，点「从云端合并」。'));
    var cfg = S.settings.cloud || {};
    var tokenIn = UI.el('input', { class: 'input', type: 'password', value: cfg.token || '', placeholder: 'GitHub Token（只勾 Gists 读写）', style: { width: '100%' }, autocomplete: 'off' });
    var gistIn = UI.el('input', { class: 'input', value: cfg.gistId || '', placeholder: 'Gist ID（首次留空，自动创建后自动填入）', style: { width: '100%', marginTop: '8px' } });
    var status = UI.el('div', { class: 'tiny faint', style: { marginTop: '8px' } }, cfg.gistId ? '已配置 Gist：' + cfg.gistId : '尚未配置云同步');
    function saveCfg() {
      S.setSettings({ cloud: { token: String(tokenIn.value || '').trim(), gistId: String(gistIn.value || '').trim() } });
    }
    function ghApi(path, opts) {
      var token = String(tokenIn.value || '').trim();
      if (!token) return Promise.reject(new Error('请先填 GitHub Token'));
      opts = opts || {};
      opts.headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
      return fetch('https://api.github.com' + path, opts).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('GitHub ' + r.status + '：' + t.slice(0, 120)); });
        return r.json();
      });
    }
    function upload() {
      saveCfg();
      var token = String(tokenIn.value || '').trim();
      if (!token) { UI.toast('请先填 GitHub Token', 'bad'); return; }
      var body = JSON.stringify({ description: '研墨 · 练习记录同步（私密）', public: false, files: { 'yanmo-sync.json': { content: S.exportJSON() } } });
      var gid = String(gistIn.value || '').trim();
      var req = gid ? ghApi('/gists/' + gid, { method: 'PATCH', body: body }) : ghApi('/gists', { method: 'POST', body: body });
      status.textContent = '正在上传…';
      req.then(function (res) {
        if (!gid && res.id) { gistIn.value = res.id; saveCfg(); status.textContent = '已创建并上传：' + res.id; }
        else status.textContent = '已上传 ' + new Date().toLocaleTimeString();
        UI.toast('已上传到云端', 'ok');
      }).catch(function (e) { status.textContent = '上传失败：' + e.message; UI.toast('上传失败：' + e.message, 'bad'); });
    }
    function download() {
      var gid = String(gistIn.value || '').trim();
      if (!gid) { UI.toast('请先填 Gist ID', 'bad'); return; }
      saveCfg();
      status.textContent = '正在下载…';
      ghApi('/gists/' + gid).then(function (res) {
        var f = res.files && res.files['yanmo-sync.json'];
        if (!f || !f.content) throw new Error('该 Gist 里没有 yanmo-sync.json');
        S.importJSON(f.content, { merge: true });
        UI.toast('已合并云端记录，正在刷新…', 'ok');
        location.reload();
      }).catch(function (e) { status.textContent = '下载失败：' + e.message; UI.toast('下载失败：' + e.message, 'bad'); });
    }
    var upBtn = UI.el('button', { class: 'btn btn--gold' }, '创建/上传到云');
    upBtn.addEventListener('click', upload);
    var downBtn = UI.el('button', { class: 'btn' }, '从云端合并');
    downBtn.addEventListener('click', download);
    var saveBtn = UI.el('button', { class: 'btn' }, '保存设置');
    saveBtn.addEventListener('click', function () { saveCfg(); status.textContent = '已保存本机配置'; UI.toast('已保存', 'ok'); });
    var clearBtn = UI.el('button', { class: 'btn btn--danger' }, '清除 Token');
    clearBtn.addEventListener('click', function () {
      tokenIn.value = ''; gistIn.value = '';
      S.setSettings({ cloud: { token: '', gistId: '' } });
      status.textContent = '已清除本机 Token';
      UI.toast('已清除');
    });
    card.appendChild(tokenIn);
    card.appendChild(gistIn);
    card.appendChild(UI.el('div', { class: 'btn-row', style: { marginTop: '10px' } }, [upBtn, downBtn, saveBtn, clearBtn]));
    card.appendChild(status);
    return card;
  }

  function syncCard() {
    var card = section('手机 ↔ 电脑同步', '数据只在本机；用同步码/文件在设备间合并，不经过服务器');
    card.appendChild(UI.el('div', { class: 'tiny faint', style: { marginBottom: '10px', lineHeight: '1.8' } },
      '成绩、错题、统计会合并（重复记录自动去重；设置与 API Key 保留本机）。“同步码”就是一段文本：电脑生成后发到微信，手机长按复制，点「粘贴同步码导入」即可；两向同理。'));
    function showCode(text) {
      var ta = UI.el('textarea', { class: 'input', style: { width: '100%', height: '220px', fontFamily: 'monospace', fontSize: '11px' } });
      ta.value = text; ta.readOnly = true;
      UI.modal({
        title: '同步码（复制后发到另一台设备）',
        body: UI.el('div', {}, [UI.el('div', { class: 'tiny faint', style: { marginBottom: '6px' } }, '内容只含练习记录，不含 API Key。长按全选复制即可。'), ta]),
        actions: [{
          label: '复制', primary: true, onClick: function () {
            ta.select(); ta.setSelectionRange(0, text.length);
            try { document.execCommand('copy'); } catch (e) {}
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
            UI.toast('已复制同步码', 'ok'); return true;
          }
        }]
      });
    }
    function pasteImport() {
      var ta = UI.el('textarea', { class: 'input', style: { width: '100%', height: '200px', fontFamily: 'monospace', fontSize: '11px' }, placeholder: '把另一台设备生成的同步码粘贴到这里' });
      UI.modal({
        title: '粘贴同步码导入（合并）',
        body: ta,
        actions: [{
          label: '合并导入', primary: true, onClick: function () {
            var txt = String(ta.value || '').trim();
            if (!txt) { UI.toast('还没有内容', 'bad'); return false; }
            try { S.importJSON(txt, { merge: true }); UI.toast('已合并，正在刷新…', 'ok'); location.reload(); return true; }
            catch (e) { UI.toast('导入失败：' + e.message, 'bad'); return false; }
          }
        }]
      });
    }
    var codeBtn = UI.el('button', { class: 'btn btn--gold' }, '生成同步码（复制）');
    codeBtn.addEventListener('click', function () { showCode(S.exportJSON()); });
    var pasteBtn = UI.el('button', { class: 'btn' }, '粘贴同步码导入');
    pasteBtn.addEventListener('click', pasteImport);
    var exportBtn = UI.el('button', { class: 'btn' }, '导出同步文件');
    exportBtn.addEventListener('click', function () {
      var data = S.exportJSON();
      var blob = new Blob([data], { type: 'application/json' });
      var a = UI.el('a', { href: URL.createObjectURL(blob), download: '研墨同步-' + U.formatDate(Date.now()) + '.json' });
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 300);
      UI.toast('已导出同步文件', 'ok');
    });
    var importInput = UI.el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    var importBtn = UI.el('button', { class: 'btn' }, '导入同步文件（合并）');
    importBtn.addEventListener('click', function () { importInput.click(); });
    importInput.addEventListener('change', function () {
      var f = importInput.files && importInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { S.importJSON(String(reader.result), { merge: true }); UI.toast('已合并导入，正在刷新…', 'ok'); location.reload(); }
        catch (e) { UI.toast('导入失败：' + e.message, 'bad'); }
      };
      reader.readAsText(f);
    });
    card.appendChild(UI.el('div', { class: 'btn-row' }, [codeBtn, pasteBtn, exportBtn, importBtn, importInput]));
    var resetProgress = UI.el('button', { class: 'btn btn--danger' }, '清空练习记录');
    resetProgress.addEventListener('click', function () {
      UI.confirm('会清空所有作答记录、错题、统计，但保留设置。确定吗？', { danger: true, okLabel: '清空' }).then(function (yes) {
        if (yes) { S.resetProgress(); UI.toast('已清空练习记录'); location.reload(); }
      });
    });
    var resetAll = UI.el('button', { class: 'btn btn--danger' }, '恢复出厂（含 API Key）');
    resetAll.addEventListener('click', function () {
      UI.confirm('会删除所有本地数据和 API Key，不可恢复。确定吗？', { danger: true, okLabel: '全部删除' }).then(function (yes) {
        if (yes) { S.resetAll(); location.reload(); }
      });
    });
    card.appendChild(UI.el('div', { class: 'btn-row', style: { marginTop: '10px' } }, [resetProgress, resetAll]));
    card.appendChild(UI.el('div', { class: 'tiny faint', style: { marginTop: '8px' } }, '当前占用约 ' + UI.formatBytes(UI.storageEstimate()) + '（浏览器上限 5 MB 左右）'));
    return card;
  }

  function installCard() {
    var card = section('添加到手机桌面', '像 App 一样放桌面、离线打开');
    var rows = [
      ['安卓（Chrome / Edge / 夸克）', '把「研墨-手机单文件版.html」存到手机 → 用 Chrome 打开 → 右上角 ⋮ →「添加到主屏幕 / 安装应用」。桌面会出现「研墨」图标，点开即用、断网也能刷。'],
      ['iPhone（Safari）', 'Safari 只能给 http(s) 网页「添加到主屏幕」，本地文件不行。两个办法：① 把单文件存「文件」App，从文件 App 直接打开使用；② 把网页放到任意静态托管（GitHub Pages / Netlify / 自己的服务器），用 Safari 打开后「分享 → 添加到主屏幕」，即可全屏无地址栏、离线可用。'],
      ['电脑（Chrome / Edge）', '把整个 practice 文件夹放到静态托管或用任意本地服务器打开后，地址栏右侧会有「安装」图标，可装成桌面 App；直接双击 操作题.html 也能用，只是没有安装图标。'],
      ['说明', '以 file:// 方式「添加到主屏幕」创建的是浏览器快捷方式，功能完整；只有放到 https 静态网站后，才会变成真正全屏的 PWA。']
    ];
    rows.forEach(function (it) {
      card.appendChild(UI.el('div', { class: 'about-item' }, [
        UI.el('div', { class: 'about-k' }, it[0]),
        UI.el('div', { class: 'about-v' }, it[1])
      ]));
    });
    return card;
  }

  function aboutCard() {
    var card = section('说明', '题库来源 / 判分口径 / 技术');
    var items = [
      ['题库来源', '「真题」＝公开可查的各校历年考研真题，标注学校、年份、科目代码；「模拟题」＝按真题风格编写，note 中不含虚构院校年份；「教材经典」＝黄伯荣/廖序东、邵敬敏等教材经典例句。'],
      ['判分口径', '句法：位置分 60 + 关系分 40；音标：声母 30% + 韵母 40% + 声调 20% + 规范 10%；义素：逐列比对 + 取值；句读：断点 60 + 标点类型 40；翻译：采分点覆盖率（可再点 AI 精评）。参考答案均按现代汉语/古代汉语教学通行体系，个别题存在合理异说，以你目标院校教材为准。'],
      ['AI 使用', 'DeepSeek 直连（OpenAI 兼容）。Key 只存本机；只在做错后调用一次；同题同答案走缓存；单次 ≤ 800 tokens 左右。断网也能用全部离线判分。'],
      ['数据与隐私', '全部数据存 localStorage，不上传、不注册。换电脑前用「导出备份」。'],
      ['快捷键', 'Enter 提交 · ←/→ 上一题/下一题 · 1–9 选关系（句法）· Esc 关闭弹层 · 音标面板：点击插入光标处，声调直接打数字。'],
      ['技术', '纯静态单页，file:// 双击即开；无外部依赖、无 webfont、无 CDN。']
    ];
    items.forEach(function (it) {
      card.appendChild(UI.el('div', { class: 'about-item' }, [
        UI.el('div', { class: 'about-k' }, it[0]),
        UI.el('div', { class: 'about-v' }, it[1])
      ]));
    });
    card.appendChild(UI.el('div', { class: 'tiny faint', style: { marginTop: '12px' } }, '研墨 · 语言学操作题训练场 v1.0 · 仅供学习使用，真题版权归原命题单位所有。'));
    return card;
  }
})();



