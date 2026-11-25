import { Router } from "express";
import { analyzeMeal, saveMealMessage, probeVision } from "../services/mealReview";
import { buildHealthBrief } from "../services/healthBrief";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { todayRange } from "../utils/date";

const router = Router();
const client = getSupabaseClient();

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

    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    if (!imageUrl && !videoUrl) return res.status(400).json({ error: "缺少图片或视频地址" });

    const analysis = await analyzeMeal(req, { userId, imageUrl, videoUrl });
    // 只有识别成功才落库，避免把"没看清"的失败记录混进今日摄入
    const message = analysis.ok
      ? await saveMealMessage(userId, imageUrl || videoUrl, analysis)
      : null;

    return res.json({ ...analysis, message });
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
    let intake = 0;
    for (const row of data || []) {
      try {
        const obj = JSON.parse(String((row as any).content || "{}"));
        intake += Number(obj?.totals?.kcal || 0);
        meals.push({ id: (row as any).id, createdAt: (row as any).created_at, ...obj });
      } catch {
        // 脏数据跳过，不让一条坏记录毁掉整天的汇总
      }
    }

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
