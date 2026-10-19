/* 空我人生 · 人生框架种子数据（来自本人的框架材料，已提炼）
   结构：领域 → 节点（罗盘上的圆）→ 卡片（节点的内容）
   卡片：mode 'chain' 递进 / 'list' 并列 / 'gate' 入口（只做跳转）
   条目：t 主张 · nums 数字 [{v,u}] · why 为什么 · forms 形式标签 · links 关联 [{to:'节点id', item:序号}] */
window.FRAMEWORK_SEED = {
  version: 1,
  domains: [
    {
      id: 'body', name: '身心健康', sub: '稳定的能量\n是一切的基础', icon: 'health',
      desc: '身体重塑：降体脂、练肩背、保持运动员气质。',
      nodes: ['diet', 'training', 'life']
    },
    {
      id: 'self', name: '个人修炼', sub: '向内生长\n向外表达', icon: 'learn',
      desc: '沉浸、表达、运动，从内部获得滋养，向外建立链接。',
      nodes: ['hobby', 'express', 'study']
    },
    {
      id: 'career', name: '事业建设', sub: '打通事业\n不断精进', icon: 'work',
      desc: '努力打通事业，在行业里持续生产价值。',
      nodes: ['industry']
    },
    {
      id: 'wealth', name: '物质财富', sub: '投资 · 生产 · 销售', icon: 'wealth',
      desc: '物质财富由投资、生产、销售三套系统构成。',
      nodes: ['invest', 'produce', 'sell']
    },
    {
      id: 'spirit', name: '精神财富', sub: '哲学 · 价值观 · 道', icon: 'spirit',
      desc: '在喧嚣之外保留内在空间，形成自己的哲学与价值观。',
      nodes: ['philosophy', 'values', 'dao']
    },
    {
      id: 'bond', name: '关系情感', sub: '深的连接\n长的陪伴', icon: 'family',
      desc: '爱情、家庭、朋友，经营值得信赖的关系。',
      nodes: ['love', 'family', 'friends']
    }
  ],

  nodes: {
    /* ———————— 身心健康 ———————— */
    diet: {
      name: '饮食', sub: '热量 · 碳脂比 · 断食', mode: 'chain', settled: '2026-09',
      items: [
        { t: '控制总热量缺口', nums: [{ v: '300', u: '大卡缺口' }],
          why: '这是总纲领：总摄入和总消耗维持大约 300 大卡的热量缺口。' },
        { t: '降碳增脂，碳水集中在低 GI 食物',
          nums: [{ v: '30%', u: '碳水' }, { v: '35%', u: '蛋白质' }, { v: '35%', u: '脂肪' }],
          why: '从降低碳脂比到降低 GI 值，每一步都在防止血糖波动大，防止容易饿、容易馋，防止胰岛素导致的脂肪合成，增强脂肪燃烧回路。' },
        { t: '延长空腹时长，形成断食窗口',
          why: '断食状态可以让身体燃烧更多脂肪，开启细胞自噬与清理修复机制，激发长寿基因，增强免疫力，有益脑功能。' }
      ]
    },
    training: {
      name: '训练', sub: '身体重塑', mode: 'list', settled: '2026-09',
      lead: '未来一年的训练哲学：身体重塑。目标定位是凌厉的锋卫摇摆人。',
      items: [
        { t: '大力发展肩背',
          forms: ['三角肌中束', '三角肌后束', '背阔肌宽度', '大圆肌'],
          why: '释放展开度，打开肩腰比，练就横向宽度。' },
        { t: '继续降低体脂率',
          why: '保持锻炼，维持适当热量缺口，饮食管理好，睡眠管理好。低体脂是我的优势能够显现的必要条件。',
          links: [{ to: 'diet' }, { to: 'life', item: 0 }] },
        { t: '保持并增强运动能力',
          forms: ['跑步', '篮球', '游泳', '弹跳', '协调性'],
          why: '我的风格是运动员风格，而不是精瘦风格。这是定位背后的气质来源，不能放弃。' }
      ]
    },
    life: {
      name: '生活管理', sub: '睡眠 · 欲望 · 表达', mode: 'list', settled: '2026-09',
      items: [
        { t: '睡眠管理', nums: [{ v: '8', u: '小时 / 天' }, { v: '23:00', u: '前后入睡' }],
          why: '每天保证平均 8 个小时左右的睡眠，入睡时间努力调整到平均 23:00 前后。' },
        { t: '欲望管理', nums: [{ v: '3', u: '次 / 周 → 1–2 次' }],
          why: '以周为单位，每周的预算先调整为 3 次，然后逐渐下降到 1–2 次。' },
        { t: '表达管理', forms: ['刻意训练直视', '自我表达与逻辑', '语言气场'],
          why: '眼神不躲，声音不虚，观点不藏。',
          links: [{ to: 'express' }] }
      ]
    },

    /* ———————— 个人修炼 ———————— */
    hobby: {
      name: '兴趣爱好', sub: '沉浸 · 表达 · 运动', mode: 'list', settled: '2026-09',
      items: [
        { t: '沉浸型 · 专注 / 输入', forms: ['看书', '弹唱', '学外语', '朗读', '剪辑'],
          why: '让我从内部与精神上获得补充与滋养。' },
        { t: '表达型 · 输出', forms: ['写文章', '做短视频'],
          why: '让我产生创作价值感与对外链接的能力。', links: [{ to: 'express' }] },
        { t: '运动型', forms: ['跑步', '健身', '篮球', '游泳', '拳击'],
          why: '从物理上保证我的身体能量。', links: [{ to: 'training', item: 2 }] }
      ]
    },
    express: {
      name: '刻意表达', sub: '眼神 · 声音 · 观点', mode: 'list',
      lead: '眼神不躲，声音不虚，观点不藏。',
      items: [
        { t: '刻意训练直视' },
        { t: '训练自我表达与逻辑' },
        { t: '训练语言气场' }
      ]
    },
    study: {
      name: '学习精进', sub: '疯狂读书', mode: 'list',
      items: [
        { t: '疯狂读书' },
        { t: '不断精进学习' }
      ]
    },

    /* ———————— 事业建设 ———————— */
    industry: { name: '行业生产', sub: '打通事业', mode: 'list', items: [] },

    /* ———————— 物质财富 ———————— */
    invest: { name: '投资系统', sub: '让钱生钱', mode: 'list', items: [] },
    produce: { name: '生产系统', sub: '→ 行业生产', mode: 'gate', gate: 'industry',
      lead: '物质财富的生产端，具体内容写在「事业建设 · 行业生产」。', items: [] },
    sell: { name: '销售系统', sub: '→ 刻意表达', mode: 'gate', gate: 'express',
      lead: '销售即表达，具体内容写在「个人修炼 · 刻意表达」。', items: [] },

    /* ———————— 精神财富 ———————— */
    philosophy: { name: '哲学', sub: '', mode: 'list', items: [] },
    values: { name: '价值观', sub: '', mode: 'list', items: [] },
    dao: { name: '道', sub: '', mode: 'list', items: [] },

    /* ———————— 关系情感 ———————— */
    love: { name: '爱情', sub: '', mode: 'list', items: [] },
    family: { name: '家庭维护', sub: '', mode: 'list', items: [] },
    friends: { name: '朋友维护', sub: '', mode: 'list', items: [] }
  }
};
