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
