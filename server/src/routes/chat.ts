import { Router } from "express";
import { getSupabaseClient } from "../storage/database/supabase-client";
import { chatReply, type HealthContext } from "../services/ai";
import { LLMClient, Config, HeaderUtils, type Message } from "coze-coding-dev-sdk";

const router = Router();
const client = getSupabaseClient();

async function buildContext(userId: string): Promise<HealthContext> {
  const { data: profile } = await client.from("health_profiles").select("*").eq("user_id", userId).maybeSingle();
  const { data: goals } = await client.from("goals").select("title,status").eq("user_id", userId).eq("status", "active");
  const p: any = profile || {};
  const bp = p.blood_pressure_systolic && p.blood_pressure_diastolic ? `${p.blood_pressure_systolic}/${p.blood_pressure_diastolic}` : "";
  return {
    nickname: "主人",
    height: p.height || undefined,
    weight: p.weight || undefined,
    age: p.age ? String(p.age) : undefined,
    gender: p.gender || undefined,
    bloodPressure: bp || undefined,
    bloodSugar: p.blood_sugar || undefined,
    bloodLipid: [p.total_cholesterol, p.triglycerides].filter(Boolean).join("/") || undefined,
    heartRate: p.heart_rate || undefined,
    medicalHistory: p.medical_history || [],
    goals: (goals || []).map((g: any) => g.title),
  };
}

function greetingForNow(): { content: string; type: string } {
  const h = new Date().getHours();
  let msg = "";
  if (h < 6) msg = "夜深了主人，记得早点休息，明早我们继续加油哦 🌙";
  else if (h < 9) msg = "早安主人 ☀️ 新的一天开始啦，记得吃早餐、喝杯温水，今天也要元气满满哦！";
  else if (h < 12) msg = "上午好呀主人～记得起身活动活动，累了就歇一会儿，暖暖一直在陪伴你 💚";
  else if (h < 14) msg = "中午好主人 🥗 记得规律进餐、别久坐，饭后散散步更健康哦～";
  else if (h < 18) msg = "下午好主人 ☕ 今天的目标完成得怎么样啦？有需要随时叫我哦～";
  else msg = "晚上好主人 🌙 辛苦一天啦，别忘了完成今日小目标的温馨打卡，暖暖为你加油！";
  return { content: msg, type: "greeting" };
}

// 首次/每日开启的温馨提示语
// 接口：POST /api/v1/chat/:userId/greeting
router.post("/:userId/greeting", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { content, type } = greetingForNow();
    const { data } = await client.from("chat_messages").insert({ user_id: userId, role: "assistant", content, message_type: type }).select().single();
    return res.json({ message: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 今日待办/按时提醒（基于活跃目标的计划项）
// 接口：GET /api/v1/chat/:userId/today-reminders
router.get("/:userId/today-reminders", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data: goals } = await client.from("goals").select("id,title").eq("user_id", userId).eq("status", "active");
    const today = new Date().toISOString().slice(0, 10);
    let reminders: any[] = [];
    for (const g of goals || []) {
      const { data: items } = await client.from("plan_items").select("*").eq("goal_id", g.id).order("planned_time");
      const ids = (items || []).map((p: any) => p.id);
      const { data: done } = ids.length
        ? await client
            .from("checkins")
            .select("plan_item_id")
            .eq("goal_id", g.id)
            .gte("checkin_date", `${today}T00:00:00`)
            .lte("checkin_date", `${today}T23:59:59`)
        : { data: [] };
      const doneSet = new Set((done || []).map((c: any) => c.plan_item_id));
      for (const it of items || []) {
        reminders.push({
          goalId: g.id,
          goalTitle: g.title,
          id: it.id,
          title: it.title,
          category: it.category,
          time: it.planned_time || "全天",
          done: doneSet.has(it.id),
        });
      }
    }
    // 按时序排序
    reminders.sort((a, b) => (a.time === "全天" ? 1 : a.time.localeCompare(b.time)));
    return res.json({ reminders });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 消息列表
// 接口：GET /api/v1/chat/:userId/messages
router.get("/:userId/messages", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data, error } = await client.from("chat_messages").select("*").eq("user_id", userId).order("created_at", { ascending: true }).limit(100);
    if (error) throw new Error(error.message);
    return res.json({ messages: data || [] });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 保存一条消息
// 接口：POST /api/v1/chat/:userId/messages
// Body 参数：role: 'user'|'assistant', content: string, messageType?: string
router.post("/:userId/messages", async (req, res) => {
  try {
    const userId = req.params.userId;
    const b = req.body || {};
    const { data, error } = await client
      .from("chat_messages")
      .insert({ user_id: userId, role: b.role || "user", content: b.content, message_type: b.messageType || "text" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ message: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// AI 对话（SSE 流式）
// 接口：POST /api/v1/chat/:userId/ai
// Body 参数：content: string, history?: {role:string;content:string}[]
router.post("/:userId/ai", async (req, res) => {
  try {
    const userId = req.params.userId;
    const b = req.body || {};
    const userContent = String(b.content || "");
    // 保存用户消息
    await client.from("chat_messages").insert({ user_id: userId, role: "user", content: userContent }).select().single();
    // 取最近历史做上下文
    const { data: msgs } = await client
      .from("chat_messages")
      .select("role,content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(30);
    const history = (msgs || []).map((m: any) => ({ role: m.role, content: m.content }));
    const ctx = await buildContext(userId);

    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as unknown as Record<string, string>);
    const llm = new LLMClient(config, customHeaders);
    const system = `你是"暖暖"，健康陪伴类应用"暖暖·陪跑"的暖心AI助手。请以亲近温馨的口吻称呼用户为"主人"。角色定位是"健康生活方式管理"，不做疾病诊断、不提供药物剂量。回答简洁友好温暖。饮食/运动相关建议附来源与免责提示。`;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const messages: Message[] = [
      { role: "system", content: system },
      { role: "system", content: ctxTextHelper(ctx) },
    ];
    history.slice(-12).forEach((m) => messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
    if (!messages.some((m) => m.role === "user")) messages.push({ role: "user", content: "你好" });

    let full = "";
    const stream = llm.stream(messages, { model: "doubao-seed-2-0-pro-260215", temperature: 0.8 });
    for await (const chunk of stream) {
      const t = chunk.content?.toString?.() || "";
      if (t) {
        full += t;
        res.write(`data: ${JSON.stringify({ content: t })}\n\n`);
      }
    }
    // 保存 AI 回复
    await client.from("chat_messages").insert({ user_id: userId, role: "assistant", content: full, message_type: "ai" }).select().single();
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (e: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

function ctxTextHelper(ctx: HealthContext): string {
  const parts: string[] = [];
  if (ctx.height) parts.push(`身高${ctx.height}`);
  if (ctx.weight) parts.push(`体重${ctx.weight}`);
  if (ctx.age) parts.push(`年龄${ctx.age}`);
  if (ctx.bloodPressure) parts.push(`血压${ctx.bloodPressure}`);
  if (ctx.bloodSugar) parts.push(`空腹血糖${ctx.bloodSugar}`);
  if (ctx.bloodLipid) parts.push(`血脂${ctx.bloodLipid}`);
  if (ctx.medicalHistory?.length) parts.push(`过往病史：${ctx.medicalHistory.join("、")}`);
  if (ctx.goals?.length) parts.push(`当前目标：${ctx.goals.join("、")}`);
  return parts.length ? `【用户身体状况与目标】\n${parts.map((p) => `- ${p}`).join("\n")}\n` : "";
}

export default router;