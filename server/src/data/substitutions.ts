/**
 * 食材替换与饮食偏好规则
 *
 * 解决两个问题：
 *
 * 1. 饮食偏好此前形同虚设。health_profiles.diet_prefs 只被拼进提示词
 *    一句"推荐时必须避开不吃的"，代码层面从不过滤。用户勾了"素食"，
 *    计划里照样排出红烧带鱼——模型看漏了，用户就觉得这功能是假的。
 *
 * 2. 用户知道自己不吃什么，但不知道能换成什么。"痛风不能吃海鲜"是限制，
 *    "虾可以换成鸡胸或豆腐"才是能落地的建议。
 *
 * 依据：《中国居民膳食指南（2022）》食物多样与同类互换原则。
 */

import type { Recipe } from "./recipes";

const MEAT_WORDS = [
  "猪", "牛", "羊", "鸡", "鸭", "鹅", "鱼", "虾", "蟹", "肉", "排骨",
  "培根", "腊", "香肠", "火腿", "贝", "蛤", "蛎", "鱿", "章鱼", "三文鱼",
  "带鱼", "鲈鱼", "鲭鱼", "鳕鱼", "沙丁", "牛腩", "牛腱", "里脊",
];

/** 甜味特征 */
const SWEET_WORDS = ["糖", "蜜", "甜", "拔丝", "蛋糕", "可乐", "果汁", "果酱"];

/** 高盐特征 */
const SALTY_WORDS = ["咸", "腌", "酸菜", "腊", "豆瓣酱", "卤", "酱"];

/**
 * 判断"荤"：肉禽鱼虾贝。蛋奶不在内，因为中文语境的素食多为蛋奶素。
 *
 * 关键坑：「鸡蛋」含"鸡"、「牛奶/牛油果」含"牛"，直接做子串判断会把
 * 番茄炒蛋和牛奶燕麦误判成荤菜，导致素食用户吃不到本该吃的东西。
 * 所以先把蛋奶类词从文本里剔掉，再做荤食判断。
 */
const EGG_DAIRY_WORDS = [
  "鸡蛋", "鸭蛋", "鹅蛋", "鹌鹑蛋", "蛋清", "蛋黄", "蛋液", "蛋花", "蛋",
  "牛奶", "酸奶", "奶油", "奶酪", "芝士", "牛油果",
];

function stripEggDairy(t: string): string {
  let out = t;
  for (const w of EGG_DAIRY_WORDS) out = out.split(w).join("");
  return out;
}

function textOf(r: Recipe): string {
  return [r.name, ...(r.ingredients || []), ...(r.tags || [])].join(" ");
}

/** 是否含动物性肉类食材（蛋奶除外） */
export function isMeatDish(r: Recipe): boolean {
  const t = stripEggDairy(textOf(r));
  return MEAT_WORDS.some((w) => t.includes(w));
}

/** 是否偏甜 */
export function isSweetDish(r: Recipe): boolean {
  const t = textOf(r);
  return SWEET_WORDS.some((w) => t.includes(w));
}

/** 是否偏咸（腌腊、酱卤、豆瓣） */
export function isSaltyDish(r: Recipe): boolean {
  const t = textOf(r);
  return SALTY_WORDS.some((w) => t.includes(w));
}

export interface PreferenceRules {
  vegetarian: boolean;
  lightSeasoning: boolean;
  highProtein: boolean;
  lowSugar: boolean;
  moreVeg: boolean;
}

/** 把前端勾选的偏好文字翻译成可执行规则 */
export function prefsToRules(prefs: string[]): PreferenceRules {
  const p = (prefs || []).map(String);
  return {
    vegetarian: p.some((x) => x.includes("素")),
    lightSeasoning: p.some((x) => x.includes("清淡") || x.includes("少盐") || x.includes("少油")),
    highProtein: p.some((x) => x.includes("高蛋白")),
    lowSugar: p.some((x) => x.includes("少甜") || x.includes("控糖")),
    moreVeg: p.some((x) => x.includes("蔬果") || x.includes("多蔬")),
  };
}

/**
 * 硬过滤：只处理不可妥协的偏好。
 * 素食是唯一会造成"用户明确不想吃却硬推"的偏好，必须硬过滤。
 * 其余偏好属于倾向，交给 scoreForPrefs 做加权，避免候选池被砍空。
 */
export function filterByPrefs(recipes: Recipe[], prefs: string[]): Recipe[] {
  const rules = prefsToRules(prefs);
  let out = recipes;
  if (rules.vegetarian) out = out.filter((r) => !isMeatDish(r));
  if (rules.lowSugar) out = out.filter((r) => !isSweetDish(r));
  // 素食过滤后若为空（说明库里没有合适选项），退回原池而不是让计划无菜可排
  return out.length ? out : recipes;
}

/**
 * 软打分：口味倾向，返回负分（越小越优先）。
 * 与 planBuilder 的餐次打分叠加使用。
 */
export function scoreForPrefs(r: Recipe, prefs: string[]): number {
  const rules = prefsToRules(prefs);
  let s = 0;
  const tags = r.tags || [];
  if (rules.lightSeasoning) {
    if (tags.includes("清淡") || tags.includes("少油")) s -= 40;
    if (isSaltyDish(r)) s += 60;
  }
  if (rules.highProtein) {
    if (r.protein >= 28) s -= 40;
    else if (r.protein < 15) s += 30;
  }
  if (rules.moreVeg) {
    if (tags.includes("高纤维") || tags.includes("低热量")) s -= 25;
  }
  if (rules.lowSugar && isSweetDish(r)) s += 50;
  return s;
}

// ==================== 食材替换表 ====================

export interface Substitute {
  /** 受限食材或做法 */
  from: string;
  /** 可替换为 */
  to: string[];
  /** 为什么这样换 */
  reason: string;
}

export const SUBSTITUTES: Substitute[] = [
  {
    from: "猪肉（五花、里脊）",
    to: ["鸡胸肉", "牛腱", "鱼肉", "北豆腐"],
    reason: "同等重量下鸡胸与鱼肉的饱和脂肪明显更低，豆腐还能额外补充钙与植物蛋白",
  },
  {
    from: "白米饭",
    to: ["杂粮饭（糙米+燕麦米+藜麦）", "荞麦面", "蒸红薯"],
    reason: "全谷物升糖更平缓，膳食纤维与 B 族维生素更高；替换时按 1:1 重量即可",
  },
  {
    from: "白面条",
    to: ["荞麦面", "全麦面", "魔芋面（控热量）"],
    reason: "荞麦的升糖指数低于精制小麦面，适合需要控糖的人",
  },
  {
    from: "油炸做法",
    to: ["空气炸锅（少油）", "烤箱烤", "白灼", "清蒸"],
    reason: "同一道菜换做法可减少 30%–50% 的用油量，风味损失很小",
  },
  {
    from: "豆瓣酱、酱油、蚝油",
    to: ["姜蒜蓉", "柠檬汁", "香醋", "花椒与八角等香料"],
    reason: "酱油 10ml 约含 1.5g 盐，用香气替代咸味是控盐最有效的手段",
  },
  {
    from: "海鲜（虾、蟹、贝）",
    to: ["鸡蛋", "北豆腐", "鸡胸肉"],
    reason: "痛风或高尿酸人群的嘌呤替代方案，蛋白质摄入不打折",
  },
  {
    from: "动物内脏、浓肉汤",
    to: ["瘦肉", "蛋类", "豆制品"],
    reason: "内脏与浓汤嘌呤极高，是痛风发作最常见的诱因之一",
  },
  {
    from: "含糖饮料、果汁",
    to: ["白水", "无糖茶", "气泡水加柠檬"],
    reason: "一瓶含糖饮料约含 40–50g 糖，接近每日添加糖上限的两倍；果汁滤掉了纤维",
  },
  {
    from: "黄油、奶油",
    to: ["橄榄油", "菜籽油", "牛油果泥"],
    reason: "用不饱和脂肪替代饱和脂肪，对血脂更友好",
  },
  {
    from: "腌菜、咸菜、腊肉",
    to: ["新鲜蔬菜加醋凉拌", "自制少盐泡菜（冷藏 3 天内吃完）"],
    reason: "腌制品钠含量极高，一份咸菜的盐可能就超过全天建议量",
  },
  {
    from: "精制点心、饼干",
    to: ["原味坚果（20g）", "无糖酸奶", "水果"],
    reason: "加餐的核心是扛饿且不引起血糖骤升，坚果与酸奶更符合",
  },
  {
    from: "全脂奶",
    to: ["低脂或脱脂奶", "无糖豆浆"],
    reason: "减脂期用低脂奶可省下约 60 kcal/300ml；乳糖不耐受改豆浆",
  },
];

/**
 * 按用户问句找相关替换建议。
 *
 * 匹配粒度要拆到词：用户说「痛风能吃虾吗」时，"海鲜（虾、蟹、贝）"这条
 * 若按整串比较是匹配不上的——必须把括号和顿号拆开逐词比对。
 */
export function findSubstitutes(query: string, limit = 3): Substitute[] {
  const q = String(query || "");
  if (!q) return [];
  return SUBSTITUTES.filter((s) => {
    const parts = s.from.replace(/[（）()]/g, " ").split(/[\s、]+/).filter(Boolean);
    if (parts.some((p) => p.length >= 1 && q.includes(p))) return true;
    return s.to.some((t) => q.includes(t));
  }).slice(0, limit);
}

/** 生成给模型的文本 */
export function substitutesToText(list: Substitute[]): string {
  if (!list.length) return "";
  const body = list.map((s) => `「${s.from}」可换成 ${s.to.join(" / ")}——${s.reason}`).join("\n");
  return `【食材替换建议（本系统内置）】\n${body}`;
}

/** 饮食偏好说明，供提示词使用 */
export function prefsToText(prefs: string[]): string {
  if (!prefs?.length) return "";
  const rules = prefsToRules(prefs);
  const lines: string[] = [`用户已勾选的饮食偏好：${prefs.join("、")}`];
  if (rules.vegetarian) lines.push("- 素食：推荐中不得出现肉类、禽类、鱼虾贝类（蛋奶可保留）");
  if (rules.lightSeasoning) lines.push("- 清淡/少盐少油：优先蒸煮白灼，避开腌腊、酱卤、豆瓣类高盐做法");
  if (rules.highProtein) lines.push("- 高蛋白：每餐蛋白建议 ≥25g，优先鸡胸、鱼、蛋、豆制品");
  if (rules.lowSugar) lines.push("- 少甜食：避开加糖、蜜制、拔丝类");
  if (rules.moreVeg) lines.push("- 多蔬果：每餐保证一份蔬菜，水果放在两餐之间");
  return lines.join("\n");
}
