/**
 * 统一使用东八区（Asia/Shanghai）计算"今天"。
 *
 * 原实现用 new Date().toISOString().slice(0,10)，取的是 UTC 日期。
 * 对北京时间的用户来说，凌晨 0:00–8:00 打卡会被算成"昨天"，
 * 表现为「明明打卡了，今天却显示没完成」。这里统一修正。
 */
const TZ_OFFSET = "+08:00";
const TZ_SHIFT_MS = 8 * 3600_000;

/** 返回东八区的 YYYY-MM-DD */
export function localToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_SHIFT_MS).toISOString().slice(0, 10);
}

/**
 * 返回当天的时间区间，带时区偏移，用于和 timestamptz 字段比较。
 * start: 2026-11-17T00:00:00+08:00
 * end:   2026-11-17T23:59:59.999+08:00
 */
export function todayRange(now: Date = new Date()): { start: string; end: string } {
  const d = localToday(now);
  return { start: `${d}T00:00:00${TZ_OFFSET}`, end: `${d}T23:59:59.999${TZ_OFFSET}` };
}

/** 指定某一天的区间（date 为 YYYY-MM-DD，按东八区理解） */
export function dayRange(date: string): { start: string; end: string } {
  return { start: `${date}T00:00:00${TZ_OFFSET}`, end: `${date}T23:59:59.999${TZ_OFFSET}` };
}

/** 相对今天偏移 n 天的日期（n 为负表示过去） */
export function dateOffset(days: number, now: Date = new Date()): string {
  return localToday(new Date(now.getTime() + days * 86_400_000));
}

/** 最近 n 天（含今天）的日期数组，从早到晚 */
export function lastNDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(dateOffset(-i, now));
  return out;
}
