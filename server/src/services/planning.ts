/**
 * 规则化推荐引擎
 *
 * 大模型不参与"推荐哪道菜/哪项运动"的决策，只由规则算出结果，理由也由规则生成。
 * 这样可以做到：① 不发生幻觉；② 每个推荐都能给出确定性的依据；③ 大模型不可用时功能依然成立。
 */
import { getSupabaseClient } from "../storage/database/supabase-client";
import { RECIPES, type Recipe } from "../data/recipes";
import { WORKOUTS, type Workout } from "../data/workouts";

const client = getSupabaseClient();

export interface UserContext {
  userId: string;
  nickname: string;
  gender?: string;
  age?: number;
  height?: number;
  weight: number;
  bmi?: number;
  bp?: { sys?: number; dia?: number };
  bloodSugar?: number;
  cholesterol?: number;
  /** 病史名称数组，如 ["高血压","痛风"] */
  conditions: string[];
  dietPrefs: string[];
  /** 进行中目标的方向：weight_loss / muscle / health_control / learning / habit */
  goalCategories: string[];
  goalTitles: string[];
}

/** 从 "空腹血糖 5.2" 这类文本里取数字 */
export function parseNum(raw: any): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const m = String(raw).match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

export async function loadUserContext(userId: string): Promise<UserContext> {
  const { data: p } = await client.from("health_profiles").select("*").eq("user_id", userId).maybeSingle();
  const { data: u } = await client.from("users").select("nickname").eq("id", userId).maybeSingle();
  const { data: goals } = await client.from("goals").select("title,category").eq("user_id", userId).eq("status", "active");
  const pp: any = p || {};
  const weight = parseNum(pp.weight) || 60;
  const height = parseNum(pp.height);
  const bmi = height && weight ? Number((weight / Math.pow(height / 100, 2)).toFixed(1)) : undefined;
  const history = Array.isArray(pp.medical_history) ? pp.medical_history : [];
  return {
    userId,
    nickname: u?.nickname || "主人",
    gender: pp.gender || undefined,
    age: pp.age ? Number(pp.age) : undefined,
    height,
    weight,
    bmi,
    bp: { sys: parseNum(pp.blood_pressure_systolic), dia: parseNum(pp.blood_pressure_diastolic) },
    bloodSugar: parseNum(pp.blood_sugar),
    cholesterol: parseNum(pp.total_cholesterol),
    conditions: history.filter(Boolean),
    dietPrefs: Array.isArray(pp.diet_prefs) ? pp.diet_prefs : [],
    goalCategories: (goals || []).map((g: any) => g.category),
    goalTitles: (goals || []).map((g: any) => g.title),
  };
}

/** 依据体检数值补充"事实上的"风险标签，让规则更贴近真实情况 */
export function effectiveConditions(ctx: UserContext): string[] {
  const set = new Set(ctx.conditions);
  const sys = ctx.bp?.sys;
  if (sys && sys >= 140) set.add("高血压");
  if (ctx.bloodSugar && ctx.bloodSugar >= 7.0) set.add("糖尿病");
  if (ctx.cholesterol && ctx.cholesterol >= 5.2) set.add("高血脂");
  return [...set];
}

const CONDITION_TIP: Record<string, string> = {
  高血压: "少盐少油的做法对血压更友好",
  糖尿病: "低升糖的搭配能让血糖更平稳",
  高血脂: "控制了油脂比例，血脂负担更小",
  冠心病: "清淡少油，减轻心脏负担",
  痛风: "避开了高嘌呤食材",
  肾脏疾病: "控制了蛋白总量，给肾脏减负",
  慢性胃炎: "温和易消化，不刺激胃",
  骨质疏松: "含钙与优质蛋白，对骨骼有益",
  脂肪肝: "低脂低糖，有助于减少肝脏脂肪堆积",
  甲状腺疾病: "食材常见、做法清淡，便于按医嘱调整",
  哮喘: "做法清淡，减少刺激性调味",
};

/** 估算运动热量：kcal/min = MET × 3.5 × kg / 200 */
export function estimateCalories(met: number, weightKg: number, minutes: number): number {
  return Math.round((met * 3.5 * weightKg) / 200 * minutes);
}

export interface PickResult<T> {
  item: T;
  reason: string;
  score: number;
}

/** 选菜：按病史过滤 + 目标/食材/偏好打分 */
export function pickRecipes(
  ctx: UserContext,
  opts: { ingredients?: string[]; limit?: number; offset?: number } = {}
): { list: Array<Recipe & { reason: string }>; excludedCount: number } {
  const conds = effectiveConditions(ctx);
  const limit = Math.min(Math.max(opts.limit || 3, 1), 12);
  const offset = Math.max(opts.offset || 0, 0);
  const ingredients = (opts.ingredients || []).map((s) => s.trim()).filter(Boolean);

  const scored: Array<PickResult<Recipe>> = [];
  let excludedCount = 0;

  for (const r of RECIPES) {
    const hitAvoid = r.avoidFor.find((c) => conds.includes(c));
    if (hitAvoid) {
      excludedCount += 1;
      continue;
    }
    let score = 0;
    const reasonParts: string[] = [];

    // 目标导向
    if (ctx.goalCategories.includes("weight_loss")) {
      if (r.calories <= 220) { score += 4; reasonParts.push("热量控制在 220kcal 以内，减脂期很友好"); }
      else if (r.calories <= 380) { score += 2; reasonParts.push("热量适中，不容易超标"); }
      else if (r.calories >= 500) score -= 2;
      if (r.tags.includes("饱腹")) score += 1;
    }
    if (ctx.goalCategories.includes("muscle")) {
      if (r.protein >= 25) { score += 4; reasonParts.push(`蛋白质 ${r.protein}g，够一次增肌餐的量`); }
      else if (r.protein >= 15) score += 2;
    }
    if (ctx.goalCategories.includes("health_control")) {
      if (r.tags.includes("低GI") || r.tags.includes("控糖")) { score += 2; }
      if (r.tags.includes("低脂") || r.tags.includes("少油")) { score += 2; }
    }

    // 病史适配
    for (const c of conds) {
      if (r.goodFor.includes(c)) {
        score += 2.5;
        if (reasonParts.length < 2) reasonParts.push(CONDITION_TIP[c] || `适合有${c}的情况`);
      }
    }

    // 冰箱食材匹配
    if (ingredients.length) {
      const hit = ingredients.filter((ing) => r.ingredients.some((ri) => ri.includes(ing) || ing.includes(ri)));
      if (hit.length) {
        score += hit.length * 4;
        reasonParts.unshift(`用得上冰箱里的${hit.slice(0, 3).join("、")}`);
      } else {
        score -= 3;
      }
    }

    // 饮食偏好
    if (ctx.dietPrefs.includes("清淡") || ctx.dietPrefs.includes("少盐少油")) {
      if (r.tags.includes("清淡") || r.tags.includes("少油")) score += 1;
    }
    if (ctx.dietPrefs.includes("高蛋白") && r.protein >= 25) score += 1;
    if (ctx.dietPrefs.includes("少甜食") && r.tags.includes("控糖")) score += 1;

    if (!reasonParts.length) {
      reasonParts.push(
        r.calories <= 250 ? "清爽低负担，适合日常一餐" : "营养结构均衡，主食蛋白蔬菜都有"
      );
    }

    scored.push({ item: r, score, reason: reasonParts.slice(0, 2).join("；") });
  }

  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  // 稳定的"换一批"：按偏移旋转，保证每次结果不同但可复现
  const rotated = scored.length ? [...scored.slice(offset % scored.length), ...scored.slice(0, offset % scored.length)] : [];
  const list = rotated.slice(0, limit).map((s) => ({ ...s.item, reason: s.reason }));
  return { list, excludedCount };
}

/** 选运动：按病史/关节限制过滤 + 目标与时长打分 */
export function pickWorkouts(
  ctx: UserContext,
  opts: { parts?: string[]; minutes?: number; limit?: number; offset?: number } = {}
): { list: Array<Workout & { reason: string; calories: number }>; excludedCount: number } {
  const conds = effectiveConditions(ctx);
  const limit = Math.min(Math.max(opts.limit || 3, 1), 12);
  const offset = Math.max(opts.offset || 0, 0);
  const parts = (opts.parts || []).filter(Boolean);
  const maxMinutes = opts.minutes && opts.minutes > 0 ? opts.minutes : undefined;

  const highRisk = conds.includes("冠心病") || conds.includes("高血压") || conds.includes("骨质疏松");
  const scored: Array<PickResult<Workout>> = [];
  let excludedCount = 0;

  for (const w of WORKOUTS) {
    const hitAvoid = w.avoidFor.find((c) => conds.includes(c));
    if (hitAvoid) { excludedCount += 1; continue; }
    if (highRisk && w.intensity === "较高") { excludedCount += 1; continue; }
    if (maxMinutes && w.minutes > maxMinutes + 5) { excludedCount += 1; continue; }
    if (parts.length && !parts.some((p) => w.parts.some((wp) => wp.includes(p) || p.includes(wp)))) {
      continue;
    }

    let score = 0;
    const reasonParts: string[] = [];

    if (ctx.goalCategories.includes("weight_loss")) {
      score += w.met * 0.6;
      if (w.met >= 6) reasonParts.push(`强度 ${w.intensity}，单次约消耗 ${estimateCalories(w.met, ctx.weight, w.minutes)}kcal`);
    }
    if (ctx.goalCategories.includes("muscle")) {
      if (w.parts.some((p) => ["下肢", "上肢", "背部", "核心", "胸部", "臀腿"].includes(p))) { score += 3; reasonParts.push("有力量刺激，能帮上增肌"); }
    }
    if (ctx.goalCategories.includes("health_control") || conds.length) {
      if (w.intensity === "低") { score += 2.5; reasonParts.push("低冲击，对关节和心血管压力小"); }
      if (w.tags.includes("护关节") || w.tags.includes("低冲击")) score += 1.5;
    }
    for (const c of conds) {
      if (w.goodFor.includes(c)) {
        score += 2;
        if (reasonParts.length < 2) reasonParts.push(CONDITION_TIP[c] || `适合有${c}的情况`);
      }
    }
    if (ctx.bmi && ctx.bmi >= 28 && w.intensity !== "低") {
      score -= 2;
      if (!reasonParts.length) reasonParts.push("考虑到体重基数，先从低冲击开始更稳");
    }
    if (!reasonParts.length) {
      reasonParts.push(`${w.minutes} 分钟就能完成，${w.intensity}强度，容易坚持`);
    }

    scored.push({ item: w, score, reason: reasonParts.slice(0, 2).join("；") });
  }

  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const rotated = scored.length ? [...scored.slice(offset % scored.length), ...scored.slice(0, offset % scored.length)] : [];
  const list = rotated.slice(0, limit).map((s) => ({
    ...s.item,
    reason: s.reason,
    calories: estimateCalories(s.item.met, ctx.weight, s.item.minutes),
  }));
  return { list, excludedCount };
}

/** 给前端的一次性健康提示（不做诊断，只说明规则用了哪些信息） */
export function safetyNote(ctx: UserContext): string {
  const conds = effectiveConditions(ctx);
  if (!conds.length) return "未记录慢性病史，已按通用健康人群的标准推荐。";
  return `已结合${conds.join("、")}的情况做了筛选，被判定为不合适的项目不会出现在列表里。`;
}
