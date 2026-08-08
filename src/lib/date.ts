// 日期都用 YYYY-MM-DD 字串處理，避免時區換算造成誤差

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return toDateStr(date);
}

// 取得某日期所在那週的星期一
export function getMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.getDay(); // 0=Sun ... 6=Sat
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(dateStr, offset);
}

// 沒有指定週次時，預設要顯示哪一週：平日顯示這一週；週六日通常已經在準備下週，
// 直接預設跳到下一週，避免每次都要手動點「下一週」
export function getDefaultWeekMonday(): string {
  const today = new Date();
  const monday = getMonday(toDateStr(today));
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  return isWeekend ? addDays(monday, 7) : monday;
}

export function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}

export const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
