import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { fileUrl } from "../services/storage";
import { localToday, todayRange, dayRange, lastNDays } from "../utils/date";

const router = Router();
const client = getSupabaseClient();

const PLAN_PRESETS: Record<string, { title: string; category: string; time: string }[]> = {
  weight_loss: [
    { title: "晨起空腹称重并记录", category: "health", time: "07:00" },
    { title: "健康早餐拍照记录", category: "diet", time: "08:00" },
    { title: "低卡午餐，拍照记录", category: "diet", time: "12:00" },
    { title: "快走或慢跑 30 分钟", category: "exercise", time: "19:00" },
    { title: "晚餐清淡，拍照记录", category: "diet", time: "18:30" },
    { title: "睡前 15 分钟拉伸放松", category: "exercise", time: "21:30" },
  ],
  muscle: [
    { title: "高蛋白早餐（拍照记录）", category: "diet", time: "08:00" },
    { title: "力量训练（胸/背/腿任选）", category: "exercise", time: "19:00" },
    { title: "训练后补充蛋白质", category: "diet", time: "20:00" },
    { title: "保证 7 小时睡眠", category: "health", time: "23:00" },
  ],
  health_control: [
    { title: "晨起测量血压血糖并记录", category: "health", time: "07:30" },
    { title: "低盐低脂午餐，拍照记录", category: "diet", time: "12:00" },
    { title: "太极或瑜伽 30 分钟", category: "exercise", time: "17:00" },
    { title: "晚间散步 20 分钟", category: "exercise", time: "20:00" },
  ],
  learning: [
    { title: "晨间学习 30 分钟", category: "study", time: "08:00" },
    { title: "整理今日学习笔记", category: "study", time: "20:00" },
    { title: "睡前回顾并打卡", category: "study", time: "21:30" },
  ],
  habit: [
    { title: "晨起喝水 300ml", category: "health", time: "07:00" },
    { title: "冥想 10 分钟", category: "health", time: "12:30" },
    { title: "今日小目标打卡", category: "habit", time: "21:00" },
  ],
};

function defaultPlans(category: string) {
  return PLAN_PRESETS[category] || PLAN_PRESETS.habit;
}

// 创建目标（含可选的每日打卡计划；不传计划则按类别生成系统推荐计划）
// 服务端文件：server/src/routes/goals.ts
// 接口：POST /api/v1/goals
// Body 参数：userId: string, title: string, category: string, metrics?: string[], targetValue?: string, targetMetric?: string, startDate?: string, endDate?: string, dailyPoints?: number, planItems?: {title:string;category:string;planned_time?:string}[], rewards?: string[], punishments?: string[]
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.userId || !b.title) return res.status(400).json({ error: "缺少参数" });
    const { data: goal, error } = await client
      .from("goals")
      .insert({
        user_id: b.userId,
        title: b.title,
        category: b.category || "weight_loss",
        metrics: b.metrics || [],
        target_value: b.targetValue || null,
        target_metric: b.targetMetric || null,
        start_date: b.startDate || localToday(),
        end_date: b.endDate || null,
        daily_points: b.dailyPoints || 20,
        rewards: b.rewards || [],
        punishments: b.punishments || [],
        from_system: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const items = b.planItems && b.planItems.length ? b.planItems : defaultPlans(b.category || "weight_loss");
    const rows = items.map((p: any) => ({
      goal_id: goal.id,
      title: p.title,
      category: p.category || "health",
      planned_time: p.planned_time || p.time || null,
      points: p.points || 10,
    }));
    await client.from("plan_items").insert(rows);
    return res.json({ goal });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 目标列表（含今日打卡状态）
// 接口：GET /api/v1/goals?userId=xxx&status=active
router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    let q: any = client.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (req.query.status) q = q.eq("status", req.query.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const goals = data || [];
    const { start: dayStart, end: dayEnd } = todayRange();
    // 逐个目标统计今日已完成
    const stats: Record<number, { todayDone: number; todayTotal: number }> = {};
    for (const g of goals) {
      const { data: planItems } = await client.from("plan_items").select("id").eq("goal_id", g.id);
      const ids = (planItems || []).map((p: any) => p.id);
      const { data: done } = ids.length
        ? await client
            .from("checkins")
            .select("id")
            .eq("goal_id", g.id)
            .gte("checkin_date", dayStart)
            .lte("checkin_date", dayEnd)
        : { data: [] };
      stats[g.id] = { todayDone: (done || []).length, todayTotal: (planItems || []).length };
    }
    return res.json({ goals, stats });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 目标详情（计划项 + 今日状态 + 打卡记录 + 监督团 + 留言）
// 接口：GET /api/v1/goals/:id
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { data: goal, error } = await client.from("goals").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!goal) return res.status(404).json({ error: "目标不存在" });
    const { data: planItems } = await client.from("plan_items").select("*").eq("goal_id", id).order("planned_time");
    const { start: dayStart, end: dayEnd } = todayRange();
    const pi = planItems || [];
    const piIds = pi.map((p: any) => p.id);
    const { data: todayCheckins } = piIds.length
      ? await client
          .from("checkins")
          .select("*")
          .eq("goal_id", id)
          .gte("checkin_date", dayStart)
          .lte("checkin_date", dayEnd)
      : { data: [] };
    const doneMap: Record<number, boolean> = {};
    (todayCheckins || []).forEach((c: any) => {
      if (c.plan_item_id) doneMap[c.plan_item_id] = true;
    });
    const { data: checkins } = await client.from("checkins").select("*").eq("goal_id", id).order("created_at", { ascending: false }).limit(30);
    // 凭证 URL
    const keyList = (checkins || []).map((c: any) => c.proof_key).filter(Boolean);
    const urlMap: Record<string, string> = {};
    for (const k of keyList) urlMap[k] = await fileUrl(k);
    const enriched = (checkins || []).map((c: any) => ({ ...c, proof_url: urlMap[c.proof_key] || "" }));
    // 监督团成员
    const { data: members } = await client.from("goal_members").select("user_id").eq("goal_id", id);
    const memberIds = (members || []).map((m: any) => m.user_id);
    const { data: memberUsers } = memberIds.length
      ? await client.from("users").select("id,nickname,invite_code,avatar_text").in("id", memberIds)
      : { data: [] };
    // 各成员的今日完成情况
    const memberStats: Record<string, number> = {};
    for (const m of (memberUsers || [])) {
      const { count } = await client
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("goal_id", id)
        .eq("user_id", m.id)
        .gte("checkin_date", dayStart)
        .lte("checkin_date", dayEnd);
      memberStats[m.id] = count || 0;
    }
    // 留言（关联到打卡）
    const checkinIds = enriched.map((c: any) => c.id);
    const { data: comments } = checkinIds.length
      ? await client.from("comments").select("*").in("checkin_id", checkinIds).order("created_at", { ascending: false })
      : { data: [] };
    const commentUsers = await Promise.all(
      [...new Set((comments || []).map((c: any) => c.user_id))].map(async (uid) => {
        const { data: u } = await client.from("users").select("id,nickname,avatar_text").eq("id", uid).maybeSingle();
        return u;
      })
    );
    return res.json({
      goal,
      planItems: pi.map((p: any) => ({ ...p, doneToday: !!doneMap[p.id] })),
      checkins: enriched,
      members: memberUsers || [],
      memberStats,
      comments: comments || [],
      commentUsers: commentUsers.filter(Boolean),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 更新目标（暂停/重设/编辑）
// 接口：PUT /api/v1/goals/:id
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const payload: any = {};
    ["title", "category", "metrics", "target_value", "target_metric", "start_date", "end_date", "daily_points", "rewards", "punishments"].forEach((k) => {
      if (b[k] !== undefined) payload[k] = b[k];
    });
    const { data, error } = await client.from("goals").update(payload).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return res.json({ goal: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 暂停 / 重设 / 删除
router.post("/:id/pause", async (req, res) => {
  const id = req.params.id;
  const { data } = await client.from("goals").update({ status: "paused" }).eq("id", id).select().single();
  return res.json({ goal: data });
});
router.post("/:id/reset", async (req, res) => {
  const id = req.params.id;
  const { data } = await client.from("goals").update({ status: "active", end_date: null }).eq("id", id).select().single();
  return res.json({ goal: data });
});
router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  await client.from("goals").delete().eq("id", id);
  return res.json({ ok: true });
});

// 添加/替换每日打卡计划项
// 接口：POST /api/v1/goals/:id/plan-items
// Body 参数：planItems: {title:string;category?:string;planned_time?:string;points?:number}[]
router.post("/:id/plan-items", async (req, res) => {
  try {
    const id = req.params.id;
    const items = (req.body?.planItems || []) as any[];
    if (!items.length) return res.status(400).json({ error: "planItems 不能为空" });
    // 先清空旧的计划项，再插入新计划（保证与切换系统推荐/自定义一致）
    await client.from("plan_items").delete().eq("goal_id", id);
    const rows = items.map((p) => ({
      goal_id: Number(id),
      title: p.title,
      category: p.category || "health",
      planned_time: p.planned_time || null,
      points: p.points || 10,
    }));
    const { data, error } = await client.from("plan_items").insert(rows).select();
    if (error) throw new Error(error.message);
    return res.json({ planItems: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

interface CheckinBody {
  userId: string;
  title: string;
  planItemId?: number;
  proofKey?: string;
  proofType?: string;
}
// 完成打卡（配凭证；成功发放积分）
// 接口：POST /api/v1/goals/:id/checkins
router.post("/:id/checkins", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = (req.body || {}) as CheckinBody;
    if (!b.userId || !b.title) return res.status(400).json({ error: "缺少参数" });
    if (!b.proofKey) return res.status(400).json({ error: "打卡需上传照片/视频凭证" });
    const { data: goal } = await client.from("goals").select("daily_points").eq("id", id).maybeSingle();
    const pointsEarned = b.planItemId ? 10 : goal?.daily_points || 10;
    const { data: checkin, error } = await client
      .from("checkins")
      .insert({
        goal_id: id,
        plan_item_id: b.planItemId || null,
        user_id: b.userId,
        title: b.title,
        proof_key: b.proofKey,
        proof_type: b.proofType || "image",
        points: pointsEarned,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await client.from("points").insert({
      user_id: b.userId,
      goal_id: id,
      amount: pointsEarned,
      reason: `完成打卡：${b.title}`,
    });
    return res.json({ checkin, pointsEarned });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 漏打卡惩罚：扣除可获取积分的一半
// 接口：POST /api/v1/goals/:id/penalty
// Body 参数：userId: string, reason?: string
router.post("/:id/penalty", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const { data: goal } = await client.from("goals").select("daily_points").eq("id", id).maybeSingle();
    const half = Math.ceil((goal?.daily_points || 20) / 2);
    await client.from("points").insert({
      user_id: b.userId,
      goal_id: id,
      amount: -half,
      reason: b.reason || "当日漏打卡惩罚",
    });
    return res.json({ deducted: -half });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 打卡留言
// 接口：POST /api/v1/goals/comment
// Body 参数：checkinId: number, userId: string, content: string
router.post("/comment", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.checkinId || !b.userId || !b.content) return res.status(400).json({ error: "缺少参数" });
    const { data, error } = await client.from("comments").insert({ checkin_id: b.checkinId, user_id: b.userId, content: b.content }).select().single();
    if (error) throw new Error(error.message);
    return res.json({ comment: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 我的某目标的打卡记录（供首页/详情跳转）
// 接口：GET /api/v1/goals/:id/checkins?userId=xx
router.get("/:id/checkins", async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.query.userId as string;
    const { data, error } = await client
      .from("checkins")
      .select("*")
      .eq("goal_id", id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return res.json({ checkins: data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ===== 短期目标结算 =====
function periodDays(period: string): string[] {
  if (period === "month") {
    const t = localToday();
    const first = `${t.slice(0, 7)}-01`;
    const total = Number(t.slice(8, 10));
    return lastNDays(total);
  }
  if (period === "today") return [localToday()];
  return lastNDays(7);
}

async function buildSettlement(goalId: string, period: string, userId?: string) {
  const { data: goal } = await client.from("goals").select("*").eq("id", goalId).maybeSingle();
  if (!goal) throw new Error("目标不存在");
  const { data: planItems } = await client.from("plan_items").select("id").eq("goal_id", goalId);
  const itemCount = (planItems || []).length || 1;
  const days = periodDays(period);
  const ownerId = userId || String(goal.user_id);

  const { data: rows } = await client
    .from("checkins")
    .select("id,title,checkin_date,points")
    .eq("goal_id", goalId)
    .eq("user_id", ownerId)
    .gte("checkin_date", dayRange(days[0]).start)
    .lte("checkin_date", dayRange(days[days.length - 1]).end);

  const list = rows || [];
  const perDay: Record<string, number> = {};
  days.forEach((d) => { perDay[d] = 0; });
  list.forEach((r: any) => {
    const d = localToday(new Date(r.checkin_date));
    if (perDay[d] !== undefined) perDay[d] += 1;
  });

  const expected = itemCount * days.length;
  const actual = list.length;
  const rate = expected ? Math.min(1, actual / expected) : 0;
  const missingDays = days.filter((d) => perDay[d] === 0);
  const dailyPoints = Number(goal.daily_points) || 20;
  const penaltyPerDay = Math.ceil(dailyPoints / 2);

  let verdict: "达成" | "接近" | "未达成";
  if (rate >= 0.8) verdict = "达成";
  else if (rate >= 0.5) verdict = "接近";
  else verdict = "未达成";

  const rewards: string[] = Array.isArray(goal.rewards) ? goal.rewards : [];
  const punishments: string[] = Array.isArray(goal.punishments) ? goal.punishments : [];

  return {
    goal: { id: goal.id, title: goal.title, dailyPoints },
    period,
    days,
    range: `${days[0]} ~ ${days[days.length - 1]}`,
    expected,
    actual,
    rate: Math.round(rate * 100),
    missingDays,
    missingCount: missingDays.length,
    perDay,
    earnedPoints: list.reduce((s: number, r: any) => s + Number(r.points || 0), 0),
    verdict,
    suggestReward: verdict === "达成" ? rewards[0] || "给自己一个不超预算的小奖励" : null,
    suggestPunishment: verdict === "达成" ? null : punishments[0] || `补上漏掉的 ${missingDays.length} 天，并做一次复盘`,
    bonusPoints: verdict === "达成" ? Math.round(dailyPoints * 0.5) : 0,
    penaltyPoints: verdict === "达成" ? 0 : -Math.min(60, missingDays.length * penaltyPerDay),
  };
}

// 结算预览（不写入任何数据）
// 接口：GET /api/v1/goals/:id/settlement?period=week|month|today&userId=
router.get("/:id/settlement", async (req, res) => {
  try {
    const period = String(req.query.period || "week");
    const data = await buildSettlement(req.params.id, period, req.query.userId as string | undefined);
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 执行结算（写入积分流水；同一周期重复调用不会重复计分）
// 接口：POST /api/v1/goals/:id/settlement
// Body 参数：userId?: string, period: 'week'|'month'|'today'
router.post("/:id/settlement", async (req, res) => {
  try {
    const goalId = req.params.id;
    const { userId, period = "week" } = req.body || {};
    const s = await buildSettlement(goalId, String(period), userId ? String(userId) : undefined);
    const { data: goal } = await client.from("goals").select("user_id").eq("id", goalId).maybeSingle();
    const uid = userId ? String(userId) : String(goal?.user_id || "");
    if (!uid) return res.status(400).json({ error: "缺少 userId" });

    const reasonTag = `周期结算 ${s.range}`;
    const { data: existed } = await client.from("points").select("id").eq("user_id", uid).eq("goal_id", Number(goalId)).like("reason", `%${reasonTag}%`).limit(1);
    if (existed && existed.length) {
      return res.json({ already: true, settlement: s, message: "这个周期已经结算过了，不会重复计分" });
    }

    const amount = s.verdict === "达成" ? s.bonusPoints : s.penaltyPoints;
    if (amount !== 0) {
      await client.from("points").insert({
        user_id: uid,
        goal_id: Number(goalId),
        amount,
        reason: `${reasonTag} · ${s.verdict}${amount > 0 ? "奖励" : "补扣"}`,
      });
    }
    return res.json({ already: false, settlement: s, points: amount });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;