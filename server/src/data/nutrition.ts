/**
 * 营养素目标计算库
 *
 * 此前计划生成只有一句「三餐能量比 3:4:3」，没有具体到克的蛋白质、纤维、
 * 钠、钙、水目标。模型只能凭印象给数字，同一个用户两次问可能得到不同答案。
 * 本文件把能量与营养素目标固化为可复算的公式。
 *
 * 依据：
 * - Mifflin-St Jeor 方程（基础代谢）
 * - 《中国居民膳食营养素参考摄入量（2023版）》
 * - 《中国居民膳食指南（2022）》
 * - 《慢性肾脏病膳食营养治疗中国专家共识》
 *
 * 边界：为健康生活方式管理用途的估算值，不是临床营养处方。
 */

export type GoalKind = "weight_loss" | "maintain" | "muscle_gain";

export interface BodyInput {
  height?: any;
  weight?: any;
  age?: any;
  gender?: any;
  medical_history?: string[];
}

export interface NutritionTarget {
  /** 基础代谢 kcal */
  bmr: number;
  /** 估算每日总消耗 kcal */
  tdee: number;
  /** 建议每日摄入 kcal */
  intake: number;
  /** 三餐分配 kcal */
  meals: { breakfast: number; lunch: number; dinner: number };
  /** 蛋白质 g */
  protein: number;
  /** 膳食纤维 g */
  fiber: number;
  /** 钠上限 mg */
  sodiumMax: number;
  /** 钙 mg */
  calcium: number;
  /** 饮水 ml */
  water: number;
  /** 碳水 g（由剩余热量推算） */
  carb: number;
  /** 脂肪 g */
  fat: number;
  /** 计算过程说明，供展示与模型引用 */
  notes: string[];
}

function num(raw: any, fallback = 0): number {
  const n = Number(String(raw ?? "").match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 活动系数。默认按「轻度活动」（每周 1–3 次运动）取值。
 * 应用里没有采集活动量，取保守值优于给一个乐观值。
 */
const ACTIVITY = 1.375;

export function computeTarget(body: BodyInput, kind: GoalKind = "maintain"): NutritionTarget | null {
  const h = num(body.height);
  const w = num(body.weight);
  const age = num(body.age, 32);
  if (!h || !w) return null;

  const male = String(body.gender || "").includes("男");
  const conditions = (body.medical_history || []).filter(Boolean);
  const notes: string[] = [];

  // 1) 基础代谢：Mifflin-St Jeor
  const bmrRaw = 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
  const bmr = Math.round(bmrRaw);
  notes.push(`基础代谢 ${bmr} kcal（Mifflin-St Jeor 方程：10×${w} + 6.25×${h} − 5×${age} ${male ? "+ 5" : "− 161"}）`);

  // 2) 总消耗
  const tdee = Math.round(bmr * ACTIVITY);
  notes.push(`按轻度活动系数 ${ACTIVITY} 估算每日总消耗 ${tdee} kcal`);

  // 3) 目标热量
  let intake = tdee;
  if (kind === "weight_loss") {
    // 缺口 400 kcal，但不低于基础代谢的 1.1 倍，避免代谢代偿与肌肉流失
    intake = Math.max(tdee - 400, Math.round(bmr * 1.1));
    const gap = tdee - intake;
    notes.push(`减重目标：热量缺口 ${gap} kcal/日，摄入下限设为基础代谢的 1.1 倍（${Math.round(bmr * 1.1)} kcal）以防肌肉流失`);
  } else if (kind === "muscle_gain") {
    intake = tdee + 250;
    notes.push(`增肌目标：在总消耗上增加 250 kcal/日，配合抗阻训练`);
  } else {
    notes.push(`维持目标：按总消耗摄入`);
  }

  // 4) 三餐 3:4:3
  const meals = {
    breakfast: Math.round(intake * 0.3),
    lunch: Math.round(intake * 0.4),
    dinner: Math.round(intake * 0.3),
  };
  notes.push(`三餐能量比 3:4:3（《中国居民膳食指南2022》）→ ${meals.breakfast} / ${meals.lunch} / ${meals.dinner} kcal`);

  // 5) 蛋白质 g/kg
  let proteinPerKg = 1.0;
  if (kind === "weight_loss") proteinPerKg = 1.4;
  else if (kind === "muscle_gain") proteinPerKg = 1.6;
  else proteinPerKg = 1.0;

  if (conditions.includes("肾脏疾病")) {
    proteinPerKg = 0.8;
    notes.push(`因有肾脏疾病，蛋白质下调至 0.8g/kg，具体总量请遵医嘱`);
  } else {
    notes.push(`蛋白质 ${proteinPerKg}g/kg × ${w}kg`);
  }
  if (age >= 65 && proteinPerKg < 1.0) {
    proteinPerKg = 1.0;
    notes.push(`年龄 ≥65，蛋白质提高至 1.0g/kg 以减缓肌肉流失`);
  }
  const protein = Math.round(w * proteinPerKg);

  // 6) 脂肪：占总量 25%，最低不低于 0.6g/kg（保障必需脂肪酸与脂溶性维生素吸收）
  const fat = Math.max(Math.round((intake * 0.25) / 9), Math.round(w * 0.6));
  // 7) 碳水：剩余热量
  const carb = Math.max(Math.round((intake - protein * 4 - fat * 9) / 4), 100);
  if (conditions.includes("糖尿病")) {
    notes.push(`糖尿病：碳水建议占总量 45%–50%，优先低升糖主食，实际碳水 ${carb}g 请对照主食份量控制`);
  }
  if (conditions.includes("高血脂") || conditions.includes("脂肪肝")) {
    notes.push(`血脂/脂肪肝：饱和脂肪控制在总热量 7% 以内，可用不饱和脂肪替代`);
  }

  // 8) 膳食纤维
  const fiber = conditions.includes("糖尿病") ? 30 : 25;
  // 9) 钠
  let sodiumMax = 2000;
  if (conditions.includes("高血压")) sodiumMax = 1500;
  if (conditions.includes("肾脏疾病")) sodiumMax = 1500;
  // 10) 钙
  const calcium = age >= 50 || conditions.includes("骨质疏松") ? 1000 : 800;
  // 11) 饮水
  let water = Math.round(w * 30);
  if (conditions.includes("痛风")) water = Math.max(water, 2000);
  if (conditions.includes("肾脏疾病")) {
    water = 0; // 需遵医嘱，不给默认值
    notes.push(`肾脏疾病患者饮水量需遵医嘱，此处不做推荐`);
  }

  return {
    bmr, tdee, intake, meals,
    protein, fiber, sodiumMax, calcium, water, carb, fat,
    notes,
  };
}

/** 生成给模型的结构化文本 */
export function targetToText(t: NutritionTarget | null, kind: GoalKind): string {
  if (!t) return "";
  const kindText = kind === "weight_loss" ? "减重" : kind === "muscle_gain" ? "增肌" : "维持体重";
  const waterLine = t.water ? `\n- 饮水 ${t.water} ml` : "";
  return [
    `【每日营养目标（系统按公式测算，${kindText}）】`,
    `- 总热量 ${t.intake} kcal（基础代谢 ${t.bmr} / 总消耗 ${t.tdee}）`,
    `- 三餐分配 ${t.meals.breakfast} / ${t.meals.lunch} / ${t.meals.dinner} kcal`,
    `- 蛋白质 ${t.protein} g｜碳水 ${t.carb} g｜脂肪 ${t.fat} g`,
    `- 膳食纤维 ${t.fiber} g｜钠上限 ${t.sodiumMax} mg（约食盐 ${(t.sodiumMax / 400).toFixed(1)} g）｜钙 ${t.calcium} mg${waterLine}`,
    `计算依据：${t.notes.join("；")}`,
  ].join("\n");
}
