import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";

const router = Router();
const client = getSupabaseClient();

function genInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `NKN-${s}`;
}

// 生成唯一的邀请标识（冲突时重试）
async function uniqueInviteCode(client: any): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = genInviteCode();
    const { data } = await client.from("users").select("id").eq("invite_code", code).maybeSingle();
    if (!data) return code;
  }
  // 极端情况兜底：加时间戳尾号
  return `NKN-TOK${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

// 引导：按 deviceId 获取或创建"主人"用户
// 服务端文件：server/src/routes/users.ts
// 接口：POST /api/v1/users/me/bootstrap
// Body 参数：deviceId: string, nickname?: string
router.post("/me/bootstrap", async (req, res) => {
  try {
    const { deviceId, nickname } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: "缺少 deviceId" });
    let { data } = await client.from("users").select("*").eq("device_id", deviceId).maybeSingle();
    if (!data) {
      const { data: created } = await client
        .from("users")
        .insert({ device_id: deviceId, nickname: nickname || "主人", invite_code: await uniqueInviteCode(client), avatar_text: "初" })
        .select()
        .single();
      data = created;
    }
    const { data: profile } = await client.from("health_profiles").select("*").eq("user_id", String(data.id)).maybeSingle();
    return res.json({ user: data, hasProfile: !!profile, profile: profile || null });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取主人用户 + 档案概览
// 接口：GET /api/v1/users/me/:userId
router.get("/me/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data: user } = await client.from("users").select("*").eq("id", userId).maybeSingle();
    const { data: profile } = await client.from("health_profiles").select("*").eq("user_id", userId).maybeSingle();
    // 我的监督团好友
    const { data: friends } = await client.from("friendships").select("*").eq("user_id", userId).eq("status", "active");
    const friendIds = (friends || []).map((f: any) => f.friend_user_id);
    const { data: friendUsers } = friendIds.length
      ? await client.from("users").select("id,nickname,invite_code,avatar_text").in("id", friendIds)
      : { data: [] };
    return res.json({ user, profile, friends: friendUsers || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 新增/更新健康档案（首次录入 + 后期修改共用）
// 接口：POST /api/v1/users/:userId/health-profile
// Body 参数：height?: string, weight?: string ... medicalHistory?: string[], dietPrefs?: string[]
router.post("/:userId/health-profile", async (req, res) => {
  try {
    const userId = req.params.userId;
    const b = req.body || {};
    const payload: any = {
      user_id: userId,
      height: b.height ?? null,
      weight: b.weight ?? null,
      age: b.age ?? null,
      gender: b.gender ?? null,
      blood_pressure_systolic: b.bloodPressureSystolic ?? null,
      blood_pressure_diastolic: b.bloodPressureDiastolic ?? null,
      blood_sugar: b.bloodSugar ?? null,
      total_cholesterol: b.totalCholesterol ?? null,
      triglycerides: b.triglycerides ?? null,
      heart_rate: b.heartRate ?? null,
      bmi: b.bmi ?? null,
      body_fat: b.bodyFat ?? null,
      waist: b.waist ?? null,
      medical_history: b.medicalHistory ?? [],
      diet_prefs: b.dietPrefs ?? [],
      updated_at: new Date().toISOString(),
    };
    const { data: exist } = await client.from("health_profiles").select("id").eq("user_id", userId).maybeSingle();
    let result;
    if (exist) {
      const { data } = await client.from("health_profiles").update(payload).eq("user_id", userId).select().single();
      result = data;
    } else {
      const { data } = await client.from("health_profiles").insert(payload).select().single();
      result = data;
    }
    // 同时写一条身体历史记录
    await client.from("health_records").insert({
      user_id: userId,
      blood_pressure_systolic: payload.blood_pressure_systolic,
      blood_pressure_diastolic: payload.blood_pressure_diastolic,
      blood_sugar: payload.blood_sugar,
      total_cholesterol: payload.total_cholesterol,
      triglycerides: payload.triglycerides,
      heart_rate: payload.heart_rate,
      weight: payload.weight,
      bmi: payload.bmi,
      body_fat: payload.body_fat,
      waist: payload.waist,
    });
    return res.json({ profile: result });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 身体历史记录列表
// 接口：GET /api/v1/users/:userId/health-records
router.get("/:userId/health-records", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data, error } = await client
      .from("health_records")
      .select("*")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return res.json({ records: data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 新增身体记录（手动多维度记录）
// 接口：POST /api/v1/users/:userId/health-records
router.post("/:userId/health-records", async (req, res) => {
  try {
    const userId = req.params.userId;
    const b = req.body || {};
    const payload: any = {
      user_id: userId,
      blood_pressure_systolic: b.bloodPressureSystolic ?? null,
      blood_pressure_diastolic: b.bloodPressureDiastolic ?? null,
      blood_sugar: b.bloodSugar ?? null,
      total_cholesterol: b.totalCholesterol ?? null,
      triglycerides: b.triglycerides ?? null,
      heart_rate: b.heartRate ?? null,
      weight: b.weight ?? null,
      bmi: b.bmi ?? null,
      body_fat: b.bodyFat ?? null,
      waist: b.waist ?? null,
    };
    const { data, error } = await client.from("health_records").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return res.json({ record: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 积分总览与明细
// 接口：GET /api/v1/users/:userId/points
router.get("/:userId/points", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data: list, error } = await client
      .from("points")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = list || [];
    const total = rows.reduce((s: number, r: any) => s + r.amount, 0);
    const today = new Date().toDateString();
    const week = rows
      .filter((r: any) => new Date(r.created_at).getTime() > Date.now() - 7 * 86400000)
      .reduce((s: number, r: any) => s + r.amount, 0);
    return res.json({ total, week, today, list: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;