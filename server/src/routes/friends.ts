import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { fileUrl } from "../services/storage";
import { todayRange } from "../utils/date";

const router = Router();
const client = getSupabaseClient();

// 我的好友列表
// 接口：GET /api/v1/friends/:userId
router.get("/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data: fs } = await client.from("friendships").select("*").eq("user_id", userId).eq("status", "active");
    const friendIds = (fs || []).map((f: any) => f.friend_user_id);
    const { data: friends } = friendIds.length
      ? await client.from("users").select("id,nickname,invite_code,avatar_text").in("id", friendIds)
      : { data: [] };
    // 每个好友的共同监督目标数
    const result = await Promise.all(
      (friends || []).map(async (f: any) => {
        const { data: gm } = await client.from("goal_members").select("goal_id").eq("user_id", f.id).eq("role", "supervisor");
        const goalIds = [...new Set((gm || []).map((g: any) => g.goal_id))];
        const { data: goals } = goalIds.length ? await client.from("goals").select("id,title").in("id", goalIds) : { data: [] };
        return { ...f, goals: goals || [] };
      })
    );
    return res.json({ friends: result });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 按邀请标识查找用户
// 接口：POST /api/v1/friends/find
// Body 参数：inviteCode: string
router.post("/find", async (req, res) => {
  try {
    const code = (req.body?.inviteCode || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "请输入邀请标识" });
    const { data } = await client.from("users").select("id,nickname,invite_code,avatar_text").eq("invite_code", code).maybeSingle();
    if (!data) return res.status(404).json({ error: "未找到该邀请标识对应的朋友" });
    return res.json({ friend: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 通过邀请标识添加好友（双向）
// 接口：POST /api/v1/friends/add
// Body 参数：userId: string, inviteCode: string
router.post("/add", async (req, res) => {
  try {
    const { userId, inviteCode } = req.body || {};
    if (!userId || !inviteCode) return res.status(400).json({ error: "缺少参数" });
    const { data: friend } = await client.from("users").select("id").eq("invite_code", String(inviteCode).toUpperCase()).maybeSingle();
    if (!friend) return res.status(404).json({ error: "未找到该邀请标识对应用户" });
    if (String(friend.id) === String(userId)) return res.status(400).json({ error: "不能添加自己为好友" });
    // 双向 friendship
    await client.from("friendships").upsert(
      { user_id: userId, friend_user_id: String(friend.id), status: "active" },
      { onConflict: "user_id,friend_user_id" }
    );
    await client.from("friendships").upsert(
      { user_id: String(friend.id), friend_user_id: userId, status: "active" },
      { onConflict: "user_id,friend_user_id" }
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 加入某目标的监督团 / 或加入共同监督
// 接口：POST /api/v1/friends/:userId/goal-members
// Body 参数：goalId: number
router.post("/:userId/goal-members", async (req, res) => {
  try {
    const userId = req.params.userId;
    const goalId = Number(req.body?.goalId);
    if (!goalId) return res.status(400).json({ error: "缺少 goalId" });
    const { data, error } = await client
      .from("goal_members")
      .insert({ goal_id: goalId, user_id: userId, role: "supervisor" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ member: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 共同目标监督视图（好友与主人的打卡对比 + 留言）
// 接口：GET /api/v1/friends/:userId/goals/:goalId/supervision
router.get("/:userId/goals/:goalId/supervision", async (req, res) => {
  try {
    const { userId, goalId } = req.params;
    const { data: goal } = await client.from("goals").select("*").eq("id", goalId).maybeSingle();
    const { data: members } = await client.from("goal_members").select("user_id").eq("goal_id", goalId);
    const memberIds = [...new Set([...(members || []).map((m: any) => m.user_id), userId])];
    const { data: memberUsers } = await client.from("users").select("id,nickname,avatar_text,invite_code").in("id", memberIds);
    const { start: dayStart, end: dayEnd } = todayRange();
    const details = await Promise.all(
      (memberUsers || []).map(async (u: any) => {
        const { data: mine } = await client
          .from("checkins")
          .select("*")
          .eq("goal_id", goalId)
          .eq("user_id", u.id)
          .gte("checkin_date", dayStart)
          .lte("checkin_date", dayEnd);
        const { data: week } = await client
          .from("checkins")
          .select("id")
          .eq("goal_id", goalId)
          .eq("user_id", u.id)
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
        return { user: u, todayCount: (mine || []).length, weekCount: (week || []).length };
      })
    );
    return res.json({ goal, members: details });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;