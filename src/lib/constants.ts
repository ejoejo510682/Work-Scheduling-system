export const SLOTS = [
  "上午出訂單前",
  "上午出訂單後",
  "下午出訂單前",
  "下午出訂單後",
  "出貨完成後",
] as const;

export type Slot = (typeof SLOTS)[number];

export const AVAILABILITY_RANGES = ["全天", "只上午", "只下午", "全天休假"] as const;

export type AvailabilityRange = (typeof AVAILABILITY_RANGES)[number];

export const ABILITY_LEVELS = [
  { value: 1, label: "一級・完全不會" },
  { value: 2, label: "二級・訓練中" },
  { value: 3, label: "三級・可獨立執行" },
] as const;

export const EMPLOYMENT_TYPES = ["PT", "正職"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
