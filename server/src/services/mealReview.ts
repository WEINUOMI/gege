import type { Request } from "express";
import { LLMClient, Config, HeaderUtils, type Message } from "coze-coding-dev-sdk";
import {
  findFood,
  portionToGrams,
  CATEGORY_FALLBACK,
  FOOD_SOURCES,
  type FoodCategory,
} from "../data/foods";
import { buildHealthBrief } from "./healthBrief";
import { todayIntakeKcal } from "./intake";
import { getSupabaseClient } from "../storage/database/supabase-client";

const client = getSupabaseClient();
const MODEL = process.env.MEAL_MODEL || "doubao-seed-2-0-pro-260215";

const VALID_CATEGORIES: FoodCategory[] = [
  "staple", "meat", "poultry", "seafood", "egg", "dairy", "soy",
  "vegetable", "mushroom", "fruit", "nut", "oil", "drink", "dish", "snack",
];

/** 识别用的系统提示：把「识别」和「计算」彻底切开 */
const VISION_SYSTEM = `你是食物识别器，只负责看和认，不负责算。

任务：识别用户发来的图片或视频里所有可以吃的东西。
只回答两件事：① 这是什么食物 ② 大概多少量。
绝对不要计算热量、不要评价营养好坏、不要给建议——热量和营养素由系统按食物成分表计算，你算的会和系统对不上。

只输出一个 JSON 对象，不要解释文字，不要 markdown 代码块：
{
  "isFood": true,
  "mealType": "breakfast" | "lunch" | "dinner" | "snack",
  "items": [
    { "name": "番茄炒蛋", "portion": "一盘", "category": "dish", "confidence": "high" }
  ],
  "sceneNote": "识别不出时用一句话说明原因"
}

规则：
1. name 用中文常见叫法。不要写品牌名，不要编造菜名。
2. portion 用中文份量词（一碗、一盘、一个、一杯、一把、200g 等），不要写热量。
3. category 只能取：staple（主食）、meat（畜肉）、poultry（禽肉）、seafood（水产）、egg（蛋）、dairy（奶）、soy（豆制品）、vegetable（蔬菜）、mushroom（菌藻）、fruit（水果）、nut（坚果）、oil（油脂）、drink（饮品）、dish（成品菜）、snack（点心零食）。
4. confidence：确定是这东西填 high；大致像填 medium；连自己都不太确定填 low。
5. 画面不是食物（人、风景、文字、截图、空盘子）→ isFood 填 false，items 留空，sceneNote 说明。
6. 看不清楚就别猜。被遮挡、光线暗、只露出一角的，只输出能确认的，宁可少列也不要凭常见搭配补全——不要因为看到米饭就自动加上番茄炒蛋。
7. 复合菜整体当一道菜，不要拆成原料。青椒肉丝就是一道菜，不要拆成青椒、猪肉、油分别计算，那样油会被重复计数好几遍。
8. 汤类只算吃进去的部分，不要把整锅汤算进来。`;

/** 一个识别出的条目经过营养表换算后的结果 */
export interface MealItemResult {
  /** 模型给的原始名称 */
  name: string;
  /** 在营养表里匹配到的标准名，未匹配时为空 */
  matchedName?: string;
  category: FoodCategory;
  grams: number;
  /** 克数是否为默认值推测得出（模型没给份量） */
  gramsAssumed: boolean;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
  /** 是否在营养表里精确匹配到 */
  matched: boolean;
  confidence: string;
}

export interface MealTotals {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
}

export interface MealAnalysis {
  ok: boolean;
  /** 识别失败或非食物时为空 */
  items: MealItemResult[];
  totals: MealTotals;
  mealType: string;
  /** 失败原因 / 部分识别说明 */
  note?: string;
  review: string;
  targetKcal: number | null;
  yesterdayHint?: string;
  intakeBefore: number;
  intakeAfter: number;
  model: string;
}

function emptyTotals(): MealTotals {
  return { kcal: 0, protein: 0, carb: 0, fat: 0, sodium: 0 };
}

/** 从模型输出里抠出 JSON，容忍代码块包裹与前后多余文字 */
function parseJsonLoose(text: string): any | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toCategory(v: any): FoodCategory {
  const s = String(v || "").trim().toLowerCase();
  return (VALID_CATEGORIES as string[]).includes(s) ? (s as FoodCategory) : "dish";
}

/**
 * 调多模态模型识别一餐。
 * 图片走 image_url，视频走 video_url（fps=1，即每秒抽一帧，避免长视频开销过大）。
 */
async function identifyByVision(
  req: Request,
  media: { imageUrl?: string; videoUrl?: string },
): Promise<{ isFood: boolean; mealType: string; items: any[]; sceneNote?: string } | null> {
  const config = new Config();
  const headers = HeaderUtils.extractForwardHeaders(
    req.headers as unknown as Record<string, string>,
  );
  const llm = new LLMClient(config, headers);

  const parts: any[] = [{ type: "text", text: "识别这些画面里的食物。" }];
  if (media.imageUrl) {
    parts.push({ type: "image_url", image_url: { url: media.imageUrl, detail: "high" } });
  }
  if (media.videoUrl) {
    parts.push({ type: "video_url", video_url: { url: media.videoUrl, fps: 1 } });
  }

  const messages: Message[] = [
    { role: "system", content: VISION_SYSTEM },
    { role: "user", content: parts },
  ];

  const res = await llm.invoke(messages, { model: MODEL, temperature: 0.1 });
  const parsed = parseJsonLoose(res.content);
  if (!parsed) return null;

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    isFood: parsed.isFood !== false,
    mealType: String(parsed.mealType || "").trim() || guessMealType(),
    items,
    sceneNote: parsed.sceneNote ? String(parsed.sceneNote) : undefined,
  };
}

/** 模型没给餐次时按当前时间推断 */
function guessMealType(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const h = now.getUTCHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

/** 把识别结果按营养表换算成热量与营养素。数字全部来自本地表，不经过模型。 */
export function computeItems(rawItems: any[]): { items: MealItemResult[]; totals: MealTotals } {
  const items: MealItemResult[] = [];
  for (const raw of rawItems) {
    const name = String(raw?.name || "").trim();
    if (!name) continue;
    const category = toCategory(raw?.category);
    const food = findFood(name);
    const { grams, assumed } = portionToGrams(String(raw?.portion || ""), food);
    const base = food ? food.per100 : CATEGORY_FALLBACK[category].per100;
    const sodiumPer100 = food ? food.sodiumPer100 : 400;
    const k = grams / 100;
    items.push({
      name,
      matchedName: food?.name,
      category,
      grams,
      gramsAssumed: assumed,
      kcal: Math.round(base.kcal * k),
      protein: Number((base.protein * k).toFixed(1)),
      carb: Number((base.carb * k).toFixed(1)),
      fat: Number((base.fat * k).toFixed(1)),
      sodium: Math.round(sodiumPer100 * k),
      matched: Boolean(food),
      confidence: String(raw?.confidence || "medium"),
    });
  }
  const totals = emptyTotals();
  for (const it of items) {
    totals.kcal += it.kcal;
    totals.protein += it.protein;
    totals.carb += it.carb;
    totals.fat += it.fat;
    totals.sodium += it.sodium;
  }
  totals.protein = Number(totals.protein.toFixed(1));
  totals.carb = Number(totals.carb.toFixed(1));
  totals.fat = Number(totals.fat.toFixed(1));
  return { items, totals };
}

/** 今日已摄入（本餐之前）。口径与「今日摄入」卡片保持一致，见 services/intake.ts */
export async function todayIntake(userId: string, excludeMessageId?: number): Promise<number> {
  return todayIntakeKcal(userId, excludeMessageId);
}

/** 规则兜底点评：模型不可用时仍能给出有数字、有结论的一段话 */
export function ruleBasedReview(
  totals: MealTotals,
  target: { kcal: number; protein: number; sodium: number } | null,
  intakeBefore: number,
  conditions: string[],
): string {
  if (totals.kcal <= 0) return "这一餐没能识别出具体食物，可以换一张更清楚的、能看全盘子的照片再试一次。";
  const parts: string[] = [];

  if (target) {
    const ratio = Math.round((totals.kcal / target.kcal) * 100);
    const total = intakeBefore + totals.kcal;
    const left = Math.max(0, target.kcal - total);
    parts.push(
      `这一餐约 ${totals.kcal} kcal，占今日目标 ${target.kcal} kcal 的 ${ratio}%` +
        (left > 0 ? `，今天还剩 ${left} kcal 额度。` : `，已经超出今日额度 ${total - target.kcal} kcal。`),
    );
    // 蛋白：一餐大致应占全天的 1/3
    const proteinPerMeal = Math.round(target.protein / 3);
    if (totals.protein < proteinPerMeal * 0.7) {
      parts.push(`蛋白质 ${totals.protein}g，比这一餐的参考量 ${proteinPerMeal}g 少一些，下一顿可以加点鸡蛋、豆腐或瘦肉。`);
    } else if (totals.protein >= proteinPerMeal) {
      parts.push(`蛋白质 ${totals.protein}g，达到这一餐的参考量 ${proteinPerMeal}g。`);
    }
  } else {
    parts.push(`这一餐约 ${totals.kcal} kcal（蛋白质 ${totals.protein}g、碳水 ${totals.carb}g、脂肪 ${totals.fat}g）。`);
  }

  if (target && totals.sodium > 800) {
    parts.push(`钠约 ${totals.sodium}mg，偏高，今天后面尽量选清淡的。`);
  }
  if (conditions.includes("高血压") && totals.sodium > 800) {
    parts.push("你有高血压记录，这餐偏咸，注意别连着几顿都这样。");
  }
  if (conditions.includes("糖尿病") && totals.carb > 80) {
    parts.push("碳水偏多，建议搭配蔬菜一起吃，餐后走一走。");
  }
  return parts.join("");
}

/** 让模型把系统算好的数字组织成一段自然点评。失败时退回规则点评。 */
export async function writeReview(
  req: Request,
  params: {
    items: MealItemResult[];
    totals: MealTotals;
    briefText: string;
    target: { kcal: number; protein: number; sodium: number } | null;
    intakeBefore: number;
    conditions: string[];
    mealType: string;
  },
): Promise<string> {
  const fallback = ruleBasedReview(params.totals, params.target, params.intakeBefore, params.conditions);
  try {
    const config = new Config();
    const headers = HeaderUtils.extractForwardHeaders(
      req.headers as unknown as Record<string, string>,
    );
    const llm = new LLMClient(config, headers);

    const dishList = params.items
      .map((i) => `${i.name}（约 ${i.grams}g，${i.kcal} kcal）`)
      .join("、");
    const intakeTotal = params.intakeBefore + params.totals.kcal;

    const system = `你是"暖暖"，健康陪伴应用的助手，称呼用户为"主人"。

现在系统已经用食物成分表算好了这一餐的数据，你的任务是把这些数字讲成人话，并结合身体状况给一句具体提醒。

【硬性纪律】
1. 所有热量与营养素数字必须原样引用下面给出的值，不要重新估算、不要四舍五入成别的数、不要新增任何数字。
2. 不要报菜谱、不要编造没被识别出的食物。
3. 不做疾病诊断、不给药物剂量。
4. 2-4 句话，口语化，不要 Markdown 表格、不要 # 标题、不要分隔线。
5. 不要每句都加免责，最多在最后自然带一句。`;

    const user = `【这一餐识别结果】${params.mealType === "breakfast" ? "早餐" : params.mealType === "lunch" ? "午餐" : params.mealType === "dinner" ? "晚餐" : "加餐"}
菜品：${dishList}
合计：${params.totals.kcal} kcal，蛋白质 ${params.totals.protein}g，碳水 ${params.totals.carb}g，脂肪 ${params.totals.fat}g，钠 ${params.totals.sodium}mg
今日目标热量：${params.target ? `${params.target.kcal} kcal` : "未设置"}
今日本餐前已摄入：${params.intakeBefore} kcal
今日累计：${intakeTotal} kcal

【身体与目标简报】
${params.briefText || "（暂无身体档案）"}

请写下对这一餐的点评。要具体说这餐占今天多少额度、蛋白质够不够、有没有需要提醒的地方（比如偏咸、油多、蔬菜少）。`;

    const res = await llm.invoke(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { model: MODEL, temperature: 0.6 },
    );
    const text = String(res.content || "").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

/** 分析一餐：识别 → 计算 → 点评 */
export async function analyzeMeal(
  req: Request,
  params: { userId: string; imageUrl?: string; videoUrl?: string },
): Promise<MealAnalysis> {
  const { userId, imageUrl, videoUrl } = params;
  const base: MealAnalysis = {
    ok: false,
    items: [],
    totals: emptyTotals(),
    mealType: guessMealType(),
    review: "",
    targetKcal: null,
    intakeBefore: 0,
    intakeAfter: 0,
    model: MODEL,
  };

  let brief: Awaited<ReturnType<typeof buildHealthBrief>> | null = null;
  try {
    brief = await buildHealthBrief(userId);
  } catch {
    brief = null;
  }
  const conditions = (brief?.profile as any)?.medical_history || [];
  const target = brief?.targets
    ? { kcal: brief.targets.intake, protein: brief.targets.protein, sodium: brief.targets.sodiumMax }
    : null;
  const intakeBefore = await todayIntake(userId);

  let identified: Awaited<ReturnType<typeof identifyByVision>> = null;
  try {
    identified = await identifyByVision(req, { imageUrl, videoUrl });
  } catch (e: any) {
    return {
      ...base,
      intakeBefore,
      targetKcal: target?.kcal ?? null,
      note: `识别服务没能返回结果（${e?.message || "未知错误"}）。可以先告诉我你吃了什么，我按食物成分表帮你算。`,
      review: "这张图我暂时没能看明白，主人可以直接打字告诉我吃了什么，我用食物成分表给你算热量。",
    };
  }

  if (!identified) {
    return {
      ...base,
      intakeBefore,
      targetKcal: target?.kcal ?? null,
      note: "没能从画面里读出食物信息。",
      review: "这张图我没能看清楚，主人可以换一张能看到整盘菜的照片，或者直接告诉我吃了什么。",
    };
  }

  if (!identified.isFood || !identified.items.length) {
    return {
      ...base,
      mealType: identified.mealType,
      intakeBefore,
      targetKcal: target?.kcal ?? null,
      note: identified.sceneNote || "画面里没有识别到食物。",
      review: identified.sceneNote
        ? `这张图里我没找到食物（${identified.sceneNote}）。要是发错了没关系，重新发一张就好。`
        : "这张图里好像没有食物哦，主人是不是发错啦？",
    };
  }

  const { items, totals } = computeItems(identified.items);
  if (!items.length) {
    return {
      ...base,
      intakeBefore,
      targetKcal: target?.kcal ?? null,
      note: "识别结果为空。",
      review: "这一餐我没认出具体的食物，主人可以直接告诉我吃了什么。",
    };
  }

  const review = await writeReview(req, {
    items,
    totals,
    briefText: brief?.text || "",
    target,
    intakeBefore,
    conditions,
    mealType: identified.mealType,
  });

  // 部分食物没在成分表里匹配到，说明热量是按类别中位数估的，要如实告诉用户
  const unmatched = items.filter((i) => !i.matched);
  const note = unmatched.length
    ? `${unmatched.map((i) => i.name).join("、")} 不在营养成分表里，这几项按同类食物均值估算，误差会大一些。`
    : undefined;

  return {
    ok: true,
    items,
    totals,
    mealType: identified.mealType,
    note,
    review,
    targetKcal: target?.kcal ?? null,
    intakeBefore,
    intakeAfter: intakeBefore + totals.kcal,
    model: MODEL,
  };
}

/** 探测当前模型是否接受图片输入。部署后用它确认能力，比盲猜快。 */
export async function probeVision(req: Request): Promise<{ ok: boolean; model: string; detail: string }> {
  // 1×1 透明像素：只用于验证「模型能否接收 image_url 并正常返回」，
  // 不用于识别，所以内容是什么无所谓。
  const tiny =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  try {
    const r = await identifyByVision(req, { imageUrl: tiny });
    if (r) return { ok: true, model: MODEL, detail: "模型可以接收图片输入，识别链路通。" };
    return { ok: false, model: MODEL, detail: "模型有返回但内容不是预期 JSON，可能是它不接受图片或改了格式。" };
  } catch (e: any) {
    return {
      ok: false,
      model: MODEL,
      detail: `调用失败：${String(e?.message || e).slice(0, 200)}。若提示模型不支持图片，可用环境变量 MEAL_MODEL 换成视觉模型。`,
    };
  }
}

/** 把分析结果落成一条 meal 消息，前端据此渲染营养卡片 */
export async function saveMealMessage(
  userId: string,
  imageUrl: string,
  analysis: MealAnalysis,
  /** 附加字段，如 checkinId（该餐已确认记入打卡）、meal */
  extra: Record<string, any> = {},
): Promise<any | null> {
  const payload = {
    imageUrl,
    items: analysis.items,
    totals: analysis.totals,
    mealType: analysis.mealType,
    note: analysis.note,
    review: analysis.review,
    targetKcal: analysis.targetKcal,
    intakeBefore: analysis.intakeBefore,
    intakeAfter: analysis.intakeAfter,
    sources: FOOD_SOURCES,
    ...extra,
  };
  const { data } = await client
    .from("chat_messages")
    .insert({ user_id: userId, role: "assistant", content: JSON.stringify(payload), message_type: "meal" })
    .select()
    .single();
  return data;
}
