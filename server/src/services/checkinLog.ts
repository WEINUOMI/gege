import { getSupabaseClient } from "../storage/database/supabase-client";
import { localToday } from "../utils/date";

const client = getSupabaseClient();

export type AnchorCategory = "diet" | "exercise" | "study";

export const ANCHOR_META: Record<AnchorCategory, { title: string; itemTitle: string; points: number }> = {
  diet: { title: "饮食记录", itemTitle: "今日饮食记录", points: 8 },
  exercise: { title: "运动记录", itemTitle: "今日运动", points: 10 },
  study: { title: "学习记录", itemTitle: "今日学习", points: 10 },
};

/**
 * 找到（或创建）某个类别的记账型目标。
 *
 * 为什么需要它：打卡凭证必须挂在某个目标下（checkins.goal_id 非空），
 * 而饮食/运动/学习记录是"随手记"，不该强迫用户先建目标。
 * 因此这里自动维护一个固定锚点目标，用户不必感知它的存在。
 */
export async function ensureAnchor(
  userId: string,
  category: AnchorCategory,
): Promise<{ goalId: number; planItemId: number | null }> {
  const meta = ANCHOR_META[category];
  const { data: existing } = await client
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("category", category)
    .eq("status", "active")
    .order("id")
    .limit(1);
  if (existing && existing.length) {
    const goalId = Number(existing[0].id);
    const { data: items } = await client
      .from("plan_items")
      .select("id")
      .eq("goal_id", goalId)
      .order("id")
      .limit(1);
    return { goalId, planItemId: items && items.length ? Number(items[0].id) : null };
  }
  const { data: created, error } = await client
    .from("goals")
    .insert({
      user_id: userId,
      title: meta.title,
      category,
      target_value: "自动创建，用于日常记录",
      start_date: localToday(),
      daily_points: meta.points,
      from_system: true,
      status: "active",
    })
    .select()
    .single();
  if (error || !created) throw new Error(error?.message || "创建记录目标失败");
  const goalId = Number(created.id);
  const { data: item } = await client
    .from("plan_items")
    .insert({
      goal_id: goalId,
      title: meta.itemTitle,
      category: category === "diet" ? "diet" : category === "exercise" ? "exercise" : "study",
      planned_time: "21:00",
      points: meta.points,
    })
    .select()
    .single();
  return { goalId, planItemId: item ? Number(item.id) : null };
}

export async function addPoints(userId: string, goalId: number, amount: number, reason: string) {
  await client.from("points").insert({ user_id: userId, goal_id: goalId, amount, reason });
}

/**
 * 写一条饮食打卡。
 *
 * 与 records.ts 的 /diet 是同一张表、同一套标题规则，
 * 区别只在于调用方已经把营养素算好了（拍照识别的结果），
 * 所以这里额外接收 note 存进标题尾巴。
 */
export async function logDietCheckin(params: {
  userId: string;
  name: string;
  calories: number;
  meal?: string;
  photoKey?: string;
  note?: string;
}): Promise<{ checkin: any; goalId: number; pointsEarned: number }> {
  const { userId, name, calories, meal, photoKey, note } = params;
  const { goalId, planItemId } = await ensureAnchor(userId, "diet");
  const kcal = Math.max(0, Math.round(Number(calories) || 0));
  const title = `${meal ? `${meal} · ` : ""}${String(name).slice(0, 40)}${kcal ? `（约 ${kcal} kcal）` : ""}${
    note ? `｜${String(note).slice(0, 30)}` : ""
  }`.slice(0, 120);

  const { data: checkin, error } = await client
    .from("checkins")
    .insert({
      goal_id: goalId,
      plan_item_id: planItemId,
      user_id: userId,
      title,
      proof_key: photoKey || null,
      proof_type: photoKey ? "image" : "text",
      points: ANCHOR_META.diet.points,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await addPoints(userId, goalId, ANCHOR_META.diet.points, `饮食记录：${name}`);
  return { checkin, goalId, pointsEarned: ANCHOR_META.diet.points };
}
