import { getSupabaseClient } from "../storage/database/supabase-client";
import { todayRange } from "../utils/date";

const client = getSupabaseClient();

/** 从打卡标题里读「约 xxx kcal」 */
export function kcalFromTitle(title: string): number {
  const m = String(title || "").match(/(\d{2,4})\s*kcal/);
  return m ? Number(m[1]) : 0;
}

/**
 * 今日饮食摄入（全站唯一口径）
 *
 * 为什么需要统一：饮食热量有两个来源，各自成体系时必然对不上——
 * 1) 饮食打卡：推荐菜「我吃了这道」、手动记录、拍照记录确认后写入，标题里带 kcal
 * 2) 聊天里拍的餐食分析：存在 chat_messages(message_type='meal')
 *
 * 一条餐食如果既被分析又已确认记成一餐，两个地方都有它。
 * 因此确认写入时会给那条分析打上 checkinId 标记，这里跳过带标记的，
 * 避免同一条被算两遍。反过来，只在聊天里发图没确认的，仍然计入。
 */
export async function todayIntakeKcal(userId: string, excludeMessageId?: number): Promise<number> {
  const { start, end } = todayRange();
  let total = 0;

  try {
    const { data: goals } = await client
      .from("goals")
      .select("id")
      .eq("user_id", userId)
      .eq("category", "diet");
    const ids = (goals || []).map((g: any) => Number(g.id));
    if (ids.length) {
      const { data } = await client
        .from("checkins")
        .select("title")
        .in("goal_id", ids)
        .eq("user_id", userId)
        .gte("checkin_date", start)
        .lte("checkin_date", end);
      for (const r of data || []) total += kcalFromTitle((r as any).title);
    }
  } catch {
    // 读不到打卡不影响后面继续累加分析结果
  }

  try {
    const { data } = await client
      .from("chat_messages")
      .select("id,content")
      .eq("user_id", userId)
      .eq("message_type", "meal")
      .gte("created_at", start)
      .lte("created_at", end);
    for (const row of data || []) {
      if (excludeMessageId && Number((row as any).id) === excludeMessageId) continue;
      try {
        const obj = JSON.parse(String((row as any).content || "{}"));
        // 已折成打卡，不再重复计
        if (obj?.checkinId) continue;
        total += Number(obj?.totals?.kcal || 0);
      } catch {
        // 历史脏数据跳过
      }
    }
  } catch {
    // 同上
  }

  return Math.round(total);
}
