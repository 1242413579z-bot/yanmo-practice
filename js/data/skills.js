/* ============================================================================
   practice/js/data/skills.js — 内置提示词（AI skill）+ 离线方法库（METHODS）
   AI 调用纪律：短系统提示 + 紧凑用户负载 + 严格 JSON + 低 max_tokens。
   ========================================================================== */
(function () {
  'use strict';

  /* ============================ 一、离线方法库 ============================ */
  window.METHODS = [
    {
      id: 'syntax-steps',
      title: '层次分析法 · 五步操作',
      tag: '句法',
      body: [
        '① 通读：先读两遍，标出标点、关联词，判断是单句还是复句。',
        '② 抓主干：单句先找谓语中心词（动词/形容词），再找主语、宾语；复句先定第一层关系。',
        '③ 第一刀：在最大成分之间切（主谓 / 状中 / 述宾 / 复句第一层），标关系。',
        '④ 逐层下切：每次只切一个成分内部，切到词为止（题目要求「分析到词」时）。',
        '⑤ 复核：叶子按顺序拼回去要等于原句；数一数刀数 = 词数 − 1（二合切分）；关系标签与结构是否自洽。'
      ]
    },
    {
      id: 'syntax-rels',
      title: '九种基本关系 · 判定速查',
      tag: '句法',
      body: [
        '主谓：谁/什么 + 怎么样。前后是陈述关系。',
        '述宾：动词 + 受事/结果/处所等宾语，动词能带宾语。',
        '偏正：修饰语 + 中心语。定语修饰名词（的），状语修饰动词/形容词（地）。',
        '中补：中心语 + 补语，补语说明结果/程度/趋向/可能/数量（得）。',
        '联合：并列、对等，可加「和/或/而」，互换位置意思基本不变。',
        '连谓：两个动词短语连用，同属一个主语，有先后/方式/目的关系，中间不能加「而」以外的连接。',
        '兼语：前动词的宾语兼作后动词的主语（请/叫/让/使/派/选/有）。',
        '双宾：动词后带两个宾语（近宾=人，远宾=物）：给我一本书、问我一个问题。',
        '介宾：介词 + 宾语（从、向、把、被、对、关于、沿着……），整体常作状语/补语。',
        '附加：的字短语（卖菜的）、数量（三本）、方位（桌子上）、同位（首都北京）、比况（像……一样）。'
      ]
    },
    {
      id: 'compound-rels',
      title: '复句关系 · 关联词速记',
      tag: '句法',
      body: [
        '并列：既……又、不是……而是、一边……一边（分句地位平等）。',
        '承接：先……然后、就、便、于是（时间/事理先后）。',
        '递进：不但……而且、甚至、何况（后句更进一步）。',
        '选择：或者……或者、是……还是、宁可……也不。',
        '转折：虽然……但是、然而、却、不过（前后相反）。',
        '因果：因为……所以、因此、以致、既然……就。',
        '假设：如果……就、即使……也、要是、倘若（后句是假设的结果/让步结果）。',
        '条件：只要……就、只有……才、无论……都（前者是条件）。',
        '目的：为了、以便、以免、好让（前句表目的用「为了」，后句表目的用「以便」）。',
        '让步：尽管……还是、即使……也（先退一步再转折）。',
        '解说：即、就是说、例如、总之（后句解释/总结前句）。'
      ]
    },
    {
      id: 'sememe-steps',
      title: '义素分析法 · 四步',
      tag: '义素',
      body: [
        '① 定语义场：确认这组词是同一类事物/同一层级（如亲属称谓、牲畜、行走方式），找出共同义素。',
        '② 两两比较：任意两个词，意义差在哪，就设一个义素；反复比较直到所有词能两两区分。',
        '③ 列矩阵：行为词、列为义素，交叉处填 + / −（少数填 ±）。',
        '④ 复查：去掉任一个义素后是否还有词无法区分？能区分则义素冗余；不能区分则缺义素。',
        '命名规范：用肯定项名词/形容词（男性、成年、直系），同一概念全表统一写法。'
      ]
    },
    {
      id: 'ipa-quick',
      title: '普通话国际音标 · 速查',
      tag: '音标',
      body: [
        '声母 21 个（IPA）：p pʰ m f t tʰ n l k kʰ x tɕ tɕʰ ɕ ts tsʰ s ʈʂ ʈʂʰ ʂ ʐ（零声母不写）。',
        '韵母常用：a o ɤ ə ɛ e i u y ɿ ʅ ɚ；复元音 ai ei ɑu ou；鼻韵母 an ən ɑŋ ɤŋ；介音 i u y 组合 ia iɛ iɑu iou iɛn in iɑŋ iŋ iʊŋ ua uo uai uei uan uən uɑŋ uɤŋ yɛ yɛn yn。',
        '声调调值：阴平 55、阳平 35、上声 214、去声 51；轻声不标调；上声变调：上声+上声→35，上声+非上声→21（半上）。',
        '「一」变调：去声前读 35，非去声前读 51，单念/词尾读 55；「不」变调：去声前读 35。',
        '儿化：一个音节 + 卷舌，韵母按规则变：[ɚ] 前加卷舌或换韵（花儿 xuaɚ、点儿 tiɐɚ）。',
        'i 的三个音素：[i]（基 tɕi）、[ɿ]（资 tsɿ）、[ʅ]（知 tʂʅ）；/a/ 音位变体：[a]（安 an、爱 ai）、[ɑ]（昂 ɑŋ）、[ɛ]（烟 iɛn）、[æ]（yuan? 实际 [ɥɛn]）。'
      ]
    },
    {
      id: 'classical-trans',
      title: '古文翻译 · 六步',
      tag: '古文',
      body: [
        '① 先句读：抓「者、也、矣、焉、曰、故、然、则」等标志断句。',
        '② 逐词落实：古今异义、通假字、词类活用、虚词用法逐个辨明。',
        '③ 判句式：判断句（者…也）、被动句（为…所、见、于）、宾语前置（之/是/否定句代词）、定语后置（之…者）、状语后置（于/以）、省略句。',
        '④ 直译为主：字字落实，语序按现代汉语调整，省略成分补出（加括号）。',
        '⑤ 专名保留：人名地名书名官名不译（必要时加注），年号、朝代按习惯处理。',
        '⑥ 通读润色：检查语气、逻辑、文体（叙事/议论/抒情），确保通顺不丢原意。'
      ]
    },
    {
      id: 'punct-steps',
      title: '句读 · 四招',
      tag: '句读',
      body: [
        '① 抓动词定句：一个主谓结构通常一句；先找谓语，再往前找主语、往后找宾语。',
        '② 抓虚词定断：句尾「也/矣/焉/乎/哉/耳」后断；句首「夫/盖/故/然/则/而/且」前断；「曰/云/言」后起引语。',
        '③ 抓结构定连：介宾短语、定语后置、宾语前置、双宾、兼语不能拦腰断；固定结构（于是、可以、虽然、无论、所以、是以）整体不拆。',
        '④ 通读复验：断完逐句读一遍，读不通就回退，标点类型按语气与句间关系定。'
      ]
    },
    {
      id: 'ambiguity-list',
      title: '常见歧义结构 · 清单',
      tag: '句法',
      body: [
        '的：三个学校的学生 / 热爱人民的军队 / 卖菜的老太太 / 开刀的是他父亲。',
        '和：小王和小李结婚了 / 我和他的老师。',
        '在：在火车上写字 / 在图书馆看书。',
        '对：对他的意见 / 对他的帮助。',
        '数量：三个学校的校长 / 咬死了猎人的狗。',
        '动宾/偏正：学习文件 / 研究计划 / 出租汽车。',
        '多义动词：洗得干净（结果/可能）、烧了一车炭（烧掉/烧制）、走了三个小时（行走/离开）。',
        '处理：找出两种切分、分别释义、说明指代/结构差异，必要时用变换或增删词语分化。'
      ]
    }
  ];

  /* ============================ 二、AI Skills ============================ */
  // 通用输出纪律
  var OUTPUT_RULE = '\n只输出一个 JSON 对象，不要 markdown、不要解释、不要多余文字。全部用简体中文。';

  function taxList(type) {
    var arr = (window.ERROR_TAXONOMY && window.ERROR_TAXONOMY[type]) || [];
    // 紧凑：code=名称
    return arr.map(function (e) { return e.code + '=' + e.name; }).join('；');
  }

  function compactJSON(obj) {
    try { return JSON.stringify(obj); } catch (e) { return String(obj); }
  }

  window.SKILLS = {
    /* ---------- 1. 错因归类（提交后做错时自动调用） ---------- */
    classify: {
      id: 'classify',
      title: '错因归类 + 一句话点拨',
      desc: '内置判分器给出结构化差异后，由 AI 把错误精准归入错误类型库，并给出一条可执行的纠错建议。',
      when: '每次提交且未满分、且设置了 DeepSeek Key 时自动触发一次（同一答案命中缓存不重复调用）。',
      maxTokens: 700,
      temperature: 0.1,
      json: true,
      system: function (ctx) {
        return '你是语言学考研阅卷老师，负责把学生的错因归入给定错误类型表，并用一句话点拨。\n' +
          '错误类型表（只能用这些 code）：' + taxList(ctx.type) + '；通用：' + taxList('common') + '。\n' +
          '规则：每个错处只归一个最贴近的 code；不要编造 code；不确定用 cm_concept。' +
          OUTPUT_RULE +
          '\nJSON 结构：{"oneLine":"一句话点拨(≤40字)","errors":[{"code":"sx_rel","where":"第7字后","why":"为什么错(≤30字)","fix":"怎么改(≤30字)"}],"drill":"下道题该练什么(≤20字)"}';
      },
      build: function (ctx) {
        var q = ctx.question || {};
        var pack = {
          type: ctx.type,
          question: {
            prompt: q.prompt || '',
            sentence: q.sentence || q.text || q.words || '',
            tree: q.tree || null,
            points: q.points ? q.points.map(function (p) { return p.seg; }) : null,
            reference: q.reference || null,
            sememes: q.sememes ? q.sememes.map(function (s) { return s.name; }) : null,
            items: q.items ? q.items.map(function (it) { return it.text + '=>' + it.answer; }) : null
          },
          userAnswer: ctx.userAnswer,
          standard: ctx.standard || null,
          diff: ctx.diff || null,
          score: ctx.score
        };
        return '题与学生作答：' + compactJSON(pack) + '\n请归类错因。';
      },
      parse: function (text) {
        return safeParse(text);
      }
    },

    /* ---------- 2. 翻译精评（翻译题提交后按需） ---------- */
    translate_review: {
      id: 'translate_review',
      title: '古文翻译精评',
      desc: '逐句对照参考译文，找出漏译、误译、句式与虚词问题，给出可操作的修改建议。',
      when: '古文翻译题提交后，点「AI 精评」时调用（内置采分点判分之外的人工智能复核）。',
      maxTokens: 900,
      temperature: 0.1,
      json: true,
      system: function () {
        return '你是古代汉语考研阅卷老师。对照参考译文批改学生译文：逐句找漏译/误译/句式错/虚词错/专名错，按错误类型表归类。\n' +
          '错误类型表（只能用这些 code）：' + taxList('translate') + '。\n' +
          '不要重写整篇译文，只写改进要点。' + OUTPUT_RULE +
          '\nJSON 结构：{"score":整数0-100,"comment":"总评(≤60字)","errors":[{"code":"tr_word","where":"原句","why":"错在哪(≤30字)","fix":"应译为(≤30字)"}],"punchlines":["最该记住的1-3条(每条≤30字)"]}';
      },
      build: function (ctx) {
        var q = ctx.question || {};
        return '原文：' + (q.text || '') + '\n参考译文：' + (q.reference || '') + '\n采分点：' +
          (q.points || []).map(function (p) { return p.seg + '→' + p.ref; }).join('；') +
          '\n学生译文：' + (ctx.userText || '') + '\n请批改。';
      },
      parse: function (text) { return safeParse(text); }
    },

    /* ---------- 3. 本题精讲（按需） ---------- */
    explain: {
      id: 'explain',
      title: '本题精讲',
      desc: '把这道题的分析过程拆成「先找什么 → 怎么切 → 标什么关系」，只讲这一题，不泛泛而谈。',
      when: '做错或看了解析还想不通时，点「AI 精讲」调用。',
      maxTokens: 600,
      temperature: 0.2,
      json: true,
      system: function () {
        return '你是语言学考研老师，只讲当前这一道题。用「步骤 → 判定依据 → 易错点」的结构，务必具体到本题的字词，不要讲通用理论。' +
          OUTPUT_RULE + '\nJSON 结构：{"steps":["步骤1(≤40字)","步骤2","步骤3"],"trap":"本题最易错的一点(≤40字)","check":"自检方法(≤30字)"}';
      },
      build: function (ctx) {
        var q = ctx.question || {};
        return '题型：' + ctx.type + '\n题目：' + (q.prompt || '') + '\n题干：' + (q.sentence || q.text || (q.words || []).join('、') || '') +
          '\n标准答案：' + (q.tree || q.answer || q.reference || '') + '\n学生答案：' + compactJSON(ctx.userAnswer) + '\n请只讲这一题。';
      },
      parse: function (text) { return safeParse(text); }
    },

    /* ---------- 4. 音标兜底解析（内置解析失败时） ---------- */
    ipa_assist: {
      id: 'ipa_assist',
      title: '音标批注助手',
      desc: '当学生输入写法特殊、内置解析器无法逐要素比对时，由 AI 判断对错并指出声母/韵母/声调哪一项不同。',
      when: '音标题提交后，若某项内置解析失败（未知符号/格式），自动兜底调用。',
      maxTokens: 400,
      temperature: 0,
      json: true,
      system: function () {
        return '你是普通话语音学老师。比对标准音标与学生音标，逐项判断声母、韵母、声调是否一致。只输出 JSON。' +
          '\nJSON 结构：{"items":[{"text":"字词","correct":true,"diff":"若错写哪一项(≤20字)","right":"正确音标"}]}';
      },
      build: function (ctx) {
        return '标准：' + compactJSON(ctx.standard) + '\n学生：' + compactJSON(ctx.user) + '\n请比对。';
      },
      parse: function (text) { return safeParse(text); }
    },

    /* ---------- 5. 义素命名归类 ---------- */
    sememe_naming: {
      id: 'sememe_naming',
      title: '义素命名归类',
      desc: '学生自拟的义素名与标准义素不同名时，判断是否等价、是否冗余、是否存在命名不规范。',
      when: '义素题提交后，若有内置别名表无法匹配的义素列，调用一次。',
      maxTokens: 400,
      temperature: 0,
      json: true,
      system: function () {
        return '你是现代汉语语义学老师。判断学生义素与标准义素是否等价，指出冗余/缺失/命名不当。' + OUTPUT_RULE +
          '\nJSON 结构：{"matched":[{"student":"学生的义素名","standard":"对应标准义素名或null","equivalent":true,"reason":"≤20字"}],"extra":["多余义素"],"missing":["缺失义素"],"comment":"≤40字"}';
      },
      build: function (ctx) {
        return '标准义素：' + (ctx.standardSememes || []).join('、') + '\n学生义素：' + (ctx.userSememes || []).join('、') + '\n词语：' + (ctx.words || []).join('、') + '\n请判断。';
      },
      parse: function (text) { return safeParse(text); }
    },

    /* ---------- 6. 断句争议判断 ---------- */
    punct_assist: {
      id: 'punct_assist',
      title: '断句争议判断',
      desc: '学生断法与标准答案不同但可能也讲得通时，判断是否可接受、理由是什么。',
      when: '句读题提交后，若差异处涉及争议断法（可选按钮触发）。',
      maxTokens: 300,
      temperature: 0,
      json: true,
      system: function () {
        return '你是古代汉语老师。判断学生对古文的另一种断句是否可接受，给出简短理由。' + OUTPUT_RULE +
          '\nJSON 结构：{"acceptable":true,"reason":"≤50字","suggestion":"≤30字"}';
      },
      build: function (ctx) {
        return '原文：' + (ctx.text || '') + '\n标准答案：' + (ctx.answer || '') + '\n学生答案：' + (ctx.userAnswer || '') + '\n请判断。';
      },
      parse: function (text) { return safeParse(text); }
    },

    /* ---------- 7. 错题周报 / 复习计划 ---------- */
    review_plan: {
      id: 'review_plan',
      title: '错题诊断与复习计划',
      desc: '根据最近的错题类型分布和考点分布，生成一份针对性的 3 天复习计划。',
      when: '错题本页点「生成复习计划」时调用（一次请求，看最近 30 条）。',
      maxTokens: 700,
      temperature: 0.3,
      json: true,
      system: function () {
        return '你是考研语言学助教。根据错题统计生成诊断与 3 天计划：诊断要指出最该补的 1-2 个能力短板，计划要具体到题型+数量+方法。' + OUTPUT_RULE +
          '\nJSON 结构：{"diagnosis":"≤80字","focus":["考点1","考点2"],"plan":[{"day":"今天","task":"≤40字"}],"tip":"一句话"}';
      },
      build: function (ctx) {
        return '错题统计：' + compactJSON(ctx.summary) + '\n最近错题：' + compactJSON(ctx.recent) + '\n请生成诊断与计划。';
      },
      parse: function (text) { return safeParse(text); }
    },

    /* ---------- 8. 考点答疑（AI 助教） ---------- */
    concept_qa: {
      id: 'concept_qa',
      title: '考点答疑',
      desc: '就语言学操作题相关的概念、判定规则提问，回答控制在 300 字以内并配一个本题型例子。',
      when: '「AI 助教」页自由提问时。',
      maxTokens: 600,
      temperature: 0.3,
      json: false,
      system: function () {
        return '你是南京师范大学语言学及应用语言学考研的助教。回答要准确、直接、口语化，控制在 300 字以内；能举例就举一个现代汉语/古汉语的例子；不确定的知识点要说明有争议。不要输出 markdown 标题。';
      },
      build: function (ctx) { return ctx.question || ''; },
      parse: function (text) { return { text: String(text || '').trim() }; }
    },

    /* ---------- 9. 歧义多解 ---------- */
    ambiguity: {
      id: 'ambiguity',
      title: '歧义结构双解',
      desc: '句法分析遇到歧义结构时，列出所有可能切分及各自意义，并给分化方法。',
      when: '点「歧义多解」按钮时调用。',
      maxTokens: 500,
      temperature: 0.2,
      json: true,
      system: function () {
        return '你是现代汉语语法老师。对一个歧义结构给出全部合理解释、每种的结构切分差异、以及分化歧义的方法。' + OUTPUT_RULE +
          '\nJSON 结构：{"readings":[{"sense":"意思1","structure":"层次/结构差异(≤40字)"}],"how":"分化方法(≤60字)"}';
      },
      build: function (ctx) { return '歧义结构：' + (ctx.sentence || '') + '\n请给出所有解释。'; },
      parse: function (text) { return safeParse(text); }
    }
  };

  function safeParse(text) {
    if (!text) return null;
    var s = String(text).trim();
    // 去掉可能的 ```json 包裹
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    var i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
    try { return JSON.parse(s); } catch (e) { return { raw: String(text).slice(0, 600) }; }
  }

  window.SKILLS_BY_ID = window.SKILLS;
  window.safeParseJSON = safeParse;
})();

