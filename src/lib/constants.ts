export const SLOTS = [
  "上午出訂單前",
  "上午出訂單後",
  "下午出訂單前",
  "下午出訂單後",
  "出貨完成後",
] as const;

export type Slot = (typeof SLOTS)[number];

// 每個時段幾小時（2026-11-26 Cynthia 提供，午休已排除）：8:30-9:00、9:00-12:30、13:30-14:30、14:30-17:30；
// 出貨完成後時間不一定，先估 0.5 小時。週六跟平日同時間
export const SLOT_HOURS: Record<Slot, number> = {
  上午出訂單前: 0.5,
  上午出訂單後: 3.5,
  下午出訂單前: 1,
  下午出訂單後: 3,
  出貨完成後: 0.5,
};

export const AVAILABILITY_RANGES = ["全天", "只上午", "只下午", "全天休假"] as const;

export type AvailabilityRange = (typeof AVAILABILITY_RANGES)[number];

export const ABILITY_LEVELS = [
  { value: 1, label: "一級・完全不會" },
  { value: 2, label: "二級・訓練中" },
  { value: 3, label: "三級・可獨立執行" },
] as const;

export const EMPLOYMENT_TYPES = ["PT", "正職"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// 排班時的提醒門檻：一個人一週上班超過這個天數就顯示警示（不是硬性擋下，排班人員可以自己判斷）
export const MAX_DAYS_PER_WEEK = 4;

export const SPECIAL_DATE_TYPES = ["國定假日", "電商檔期", "出貨優先日", "颱風假／臨時停班"] as const;

export type SpecialDateType = (typeof SPECIAL_DATE_TYPES)[number];

// 這兩種日子整天不排班
export const CLOSED_SPECIAL_DATE_TYPES: readonly SpecialDateType[] = ["國定假日", "颱風假／臨時停班"];

export const WORK_GROUPS = ["出貨組", "進貨組"] as const;

export type WorkGroup = (typeof WORK_GROUPS)[number];

export const GENDERS = ["男", "女"] as const;

export type Gender = (typeof GENDERS)[number];

export const SATURDAY_GROUPS = ["多", "少"] as const;

export type SaturdayGroup = (typeof SATURDAY_GROUPS)[number];
