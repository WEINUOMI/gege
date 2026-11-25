/**
 * 常见活动 MET 表（自定义运动记录用）
 *
 * 推荐库（workouts.ts）里的 40 项是针对「计划动作」设计的，
 * 但用户实际做的往往是推荐里没有的：遛狗、广场舞、爬楼、带娃……
 * 这里单独维护一张覆盖面更广的常见活动表，供「记我做过的运动」选择。
 *
 * MET 取值参考《ACSM 运动测试与运动处方指南》与体力活动纲要的常见区间，
 * 只用于估算量级，不作为运动处方。
 */

export interface ActivityOption {
  id: string;
  name: string;
  emoji: string;
  /** 代谢当量 */
  met: number;
  /** 一句话说明，帮用户选对强度 */
  hint: string;
}

export const ACTIVITIES: ActivityOption[] = [
  { id: "a01", name: "散步", emoji: "🚶", met: 3.0, hint: "慢走、遛弯，能轻松聊天" },
  { id: "a02", name: "快走", emoji: "🏃", met: 4.3, hint: "步子加快，微微出汗" },
  { id: "a03", name: "慢跑", emoji: "👟", met: 7.0, hint: "能说话但有点喘" },
  { id: "a04", name: "跑步", emoji: "🏃‍♀️", met: 8.3, hint: "8 公里/小时左右" },
  { id: "a05", name: "骑行", emoji: "🚴", met: 6.0, hint: "平路休闲骑或通勤" },
  { id: "a06", name: "游泳", emoji: "🏊", met: 6.0, hint: "自由泳慢速、蛙泳" },
  { id: "a07", name: "跳绳", emoji: "🪢", met: 11.0, hint: "中速连续跳" },
  { id: "a08", name: "健身操", emoji: "🤸", met: 6.5, hint: "跟练操课、有氧操" },
  { id: "a09", name: "瑜伽", emoji: "🧘", met: 2.5, hint: "哈他、拉伸为主" },
  { id: "a10", name: "普拉提", emoji: "🤍", met: 3.0, hint: "垫上核心训练" },
  { id: "a11", name: "太极", emoji: "☯️", met: 3.0, hint: "24 式、八法五步" },
  { id: "a12", name: "八段锦", emoji: "🎋", met: 2.5, hint: "一套约 12 分钟" },
  { id: "a13", name: "力量训练", emoji: "🏋️", met: 5.0, hint: "哑铃、器械、自重" },
  { id: "a14", name: "平板支撑", emoji: "🧱", met: 3.5, hint: "核心静力训练" },
  { id: "a15", name: "羽毛球", emoji: "🏸", met: 5.5, hint: "休闲对打" },
  { id: "a16", name: "乒乓球", emoji: "🏓", met: 4.0, hint: "休闲对打" },
  { id: "a17", name: "篮球", emoji: "🏀", met: 6.5, hint: "半场对抗" },
  { id: "a18", name: "网球", emoji: "🎾", met: 7.3, hint: "单打为主" },
  { id: "a19", name: "爬楼", emoji: "🪜", met: 8.0, hint: "连续上下楼梯" },
  { id: "a20", name: "登山", emoji: "⛰️", met: 6.5, hint: "郊野徒步、上坡" },
  { id: "a21", name: "广场舞", emoji: "💃", met: 4.5, hint: "跟队伍跳整套" },
  { id: "a22", name: "跳舞", emoji: "🕺", met: 5.0, hint: "交谊舞、尊巴" },
  { id: "a23", name: "遛狗", emoji: "🐕", met: 3.0, hint: "正常步速遛弯" },
  { id: "a24", name: "家务", emoji: "🧹", met: 3.3, hint: "拖地、擦窗、收拾" },
  { id: "a25", name: "椭圆机", emoji: "🌀", met: 5.0, hint: "中等阻力" },
  { id: "a26", name: "划船机", emoji: "🚣", met: 7.0, hint: "中等强度" },
  { id: "a27", name: "拉伸放松", emoji: "🤍", met: 2.2, hint: "静态拉伸、泡沫轴" },
  { id: "a28", name: "骑车通勤", emoji: "🚲", met: 6.8, hint: "上下班路上" },
];

/** 表里没有的活动按「中等强度」估算，并明确告知用户这是估算 */
export const DEFAULT_CUSTOM_MET = 4.0;

export const ACTIVITY_SOURCE = "ACSM 运动测试与运动处方指南、体力活动纲要（MET 参考区间）";

export function findActivity(name: string): ActivityOption | null {
  const key = String(name || "").trim();
  if (!key) return null;
  const exact = ACTIVITIES.find((a) => a.name === key);
  if (exact) return exact;
  // 包含匹配：「快走 30 分钟」「楼下遛狗」也能认出来
  return ACTIVITIES.find((a) => key.includes(a.name)) || null;
}
