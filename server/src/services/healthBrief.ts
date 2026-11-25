/**
 * 身体状况简报（Health Brief）
 *
 * 解决的问题：在此之前，对话上下文只有一张 profile 快照 + 今日计划 + 今日打卡数。
 * 用户库里的历史体检记录、体重血压变化、过去 30 天的打卡完成率、连续天数
 * 全都没有进入模型 —— 数据采了在库里睡觉。
 *
 * 本文件把这些汇总成一段结构化文本，注入对话与计划生成，让「基于身体状况」
 * 变成真的基于数据，而不是基于今天这一次快照。
 */

import { getSupabaseClient } from "../storage/database/supabase-client";
import { lastNDays, dayRange, localToday } from "../utils/date";
import {
  assessAll, concernsOf, readingsToText, type MetricReading, type ProfileLike,
} from "../data/clinical";
import { conditionsToText } from "../data/conditions";
import { computeTarget, targetToText, type NutritionTarget, type GoalKind } from "../data/nutrition";

const client = getSupabaseClient();

export interface BehaviorStats {
  /** 最近 30 天有打卡的天数 */
  activeDays: number;
  /** 最近 30 天总打卡次数 */
  totalCheckins: number;
  /** 截至今天的连续打卡天数 */
  streak: number;
  /** 最近 7 天打卡次数 */
  last7: number;
  /** 最近 7 天里没打卡的天数 */
  miss7: number;
  /** 最近 30 天每天的次数（从旧到新） */
  daily: { date: string; count: number }[];
  /** 打卡最多的类别标题关键词（如"饮食"） */
  topCategory?: string;
}

export interface BodyTrend {
  /** 体重变化：最早 → 最新 */
  weight?: { from: number; to: number; delta: number; days: number };
  /** 收缩压变化 */
  systolic?: { from: number; to: number; delta: number; days: number };
  /** 空腹血糖变化 */
  glucose?: { from: number; to: number; delta: number; days: number };
  /** 记录条数 */
  recordCount: number;
}

export interface HealthBrief {
  /** 完整文本，直接拼进 system 消息 */
  text: string;
  profile: ProfileLike;
  readings: MetricReading[];
  concerns: MetricReading[];
  targets: NutritionTarget | null;
  stats: BehaviorStats;
  trend: BodyTrend;
  /** 病程/约束原文，供其他模块复用 */
  conditionText: string;
}

/** timestamp → 东八区日期字符串 yyyy-MM-dd */
function localDate(ts: any): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 读身体记录并算趋势。只比较同名字段的最早与最新值。 */
async function loadTrend(userId: string): Promise<BodyTrend> {
  const { data } = await client
    .from("health_records")
    .select("recorded_at,weight,blood_pressure_systolic,blood_sugar")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .limit(30);

  const rows = (data || []).filter((r: any) => r.recorded_at);
  const trend: BodyTrend = { recordCount: rows.length };
  if (rows.length < 2) return trend;

  const newest = rows[0];
  const oldest = rows[rows.length - 1];
  const spanDays = Math.max(
    1,
    Math.round((new Date(newest.recorded_at).getTime() - new Date(oldest.recorded_at).getTime()) / 86400000)
  );

  const pair = (key: "weight" | "blood_pressure_systolic" | "blood_sugar") => {
    const a = Number(oldest[key]);
    const b = Number(newest[key]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return undefined;
    return { from: a, to: b, delta: Number((b - a).toFixed(1)), days: spanDays };
  };

  const w = pair("weight");
  if (w) trend.weight = w;
  const s = pair("blood_pressure_systolic");
  if (s) trend.systolic = s;
  const g = pair("blood_sugar");
  if (g) trend.glucose = g;
  return trend;
}

/** 读最近 30 天打卡，算完成率、连续天数 */
async function loadStats(userId: string): Promise<BehaviorStats> {
  const days = lastNDays(30);
  const from = dayRange(days[0]).start;
  const to = dayRange(days[days.length - 1]).end;

  const { data } = await client
    .from("checkins")
    .select("checkin_date,title")
    .eq("user_id", userId)
    .gte("checkin_date", from)
    .lte("checkin_date", to);

  const rows = data || [];
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const d = localDate(r.checkin_date);
    if (!d) continue;
    byDate.set(d, (byDate.get(d) || 0) + 1);
  }

  const daily = days.map((d) => ({ date: d, count: byDate.get(d) || 0 }));
  const activeDays = daily.filter((d) => d.count > 0).length;

  // 连续天数：从今天往前数，遇到空白日就停
  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].count > 0) streak += 1;
    else break;
  }

  const last7Arr = daily.slice(-7);
  const last7 = last7Arr.reduce((a, b) => a + b.count, 0);
  const miss7 = last7Arr.filter((d) => d.count === 0).length;

  // 最常打卡的类别：按标题里的中文关键词粗分类
  const bucket: Record<string, number> = {};
  for (const r of rows) {
    const t = String(r.title || "");
    const k = /早|午|晚|餐|饭|菜|粥|果|奶|食/.test(t) ? "饮食"
      : /走|跑|骑|练|操|拉伸|瑜伽|运动|分钟/.test(t) ? "运动"
      : /学|读|课|背|练题|复习/.test(t) ? "学习"
      : "其他";
    bucket[k] = (bucket[k] || 0) + 1;
  }
  const topCategory = Object.entries(bucket).sort((a, b) => b[1] - a[1])[0]?.[0];

  return { activeDays, totalCheckins: rows.length, streak, last7, miss7, daily, topCategory };
}

/** 主入口：一次性汇总，供对话与计划生成共用 */
export async function buildHealthBrief(userId: string): Promise<HealthBrief> {
  const { data: profileRow } = await client
    .from("health_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const profile: ProfileLike = (profileRow || {}) as ProfileLike;

  const readings = assessAll(profile);
  const concerns = concernsOf(readings);

  const goalKind: GoalKind =
    (profile as any).goal_kind === "muscle_gain" ? "muscle_gain"
      : (profile as any).goal_kind === "maintain" ? "maintain"
        : "weight_loss";
  const targets = computeTarget(profile, goalKind);

  const [stats, trend] = await Promise.all([loadStats(userId), loadTrend(userId)]);

  const histories: string[] = Array.isArray(profile.medical_history) ? profile.medical_history : [];
  const prefs: string[] = Array.isArray(profile.diet_prefs) ? profile.diet_prefs : [];
  const conditionText = conditionsToText(histories);

  const blocks: string[] = [];

  // ---- 1. 身体基本事实 ----
  const basics: string[] = [];
  if (profile.height) basics.push(`身高 ${profile.height} cm`);
  if (profile.weight) basics.push(`体重 ${profile.weight} kg`);
  if (profile.age) basics.push(`年龄 ${profile.age} 岁`);
  if (profile.gender) basics.push(`性别 ${profile.gender}`);
  if (profile.waist) basics.push(`腰围 ${profile.waist} cm`);
  if (profile.body_fat) basics.push(`体脂率 ${profile.body_fat}%`);
  if (basics.length) blocks.push(`【身体档案】${basics.join("｜")}`);
  if (prefs.length) blocks.push(`【饮食偏好】${prefs.join("、")}（推荐时必须避开不吃的，不要推荐后又说"可以不吃"）`);

  // ---- 2. 指标判读 ----
  const readText = readingsToText(readings);
  if (readText) blocks.push(readText);

  // ---- 3. 病史约束 ----
  if (conditionText) blocks.push(conditionText);

  // ---- 4. 营养目标 ----
  const targetText = targetToText(targets, goalKind);
  if (targetText) blocks.push(targetText);

  // ---- 5. 身体变化趋势 ----
  const trendLines: string[] = [];
  if (trend.weight) {
    const d = trend.weight.delta;
    const dir = d < 0 ? "下降" : d > 0 ? "上升" : "持平";
    trendLines.push(`体重 ${trend.weight.from} → ${trend.weight.to} kg（${trend.days} 天内${dir} ${Math.abs(d)} kg）`);
  }
  if (trend.systolic) {
    const d = trend.systolic.delta;
    trendLines.push(`收缩压 ${trend.systolic.from} → ${trend.systolic.to} mmHg（${d < 0 ? "下降" : d > 0 ? "上升" : "持平"} ${Math.abs(d)}）`);
  }
  if (trend.glucose) {
    const d = trend.glucose.delta;
    trendLines.push(`空腹血糖 ${trend.glucose.from} → ${trend.glucose.to} mmol/L（${d < 0 ? "下降" : d > 0 ? "上升" : "持平"} ${Math.abs(d)}）`);
  }
  if (trendLines.length) {
    blocks.push(`【身体指标变化（共 ${trend.recordCount} 条记录）】\n${trendLines.map((x) => `- ${x}`).join("\n")}`);
  }

  // ---- 6. 打卡行为 ----
  if (stats.totalCheckins > 0) {
    const rate = Math.round((stats.activeDays / 30) * 100);
    const lines = [
      `最近 30 天有 ${stats.activeDays} 天打卡（出勤率 ${rate}%），共 ${stats.totalCheckins} 次`,
      `最近 7 天打卡 ${stats.last7} 次${stats.miss7 ? `，有 ${stats.miss7} 天完全没打` : "，每天都在坚持"}`,
      `当前连续打卡 ${stats.streak} 天`,
    ];
    if (stats.topCategory) lines.push(`主要在坚持${stats.topCategory}`);
    blocks.push(`【近期坚持情况】\n${lines.map((x) => `- ${x}`).join("\n")}`);
  } else {
    blocks.push(`【近期坚持情况】\n- 最近 30 天还没有任何打卡记录，属于刚起步阶段`);
  }

  // ---- 7. 重点关注 ----
  if (concerns.length) {
    blocks.push(
      `【需要留意的指标】${concerns.map((c) => `${c.label}（${c.levelText}）`).join("、")}\n涉及这些指标时，回答要落到具体可执行的建议上，并提醒必要时就医确认。`
    );
  }

  return {
    text: blocks.join("\n\n"),
    profile,
    readings,
    concerns,
    targets,
    stats,
    trend,
    conditionText,
  };
}

/** 供轻量场景（如计划生成）只需要文本时使用 */
export async function healthBriefText(userId: string): Promise<string> {
  try {
    const brief = await buildHealthBrief(userId);
    return brief.text;
  } catch {
    return "";
  }
}

/** 导出给路由层复用的今日进度描述 */
export async function todayProgressText(userId: string): Promise<string> {
  const { start, end } = dayRange(localToday());
  const { data: goals } = await client.from("goals").select("id,title").eq("user_id", userId).eq("status", "active");
  const goalIds = (goals || []).map((g: any) => g.id);
  if (!goalIds.length) return "";
  const { data: items } = await client
    .from("plan_items").select("title,planned_time").in("goal_id", goalIds).order("planned_time", { ascending: true });
  const { data: cks } = await client
    .from("checkins").select("title").eq("user_id", userId).gte("checkin_date", start).lte("checkin_date", end);
  const plan = (items || []).filter((i: any) => i.planned_time);
  if (!plan.length) return "";
  const done = new Set((cks || []).map((c: any) => String(c.title)));
  const lines = plan.map((i: any) => {
    const hit = done.has(String(i.title));
    return `- ${i.planned_time} ${i.title}${hit ? " ✅已完成" : ""}`;
  });
  return `【今日计划（共 ${plan.length} 项，已完成 ${(cks || []).length}）】\n${lines.join("\n")}`;
}
