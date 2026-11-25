/**
 * 目标计划生成器：知识库约束 + 大模型编排
 *
 * 设计原则（沿用本项目"防幻觉"架构）：
 * 1. 菜名、热量、动作名称全部来自本地结构化知识库（data/recipes.ts、data/workouts.ts），
 *    大模型只能从带编号的候选清单中"选择"，不能自创菜名或编造营养数据；
 * 2. 模型输出严格 JSON，服务端逐条校验（时间格式、类别合法性、编号越界、餐次完整性）；
 * 3. 任一环节不通过即回退到纯规则编排（buildPlanByRules），保证功能永不空白；
 * 4. 三餐能量分配采用《中国居民膳食指南（2022）》的 3:4:3 比例，而不是拍脑袋。
 */
import type { Request } from "express";
import { llmText } from "./ai";
import { RECIPES, type Recipe } from "../data/recipes";
import { WORKOUTS, type Workout } from "../data/workouts";
import { effectiveConditions, estimateCalories, type UserContext } from "./planning";
import { computeTarget, type GoalKind } from "../data/nutrition";

export interface PlanItemDraft {
  title: string;
  category: "diet" | "exercise" | "health" | "study" | "habit";
  planned_time: string;
  points: number;
  /** 生成依据，仅用于日志/调试，不落库 */
  reason?: string;
}

export interface GoalLike {
  title: string;
  category: string;
  target_value?: string | null;
}

export interface PlanResult {
  items: PlanItemDraft[];
  source: "ai" | "rules";
  note: string;
}

const MEAL_RATIO = { breakfast: 0.3, lunch: 0.4, dinner: 0.3 };

const MEAL_SLOTS = [
  { key: "breakfast", label: "早餐", time: "08:00", ratio: MEAL_RATIO.breakfast },
  { key: "lunch", label: "午餐", time: "12:00", ratio: MEAL_RATIO.lunch },
  { key: "dinner", label: "晚餐", time: "18:30", ratio: MEAL_RATIO.dinner },
] as const;

/** 餐次判定：区间之间留出加餐空档，避免 15:30 的加餐被误判为晚餐 */
export const MEAL_WINDOWS = {
  breakfast: [6 * 60, 10 * 60 + 30],
  lunch: [11 * 60, 14 * 60 + 30],
  dinner: [17 * 60, 21 * 60],
} as const;

export function toMin(hhmm: string): number {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "other";

export function mealSlot(hhmm: string): MealSlot {
  const t = toMin(hhmm);
  if (t < 0) return "other";
  for (const key of ["breakfast", "lunch", "dinner"] as const) {
    const [from, to] = MEAL_WINDOWS[key];
    if (t >= from && t < to) return key;
  }
  return "other";
}

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", other: "加餐" };

/**
 * 每日能量目标。计算逻辑已收敛到 data/nutrition.ts，与对话、营养目标展示
 * 共用同一套公式，避免计划里算出的热量和暖暖回答里说的热量对不上。
 */
export function dailyEnergyTarget(ctx: UserContext, goalCategory: string) {
  const kind: GoalKind =
    goalCategory === "weight_loss" ? "weight_loss"
      : goalCategory === "muscle" ? "muscle_gain"
        : "maintain";

  const t = computeTarget(
    {
      height: ctx.height,
      weight: ctx.weight,
      age: ctx.age,
      gender: ctx.gender,
      medical_history: ctx.conditions,
    },
    kind
  );

  // 缺身高时 computeTarget 返回 null，退回保守默认值，不让计划生成中断
  if (!t) return { bmr: 1400, tdee: 1900, target: 1900 };
  return { bmr: t.bmr, tdee: t.tdee, target: t.intake };
}

/** 候选池：剔除命中病史禁忌的菜谱 */
export function candidateRecipes(ctx: UserContext): Recipe[] {
  const conds = effectiveConditions(ctx);
  return RECIPES.filter((r) => !(r.avoidFor || []).some((c) => conds.includes(c)));
}

export function candidateWorkouts(ctx: UserContext): Workout[] {
  const conds = effectiveConditions(ctx);
  const risky = conds.some((c) => ["冠心病", "高血压", "哮喘", "骨质疏松"].includes(c));
  return WORKOUTS.filter((w) => {
    if ((w.avoidFor || []).some((c) => conds.includes(c))) return false;
    if (risky && w.intensity === "较高") return false;
    return true;
  });
}

/** 餐次-标签适配：光按热量挑菜会把"杂粮饭配香菇滑鸡"排到早餐 */
const TAG_AFFINITY: Record<MealSlot, string[]> = {
  breakfast: ["早餐", "快手早餐", "养胃", "温和"],
  lunch: ["家常", "下饭", "饱腹", "控糖主食", "主食替换"],
  dinner: ["清淡", "少油", "低脂", "护胃", "利水"],
  other: ["加餐"],
};

function dishScore(r: Recipe, slot: MealSlot, slotTarget: number): number {
  const hits = TAG_AFFINITY[slot].filter((t) => (r.tags || []).includes(t)).length;
  let score = Math.abs(r.calories - slotTarget) - hits * 120;
  // 正餐不宜过轻，避免"一碗汤当晚餐"
  if (slot !== "other" && r.calories < slotTarget * 0.5) score += 250;
  // 早餐避免下饭/家常类正餐菜
  if (slot === "breakfast" && (r.tags || []).some((t) => t === "下饭" || t === "家常")) score += 250;
  return score;
}

/**
 * 纯规则编排（兜底路径）
 * 三餐按 3:4:3 分配能量后，从候选池里挑热量最接近的菜；
 * 运动按目标方向挑 1-2 项，热量由 MET 公式算出。
 */
export function buildPlanByRules(ctx: UserContext, goal: GoalLike): PlanItemDraft[] {
  const items: PlanItemDraft[] = [];
  const cat = goal.category || "habit";
  const { target } = dailyEnergyTarget(ctx, cat);
  const recipes = candidateRecipes(ctx);
  const workouts = candidateWorkouts(ctx);
  const used = new Set<string>();

  const pickDish = (slotKey: MealSlot, ratio: number): Recipe | null => {
    const pool = recipes.filter((r) => !used.has(r.id));
    const bag = pool.length ? pool : recipes;
    if (!bag.length) return null;
    let best = bag[0];
    let bestScore = dishScore(best, slotKey, target * ratio);
    for (const r of bag.slice(1)) {
      const s = dishScore(r, slotKey, target * ratio);
      if (s < bestScore) { bestScore = s; best = r; }
    }
    used.add(best.id);
    return best;
  };

  const mealPlan = (): void => {
    for (const slot of MEAL_SLOTS) {
      const dish = pickDish(slot.key, slot.ratio);
      if (dish) {
        items.push({
          title: `${slot.label}：${dish.name}`,
          category: "diet",
          planned_time: slot.time,
          points: 10,
          reason: `《中国居民膳食指南2022》三餐能量比 3:4:3，本餐约 ${Math.round(target * slot.ratio)} kcal`,
        });
      }
    }
  };

  if (cat === "weight_loss") {
    items.push({ title: "晨起空腹称重并记录", category: "health", planned_time: "07:00", points: 5 });
    mealPlan();
    const w = workouts.find((x) => x.name.includes("快走")) || workouts[0];
    if (w) {
      items.push({
        title: `${w.name} ${w.minutes} 分钟`,
        category: "exercise",
        planned_time: "19:30",
        points: 15,
        reason: `饭后 1 小时再动，约消耗 ${estimateCalories(w.met, ctx.weight, w.minutes)} kcal（MET ${w.met}）`,
      });
    }
    items.push({ title: "睡前 15 分钟拉伸放松", category: "exercise", planned_time: "21:30", points: 5 });
  } else if (cat === "muscle") {
    mealPlan();
    const w = workouts.find((x) => /力量|俯卧撑|深蹲|哑铃/.test(x.name)) || workouts[0];
    if (w) {
      items.push({ title: `${w.name} ${w.minutes} 分钟`, category: "exercise", planned_time: "19:30", points: 15 });
    }
    items.push({ title: "训练后补充蛋白质（奶/蛋/豆制品）", category: "diet", planned_time: "20:30", points: 10 });
    items.push({ title: "保证 7 小时睡眠", category: "health", planned_time: "23:00", points: 5 });
  } else if (cat === "health_control") {
    items.push({ title: "晨起测量血压血糖并记录", category: "health", planned_time: "07:30", points: 10 });
    mealPlan();
    const w = workouts.find((x) => x.intensity === "低") || workouts[0];
    if (w) {
      items.push({ title: `${w.name} ${w.minutes} 分钟`, category: "exercise", planned_time: "17:00", points: 15 });
    }
    items.push({ title: "晚间散步 20 分钟", category: "exercise", planned_time: "20:00", points: 5 });
  } else if (cat === "learning") {
    items.push({ title: "晨间学习 30 分钟", category: "study", planned_time: "08:00", points: 10 });
    items.push({ title: "午间复习 15 分钟", category: "study", planned_time: "12:30", points: 5 });
    items.push({ title: "整理今日学习笔记", category: "study", planned_time: "20:00", points: 10 });
    items.push({ title: "睡前回顾并打卡", category: "study", planned_time: "21:30", points: 5 });
  } else {
    items.push({ title: "晨起喝水 300ml", category: "health", planned_time: "07:00", points: 5 });
    mealPlan();
    items.push({ title: "今日小目标打卡", category: "habit", planned_time: "21:00", points: 10 });
  }

  return items.sort((a, b) => toMin(a.planned_time) - toMin(b.planned_time));
}

const PLAN_SYSTEM = `你是健康目标计划的编排助手。你只能从给定的候选编号中选择菜谱和运动，禁止自创菜名或编造营养数据。必须严格输出 JSON，不要任何解释文字。`;

function buildPrompt(ctx: UserContext, goal: GoalLike, recipes: Recipe[], workouts: Workout[]): string {
  const { target } = dailyEnergyTarget(ctx, goal.category);
  const conds = effectiveConditions(ctx);
  const recipeLines = recipes
    .map((r, i) => `${i + 1}. ${r.name}（${r.calories} kcal，蛋白 ${r.protein}g，标签：${(r.tags || []).join("/")}）`)
    .join("\n");
  const workoutLines = workouts
    .map((w, i) => `${i + 1}. ${w.name}（${w.intensity}强度，${w.minutes}分钟，MET ${w.met}）`)
    .join("\n");
  const profile = [
    `昵称：${ctx.nickname}`,
    ctx.gender ? `性别：${ctx.gender}` : "",
    ctx.age ? `年龄：${ctx.age}岁` : "",
    `体重：${ctx.weight}kg`,
    ctx.height ? `身高：${ctx.height}cm` : "",
    ctx.bmi ? `BMI：${ctx.bmi}` : "",
    conds.length ? `病史/风险：${conds.join("、")}` : "病史：无特殊",
    ctx.dietPrefs.length ? `饮食偏好：${ctx.dietPrefs.join("、")}` : "",
    `本次目标：${goal.title}${goal.target_value ? `（目标值 ${goal.target_value}）` : ""}`,
    `目标类型：${goal.category}`,
    `每日能量参考：约 ${target} kcal，三餐按 3:4:3 分配`,
  ].filter(Boolean).join("\n");

  return `【用户档案】
${profile}

【可选菜谱】（只能选编号，不能自己写菜名）
${recipeLines}

【可选运动】（只能选编号）
${workoutLines}

【编排要求】
1. 必须包含三餐：早餐在 07:00-09:00、午餐在 11:30-13:30、晚餐在 17:30-19:30，各选 1 道菜谱；
2. 运动 1-2 项，时间避开刚吃完饭的 1 小时内；
3. 可补充 0-2 条 health 类自定义项（如称重、喝水、早睡），标题不超过 16 字；
4. 总条数 5-8 条；
5. 对病史相关禁忌要主动规避；
6. 严格输出如下 JSON，不要代码块标记、不要解释：
{"items":[{"time":"07:00","category":"health","title":"晨起空腹称重并记录"},{"time":"08:00","category":"diet","dishId":3},{"time":"12:00","category":"diet","dishId":7},{"time":"19:00","category":"exercise","workoutId":2},{"time":"18:30","category":"diet","dishId":11}]}`;
}

function extractJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const VALID_CATEGORIES = new Set(["diet", "exercise", "health", "study", "habit"]);

/**
 * 校验模型输出。任何一项不满足即整体作废并回退规则路径，
 * 这样可以避免"看起来像计划、实际有缺餐次或不存在的菜"的结果落库。
 */
function validateAiItems(
  parsed: any,
  recipes: Recipe[],
  workouts: Workout[],
  ctx: UserContext
): { items: PlanItemDraft[]; error?: string } {
  const raw = Array.isArray(parsed?.items) ? parsed.items : [];
  if (raw.length < 4 || raw.length > 8) return { items: [], error: "条数不在 4-8 之间" };

  const items: PlanItemDraft[] = [];
  const slots = new Set<string>();
  let dietCount = 0;

  for (const it of raw) {
    const time = String(it?.time || "");
    if (toMin(time) < 0) return { items: [], error: `时间格式非法：${time}` };
    const category = String(it?.category || "");
    if (!VALID_CATEGORIES.has(category)) return { items: [], error: `类别非法：${category}` };

    if (category === "diet") {
      const idx = Number(it?.dishId);
      if (!Number.isInteger(idx) || idx < 1 || idx > recipes.length) {
        return { items: [], error: `菜谱编号越界：${it?.dishId}` };
      }
      const dish = recipes[idx - 1];
      const slot = mealSlot(time);
      if (slot !== "other") slots.add(slot);
      dietCount += 1;
      items.push({
        title: `${SLOT_LABEL[slot]}：${dish.name}`,
        category: "diet",
        planned_time: time,
        points: 10,
        reason: `${dish.calories} kcal，来源《中国居民膳食指南2022》`,
      });
      continue;
    }

    if (category === "exercise") {
      const idx = Number(it?.workoutId);
      if (!Number.isInteger(idx) || idx < 1 || idx > workouts.length) {
        return { items: [], error: `运动编号越界：${it?.workoutId}` };
      }
      const w = workouts[idx - 1];
      items.push({
        title: `${w.name} ${w.minutes} 分钟`,
        category: "exercise",
        planned_time: time,
        points: 15,
        reason: `约消耗 ${estimateCalories(w.met, ctx.weight, w.minutes)} kcal`,
      });
      continue;
    }

    const title = String(it?.title || "").trim();
    if (!title || title.length > 20) return { items: [], error: `标题为空或过长：${title}` };
    items.push({ title, category: category as PlanItemDraft["category"], planned_time: time, points: category === "health" ? 5 : 10 });
  }

  // 三餐必须齐全：这是本次需求的核心（此前模板经常缺中餐）
  const missing = ["breakfast", "lunch", "dinner"].filter((s) => !slots.has(s));
  if (missing.length) return { items: [], error: `缺少餐次：${missing.join(",")}` };
  if (dietCount > 4) return { items: [], error: "饮食条目过多" };

  return { items: items.sort((a, b) => toMin(a.planned_time) - toMin(b.planned_time)) };
}

/** 主入口：先试大模型编排，失败或无餐次则回退规则 */
export async function generatePlan(req: Request, ctx: UserContext, goal: GoalLike): Promise<PlanResult> {
  const rules = buildPlanByRules(ctx, goal);
  const cat = goal.category || "habit";
  const needMeals = cat === "weight_loss" || cat === "muscle" || cat === "health_control" || cat === "habit";
  if (!needMeals) {
    return { items: rules, source: "rules", note: "学习类目标使用规则编排" };
  }

  const recipes = candidateRecipes(ctx).slice(0, 12);
  const workouts = candidateWorkouts(ctx).slice(0, 8);
  if (!recipes.length || !workouts.length) {
    return { items: rules, source: "rules", note: "候选知识库为空，使用规则编排" };
  }

  try {
    const raw = await llmText(req, PLAN_SYSTEM, buildPrompt(ctx, goal, recipes, workouts), 0.3);
    const parsed = extractJson(raw);
    if (!parsed) return { items: rules, source: "rules", note: "模型未返回可解析 JSON，使用规则编排" };
    const checked = validateAiItems(parsed, recipes, workouts, ctx);
    if (checked.error) return { items: rules, source: "rules", note: `模型结果校验未通过（${checked.error}），使用规则编排` };
    return { items: checked.items, source: "ai", note: "由大模型在知识库候选范围内编排" };
  } catch (e: any) {
    return { items: rules, source: "rules", note: `模型调用失败（${e?.message || "unknown"}），使用规则编排` };
  }
}
