// 票3 草稿提醒 UI 原型用的假資料（throwaway prototype）。
// 人員、崗位、能力照 prototype/schedule-algorithm 分支的 schedule-prototype.html（真實名單＋真實能力表），
// 資料庫目前還沒有的欄位（組別、性別、優先排滿、任務……）都在這裡先寫死。

import type { ManualRow, SpecialDateRow } from "./model";

export const FIXTURE_WEEK = "2026-10-26";

export const POSITIONS = [
  { id: "packing", name: "包裝", group: "出貨組", priority_day_bonus: true, default_backup_position_id: null, max_headcount: 4, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: true, sort_order: 1 },
  { id: "picking", name: "撿貨", group: "出貨組", priority_day_bonus: true, default_backup_position_id: "packing", max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: true, sort_order: 2 },
  { id: "printer", name: "印訂單", group: "出貨組", priority_day_bonus: false, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: true, sort_order: 3 },
  { id: "inbound", name: "處理進貨", group: "進貨組", priority_day_bonus: false, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: true, sort_order: 4 },
  { id: "nopack", name: "無包裝出貨", group: "出貨組", priority_day_bonus: true, default_backup_position_id: null, max_headcount: 3, monday_headcount: 3, fill_first: true, gender_restriction: null, is_active: true, included_in_auto_schedule: true, sort_order: 5 },
  { id: "groupbuy", name: "處理團購訂單", group: "進貨組", priority_day_bonus: false, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: false, included_in_auto_schedule: true, sort_order: 6 },
  { id: "boxship", name: "出箱貨", group: "出貨組", priority_day_bonus: true, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: "男", is_active: true, included_in_auto_schedule: true, sort_order: 7 },
  { id: "wholesale", name: "處理批發訂單", group: "出貨組", priority_day_bonus: false, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: false, sort_order: 8 },
  { id: "return", name: "處理退貨", group: "出貨組", priority_day_bonus: false, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: false, sort_order: 9 },
  { id: "stocktake", name: "盤點", group: "出貨組", priority_day_bonus: false, default_backup_position_id: null, max_headcount: null, monday_headcount: null, fill_first: false, gender_restriction: null, is_active: true, included_in_auto_schedule: false, sort_order: 10 },
];

export const HEADCOUNTS = [
  { position_id: "packing", headcount: 2 },
  { position_id: "picking", headcount: 3 },
  { position_id: "picking", slot: "下午出訂單後", headcount: 2 },
  { position_id: "printer", headcount: 1 },
  { position_id: "inbound", headcount: 2 },
  { position_id: "nopack", headcount: 2 },
  { position_id: "groupbuy", headcount: 1 },
  { position_id: "boxship", headcount: 1 },
  { position_id: "wholesale", headcount: 2 },
  { position_id: "return", headcount: 2 },
  { position_id: "stocktake", headcount: 2 },
];

export const SLOT_MAP = [
  ["packing", "上午出訂單後"], ["packing", "下午出訂單後"],
  ["picking", "上午出訂單後"], ["picking", "下午出訂單後"],
  ["printer", "上午出訂單前"], ["printer", "下午出訂單前"],
  ["inbound", "上午出訂單前"], ["inbound", "上午出訂單後"], ["inbound", "下午出訂單前"], ["inbound", "下午出訂單後"], ["inbound", "出貨完成後"],
  ["nopack", "下午出訂單後"],
  ["groupbuy", "上午出訂單後"], ["groupbuy", "下午出訂單後"],
  ["boxship", "上午出訂單後"], ["boxship", "下午出訂單後"],
  ["wholesale", "上午出訂單後"], ["wholesale", "下午出訂單後"],
  ["return", "上午出訂單前"], ["return", "出貨完成後"],
  ["stocktake", "出貨完成後"],
].map(([position_id, slot]) => ({ position_id, slot }));

export const STAFF = [
  { id: "s1", name: "李睿懷", employment_type: "PT", primary_group: "出貨組", gender: "男", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s2", name: "林清瑞", employment_type: "PT", primary_group: "出貨組", gender: "男", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s3", name: "楊鎔慈", employment_type: "PT", primary_group: "出貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s4", name: "葉翠茹", employment_type: "PT", primary_group: "出貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s5", name: "陳語姍", employment_type: "PT", primary_group: "出貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s6", name: "黃依婷", employment_type: "PT", primary_group: "出貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s7", name: "王瀞玉", employment_type: "正職", primary_group: "出貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
  { id: "s8", name: "許庭瑄", employment_type: "正職", primary_group: "出貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: false, is_active: true },
  { id: "s9", name: "黃盈珊", employment_type: "正職", primary_group: "出貨組", gender: "女", can_work_saturday: false, auto_schedule_weekdays: true, is_active: true },
  { id: "s10", name: "連陳軒", employment_type: "正職", primary_group: "進貨組", gender: "男", can_work_saturday: false, auto_schedule_weekdays: true, is_active: true },
  { id: "s11", name: "李玄鳳", employment_type: "PT", primary_group: "進貨組", gender: "女", can_work_saturday: true, auto_schedule_weekdays: true, is_active: true },
];

const ab = (pt_id: string, position_id: string, level: number) => ({ pt_id, position_id, level });
export const ABILITIES = [
  ab("s11", "picking", 2), ab("s11", "packing", 3), ab("s11", "inbound", 2),
  ab("s1", "picking", 3), ab("s1", "packing", 3), ab("s1", "printer", 3), ab("s1", "nopack", 3), ab("s1", "boxship", 3), ab("s1", "inbound", 3),
  ab("s2", "picking", 2), ab("s2", "packing", 3), ab("s2", "boxship", 3), ab("s2", "inbound", 3),
  ab("s3", "picking", 3), ab("s3", "packing", 3), ab("s3", "printer", 3), ab("s3", "nopack", 3), ab("s3", "inbound", 3),
  ab("s4", "picking", 3), ab("s4", "packing", 3), ab("s4", "nopack", 3), ab("s4", "inbound", 2),
  ab("s5", "picking", 3), ab("s5", "packing", 3), ab("s5", "nopack", 2), ab("s5", "inbound", 2),
  ab("s6", "picking", 3), ab("s6", "packing", 3), ab("s6", "inbound", 2),
  ab("s7", "picking", 3), ab("s7", "packing", 3), ab("s7", "printer", 3), ab("s7", "nopack", 3), ab("s7", "inbound", 3),
  ab("s8", "picking", 3), ab("s8", "packing", 3), ab("s8", "printer", 3), ab("s8", "nopack", 3), ab("s8", "inbound", 3),
  ab("s10", "picking", 3), ab("s10", "packing", 3), ab("s10", "inbound", 3),
  ab("s9", "picking", 3), ab("s9", "packing", 3), ab("s9", "nopack", 3), ab("s9", "inbound", 2),
  ab("s7", "return", 3), ab("s9", "return", 3), ab("s8", "return", 3), ab("s8", "wholesale", 3),
];

// 過去幾個週六的班底（週六輪流讀「上次上週六」用）
const PAST_SATURDAYS: [string, string[]][] = [
  ["2026-10-03", ["s7", "s1", "s3", "s5"]],
  ["2026-10-10", ["s8", "s4", "s1", "s2"]],
  ["2026-10-17", ["s7", "s3", "s1", "s6"]],
  ["2026-10-24", ["s8", "s4", "s1", "s5"]],
];
export const PAST_SCHEDULE = PAST_SATURDAYS.flatMap(([date, ids]) =>
  ids.map((pt_id, i) => ({ date, slot: "上午出訂單後", position_id: i === 0 ? "picking" : "packing", pt_id, priority: 1 })),
);

// 上週印訂單 PT 班次（印單輪排讀上週資料用）
export const PREVIOUS_WEEK_PRINTING = [
  { position_id: "printer", position_name: "印訂單", pt_id: "s1", priority: 1, date: "2026-10-20" },
  { position_id: "printer", position_name: "印訂單", pt_id: "s1", priority: 1, date: "2026-10-21" },
  { position_id: "printer", position_name: "印訂單", pt_id: "s3", priority: 1, date: "2026-10-22" },
];

export const TASK_TEMPLATES = [
  { position_id: "return", slot: "上午出訂單前", weekdays: [0, 1, 2, 3, 4], pt_id: "s7", substitute_pt_id: null },
  { position_id: "return", slot: "上午出訂單前", weekdays: [0, 1, 2, 3, 4], pt_id: "s9", substitute_pt_id: null },
  { position_id: "return", slot: "出貨完成後", weekdays: [0, 1, 2, 3, 4], pt_id: "s7", substitute_pt_id: "s8" },
  { position_id: "return", slot: "出貨完成後", weekdays: [0, 1, 2, 3, 4], pt_id: "s9", substitute_pt_id: "s8" },
];

// 這週的本週任務：批發 2 人沒指定（會跳「請手動指定」）、盤點指定連陳軒（從處理進貨移過去）、
// 週四下午批發指定王瀞玉（她那個時段在出貨，會跳「指定的人有衝突」）
export function taskRequestsFor(monday: string, addDays: (d: string, n: number) => string) {
  return [
    { date: addDays(monday, 2), slot: "下午出訂單後", position_id: "wholesale", headcount: 2, pt_id: null },
    { date: addDays(monday, 3), slot: "出貨完成後", position_id: "stocktake", headcount: 1, pt_id: "s10" },
    { date: addDays(monday, 3), slot: "下午出訂單後", position_id: "wholesale", headcount: 1, pt_id: "s7" },
  ];
}

// 可上班登記：大家全天，除了：黃依婷整週沒登記、林清瑞週四請假、葉翠茹週三只上午
export function availabilityFor(days: string[]) {
  const rows: { pt_id: string; date: string; range: string }[] = [];
  for (const s of STAFF) {
    if (s.id === "s6") continue;
    days.forEach((date, i) => {
      let range = "全天";
      if (s.id === "s2" && i === 3) range = "全天休假";
      if (s.id === "s4" && i === 2) range = "只上午";
      rows.push({ pt_id: s.id, date, range });
    });
  }
  return rows;
}

// Cynthia 已經手動調整過的格子（示範用）：
//   週三上午出訂單後 許庭瑄 手動改去包裝（主要）
//   週四上午出訂單後 王瀞玉 撿貨（照系統排的鎖住）＋ 處理進貨（手動加的備援）
//   不符合規則的示範：週四下午出訂單後 葉翠茹 手動排去出箱貨（出箱貨限男性、她出箱貨一級）；
//                     週四上午出訂單後 林清瑞 手動排去出箱貨（他週四請假）
export function initialManualRows(monday: string, addDays: (d: string, n: number) => string): ManualRow[] {
  return [
    { date: addDays(monday, 2), slot: "上午出訂單後", position_id: "packing", pt_id: "s8", priority: 1, source: "manual", kind: "edited" },
    { date: addDays(monday, 3), slot: "上午出訂單後", position_id: "picking", pt_id: "s7", priority: 1, source: "manual", kind: "pinned" },
    { date: addDays(monday, 3), slot: "上午出訂單後", position_id: "inbound", pt_id: "s7", priority: 2, source: "manual", kind: "edited" },
    { date: addDays(monday, 3), slot: "下午出訂單後", position_id: "boxship", pt_id: "s4", priority: 1, source: "manual", kind: "edited" },
    { date: addDays(monday, 3), slot: "上午出訂單後", position_id: "boxship", pt_id: "s2", priority: 1, source: "manual", kind: "edited" },
  ];
}

// 資料庫沒有資料時用的特殊日期（跟正式資料庫 10/23～10/26 的登記一樣）
export const FALLBACK_SPECIAL_DATES: SpecialDateRow[] = [
  { date: "2026-10-23", type: "國定假日", name: "颱風假" },
  { date: "2026-10-25", type: "國定假日", name: "光復節" },
  { date: "2026-10-26", type: "國定假日", name: "光復節補假" },
];

// 示範「假日有變動，請重排」：假裝草稿是 10/22 產生的，那時只登記了 10/25 光復節，
// 10/23 颱風假、10/26 補假是之後才登記的
export const ADDED_AFTER_DRAFT = ["2026-10-23", "2026-10-26"];
export const DRAFT_GENERATED_AT = "10/22（四）15:40";
