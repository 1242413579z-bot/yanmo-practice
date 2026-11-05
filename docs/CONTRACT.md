# 研墨 · 语言学操作题训练场 — 工程契约（v1）

> 本文件是全部开发者的唯一事实来源。任何与本文冲突的既有代码，以本文为准；确实需要改契约，先改本文并在群里说明。
> 项目根：`E:\考研工作台\practice\`（**独立网站**，与 `E:\考研工作台` 原工作台互不引用、互不修改）。
> 打开方式：双击 `practice\操作题.html`（file:// 直开，无需服务器、无需联网、无需构建）。

---

## 0. 硬约束（违反即返工）

1. **纯静态、零依赖、零构建**：只用原生 HTML/CSS/JS（ES2017+，目标 Chrome/Edge 最新）。**禁止** `import/export`、npm 依赖、CDN、webfont、外部图片。所有脚本用经典 `<script src>` 顺序加载。
2. **file:// 直开**：不得 `fetch()` 本地文件；数据一律以 `.js` 文件 `window.XXX = ...` 形式提供。
3. **语言与文案**：全站简体中文；术语用现代汉语教学通行体系（黄伯荣/廖序东、邵敬敏为主）。
4. **来源可追溯**：`source.real === true` 只能用于**确实查到的真题**，必须写清 `school / year / code`。查不到出处的题一律 `real:false`，`note` 写明「模拟题（仿 XX 院校风格）」或「教材经典例句」。
5. **只写自己名下的文件**（见 §2 归属表）。需要别人文件配合 → 发消息给 lead，不许越权改。
6. **答案必须语言学正确**。有争议的分析要在 `note` 里注明「参考答案，按 X 体系」。
7. **无网可用**：页面所有功能在断网下可用（AI 分析除外，需设置 Key）。

---

## 1. 视觉与体验基调

- 新中式学术风：宣纸底 `#F2ECE1`、墨字 `#211C16`、朱砂 `#A6392B`、鎏金 `#B8892F`、青玉 `#2C6B57`；深色主题 `#070A0D`。
- 标题用宋体系（`Source Han Serif SC / 宋体`），正文用黑体系；**禁止 webfont**，只用系统字体栈。
- 桌面：左侧 236px 导航栏 + 主内容；≤900px：底部 TabBar 导航；触控目标 ≥ 44px。
- 参考（公众号「句法分析自测」）的体验要点，必须实现到位：
  - 逐刀判分：位置分 / 关系分分开给；
  - 错因结构化：漏切 / 多切 / 词内误切 / 关系错，一处一处列；
  - 考点热力条（掌握度）；
  - 错题自动进重练队列；
  - 手机端点按钮落刀，不是点字缝。
- 动效克制（150–220ms ease），尊重 `prefers-reduced-motion`。

---

## 2. 文件布局与归属（ownership）

| 文件 | 归属 | 说明 |
|---|---|---|
| `操作题.html`（原 index.html） | **Lead** | 唯一入口；脚本加载顺序；页面骨架 |
| `css/base.css` / `css/components.css` | **Lead** | 设计令牌 + 全站组件 |
| `css/module-syntax.css` | mod-syntax | 句法分析模块样式 |
| `css/module-ipa.css` | mod-ipa | 音标模块样式 |
| `css/module-sememe.css` `css/module-punct.css` | Lead | 义素 / 句读模块样式 |\n| `css/module-translate.css` | mod-classical | 古文翻译模块样式 |
| `js/core/util.js` `store.js` `ui.js` `ai.js` `grade-common.js` | **Lead** | 核心库 |
| `js/app.js` | **Lead** | 路由、题目流、判分结果面板、AI 挂接 |
| `js/data/taxonomy.js` `js/data/skills.js` | **Lead** | 错误类型库、内置提示词/skill、方法库 |
| `js/data/syntax-a.js` | data-syntax-a | 题号 `sy-0001`… |
| `js/data/syntax-b.js` | data-syntax-b | 题号 `sy-0101`… |
| `js/data/ipa.js` | data-ipa | `ipa-0001`… |
| `js/data/sememe.js` | data-sememe | `sm-0001`… |
| `js/data/translate.js` | data-classical | `tr-0001`… |
| `js/data/punct.js` | data-classical | `pu-0001`… |
| `js/grade/syntax.js` `js/modules/syntax.js` | mod-syntax | 判分 + 编辑器 |
| `js/grade/ipa.js` `js/modules/ipa.js` | mod-ipa | 判分 + 编辑器 |
| `js/grade/sememe.js` `js/modules/sememe.js` | Lead | 判分 + 矩阵编辑器 |
| `js/grade/punct.js` `js/modules/punct.js` | Lead | 判分 + 标点编辑器 |
| `js/grade/translate.js` `js/modules/translate.js` | mod-classical | 判分 + 翻译编辑器 |
| `js/pages/*.js` | **Lead** | 首页/错题本/统计/AI 助教/设置 |
| `tests/*.mjs` | **Lead + QA** | Node 自检 |
| `docs/*` | Lead | 文档 |

---

## 3. 加载顺序（`操作题.html` 中的 `<script>` 顺序，Lead 维护）

```
data/taxonomy.js → data/skills.js
data/syntax-a.js → data/syntax-b.js → data/sememe.js → data/ipa.js → data/translate.js → data/punct.js
core/util.js → core/grade-common.js → core/store.js → core/ui.js → core/ai.js
grade/syntax.js → grade/ipa.js → grade/sememe.js → grade/punct.js → grade/translate.js
modules/syntax.js → modules/ipa.js → modules/sememe.js → modules/punct.js → modules/translate.js
pages/dashboard.js → pages/review.js → pages/stats.js → pages/assistant.js → pages/settings.js
app.js  （最后）
```

---

## 4. 全局对象 API（Lead 提供，模块只读调用）

### 4.1 `window.PRACTICE_DATA`
```js
{ syntax: [], sememe: [], ipa: [], translate: [], punct: [], meta: {builtAt, counts} }
```
数据文件写法（唯一允许的格式）：
```js
(function () {
  var D = (window.PRACTICE_DATA = window.PRACTICE_DATA || {});
  D.syntax = (D.syntax || []).concat([
    /* 题目对象们 */
  ]);
})();
```

### 4.2 `window.Store`（localStorage 持久化）
```js
Store.settings            // {theme:'auto|light|dark', ai:{enabled,base,model,key,maxTokens}, ...}
Store.settings.ai         // 可读；写用 Store.setSettings(patch)
Store.saveAttempt({qid, type, score, correct, errors, answerHash, timeMs})
Store.getAttempt(qid)     // 最近一次 attempt 或 null
Store.qstat(qid)          // {attempts, correct, lastScore, fav}
Store.toggleFav(qid)      // 收藏
Store.wrongList(type?)    // 错题列表（最近答错且未连续答对2次）
Store.stats()             // 汇总统计
Store.aiCacheGet(hash) / Store.aiCacheSet(hash, result)
Store.exportJSON() / Store.importJSON(str)
Store.subscribe(fn)       // 状态变更通知
Store.resetAll()
```

### 4.3 `window.UI`（DOM 与通用组件）
```js
UI.el(tag, attrs?, children?)          // 轻量元素创建；attrs 支持 class/style/on<Event>/html
UI.$ / UI.$$                            // querySelector 包装
UI.toast(msg, kind?)                   // kind: 'ok'|'bad'|'info'
UI.modal({title, html|el, actions:[{label, kind, onClick}]}) -> {close}
UI.confirm(msg) -> Promise<boolean>
UI.chips(list, {onPick, multi})        // 生成 chip 组
UI.badge(text, kind?)                  // 小标签
UI.ring(score)                         // 分数环元素
UI.esc(str)                            // HTML 转义
UI.formatMs(ms) / UI.formatDate(ts)
UI.copy(text)
UI.storageEstimate()
```

### 4.4 `window.AI`（DeepSeek 直连 + 缓存 + 预算）
```js
AI.configured() -> bool                       // settings.ai.key 非空
AI.analyze({type, question, userAnswer, gradeResult, mode}) -> Promise<AIResult|null>
AI.reviewTranslate({question, userText}) -> Promise<AIResult|null>
AI.assist({skillId, ctx}) -> Promise<AIResult|null>   // 按 skill 调；见 skills.js
AI.chat(messages, {maxTokens}) -> Promise<{text, usage}>
AI.usage() -> {calls, promptTokens, completionTokens}
AI.clearCache()
// AIResult 统一形状：
{ ok:true, text, json?:{...}, usage:{prompt_tokens, completion_tokens}, cached:bool, ms }
```
调用纪律（token 成本）：**只在提交判分后、且判定错误时**自动调用；同一 `(qid+answerHash)` 结果命中 `Store.aiCache` 就不再发请求；`max_tokens` 默认 ≤ 800；不带历史；系统提示词精简。

### 4.5 `window.ERROR_TAXONOMY` / `window.errMeta(type, code)`
```js
ERROR_TAXONOMY = { version, common:[], syntax:[], ipa:[], sememe:[], translate:[], punct:[] }
// 每条：{ code, name, short, desc, why, advice, severity:'low|mid|high' }
window.errMeta(type, code) -> 条目 | null
```

### 4.6 `window.SKILLS` / `window.METHODS`
```js
SKILLS[skillId] = { id, title, desc, when, maxTokens, temperature, json, system, build(ctx), parse(text) }
METHODS = [{ id, title, body }]   // 非 AI 的方法论卡片（层次分析步骤、九种关系速查等）
```

### 4.7 `window.util`（`js/core/util.js`）
```js
util.hash(str)            // 稳定短哈希（FNV-1a）
util.deepClone(obj)
util.norm(str)            // 全角→半角、去空白、统一标点、小写
util.normTone(str)        // '51'/'˥˩'/'51.' → 统一调值数字字符串
util.splitTop(str, sep)   // 顶层分割（忽略括号/引号内）
util.clamp(n, lo, hi)
util.uniq(arr)
util.escapeRe(str)
util.shuffle(arr)
util.pick(obj, keys)
util.isMobile()
```

---

## 5. 数据 Schema（唯一权威格式）

> 所有题目对象必须含：`id`、`type`、`prompt`、`source`、`tags`、`note`。`type` 取值：`syntax|ipa|sememe|punct|translate`。
> `source` 形状：`{school:'南京师范大学', year:2026, code:'802', real:true, detail:'原题/回忆版'}`；模拟题：`{school:'', year:0, real:false}`，`note` 写「模拟题（仿 XX 风格）」。
> `tags`：用于筛选/热力条的考点名，2–5 个，用短名（如 `主谓句`、`述宾`、`送气音`、`儿化`、`宾语前置`）。**同一考点全站用词统一**（用 taxonomy/方法库里的词）。

### 5.1 句法分析 `syntax`
```js
{
  id: 'sy-0001',
  type: 'syntax',
  sentence: '从大海上吹来湿润而新鲜的风',
  // 树的紧凑写法（唯一允许格式）：
  //   节点 = (关系标签 子1 子2 ...)；叶子 = 词（单句）/ 分句（复句），不带空格
  //   必须满足：所有叶子按顺序拼接 === sentence（逐字符，含标点）
  //   二合结构写两个子；并列/联合/承接等多分结构可写多个子
  tree: '(偏正 (介宾 从 (方位 大海 上)) (述宾 吹来 (偏正 (的字短语 (联合 湿润 而 新鲜) 的) 风)))',
  prompt: '用层次分析法分析下列句子（分析到词）',
  relations: 'single',            // 'single' 单句关系集 | 'compound' 复句关系集（见 §5.1.2）
  source: { school: '南京师范大学', year: 2026, code: '802', real: true, detail: '原题' },
  tags: ['偏正', '述宾', '长句'],
  note: '参考答案（层次分析法，二合切分）',
  hints: ['先找谓语中心词']        // 可选
}
```

**多解（歧义）题：`tree` 与 `readings` 二选一**
```js
{
  id: 'sy-0xxx', type: 'syntax', sentence: '新教工食堂',
  // 有歧义的题必须有 ≥2 种读法；每种读法一棵完整标准树 + 一句话释义
  readings: [
    { label: '读法一', meaning: '新教工的食堂（新建的教工食堂？）', tree: '(偏正 (偏正 新 教工) 食堂)' },
    { label: '读法二', meaning: '新 教工食堂（刚出现的教工食堂）', tree: '(偏正 新 (偏正 教工 食堂))' }
  ],
  prompt: '用层次分析法分析下列短语（有歧义请分别分析）',
  relations: 'single', source: {...}, tags: ['歧义','偏正'],
  note: '参考答案（两种读法）'
}
```
> - 单解题：只写 `tree`（一个字符串）；多解题：只写 `readings`（数组 ≥2，每项 `{label, meaning, tree}`，`meaning` 一句话说清两种意思的差别）。
> - 两种写法**互斥**；校验器会检查每一种 tree 的叶子拼接 === sentence。
> - 多解题的 `tags` 必须含 `歧义`；模块作答时用户可点「＋新增一种分析」分别做多种读法，判分按读法数匹配（见 §6.1/§7.1）。
> - 多解题 `note` 建议写「参考答案（N 种读法：①…②…）」；不要只写一读。
> 注意：`从大海上吹来湿润而新鲜的风` 是非主谓句（省略主语），首层是**偏正（状中）**：状语「从大海上」+ 中心语「吹来……风」，不是主谓。
> `方位` 用于「名词 + 方位词」构成的方位短语（如 大海上、屋里）。全站统一此约定。

**关系标签词表（必须用这些词）**
- 单句：`主谓` `述宾` `偏正` `中补` `联合` `连谓` `兼语` `双宾` `介宾` `数量` `方位` `同位` `的字短语` `比况` `量词`（细写时允许 `定中` `状中`）
- 复句（`relations:'compound'` 时可用，也可混用单句标签）：`并列` `承接` `递进` `选择` `转折` `因果` `假设` `条件` `目的` `让步` `解说`
- **单句**：叶子 = 词；不允许在词内切；除 `联合`/`连谓` 外，节点必须二合。
- **复句**：叶子 = 分句（分句里可以含逗号/分号，标点留在**前一分句末尾**，不要单独作叶子）；多分句同层可用一个多分节点（并列/承接/递进/选择/因果等均允许），也可以写成二合嵌套。
- 句子长度：单句 8–25 字；复句 20–45 字。不要出分析体系有争议的句子；`把/被/兼语/双宾/连谓` 等特殊句要典型。**英文句子暂不收录**（叶子不含空格，无法还原英文词间空格）。

### 5.2 义素分析 `sememe`
```js
{
  id: 'sm-0001',
  type: 'sememe',
  prompt: '用义素分析法分析下列词的义素，列成矩阵。',
  words: ['父亲', '母亲', '儿子', '女儿'],
  sememes: [                       // 标准答案的义素列；values 与 words 等长
    { name: '男性', values: ['+', '-', '+', '-'], aliases: ['男', '阳性', '雄性'] },
    { name: '成年', values: ['+', '+', '-', '-'], aliases: ['成年', '大人'] },
    { name: '长辈', values: ['+', '+', '-', '-'], aliases: ['上辈', '父辈'] }
  ],
  required: ['男性', '成年', '长辈'],   // 必须答出的义素（用 sememes[].name）
  optional: ['直系'],                  // 额外答出不算冗余的义素名
  source: { school: '', year: 0, real: false },
  tags: ['亲属称谓', '语义场'],
  note: '模拟题（义素分析法经典词组）'
}
```
- 取值只能是 `'+' | '-' | '±' | ''`；`''` 表示该词不涉及（极少用）。
- 每组 3–6 个词，全部属于同一最小语义场；`required` 2–6 个。
- 义素名用**正反标记的肯定项**（如「男性」而不是「男性/女性」），不要带方括号。

### 5.3 国际音标 `ipa`
```js
{
  id: 'ipa-0001',
  type: 'ipa',
  kind: 'word',                    // word | phrase | sentence | poem
  prompt: '用国际音标给下列字词注音。',
  items: [                         // 每项一个作答单元；answer 音节用空格分隔
    { text: '骗', answer: 'pʰiɛn51', note: '' },
    { text: '鸡儿', answer: 'tɕi55ɚ', note: '儿化' }
  ],
  subQuestions: [                  // 可选：音位分析/发音特征类小题
    { q: '这两个音素能否归为一个音位？为什么？', answer: '可以……', keyPoints: ['互补分布', '音位变体'] }
  ],
  source: { school: '南京师范大学', year: 2021, code: '611', real: true, detail: '原题' },
  tags: ['声母', '儿化'],
  note: ''
}
```
- **舌尖后塞擦音统一写 `ʈʂ / ʈʂʰ / ʂ / ʐ`**；旧写法 `tʂ / tʂʰ` 作为用户可接受读法保留，判分归一后等值。儿化的 `r` 写法（`ʂər51`）与 `ɻ` 写法等值；`A`、`ɡ`、`b` 等合法 IPA 符号不计标写规范问题。
- 音标面板提供的元音、辅音、附加符号必须能被 `GC.IPA.parseSyllable` 解析，`normRateOf` 只拦截拼音专用字母 `q / ü` 与除 `A` 外的大写字母。
- `answer` 规范：宽式/严式按题目要求；**调值用数字**（`55/35/214/51/21`，21 = 上声半上变调；**轻声不标调，不写 0**；一/不变调按实际读音写 35/51 或 51/35），音节之间**一个半角空格**；儿化写 `ɚ`（另一体系 `ɻ` 可放 `alternatives`）；送气用 `ʰ`；零声母不写；严式零声母介音可写 `j/w`。
- 同一项有可接受的其他读法 → 放 `items[i].alternatives: ['...']`（判分器应接受），`note` 里写明口径（如「按实际读音/变调」「本调见 alternatives」）。
- 儿化：主答案写**实际儿化韵**（如 花儿 xua55ɚ、事儿 ʂər51、点儿 tiɐ214ɚ），机械附加式放 alternatives。
- 纯「音位分析/发音特征」题：`items` 可为空（或放配套例词的注音作附赠），把原题问法照录进 `subQuestions`（`q`+`answer`+`keyPoints`）；只有 `q` 确实是真题原文时 `source.real:true`，配套例词在 `note` 说明。
- 诗歌标音：`items` 按句分项（一句一项），`note` 注明作者篇名。
- `subQuestions` 的 `keyPoints` 用于离线关键词判分；`answer` 是参考文字。

### 5.4 古文翻译 `translate`
```js
{
  id: 'tr-0001',
  type: 'translate',
  prompt: '把下列古文译成现代汉语。',
  text: '雍氏之役，韩征甲与粟于周。',       // 原文（可带标点；繁简按原题）
  reference: '雍氏之战时，韩国向周国征收兵甲和粮食。',  // 参考译文（须与现代汉语规范一致）
  points: [                                  // 采分点（逐句/逐短语）
    { seg: '雍氏之役', ref: '雍氏之战（时）', score: 1, keywords: ['雍氏之役', '雍氏之战'] }
  ],
  source: { school: '南京师范大学', year: 2021, code: '611', real: true, detail: '标点并翻译节选' },
  tags: ['左传', '省略句'],
  note: ''
}
```
- 原文 60–220 字为宜（可节选真题段落，节选要保留完整句）。
- `points` 覆盖每个需要译出的实词/句式/专名；`keywords` 给 1–4 个可接受译法关键词。
- `reference` 必须是通顺、准确的现代汉语译文，不许半文半白。

### 5.5 句读 `punct`
```js
{
  id: 'pu-0001',
  type: 'punct',
  prompt: '给下列古文加上新式标点（不用翻译）。',
  text: '郢人有遗燕相国书者夜书火不明因谓持烛者曰举烛云而过书举烛',
  answer: '郢人有遗燕相国书者，夜书，火不明，因谓持烛者曰：“举烛！”云而过书“举烛”。',
  reference: '楚国郢都有个人给燕国相国写信……',   // 参考译文（用于解析，可空）
  source: { school: '南京师范大学', year: 2019, code: '611', real: true, detail: '原题节选' },
  tags: ['战国策', '引号', '判断句'],
  note: ''
}
```
- **校验规则**：把 `answer` 中所有标点去掉后，必须**逐字等于** `text`（繁简、异体要一致；`answer` 里的引号/书名号等成对）。
- 原文 40–160 字；标点用中文全角 `，。；：？！、""''《》〈〉（）【】——……·「」『』`。
- 多字标点（`——`、`……`、`""`）按整体出现在两个字的间隙。

---

## 6. 模块 API（`window.PRACTICE_MODULES[type]`）

每个模块文件只注册一个对象；`app.js` 负责生命周期。**模块不碰全局布局/顶栏/判分面板**。

```js
window.PRACTICE_MODULES.syntax = {
  id: 'syntax',
  label: '句法分析',
  mount(root, ctx),      // 构建交互区；ctx = { question, savedAnswer, onChange }
                         //   onChange()：任意作答变化后调用，app 刷新「提交」按钮可用态
  getAnswer(),           // 返回原始答案对象，交给 GRADERS[type]
  setAnswer(answer),     // 回填（review 历史作答时）
  isAnswered(),          // bool：是否够判分（至少答了一部分）
  reset(),               // 清空重做
  renderSolution(root, question, userAnswer),  // 渲染标准答案 + 对照（在解析区，app 调用）
  renderResultDetail(root, question, userAnswer, gradeResult), // 可选：模块专属结果细节（如语法树 diff）
  shortcuts: [{ keys: '1-9', desc: '选择关系' }],   // 可选，app 会展示
  destroy()
};
```

### 6.1 句法分析编辑器硬性要求（mod-syntax）
- 句子按**字**展示，字与字之间是可点击的「落刀位」；移动端落刀位 ≥ 32px 命中宽度、候选以大按钮呈现。
- 点击刀位 → 弹出九种/复句关系选择（点击即落刀 + 定关系）；点击已有刀 → 可改关系或删除。
- 两种模式：**逐层分析**（默认；第一刀=第 1 层，逐层切分，实时生成层次分析图）/ **整句快切**（只判位置+关系）。
- 实时显示传统层次分析图：每层括号 + 关系名 + 成分角色（偏正→前偏后正 等）。
- **多解作答**：题目有歧义时（或用户自己发现多解），点「＋新增一种分析」可开第二/第三份独立分析；顶部用标签页切换「分析一/分析二/…」，可删除多余分析。`getAnswer()` 返回：
```js
{ analyses: [ { cuts: [ {gap, rel, span?} ], mode: 'layered' }, ... ], mode: 'layered' }
```
（单解题 `analyses` 长度为 1；兼容旧形状时可同时带当前分析的 `cuts/mode`。）
- 判分结果需能高亮：漏切位置（虚线圈）、多切位置（红色）、关系错（对比显示）；多解题还要提示「本题有 N 种读法，你分析了 k 种」。
- 答案解析必须给出**每一种读法**的层次图 + 一句话释义（meaning），并展示用户各份分析分别匹配到哪一种读法。

### 6.2 音标编辑器硬性要求（mod-ipa）
- 每个 `items[i]` 一个输入槽；音标面板**默认收起**（只留约 40px 标题栏、可一键展开/收起，折叠状态记住），展开后高度 ≤ 约 230px（窄屏 ≤ 34vh，内部可滚动），不得遮挡下方题目。
- 面板按 **元音 / 辅音** 分组（不再用声母/韵母）：
  - 元音：国际音标常用元音表符号（含 `A`），如 `a ɑ ɒ ɐ æ ɛ e ø œ ɜ ɞ ə ɘ ɵ ɤ o ɔ ʌ ɪ ʏ ʊ ɨ ʉ ɯ u i y ɚ ɿ ʅ ʮ ɥ`；
  - 辅音：`p pʰ m f t tʰ n l k kʰ x tɕ tɕʰ ɕ ts tsʰ s ʈʂ ʈʂʰ ʂ ʐ ŋ` 及常用国际音标辅音；`ŋ` 只能出现在辅音组（普通话里它是韵尾，不是声母）。
  - 声调：`55 35 214 51 21`（阴平/阳平/上声/去声/半上）；**轻声不标调，不提供 `0` 或轻声符号**。
  - 附加符号：`ʰ ʲ ʷ ̃ ˞ ː` 等少量实用符号。
- **不要预组合/提示性内容**：删除「复韵母 / 鼻韵母」「常用整体」「儿化/送气快捷按钮」等预设组合，只保留单符号按钮 + `空格 / 退格 / 清空本项` 操作。
- 点击面板符号 → 插入到**当前聚焦输入框光标处**；支持直接键盘输入；声调直接打数字，轻声则不写调值。
- 移动端面板为底部抽屉（默认收起），符号按钮 ≥ 40px。

### 6.3 义素编辑器硬性要求（Lead 实现，作为参考）
- 表格：行 = 词，列 = 用户自定义义素；点「＋义素」输入义素名（提供常用义素库 chip 辅助）；单元格循环 `+ → − → ± → 空`。
- 实时预览矩阵；提交后逐列对照标准答案。
- `getAnswer() → { sememes:[{name, values:[...]}], words:[...] }`。

### 6.4 句读编辑器硬性要求（Lead 实现，作为参考）
- 原文按字展示，字间为可点击位置；点一下弹**标点面板**（分组：句末标点 / 句中停顿 / 标号 / 引号书名号 / 删除），选中即插入；点已有标点可改/删。
- 支持引号成对（先左后右，自动提示）、书名号；显示「已加标点」预览。
- `getAnswer() → { marks: [ {gap: 6, mark: '，'} ], text?: '带标点串' }`（`gap` = 该标点前有 `gap` 个字）。

### 6.5 翻译编辑器硬性要求（mod-classical）
- 原文与译文左右/上下对照；textarea 自适应高度；提供「逐句拆行」小按钮（可选）。
- 提交后：参考译文 + 采分点对照表（命中/未命中）+ AI 批改区。

---

## 6.6 CSS 组件清单（模块直接用这些 class，不要重复造轮子）

设计令牌（`css/base.css` `:root`）：`--paper --paper-2 --surface --surface-2 --surface-3 --ink --ink-soft --ink-faint --line --line-strong --accent --accent-2 --accent-soft --gold --gold-2 --gold-soft --jade --jade-2 --jade-soft --good --bad --warn --shadow-1 --shadow-2 --shadow-pop --radius --radius-lg --font-serif --font-sans --font-mono --font-num --ease`。

`css/components.css` 已提供（模块可组合使用）：
- 按钮：`.btn` + `.btn--primary/gold/jade/ghost/danger/sm/lg/block/icon`、`.btn-row`
- 卡片：`.card`、`.card--flat/tight/accent`、`.card-title`、`.panel`、`.panel--dashed`
- 徽标：`.badge` + `.badge--gold/jade/red/real/mock`、`.tag`、`.chip`（`.is-active`）、`.chip-group`、`.chips-scroll`
- 表单：`.field` `.label` `.input` `.textarea` `.select` `.input--mono` `.hint`、`.switch`、`.seg`+`.seg-btn`
- 弹层：`.scrim` `.modal-wrap` `.modal` `.modal--wide` `.modal-hd/bd/ft` `.sheet-wrap` `.sheet`；`.toast`
- 判分：`.result-card` `.score-ring`（`--pct`）`.score-meta` `.sub-scores` `.err-list .err-item .err-code` `.ok-chip`、`.progress`、`.ai-box`
- 面板：`.palette` `.palette-hd/bd` `.palette-group` `.palette-glabel` `.palette-keys` `.palette-key`（符号面板基座，模块可直接复用）
- 展示：`.kpi-grid .kpi`、`.kv`、`.table`、`.heat-strip`、`.empty`、`.notice`、`.kbd`、`.list-item`
- 题干：`.source-line` `.prompt-text` `.sentence`
- 工具：`.hidden .sr-only .mono .num .serif .muted .faint .small .tiny .row .row-wrap .col .grow .grid-2/3/4`
- 窄屏（≤620px）符号按钮已自动放大到 42px、`.palette` 自动变底部抽屉。

模块自己的样式放 `css/module-<name>.css`，只加本模块专有类，带前缀（如 `.sx-*`、`.ip-*`、`.pu-*`、`.tr-*`），不要改全局令牌/组件样式。

---

## 7. 判分器 API（`window.GRADERS[type]`）

```js
GRADERS.syntax(question, userAnswer) -> {
  score: 0-100,                        // 总分（整数）
  passed: bool,                        // score >= question.passScore ?? 80
  sub: [ { name:'位置分', score: 47, max: 60 }, { name:'关系分', score: 28, max: 40 } ],
  errors: [
    { code:'sx_rel', name:'关系错', gap: 7,
      detail:'第 8 字后应为「主谓」，你标的是「述宾」', expected:'主谓', got:'述宾' }
  ],
  summary: '错 3 处：漏切 1、关系错 2',
  review: [...]                        // 可选：给模块渲染 diff 的结构化数据
}
```
- **错误码必须来自 `ERROR_TAXONOMY[type]`**（`window.errMeta` 可校验）；一个错处只归一个主错误码，可附带 `extraCodes`。
- 分数：0–100 整数，不出现 NaN；部分对给部分分；空答案给 0 并在 `errors` 里给「未作答」。
- 判分必须**纯函数、无 DOM 依赖、无网络**，可被 Node 直接调用（文件末尾加 `if (typeof module !== 'undefined') module.exports = ...` 以便测试，但不要用 ESM）。

### 7.1 句法判分规范（mod-syntax）
- 位置分 60：把标准树推导出的「刀位集合（字间隙）」与用户刀位比较——漏切、词内误切、多切分别计错。
- 关系分 40：对**两边都切的刀位**比较关系标签（标签同义归一：`述宾≈动宾≈述宾结构`，`偏正≈定中/状中` 需按具体切分判断，`中补≈述补`），错则记 `sx_rel`。
- 层次：同一刀位在两边所属节点跨度不同 → 记 `sx_level`（可只提示、不重复扣位置分）。
- `sub` 两项名称固定：`位置分` / `关系分`；`max` 60 / 40。
- 供 app 高亮：`review = { gaps: { [gap]: {std, user, status:'ok|miss|over|inword|rel|level'} }, stdTree: '...' }`。
- **多解题判分（`question.readings`）**：
  - 设标准读法数 N，用户提交的分析数 k（`answer.analyses`）。
  - 对每种标准读法 i，在用户的 k 份分析里找**得分最高**的一份与之匹配（同一份用户分析只能匹配一种读法，按匈牙利/贪心取最大即可，N 很小）；该读法得分 = max(该份分析的位置分+关系分, 0)；未匹配到 → 0 分。
  - 总分 = round(各读法得分之和 / N)；`sub` 仍为位置分/关系分（按各读法最佳匹配累加后按 N 平均）。
  - 若 k < N → 报 `sx_ambig`（「本题有 N 种读法，你只分析了 k 种」）；k ≥ N 不因多给分析扣分（但多余分析不参与计分）。
  - 若用户只做了 1 份而题目为单解（`tree`）→ 就按该份计分；多余分析忽略。
  - `review.readingMatch = [{readingIndex, label, analysisIndex, score}]` 供解析页展示「你的分析几 ↔ 读法几」。

### 7.2 音标判分规范（mod-ipa）
- 总 100：每项等分；每项按「声母 / 韵母 / 声调 / 标注规范」四要素比对（能解析时），四要素权重 30/40/20/10；解析失败 → 整项错并给 `ip_norm`。
- 允许用户输入：`[pʰiɛn51]`、`/pʰiɛn51/`、`pʰiɛn 51`、带调号 `pʰiɛn˥˩`；判分前归一化。
- 支持 `items[i].answer` 含多个可接受答案：用 `answer2` 或 `alternatives: ['...']`（数据侧约定：`alternatives` 数组，可选）。
- `subQuestions` 用 `keyPoints` 关键词覆盖判分（每点 1 分）；AI 可再精评。

### 7.3 义素 / 句读 / 翻译判分规范
- 义素：`required` 每命中 1 列得基础分；列内取值全对加满分、部分对按比例；`optional` 不扣不奖；多余列记 `sm_redundant` 并轻微扣分；总 100。
- 句读：断点位置分 60（标准断点命中率 - 误断惩罚）+ 标点类型分 40（同位置标点类别正确率）；错误码见 §5.5/§8。
- 翻译：内置判分按 `points` 关键词命中给采分覆盖率分；总分 100；未命中点列成「疑似漏译」，并明确提示**可点「AI 精评」**（AI 关闭时以参考译文自评）。

---

## 8. 错误类型库（`js/data/taxonomy.js`，Lead 维护）

结构：
```js
window.ERROR_TAXONOMY = {
  version: '1.0',
  common:    [ { code:'cm_careless', name:'手误/点错', short:'手误', desc:'…', why:'…', advice:'…', severity:'low' }, … ],
  syntax:    [ … ], ipa: [ … ], sememe: [ … ], translate: [ … ], punct: [ … ]
};
window.errMeta = function (type, code) { … };
```
**错误码前缀约定**：`cm_` 通用、`sx_` 句法、`ip_` 音标、`sm_` 义素、`tr_` 翻译、`pu_` 句读。
判分器/模块**只能**使用库里已有的 code；需要新增 → 先改 `taxonomy.js`（Lead 负责），再在群里通知。

---

## 9. AI 接入（`js/core/ai.js` + `js/data/skills.js`，Lead 维护）

- 供应商：**DeepSeek 直连**（`https://api.deepseek.com/chat/completions`），OpenAI 兼容；模型默认 `deepseek-chat`。
- Key 只存 `localStorage`，不外传、不写死；未配置时全部功能可用（离线判分 + 参考解析）。
- 触发时机（省 token）：**提交判分后、判定未满分时**自动调用一次「错因归类 + 一句话点拨」；翻译题提交后调用一次「逐句批改」；命中缓存不发请求；同一题不重复调用（除非用户点「重新分析」）。
- 输出 JSON 必须严格映射到 `ERROR_TAXONOMY` 的错误码；AI 返回非法 code 时丢弃该条。
- 模块如需 AI 增强，调用 `AI.assist({skillId, ctx})`，**不要自己写 fetch**。
- 设置页展示：调用次数、token 用量、缓存条数、一键清缓存。

---

## 10. 题库质量红线

1. 真题必须**可追溯**：`source.real:true` 的题，`detail` 写「原题/回忆版/节选」，并在群消息里给出出处链接或依据。
2. 句法树：叶子拼接必须等于 `sentence`；关系标签必须在词表内；**不确定分析体系的句子不出题**。
3. 音标答案：用 `ʰ ʈʂ ɕ ɿ ʅ ɚ ɛ ɔ ʊ` 等标准符号；调值数字；普通话实际读音（变调/轻声/儿化）按题目要求。
4. 翻译/句读：原文必须准确（繁简统一、无错字）；参考译文通顺；句读答案去标点后 === 原文。
5. 题目去重：同 `sentence`/同 `text`/同 `words` 不许重复（校验器会查）。
6. 每题 `note` 交代「参考答案体系 / 模拟题说明」。
7. 自检命令（必须全绿）：
   ```bash
   node practice/tests/validate-data.mjs
   ```
   （Lead 提供；输出每题的问题明细，`exit code 0` 才算通过。）

---

## 11. 协作纪律

- 共享同一个文件系统；**只改自己名下文件**；改动前先 `read`。
- 需要契约变更/新增全局 API → 消息里说清 `文件 + 函数签名 + 为什么`，等 Lead 改契约后再写。
- 每完成一批数据/模块，跑自检并在消息里报告：文件路径、题数、自检结果、已知问题。
- 禁止修改 `操作题.html`（Lead 统一加 script 标签）；禁止修改别人的 `css/*.css`；禁止在 `practice/` 外写文件（`docs/sources/` 除外=只读）。
- 测试用 Node：`node practice/tests/xxx.mjs`；浏览器验证由 Lead/QA 做。






---

## 12. 本轮修订（v1.1）

- 架构不变：仍为五大操作题（`syntax|ipa|sememe|translate|punct`），脚本加载顺序见 §3，不新增题型。
- 音标题：题库舌尖后音统一为 `ʈʂ`；`ie` 统一为 `iɛ`；补「阻挡别人」连读变调与四个多音字的语境注；`GC.IPA` 补齐面板全部辅音与儿化写法归一；`normRateOf` 改为合法符号白名单口径；编辑器补声调替换、音位小题点选插入与分区展示。
- 页面：练习页按「题目 → 作答 → 判分结果 → 答案与解析」四段分区；题目卡拆为来源行、题干行、考点行；音标页分「音标面板 / 注音项 / 音位分析」三区，解析页按音节展示声母 / 韵母 / 调值。
- 文案：清理界面、题目说明与解析中的防御性措辞、出处 URL 与编辑性提示，保留定义、条件、例证、来源与章节题号。
- 新真题素材（层次分析、标音、义素、标点、翻译）暂存 `_qa/new_questions.json` 与 `tools/build_new_questions.py`，待下一阶段用 `tools/merge_bank.py` 合并。
