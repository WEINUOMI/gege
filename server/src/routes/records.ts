import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { fileUrl } from "../services/storage";
import { todayRange, dayRange, lastNDays } from "../utils/date";
import { todayIntakeKcal } from "../services/intake";
import { ACTIVITIES, ACTIVITY_SOURCE, DEFAULT_CUSTOM_MET } from "../data/activities";
import {
  ensureAnchor,
  addPoints,
  ANCHOR_META,
  type AnchorCategory,
} from "../services/checkinLog";

const router = Router();
const client = getSupabaseClient();

// 取得某类记录的锚点目标（前端需要 goalId 才能跳转到记录详情）
// 接口：GET /api/v1/records/anchor?userId=&category=diet
router.get("/anchor", async (req, res) => {
  try {
    const userId = String(req.query.userId || "");
    const category = String(req.query.category || "diet") as AnchorCategory;
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    if (!ANCHOR_META[category]) return res.status(400).json({ error: "category 不合法" });
    const anchor = await ensureAnchor(userId, category);
    return res.json(anchor);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 记录一餐
// 接口：POST /api/v1/records/diet
// Body: userId: string, name: string, calories?: number, meal?: string, photoKey?: string, note?: string
router.post("/diet", async (req, res) => {
  try {
    const { userId, name, calories, meal, photoKey, note } = req.body || {};
    if (!userId || !name) return res.status(400).json({ error: "缺少参数" });
    const { goalId, planItemId } = await ensureAnchor(String(userId), "diet");
    const kcal = Number(calories) || 0;
    // 备注并入标题（表结构里没有独立备注字段，避免为此改动线上表）
    const title = `${meal ? `${meal} · ` : ""}${String(name).slice(0, 40)}${kcal ? `（约 ${kcal} kcal）` : ""}${note ? `｜${String(note).slice(0, 30)}` : ""}`.slice(0, 120);
    const { data: checkin, error } = await client
      .from("checkins")
      .insert({
        goal_id: goalId,
        plan_item_id: planItemId,
        user_id: String(userId),
        title,
        proof_key: photoKey || null,
        proof_type: photoKey ? "image" : "text",
        points: ANCHOR_META.diet.points,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await addPoints(String(userId), goalId, ANCHOR_META.diet.points, `饮食记录：${name}`);
    return res.json({ checkin, pointsEarned: ANCHOR_META.diet.points, goalId });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 记录一次运动（按 MET 与体重结算积分；凭证可选但强烈建议上传）
// 接口：POST /api/v1/records/workout
// Body: userId: string, name: string, minutes: number, met: number, calories?: number, photoKey?: string
router.post("/workout", async (req, res) => {
  try {
    const { userId, name, minutes, met, calories, photoKey } = req.body || {};
    if (!userId || !name) return res.status(400).json({ error: "缺少参数" });
    const mins = Math.min(Math.max(Number(minutes) || 20, 1), 300);
    const metVal = Number(met) || 3;
    const kcal = Number(calories) || Math.round((metVal * 3.5 * 60) / 200 * mins);
    // 积分与运动量挂钩：20 分钟内 8 分，之后每 10 分钟 +2，上限 20 分
    const earn = Math.min(20, 6 + Math.floor(mins / 10) * 2);
    const { goalId, planItemId } = await ensureAnchor(String(userId), "exercise");
    const title = `${String(name).slice(0, 40)} ${mins} 分钟（约 ${kcal} kcal）`.slice(0, 120);
    const { data: checkin, error } = await client
      .from("checkins")
      .insert({
        goal_id: goalId,
        plan_item_id: planItemId,
        user_id: String(userId),
        title,
        proof_key: photoKey || null,
        proof_type: photoKey ? "image" : "text",
        points: earn,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await addPoints(String(userId), goalId, earn, `运动记录：${name} ${mins}分钟`);
    return res.json({ checkin, pointsEarned: earn, calories: kcal, goalId });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 今日饮食 / 运动 / 学习记录汇总（含照片地址）
// 接口：GET /api/v1/records/today?userId=
router.get("/today", async (req, res) => {
  try {
    const userId = String(req.query.userId || "");
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const { data: goals } = await client.from("goals").select("id,category").eq("user_id", userId).in("category", ["diet", "exercise", "study"]);
    const byCat: Record<string, number[]> = { diet: [], exercise: [], study: [] };
    (goals || []).forEach((g: any) => { if (byCat[g.category]) byCat[g.category].push(Number(g.id)); });
    const { start, end } = todayRange();

    const result: any = { diet: [], exercise: [], study: [], dietCalories: 0, workoutCalories: 0, workoutMinutes: 0 };
    for (const cat of ["diet", "exercise", "study"] as AnchorCategory[]) {
      const ids = byCat[cat];
      if (!ids.length) continue;
      const { data: rows } = await client
        .from("checkins")
        .select("*")
        .in("goal_id", ids)
        .eq("user_id", userId)
        .gte("checkin_date", start)
        .lte("checkin_date", end)
        .order("created_at", { ascending: false });
      const enriched = [];
      for (const r of rows || []) {
        const url = r.proof_key ? await fileUrl(r.proof_key) : "";
        const kcalMatch = String(r.title || "").match(/(\d{2,4})\s*kcal/);
        const minMatch = String(r.title || "").match(/(\d{1,3})\s*分钟/);
        const kcal = kcalMatch ? Number(kcalMatch[1]) : 0;
        if (cat === "diet") result.dietCalories += kcal;
        if (cat === "exercise") {
          result.workoutCalories += kcal;
          result.workoutMinutes += minMatch ? Number(minMatch[1]) : 0;
        }
        enriched.push({ ...r, proof_url: url, calories: kcal, minutes: minMatch ? Number(minMatch[1]) : 0 });
      }
      result[cat] = enriched;
    }
    // 统一口径：打卡 + 未折成打卡的餐食分析，避免两边各算一套
    result.dietCalories = await todayIntakeKcal(userId);

    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * 可选的常见活动（自定义运动记录用）
 * 接口：GET /api/v1/records/activities
 *
 * 推荐库只覆盖计划动作，用户实际做的往往不在里面（遛狗、爬楼、广场舞）。
 * 这里给出名称 + MET，前端选完直接按 MET 结算热量。
 */
router.get("/activities", (_req, res) => {
  res.json({
    activities: ACTIVITIES,
    defaultMet: DEFAULT_CUSTOM_MET,
    source: ACTIVITY_SOURCE,
  });
});

// 最近 n 天的摄入与消耗趋势（用于身体记录页的趋势图）
// 接口：GET /api/v1/records/trend?userId=&days=7
router.get("/trend", async (req, res) => {
  try {
    const userId = String(req.query.userId || "");
    const days = Math.min(Math.max(Number(req.query.days) || 7, 3), 30);
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const { data: goals } = await client.from("goals").select("id,category").eq("user_id", userId).in("category", ["diet", "exercise"]);
    const dietIds = (goals || []).filter((g: any) => g.category === "diet").map((g: any) => Number(g.id));
    const exIds = (goals || []).filter((g: any) => g.category === "exercise").map((g: any) => Number(g.id));
    const dates = lastNDays(days);
    const out = [];
    for (const d of dates) {
      const { start, end } = dayRange(d);
      let intake = 0;
      let burn = 0;
      if (dietIds.length) {
        const { data } = await client.from("checkins").select("title").in("goal_id", dietIds).eq("user_id", userId).gte("checkin_date", start).lte("checkin_date", end);
        (data || []).forEach((r: any) => {
          const m = String(r.title || "").match(/(\d{2,4})\s*kcal/);
          if (m) intake += Number(m[1]);
        });
      }
      if (exIds.length) {
        const { data } = await client.from("checkins").select("title").in("goal_id", exIds).eq("user_id", userId).gte("checkin_date", start).lte("checkin_date", end);
        (data || []).forEach((r: any) => {
          const m = String(r.title || "").match(/(\d{2,4})\s*kcal/);
          if (m) burn += Number(m[1]);
        });
      }
      out.push({ date: d, intake, burn });
    }
    return res.json({ trend: out });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
