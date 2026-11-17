import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { recommendDiet, recommendExercise, DIET_SOURCES, DIET_DISCLAIMER, EXERCISE_SOURCES, EXERCISE_DISCLAIMER, llmText, type HealthContext } from "../services/ai";
import { loadUserContext, pickRecipes, pickWorkouts, safetyNote, estimateCalories, effectiveConditions } from "../services/planning";
import { RECIPE_SOURCES } from "../data/recipes";
import { WORKOUT_SOURCES } from "../data/workouts";
import { findTemplate, type StudyPlan } from "../data/study";

const router = Router();
const client = getSupabaseClient();

async function loadProseContext(userId: string): Promise<{ ctx: HealthContext; snapshot: any }> {
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

// ===== 旧接口：整段文字式建议（保留兼容，供对话式咨询使用）=====
// 接口：POST /api/v1/recommend/diet
router.post("/diet", async (req, res) => {
  try {
    const { userId, query } = req.body || {};
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const { ctx, snapshot } = await loadProseContext(userId);
    const q = query || `根据主人的身体状况与目标，给出今日饮食建议和3道可执行的菜谱（含食材、做法、热量），食材可含常见冰箱食材。`;
    const result = await recommendDiet(req, ctx, q);
    return res.json({ content: result.content, sources: DIET_SOURCES, disclaimer: DIET_DISCLAIMER, context: snapshot });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 接口：POST /api/v1/recommend/exercise
router.post("/exercise", async (req, res) => {
  try {
    const { userId, query } = req.body || {};
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const { ctx, snapshot } = await loadProseContext(userId);
    const q = query || `根据主人的身体状况与目标，推荐多项可选择的运动（含时长、强度、可消耗热量、安全注意事项）。`;
    const result = await recommendExercise(req, ctx, q);
    return res.json({ content: result.content, sources: EXERCISE_SOURCES, disclaimer: EXERCISE_DISCLAIMER, context: snapshot });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== 结构化菜谱卡片 =====
// 接口：POST /api/v1/recommend/recipes
// Body: userId: string, ingredients?: string[], limit?: number, offset?: number
// 说明：菜谱与营养值来自本地规则库（不做模型自由生成），病史不适配的项目会被过滤掉。
router.post("/recipes", async (req, res) => {
  try {
    const { userId, ingredients, limit, offset } = req.body || {};
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const ctx = await loadUserContext(String(userId));
    const { list, excludedCount } = pickRecipes(ctx, {
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      limit: Number(limit) || 3,
      offset: Number(offset) || 0,
    });
    return res.json({
      recipes: list,
      excludedCount,
      conditions: effectiveConditions(ctx),
      safetyNote: safetyNote(ctx),
      sources: RECIPE_SOURCES,
      disclaimer: DIET_DISCLAIMER,
      weight: ctx.weight,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== 结构化运动卡片 =====
// 接口：POST /api/v1/recommend/workouts
// Body: userId: string, parts?: string[], minutes?: number, limit?: number, offset?: number
router.post("/workouts", async (req, res) => {
  try {
    const { userId, parts, minutes, limit, offset } = req.body || {};
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const ctx = await loadUserContext(String(userId));
    const { list, excludedCount } = pickWorkouts(ctx, {
      parts: Array.isArray(parts) ? parts : [],
      minutes: Number(minutes) || undefined,
      limit: Number(limit) || 3,
      offset: Number(offset) || 0,
    });
    return res.json({
      workouts: list,
      excludedCount,
      conditions: effectiveConditions(ctx),
      safetyNote: safetyNote(ctx),
      weight: ctx.weight,
      sources: WORKOUT_SOURCES,
      disclaimer: EXERCISE_DISCLAIMER,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 精确热量估算（供前端按自定义时长换算）
// 接口：POST /api/v1/recommend/calories
router.post("/calories", async (req, res) => {
  const { met, minutes, weight } = req.body || {};
  const kg = Number(weight) || 60;
  const m = Number(met) || 3;
  const min = Number(minutes) || 30;
  return res.json({ calories: estimateCalories(m, kg, min) });
});

// ===== 学习计划 =====
// 接口：POST /api/v1/recommend/study-plan
// Body: userId: string, direction: string, weeks?: number
// 结构：本地模板库给出可执行的骨架 → 大模型做个性化微调（失败则原样返回模板）
function parseJsonBlock(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

router.post("/study-plan", async (req, res) => {
  try {
    const { userId, direction, weeks } = req.body || {};
    const base = findTemplate(String(direction || ""));
    const weekCount = Math.min(Math.max(Number(weeks) || base.weeks.length, 2), 8);
    let plan: StudyPlan = {
      direction: base.direction,
      summary: base.summary,
      weeks: base.weeks.slice(0, weekCount),
      resources: base.resources,
    };
    let personalized = false;

    if (userId) {
      try {
        const ctx = await loadUserContext(String(userId));
        const prompt = `请围绕「${base.direction}」为一位用户设计 ${weekCount} 周学习计划。
用户情况：${ctx.age ? `${ctx.age}岁` : "年龄未填"}${ctx.gender || ""}；当前目标：${ctx.goalTitles.join("、") || "无"}。
已有一份骨架计划如下（可沿用或微调，不要推翻结构）：
${JSON.stringify({ weeks: plan.weeks })}

请只输出 JSON，不要任何解释文字，格式：
{"summary":"一句话说明这${weekCount}周的核心思路","weeks":[{"index":1,"focus":"本周重点","tasks":[{"title":"可执行任务","minutes":20,"slot":"08:00"}]}],"tip":"给这位用户的一句提醒"}
要求：每周 2-3 个任务，单个任务不超过 40 分钟，任务必须具体到能立刻开始做。`;
        const raw = await llmText(req, "你是学习计划设计助手，只输出严格合法的 JSON，不加代码块标记。", prompt, 0.5);
        const parsed = parseJsonBlock(raw);
        if (parsed && Array.isArray(parsed.weeks) && parsed.weeks.length) {
          const weeksClean = parsed.weeks.slice(0, weekCount).map((w: any, i: number) => ({
            index: Number(w?.index) || i + 1,
            focus: String(w?.focus || plan.weeks[i]?.focus || `第 ${i + 1} 周`),
            tasks: (Array.isArray(w?.tasks) ? w.tasks : [])
              .slice(0, 4)
              .map((t: any) => ({
                title: String(t?.title || "").slice(0, 60),
                minutes: Math.min(Math.max(Number(t?.minutes) || 20, 5), 60),
                slot: String(t?.slot || "20:00").slice(0, 8),
              }))
              .filter((t: any) => t.title),
          }));
          if (weeksClean.some((w: any) => w.tasks.length)) {
            plan = {
              direction: base.direction,
              summary: String(parsed.summary || plan.summary).slice(0, 200),
              weeks: weeksClean,
              resources: plan.resources,
            };
            personalized = true;
          }
        }
      } catch {
        // 模型不可用时保持模板结果，功能不降级
      }
    }

    return res.json({
      plan,
      personalized,
      templateKey: base.key,
      disclaimer: "学习计划为通用方法框架，具体资料与考试要求请以官方信息来源为准。",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
