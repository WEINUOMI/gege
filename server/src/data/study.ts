/**
 * 学习方向模板库
 *
 * 说明：学习计划的"骨架"来自这里，保证结构完整、进度可打卡；
 * 大模型只在这些骨架之上做个性化微调（可选）。这样即使模型不可用，
 * 学习模块依然能生成一份可以照着执行的周计划。
 */

export interface StudyTask {
  title: string;
  minutes: number;
  /** 该任务适合的时段提示 */
  slot?: string;
}

export interface StudyWeek {
  index: number;
  focus: string;
  tasks: StudyTask[];
}

export interface StudyPlan {
  direction: string;
  summary: string;
  weeks: StudyWeek[];
  resources: { title: string; kind: string; note: string }[];
}

export interface StudyTemplate extends StudyPlan {
  key: string;
  label: string;
  emoji: string;
}

export const STUDY_TEMPLATES: StudyTemplate[] = [
  {
    key: "ai",
    label: "AI / 大模型入门",
    emoji: "🤖",
    direction: "AI 应用入门",
    summary: "用 4 周建立「能提问、能判断、能落地」的基础能力：先学会把问题问清楚，再学会判断输出可信度，最后做一个自己的小工具。",
    weeks: [
      {
        index: 1,
        focus: "把问题问清楚",
        tasks: [
          { title: "拆解一个任务，写出 3 版不同的提问", minutes: 20, slot: "08:00" },
          { title: "对比 3 版提问的输出差异，记下结论", minutes: 15, slot: "20:00" },
        ],
      },
      {
        index: 2,
        focus: "判断输出可信度",
        tasks: [
          { title: "拿一个模型给的数字结论，回原始来源核对", minutes: 20, slot: "08:00" },
          { title: "整理一份「哪些问题不能交给模型」清单", minutes: 20, slot: "20:00" },
        ],
      },
      {
        index: 3,
        focus: "打通一个真实流程",
        tasks: [
          { title: "选一个自己每周重复做的事，写出步骤", minutes: 25, slot: "08:00" },
          { title: "用工具把这个流程做出一半", minutes: 30, slot: "20:00" },
        ],
      },
      {
        index: 4,
        focus: "产出可演示的成果",
        tasks: [
          { title: "完成小工具，录一段 2 分钟演示", minutes: 30, slot: "08:00" },
          { title: "复盘：哪一步最花时间，下次怎么省", minutes: 20, slot: "20:00" },
        ],
      },
    ],
    resources: [
      { title: "《中国居民膳食指南》式的结构化提问练习：自建 20 条提问模板库", kind: "练习", note: "自己的模板库比收藏别人的提示词更值钱" },
      { title: "模型官方文档（豆包 / DeepSeek）的「能力与限制」章节", kind: "文档", note: "先读限制，比读能力更有用" },
      { title: "任一开源大模型的技术报告摘要", kind: "阅读", note: "只看摘要与局限部分即可" },
    ],
  },
  {
    key: "english",
    label: "英语口语",
    emoji: "🗣️",
    direction: "英语口语",
    summary: "4 周把「看得懂」变成「说得出」：每天 20 分钟输入 + 输出，重点是开口频次而不是单次时长。",
    weeks: [
      { index: 1, focus: "开口习惯", tasks: [{ title: "跟读一段 1 分钟音频，录音对比", minutes: 20, slot: "08:00" }, { title: "用英语复述今天做了什么（3 句）", minutes: 10, slot: "21:00" }] },
      { index: 2, focus: "场景表达", tasks: [{ title: "练一个固定场景（点餐/开会/自我介绍）", minutes: 20, slot: "08:00" }, { title: "把常用句抄成自己的小卡片", minutes: 10, slot: "21:00" }] },
      { index: 3, focus: "连续表达", tasks: [{ title: "就一个话题连续说 2 分钟", minutes: 20, slot: "08:00" }, { title: "听回放，改掉 2 个口头语", minutes: 10, slot: "21:00" }] },
      { index: 4, focus: "真实对话", tasks: [{ title: "找一次真人/AI 对话练习 15 分钟", minutes: 15, slot: "08:00" }, { title: "整理这月最常用的 20 句", minutes: 15, slot: "21:00" }] },
    ],
    resources: [
      { title: "BBC Learning English（免费，按场景分册）", kind: "音频", note: "每段 1–3 分钟，适合跟读" },
      { title: "《English Pod》对话音频", kind: "音频", note: "语速真实，适合第 3 周起" },
      { title: "自建「我的场景句库」", kind: "练习", note: "只记自己真会用的句子" },
    ],
  },
  {
    key: "code",
    label: "编程 / Python",
    emoji: "💻",
    direction: "Python 入门",
    summary: "4 周从小白到能写出一个解决自己问题的小脚本，每天 30 分钟，边写边学不看完教程再动手。",
    weeks: [
      { index: 1, focus: "环境与基础语法", tasks: [{ title: "装好环境，跑通第一个脚本", minutes: 30, slot: "08:00" }, { title: "练 5 道变量与循环小题", minutes: 20, slot: "20:00" }] },
      { index: 2, focus: "数据结构与函数", tasks: [{ title: "用列表/字典处理一份表格数据", minutes: 30, slot: "08:00" }, { title: "把重复代码抽成函数", minutes: 20, slot: "20:00" }] },
      { index: 3, focus: "读写文件与调库", tasks: [{ title: "读一个 CSV 并做统计", minutes: 30, slot: "08:00" }, { title: "用一个第三方库完成任务", minutes: 20, slot: "20:00" }] },
      { index: 4, focus: "做一个小工具", tasks: [{ title: "写一个自己每天会用的小脚本", minutes: 30, slot: "08:00" }, { title: "补上异常处理和说明", minutes: 20, slot: "20:00" }] },
    ],
    resources: [
      { title: "Python 官方教程（中文版）", kind: "文档", note: "前 6 章足够覆盖入门" },
      { title: "《Python Crash Course》前半本", kind: "书", note: "边看边敲，不要只看" },
      { title: "LeetCode 简单题前 30 道", kind: "练习", note: "每天 1 道即可" },
    ],
  },
  {
    key: "writing",
    label: "写作 / 自媒体",
    emoji: "✍️",
    direction: "写作与内容输出",
    summary: "4 周从「写不出」到「能稳定发」：先解决选题，再解决结构，最后解决持续输出。",
    weeks: [
      { index: 1, focus: "选题与素材", tasks: [{ title: "收集 10 个自己真实遇到的问题", minutes: 20, slot: "08:00" }, { title: "选 1 个写成 300 字", minutes: 25, slot: "21:00" }] },
      { index: 2, focus: "结构", tasks: [{ title: "用「问题—原因—做法」重写一篇", minutes: 25, slot: "08:00" }, { title: "拆解 1 篇同领域爆款的结构", minutes: 20, slot: "21:00" }] },
      { index: 3, focus: "持续输出", tasks: [{ title: "连写 3 天，每天 300 字", minutes: 25, slot: "08:00" }, { title: "把 3 篇合成一篇长文", minutes: 25, slot: "21:00" }] },
      { index: 4, focus: "发布与复盘", tasks: [{ title: "发出去 1 篇，收集 3 条真实反馈", minutes: 20, slot: "08:00" }, { title: "复盘数据，定下月选题", minutes: 20, slot: "21:00" }] },
    ],
    resources: [
      { title: "《金字塔原理》前 3 章", kind: "书", note: "解决「说了但没重点」" },
      { title: "同类账号近 30 天高赞内容 10 篇", kind: "拆解", note: "只拆结构，不抄内容" },
      { title: "自建素材库（问题/案例/数据）", kind: "练习", note: "素材库比灵感靠谱" },
    ],
  },
  {
    key: "cert",
    label: "考证 / 系统学习",
    emoji: "📚",
    direction: "考证备考",
    summary: "4 周建立可持续的备考节奏：先摸清题型与分值分布，再按分值分配时间，最后用真题校准。",
    weeks: [
      { index: 1, focus: "摸底", tasks: [{ title: "做一套真题，记录得分与耗时", minutes: 40, slot: "08:00" }, { title: "整理各章分值占比", minutes: 20, slot: "21:00" }] },
      { index: 2, focus: "主攻高分区", tasks: [{ title: "学占比最高的 2 章", minutes: 40, slot: "08:00" }, { title: "做对应章节题并记错因", minutes: 25, slot: "21:00" }] },
      { index: 3, focus: "补短板", tasks: [{ title: "攻错得最多的 1 章", minutes: 40, slot: "08:00" }, { title: "错题重做一遍", minutes: 20, slot: "21:00" }] },
      { index: 4, focus: "模考", tasks: [{ title: "限时模考一套", minutes: 45, slot: "08:00" }, { title: "整理「必背 20 条」", minutes: 20, slot: "21:00" }] },
    ],
    resources: [
      { title: "官方考试大纲", kind: "文档", note: "大纲没写的通常不考" },
      { title: "近 3 年真题", kind: "题库", note: "真题的价值高于任何模拟题" },
      { title: "自建错题本（按错因分类，不按章节）", kind: "练习", note: "错因分类才能对症" },
    ],
  },
  {
    key: "reading",
    label: "读书",
    emoji: "📖",
    direction: "主题阅读",
    summary: "4 周读完 1 本书并留下可复用的笔记：读完不算完成，能讲出来才算。",
    weeks: [
      { index: 1, focus: "搭框架", tasks: [{ title: "读目录与序言，画出全书结构", minutes: 20, slot: "08:00" }, { title: "读第 1–2 章并写 3 句摘要", minutes: 25, slot: "21:00" }] },
      { index: 2, focus: "读主体", tasks: [{ title: "读第 3–5 章", minutes: 30, slot: "08:00" }, { title: "记 3 个能马上用的观点", minutes: 15, slot: "21:00" }] },
      { index: 3, focus: "读完", tasks: [{ title: "读完剩余章节", minutes: 30, slot: "08:00" }, { title: "用 200 字讲清全书", minutes: 20, slot: "21:00" }] },
      { index: 4, focus: "用起来", tasks: [{ title: "挑 1 个观点实践 3 天", minutes: 20, slot: "08:00" }, { title: "写复盘：有效/无效各一条", minutes: 20, slot: "21:00" }] },
    ],
    resources: [
      { title: "同主题的 2 篇高质量书评", kind: "阅读", note: "用来校验自己的理解" },
      { title: "自建「一句话摘要卡」", kind: "练习", note: "每章一张" },
      { title: "费曼法：讲给一个不懂的人听", kind: "练习", note: "讲不清就是没读懂" },
    ],
  },
];

export function findTemplate(direction: string): StudyTemplate {
  const d = (direction || "").trim();
  if (!d) return STUDY_TEMPLATES[0];
  const exact = STUDY_TEMPLATES.find((t) => t.label === d || t.key === d || t.direction === d);
  if (exact) return exact;
  const fuzzy = STUDY_TEMPLATES.find((t) => d.includes(t.label) || t.label.includes(d));
  if (fuzzy) return fuzzy;
  return {
    ...STUDY_TEMPLATES[0],
    key: "custom",
    label: d,
    direction: d,
    summary: `围绕「${d}」设计的 4 周计划：先把目标拆成能每天完成的小动作，再用每周复盘校正方向。`,
    resources: [
      { title: `检索「${d}」的入门路径与大纲`, kind: "检索", note: "先找体系，再找资料" },
      { title: "自建进度表与错题/难点本", kind: "练习", note: "记录比收藏有用" },
      { title: "找一个能讲给别人的输出场景", kind: "练习", note: "输出倒逼输入" },
    ],
  };
}
