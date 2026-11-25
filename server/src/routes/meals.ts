import { Router } from "express";
import {
  analyzeMeal,
  saveMealMessage,
  probeVision,
  computeItems,
  writeReview,
  type MealAnalysis,
  type MealItemResult,
  type MealTotals,
} from "../services/mealReview";
import { buildHealthBrief } from "../services/healthBrief";
import { todayIntakeKcal } from "../services/intake";
import { logDietCheckin } from "../services/checkinLog";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { todayRange } from "../utils/date";

const router = Router();
const client = getSupabaseClient();

const MEAL_LABEL: Record<string, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};

function toMealType(meal: string): string {
  const key = String(meal || "").trim();
  const found = Object.entries(MEAL_LABEL).find(([, label]) => label === key);
  if (found) return found[0];
  if (key === "breakfast" || key === "lunch" || key === "dinner" || key === "snack") return key;
  return "lunch";
}

/**
 * 把前端确认过的清单换算成营养数据。
 * 有 grams 就用克数（前端已经给用户看过这个数），没有才去解析份量词。
 */
function computeConfirmed(rawItems: any[]): { items: MealItemResult[]; totals: MealTotals } {
  const prepared = rawItems
    .map((it: any) => ({
      name: String(it?.name || "").trim(),
      category: it?.category,
      portion: Number(it?.grams) > 0 ? `${Math.round(Number(it.grams))}g` : String(it?.portion || ""),
    }))
    .filter((it) => it.name);
  return computeItems(prepared);
}

/**
 * 自检：当前配置的模型能不能接收图片输入。
 * 接口：GET /api/v1/meals/capability
 *
 * 拍照点评依赖模型具备视觉能力，而这一点无法在开发机上验证，
 * 只能在扣子运行时里试。部署后先打这个接口，能少走很多弯路。
 */
router.get("/capability", async (req, res) => {
  try {
    const result = await probeVision(req);
    return res.json(result);
  } catch (e: any) {
    return res.json({ ok: false, model: "unknown", detail: String(e?.message || e) });
  }
});

/**
 * 分析一餐：识别照片/视频里的食物，算热量与营养素，结合身体状况点评。
 * 接口：POST /api/v1/meals/analyze
 * Body：{ userId, imageUrl?, videoUrl? }
 *
 * 图片和视频都支持（视频按每秒 1 帧抽帧识别）。
 * 热量由服务端按食物成分表计算，模型只负责识别种类与份量。
 */
router.post("/analyze", async (req, res) => {
  try {
    const b = req.body || {};
    const userId = String(b.userId || "");
    const imageUrl = String(b.imageUrl || "");
    const videoUrl = String(b.videoUrl || "");
    // 只做识别预览时不落库：用户在「暖心厨房」手动记录时会先看一眼识别结果，
    // 确认后才真正记成一餐，否则未确认的预览也会算进今日摄入
    const save = b.save !== false;

    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    if (!imageUrl && !videoUrl) return res.status(400).json({ error: "缺少图片或视频地址" });

    const analysis = await analyzeMeal(req, { userId, imageUrl, videoUrl });
    const message = analysis.ok && save
      ? await saveMealMessage(userId, imageUrl || videoUrl, analysis)
      : null;

    return res.json({ ...analysis, message });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * 按清单估算营养（不落库、不调模型）
 * 接口：POST /api/v1/meals/estimate
 * Body：{ items: [{ name, grams?, portion?, category? }] }
 *
 * 「加一样菜」「手动填菜名」时前端需要立刻看到热量，
 * 走这个接口比再调一次大模型快得多，数字也和最终记录完全一致。
 */
router.post("/estimate", async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!raw.length) return res.status(400).json({ error: "缺少食物清单" });
    const { items, totals } = computeConfirmed(raw);
    return res.json({ items, totals });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * 记录一餐（用户实际吃的，无论是否在推荐里）
 * 接口：POST /api/v1/meals/log
 * Body：{ userId, meal, items: [{ name, grams?, portion?, category? }], imageUrl?, photoKey?, kcal? }
 *
 * kcal 是用户自己填的热量：外卖、餐馆的份量很难估准，
 * 用户愿意填就按他填的算，其余营养素按比例同步缩放。
 */
router.post("/log", async (req, res) => {
  try {
    const b = req.body || {};
    const userId = String(b.userId || "");
    const meal = String(b.meal || "").trim();
    const imageUrl = String(b.imageUrl || "");
    const photoKey = String(b.photoKey || "");
    const manualKcal = Number(b.kcal) || 0;
    const rawItems = Array.isArray(b.items) ? b.items : [];

    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    if (!rawItems.length) return res.status(400).json({ error: "至少填一样吃了什么" });

    let { items, totals } = computeConfirmed(rawItems);
    if (!items.length) return res.status(400).json({ error: "食物名称不能为空" });

    if (manualKcal > 0 && manualKcal !== totals.kcal) {
      const scale = totals.kcal > 0 ? manualKcal / totals.kcal : 0;
      if (scale > 0) {
        items = items.map((i) => ({
          ...i,
          kcal: Math.round(i.kcal * scale),
          protein: Number((i.protein * scale).toFixed(1)),
          carb: Number((i.carb * scale).toFixed(1)),
          fat: Number((i.fat * scale).toFixed(1)),
          sodium: Math.round(i.sodium * scale),
        }));
        totals = {
          ...totals,
          protein: Number((totals.protein * scale).toFixed(1)),
          carb: Number((totals.carb * scale).toFixed(1)),
          fat: Number((totals.fat * scale).toFixed(1)),
          sodium: Math.round(totals.sodium * scale),
        };
      }
      totals = { ...totals, kcal: Math.round(manualKcal) };
    }

    const brief = await buildHealthBrief(userId).catch(() => null);
    const conditions: string[] = ((brief?.profile as any)?.medical_history as string[]) || [];
    const target = brief?.targets
      ? { kcal: brief.targets.intake, protein: brief.targets.protein, sodium: brief.targets.sodiumMax }
      : null;
    const intakeBefore = await todayIntakeKcal(userId);
    const mealType = toMealType(meal);
    const summaryName = items.map((i) => i.name).slice(0, 3).join("、");

    const review = await writeReview(req, {
      items,
      totals,
      briefText: brief?.text || "",
      target,
      intakeBefore,
      conditions,
      mealType,
    });

    const unmatched = items.filter((i) => !i.matched);
    const note = unmatched.length
      ? `${unmatched.map((i) => i.name).join("、")} 不在营养成分表里，按同类食物均值估算，误差会大一些。`
      : undefined;

    const { checkin, goalId, pointsEarned } = await logDietCheckin({
      userId,
      name: summaryName || "一餐",
      calories: totals.kcal,
      meal: MEAL_LABEL[mealType],
      photoKey: photoKey || undefined,
    });

    const analysis: MealAnalysis = {
      ok: true,
      items,
      totals,
      mealType,
      note,
      review,
      targetKcal: target?.kcal ?? null,
      intakeBefore,
      intakeAfter: intakeBefore + totals.kcal,
      model: "manual",
    };
    // 打卡已经写成功了，后面的消息落库失败不能再让整个请求失败，
    // 否则用户看到"记录失败"会重试，变成重复记两笔
    let message: any = null;
    try {
      // 打上 checkinId：这条分析已经折成打卡，汇总时不再重复计一次
      message = await saveMealMessage(userId, imageUrl, analysis, {
        checkinId: checkin?.id ?? null,
        meal: MEAL_LABEL[mealType],
      });
    } catch {
      message = null;
    }

    return res.json({
      ...analysis,
      meal: MEAL_LABEL[mealType],
      checkin,
      goalId,
      pointsEarned,
      message,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * 今日饮食汇总
 * 接口：GET /api/v1/meals/today?userId=
 */
router.get("/today", async (req, res) => {
  try {
    const userId = String(req.query.userId || "");
    if (!userId) return res.status(400).json({ error: "缺少 userId" });

    const { start, end } = todayRange();
    const { data } = await client
      .from("chat_messages")
      .select("id,content,created_at")
      .eq("user_id", userId)
      .eq("message_type", "meal")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    const meals: any[] = [];
    for (const row of data || []) {
      try {
        const obj = JSON.parse(String((row as any).content || "{}"));
        meals.push({ id: (row as any).id, createdAt: (row as any).created_at, ...obj });
      } catch {
        // 脏数据跳过，不让一条坏记录毁掉整天的汇总
      }
    }
    // 摄入用全站统一口径（打卡 + 未折成打卡的分析），和「今日已记录」对得上
    const intake = await todayIntakeKcal(userId);

    let target: number | null = null;
    let proteinTarget: number | null = null;
    try {
      const brief = await buildHealthBrief(userId);
      target = brief.targets?.intake ?? null;
      proteinTarget = brief.targets?.protein ?? null;
    } catch {
      // 没有身体档案时只返回摄入，不编造目标
    }

    const protein = meals.reduce((n, m) => n + Number(m?.totals?.protein || 0), 0);
    return res.json({
      intake: Math.round(intake),
      target,
      left: target != null ? Math.max(0, target - Math.round(intake)) : null,
      protein: Number(protein.toFixed(1)),
      proteinTarget,
      meals,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
