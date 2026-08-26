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

// 某天所在「下個月」的完整日期清單
export function getNextMonthDates(todayDateStr: string): string[] {
  const [y, m] = todayDateStr.split("-").map(Number);
  const nextMonthDate = new Date(y, m, 1); // m 是目前月份(1-indexed)，剛好對應下個月的 0-indexed month
  const year = nextMonthDate.getFullYear();
  const monthIndex0 = nextMonthDate.getMonth();
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => toDateStr(new Date(year, monthIndex0, i + 1)));
}

export type SubmissionWindow = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  targetMonthDates: string[];
};

// PT 自助填寫下個月可上班日期：每個月 1~20 號開放修正，20 號一過就鎖住，
// 留 21 號到月底這段時間給排班人員拿確定的資料去準備下個月的班表
export function getSubmissionWindow(todayDateStr: string): SubmissionWindow {
  const [y, m, d] = todayDateStr.split("-").map(Number);

  if (d <= 20) {
    return {
      open: true,
      opensAt: toDateStr(new Date(y, m - 1, 1)),
      closesAt: toDateStr(new Date(y, m - 1, 20)),
      targetMonthDates: getNextMonthDates(todayDateStr),
    };
  }

  // 超過 20 號，鎖到下個月 1 號才重新開放（屆時開放的是再下一個月的班表）
  const nextMonthFirstDay = toDateStr(new Date(y, m, 1));
  return {
    open: false,
    opensAt: nextMonthFirstDay,
    closesAt: toDateStr(new Date(y, m, 20)),
    targetMonthDates: getNextMonthDates(nextMonthFirstDay),
  };
}
