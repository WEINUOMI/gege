import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { recommendDiet, recommendExercise, DIET_SOURCES, DIET_DISCLAIMER, EXERCISE_SOURCES, EXERCISE_DISCLAIMER, type HealthContext } from "../services/ai";

const router = Router();
const client = getSupabaseClient();

async function loadContext(userId: string): Promise<{ ctx: HealthContext; snapshot: any }> {
  const { data: p } = await client.from("health_profiles").select("*").eq("user_id", userId).maybeSingle();
  const { data: goals } = await client.from("goals").select("title,status").eq("user_id", userId).eq("status", "active");
  const pp: any = p || {};
  const goalTitles = (goals || []).map((g: any) => g.title);
  const ctx: HealthContext = {
    nickname: "主人",
    height: pp.height || undefined,
    weight: pp.weight || undefined,
    age: pp.age ? String(pp.age) : undefined,
    gender: pp.gender || undefined,
    bloodPressure: pp.blood_pressure_systolic && pp.blood_pressure_diastolic ? `${pp.blood_pressure_systolic}/${pp.blood_pressure_diastolic}` : undefined,
    bloodSugar: pp.blood_sugar || undefined,
    bloodLipid: [pp.total_cholesterol, pp.triglycerides].filter(Boolean).join("/") || undefined,
    heartRate: pp.heart_rate || undefined,
    medicalHistory: pp.medical_history || [],
    goals: goalTitles,
  };
  const snapshot = {
    height: pp.height || "",
    weight: pp.weight || "",
    age: pp.age || "",
    gender: pp.gender || "",
    bloodPressure: ctx.bloodPressure || "",
    bloodSugar: pp.blood_sugar || "",
    bloodLipid: ctx.bloodLipid || "",
    heartRate: pp.heart_rate || "",
    medicalHistory: pp.medical_history || [],
    goals: goalTitles,
  };
  return { ctx, snapshot };
}

// 饮食/菜谱推荐（引入知识库 + 免责声明）
// 接口：POST /api/v1/recommend/diet
// Body 参数：userId: string, query?: string
router.post("/diet", async (req, res) => {
  try {
    const { userId, query } = req.body || {};
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const { ctx, snapshot } = await loadContext(userId);
    const q = query || `根据主人的身体状况与目标，给出今日饮食建议和3道可执行的菜谱（含食材、做法、热量），食材可含常见冰箱食材。`;
    const result = await recommendDiet(req, ctx, q);
    return res.json({ content: result.content, sources: DIET_SOURCES, disclaimer: DIET_DISCLAIMER, context: snapshot });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 运动计划推荐（引入知识库 + 免责声明）
// 接口：POST /api/v1/recommend/exercise
// Body 参数：userId: string, query?: string
router.post("/exercise", async (req, res) => {
  try {
    const { userId, query } = req.body || {};
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const { ctx, snapshot } = await loadContext(userId);
    const q = query || `根据主人的身体状况与目标，推荐多项可选择的运动（含时长、强度、可消耗热量、安全注意事项）。`;
    const result = await recommendExercise(req, ctx, q);
    return res.json({ content: result.content, sources: EXERCISE_SOURCES, disclaimer: EXERCISE_DISCLAIMER, context: snapshot });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;