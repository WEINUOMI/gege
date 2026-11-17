/**
 * 本地运动库（规则化推荐引擎的数据源）
 *
 * 热量估算采用运动生理学通用公式：
 *   kcal/min = MET × 3.5 × 体重(kg) / 200
 * 该公式用于估算量级，实际消耗受个体差异、动作质量影响。
 * MET 取值参考《ACSM 运动测试与运动处方指南》常见活动强度区间。
 */

export interface Workout {
  id: string;
  name: string;
  emoji: string;
  /** 代谢当量 */
  met: number;
  /** 建议时长（分钟） */
  minutes: number;
  intensity: "低" | "中" | "较高";
  /** 主要锻炼部位 */
  parts: string[];
  tags: string[];
  howTo: string[];
  cautions: string[];
  /** 命中这些病史时不推荐 */
  avoidFor: string[];
  goodFor: string[];
  /** 视频跟练的搜索关键词（跳转站内搜索，不内嵌第三方视频） */
  videoKeyword: string;
}

const SRC = "ACSM 运动测试与运动处方指南";

export const WORKOUTS: Workout[] = [
  {
    id: "w01",
    name: "快走",
    emoji: "🚶",
    met: 4.3,
    minutes: 30,
    intensity: "中",
    parts: ["全身", "心肺"],
    tags: ["零基础", "护关节", "可碎片时间"],
    howTo: [
      "抬头挺胸，肩膀放松，步幅保持自然不要跨大步",
      "速度以能说话但不能唱歌为准，约每分钟 110–120 步",
      "走完做 3 分钟慢速收尾，别立刻停下",
    ],
    cautions: ["膝盖不适时改在塑胶跑道或平路走"],
    avoidFor: [],
    goodFor: ["高血压", "糖尿病", "高血脂", "脂肪肝", "骨质疏松"],
    videoKeyword: "快走 正确姿势 跟练",
  },
  {
    id: "w02",
    name: "八段锦",
    emoji: "🧘",
    met: 3.0,
    minutes: 18,
    intensity: "低",
    parts: ["全身", "柔韧"],
    tags: ["传统养生", "低冲击", "中老年友好"],
    howTo: [
      "八个动作顺序完成，每个动作 6 次呼吸",
      "动作配合呼吸，起吸落呼，不憋气",
      "全程膝盖微屈，不要锁死关节",
    ],
    cautions: ["颈椎不适者做「双手托天」时不要过度后仰"],
    avoidFor: [],
    goodFor: ["高血压", "冠心病", "骨质疏松", "慢性胃炎"],
    videoKeyword: "八段锦 完整版 跟练",
  },
  {
    id: "w03",
    name: "太极二十四式",
    emoji: "🥋",
    met: 3.0,
    minutes: 25,
    intensity: "低",
    parts: ["全身", "平衡"],
    tags: ["低冲击", "练平衡", "舒缓"],
    howTo: [
      "先学 4–6 个基础动作，不求全套",
      "重心转换要慢，膝盖方向与脚尖一致",
      "呼吸自然，不追求低架",
    ],
    cautions: ["膝关节炎明显者减小下蹲幅度"],
    avoidFor: [],
    goodFor: ["高血压", "骨质疏松", "冠心病"],
    videoKeyword: "24式太极拳 分解教学",
  },
  {
    id: "w04",
    name: "慢跑",
    emoji: "🏃",
    met: 7.0,
    minutes: 25,
    intensity: "较高",
    parts: ["全身", "心肺"],
    tags: ["燃脂效率高", "提升心肺"],
    howTo: [
      "前 5 分钟快走热身，再进入慢跑",
      "步频快、步幅小，脚掌落在身体正下方",
      "心率控制在 (220−年龄)×60%~70% 区间",
    ],
    cautions: ["体重基数较大或膝痛者先用快走替代", "跑步中出现胸闷、头晕立即停止"],
    avoidFor: ["冠心病", "骨质疏松"],
    goodFor: ["高血压", "糖尿病", "高血脂", "脂肪肝"],
    videoKeyword: "慢跑 新手 姿势 教学",
  },
  {
    id: "w05",
    name: "自重深蹲",
    emoji: "🦵",
    met: 5.0,
    minutes: 15,
    intensity: "中",
    parts: ["下肢", "臀腿"],
    tags: ["增肌", "提升代谢", "无需器械"],
    howTo: [
      "双脚与肩同宽，脚尖略外八",
      "臀部向后坐，下蹲至大腿与地面平行即可",
      "起身时呼气，膝盖不内扣",
    ],
    cautions: ["膝痛时改为靠墙静蹲或减小幅度"],
    avoidFor: ["骨质疏松"],
    goodFor: ["糖尿病", "脂肪肝", "高血脂"],
    videoKeyword: "自重深蹲 标准动作 教学",
  },
  {
    id: "w06",
    name: "跪姿俯卧撑",
    emoji: "💪",
    met: 3.8,
    minutes: 12,
    intensity: "中",
    parts: ["上肢", "胸部", "核心"],
    tags: ["增肌", "新手友好"],
    howTo: ["双膝着地，双手略宽于肩", "身体成一条直线，肘部向下约 45 度", "下放至胸部接近地面再推起，全程不塌腰"],
    cautions: ["手腕不适可用俯卧撑架或改为靠墙推"],
    avoidFor: [],
    goodFor: ["骨质疏松"],
    videoKeyword: "跪姿俯卧撑 新手教学",
  },
  {
    id: "w07",
    name: "臀桥",
    emoji: "🌉",
    met: 3.5,
    minutes: 12,
    intensity: "低",
    parts: ["臀腿", "核心"],
    tags: ["护腰", "久坐救星", "低冲击"],
    howTo: ["仰卧屈膝，双脚踩地与髋同宽", "收紧臀部把髋抬起至肩髋膝成直线", "顶点停 2 秒再缓慢落下"],
    cautions: ["抬起时不要过度挺腰，感觉在臀部而不是腰部"],
    avoidFor: [],
    goodFor: ["骨质疏松", "高血脂"],
    videoKeyword: "臀桥 正确做法 教学",
  },
  {
    id: "w08",
    name: "平板支撑",
    emoji: "🧱",
    met: 3.3,
    minutes: 8,
    intensity: "中",
    parts: ["核心"],
    tags: ["核心训练", "时间短"],
    howTo: ["小臂着地，肘在肩正下方", "收紧腹部与臀部，身体成一条直线", "从 20 秒开始，每组间歇 30 秒"],
    cautions: ["腰部下沉说明核心已疲劳，立即结束该组", "高血压人群注意正常呼吸，不可憋气"],
    avoidFor: [],
    goodFor: ["脂肪肝"],
    videoKeyword: "平板支撑 标准姿势 教学",
  },
  {
    id: "w09",
    name: "弹力带划船",
    emoji: "🎗️",
    met: 4.0,
    minutes: 15,
    intensity: "中",
    parts: ["背部", "上肢"],
    tags: ["改善圆肩", "增肌", "居家可做"],
    howTo: ["弹力带固定在与胸同高的位置", "双手拉向身体，肩胛骨向后夹紧", "缓慢回放，保持张力"],
    cautions: ["固定点要牢靠，避免回弹伤人"],
    avoidFor: [],
    goodFor: ["骨质疏松"],
    videoKeyword: "弹力带划船 教学",
  },
  {
    id: "w10",
    name: "跳绳",
    emoji: "🪢",
    met: 11.0,
    minutes: 12,
    intensity: "较高",
    parts: ["全身", "心肺"],
    tags: ["高效燃脂", "耗时短"],
    howTo: ["前脚掌落地，膝盖微屈缓冲", "手腕摇绳，不用大臂", "30 秒跳 + 30 秒歇，循环 12 组"],
    cautions: ["体重基数大或膝踝关节不适者不建议", "硬地面需垫瑜伽垫"],
    avoidFor: ["骨质疏松", "冠心病"],
    goodFor: ["高血脂", "脂肪肝"],
    videoKeyword: "跳绳 新手 入门 教学",
  },
  {
    id: "w11",
    name: "瑜伽舒缓拉伸",
    emoji: "🪷",
    met: 2.5,
    minutes: 20,
    intensity: "低",
    parts: ["全身", "柔韧"],
    tags: ["睡前", "放松", "缓解久坐"],
    howTo: ["猫牛式 8 次唤醒脊柱", "婴儿式停留 1 分钟", "仰卧扭转左右各 1 分钟"],
    cautions: ["每个体式到「有拉伸感但不痛」即可"],
    avoidFor: [],
    goodFor: ["高血压", "慢性胃炎", "骨质疏松"],
    videoKeyword: "睡前 舒缓瑜伽 20分钟",
  },
  {
    id: "w12",
    name: "骑行（户外或动感单车）",
    emoji: "🚴",
    met: 6.8,
    minutes: 30,
    intensity: "中",
    parts: ["下肢", "心肺"],
    tags: ["护膝友好", "通勤可用"],
    howTo: ["座垫高度以脚踩到底膝盖微屈为准", "踏频保持每分钟 70–90 转", "全程阻力不要一次拉满"],
    cautions: ["户外骑行注意交通安全与补水"],
    avoidFor: [],
    goodFor: ["高血压", "糖尿病", "高血脂", "脂肪肝"],
    videoKeyword: "动感单车 新手 跟练",
  },
  {
    id: "w13",
    name: "游泳",
    emoji: "🏊",
    met: 7.0,
    minutes: 30,
    intensity: "中",
    parts: ["全身", "心肺"],
    tags: ["关节零负担", "全身运动"],
    howTo: ["下水前做 5 分钟陆上热身", "以能连续游 50 米不喘为准控制强度", "结束后补 300ml 水"],
    cautions: ["有中耳炎、皮肤破损时不要游泳", "不要单独在无人看护水域游泳"],
    avoidFor: [],
    goodFor: ["高血压", "骨质疏松", "高血脂"],
    videoKeyword: "自由泳 换气 新手教学",
  },
  {
    id: "w14",
    name: "靠墙静蹲",
    emoji: "🧗",
    met: 4.0,
    minutes: 10,
    intensity: "中",
    parts: ["下肢"],
    tags: ["护膝", "无跳跃", "居家"],
    howTo: ["背靠墙，双脚前移约一步", "下滑至大腿与地面约 45–60 度", "每组 30 秒，做 3–4 组"],
    cautions: ["全程正常呼吸，不要憋气", "膝盖不超过脚尖"],
    avoidFor: [],
    goodFor: ["骨质疏松", "糖尿病"],
    videoKeyword: "靠墙静蹲 正确做法",
  },
  {
    id: "w15",
    name: "开合跳",
    emoji: "⭐",
    met: 8.0,
    minutes: 10,
    intensity: "较高",
    parts: ["全身", "心肺"],
    tags: ["高效燃脂", "无需器械"],
    howTo: ["双脚跳开同时双手上举", "落地时膝盖微屈缓冲", "40 秒做 + 20 秒歇，循环 8 组"],
    cautions: ["楼下邻居友好时段练习", "关节不适者用「侧步点地」替代跳跃"],
    avoidFor: ["骨质疏松", "冠心病"],
    goodFor: ["高血脂", "脂肪肝"],
    videoKeyword: "开合跳 燃脂 跟练",
  },
];

export const WORKOUT_SOURCES = ["ACSM 运动测试与运动处方指南"];

export const EXERCISE_DISCLAIMER =
  "运动建议依据公开运动科学资料整理，热量为按体重估算的量级参考，用于健康生活方式管理，不构成医疗诊断或运动处方。有基础疾病、长期未运动或运动中曾出现胸闷胸痛者，请先经医师评估后再开始。";
