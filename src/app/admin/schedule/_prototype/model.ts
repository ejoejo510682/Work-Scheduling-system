// 票3 草稿提醒 UI 原型：把排班演算法的輸出整理成畫面要用的資料（throwaway prototype）

import { addDays, formatDateLabel, WEEKDAY_LABELS } from "@/lib/date";
import { SLOTS } from "@/lib/constants";
import ScheduleLogicJs from "./scheduleLogic.js";
import {
  ABILITIES,
  HEADCOUNTS,
  PAST_SCHEDULE,
  POSITIONS,
  PREVIOUS_WEEK_PRINTING,
  SLOT_MAP,
  STAFF,
  TASK_TEMPLATES,
  availabilityFor,
  taskRequestsFor,
} from "./fixture";

export type SpecialDateRow = { date: string; type: string; name: string };

export type ManualRow = {
  date: string;
  slot: string;
  position_id: string;
  pt_id: string;
  priority: 1 | 2;
  source: "manual";
  kind: "edited" | "pinned";
};

export type ScheduleRow = {
  date: string;
  slot: string;
  position_id: string;
  position_name: string;
  pt_id: string;
  pt_name: string;
  priority: 1 | 2;
  source: "auto" | "manual";
  task?: string;
  substituteFor?: string;
  kind?: "edited" | "pinned";
};

export type EngineWarning = {
  type: string;
  date?: string | null;
  message: string;
  slot?: string;
  positionId?: string;
  ptId?: string;
  target?: number;
};

type PriorityInfo = {
  isPriority: boolean;
  reason: string | null;
  extraHeadcount: number;
  nonWorking: boolean;
  isFirstAfterRun?: boolean;
  isSecondAfterRun?: boolean;
};

export type EngineResult = {
  schedule: ScheduleRow[];
  warnings: EngineWarning[];
  printerPlan: { thirdDay: string | null; thirdDayReason: string | null; assignments: Record<string, string> };
  targets: Record<string, number>;
};

type Engine = {
  generateWeekSchedule: (input: unknown) => EngineResult;
  isPriorityShippingDay: (date: string, specialDates: unknown[]) => PriorityInfo;
};

const Engine = ScheduleLogicJs as unknown as Engine;

export { POSITIONS, STAFF, SLOT_MAP };

export const positionName = (id: string) => POSITIONS.find((p) => p.id === id)?.name ?? id;
export const staffName = (id: string) => STAFF.find((s) => s.id === id)?.name ?? id;
export const levelOf = (ptId: string, positionId: string) =>
  ABILITIES.find((a) => a.pt_id === ptId && a.position_id === positionId)?.level ?? 1;

export function weekDays(monday: string) {
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i)); // 一～六
}

export function dayLabel(date: string, monday: string) {
  const i = Math.round((Date.parse(date) - Date.parse(monday)) / 86400000);
  return `${formatDateLabel(date)}（${WEEKDAY_LABELS[i] ?? ""}）`;
}

function toEngineDates(rows: SpecialDateRow[]) {
  return rows.map((r) => ({ ...r, extra_headcount: null }));
}

export function runDraft(monday: string, specialDates: SpecialDateRow[], manualRows: ManualRow[]): EngineResult {
  const days = weekDays(monday);
  return Engine.generateWeekSchedule({
    weekStart: monday,
    positions: POSITIONS,
    staff: STAFF,
    abilities: ABILITIES,
    headcounts: HEADCOUNTS,
    slotMap: SLOT_MAP,
    availability: availabilityFor(days),
    specialDates: toEngineDates(specialDates),
    previousWeekSchedule: PREVIOUS_WEEK_PRINTING,
    pastSchedule: PAST_SCHEDULE,
    weekdayFtPrinterId: "s7",
    positionPreferredStaff: [
      { position_id: "boxship", pt_id: "s2", rank: 1 },
      { position_id: "boxship", pt_id: "s1", rank: 2 },
    ],
    currentWeekSchedule: manualRows,
    taskTemplates: TASK_TEMPLATES,
    taskRequests: taskRequestsFor(monday, addDays),
  });
}

// ---- 每天的標記（日期欄位上方）----

export type DayInfo = {
  date: string;
  label: string;
  holidayNames: string[];
  isHoliday: boolean;
  isTyphoon: boolean;
  priority: boolean;
  priorityShort: string | null; // 例如「連假後第 1 天」「檔期順延」
  priorityReason: string | null;
  changed: boolean; // 跟草稿產生時的假日資料比，這天的狀態變了
  isSaturday: boolean;
  staleHoliday?: boolean; // 現在是國定假日，但這份草稿（用舊假日資料排的）那天還有排班
};

function shortReason(reason: string | null) {
  if (!reason) return null;
  const parts: string[] = [];
  const m = reason.match(/後第 (\d) 個上班日/);
  if (m) parts.push(`連假後第 ${m[1]} 天`);
  if (reason.includes("順延")) parts.push("檔期順延");
  else if (reason.includes("電商檔期")) parts.push("檔期");
  if (reason.includes("手動設定")) parts.push("手動設定");
  return parts.join("＋") || "出貨優先日";
}

function dayStatus(date: string, rows: SpecialDateRow[]) {
  const info = Engine.isPriorityShippingDay(date, toEngineDates(rows));
  const holiday = rows.some((r) => r.date === date && r.type === "國定假日");
  return { info, holiday };
}

export function buildDayInfos(monday: string, current: SpecialDateRow[], snapshot: SpecialDateRow[]): DayInfo[] {
  return weekDays(monday).map((date, i) => {
    const now = dayStatus(date, current);
    const then = dayStatus(date, snapshot);
    const names = current.filter((r) => r.date === date).map((r) => r.name);
    return {
      date,
      label: dayLabel(date, monday),
      holidayNames: names,
      isHoliday: now.holiday,
      isTyphoon: names.some((n) => n.includes("颱風")),
      priority: now.info.isPriority,
      priorityShort: now.info.isPriority ? shortReason(now.info.reason) : null,
      priorityReason: now.info.reason,
      changed: now.holiday !== then.holiday || now.info.isPriority !== then.info.isPriority,
      isSaturday: i === 5,
    };
  });
}

// ---- 提醒（第 2 輪：照類別分）----

export type ReminderLevel = "要處理" | "參考";

export type CategoryKey =
  | "shortage"
  | "task"
  | "thirdDay"
  | "holiday"
  | "rule"
  | "conflict"
  | "surplus"
  | "noAvail"
  | "days"
  | "other";

export const CATEGORIES: { key: CategoryKey; label: string; level: ReminderLevel; hint: string }[] = [
  { key: "shortage", label: "人手不足", level: "要處理", hint: "可以點名字把人調過來，或接受缺人（確認草稿時照樣保留）。" },
  { key: "task", label: "任務待指定", level: "要處理", hint: "到「任務登記」指定人員，或點那個時段某人的名字，把他改去任務崗位。" },
  { key: "thirdDay", label: "正職第三天", level: "要處理", hint: "選一天讓王瀞玉印單：點那天印訂單的人改去別的崗位，再把王瀞玉改去印訂單。" },
  { key: "holiday", label: "假日有變動", level: "要處理", hint: "草稿是用舊的假日資料排的，按「重排整週」套用新的假日。" },
  { key: "rule", label: "不符合規則", level: "要處理", hint: "手動調整或鎖定違反規則（系統照樣保留）。可以接受就勾已看過，不行就點名字改掉或解除鎖定。" },
  { key: "conflict", label: "指定的人有衝突", level: "要處理", hint: "本週任務指定的人那個時段已經有出貨／印單或請假，改指定別人或手動調整。" },
  { key: "surplus", label: "人力過剩", level: "參考", hint: "這些人有空但沒排到工作，可以手動安排處理進貨或其他工作。" },
  { key: "noAvail", label: "沒登記可上班時間", level: "參考", hint: "先當全天可上班排了，請提醒本人登記。" },
  { key: "days", label: "出貨優先日／放假資訊", level: "參考", hint: "這週哪幾天加人、哪幾天不排班。" },
  { key: "other", label: "其他提示", level: "參考", hint: "系統自己處理掉的情況（PT 到 4 天上限、印單有人頂上、任務代班……），看過就好。" },
];

// 提醒對到畫面上的哪裡：某天、某天某時段、某格（時段＋崗位）、或某個人
export type Target = { date?: string; slot?: string; positionId?: string; ptId?: string };

export type Reminder = {
  id: string;
  catKey: CategoryKey;
  level: ReminderLevel;
  category: string; // 類別名稱（舊版 A／C 也用這個）
  title: string;
  detail?: string;
  date?: string;
  slot?: string;
  positionId?: string;
  targets: Target[];
};

// 演算法的訊息日期是 YYYY-MM-DD，畫面上改成 M/D（例如 2026-10-28（週三） → 10/28（三））
export function prettyDates(text: string) {
  return text
    .replace(/\d{4}-(\d{2})-(\d{2})（週(.)）/g, (_, m, d, w) => `${Number(m)}/${Number(d)}（${w}）`)
    .replace(/\d{4}-(\d{2})-(\d{2})/g, (_, m, d) => `${Number(m)}/${Number(d)}`);
}

const firstDate = (msg: string) => msg.match(/\d{4}-\d{2}-\d{2}/)?.[0];
const firstSlot = (msg: string) => SLOTS.find((s) => msg.includes(s));
const positionInMsg = (msg: string) => {
  const quoted = msg.match(/「([^」]+)」/)?.[1];
  const byQuote = quoted && POSITIONS.find((p) => quoted === p.name || quoted.startsWith(p.name));
  if (byQuote) return byQuote.id;
  return [...POSITIONS].sort((a, b) => b.name.length - a.name.length).find((p) => msg.includes(p.name))?.id;
};
const personInMsg = (msg: string) => STAFF.find((s) => msg.includes(s.name))?.id;

// 「不符合規則」的規則名稱（從演算法的手動鎖定檢查訊息判斷）
function ruleName(msg: string) {
  if (msg.includes("能力是一級")) return "能力不足（一級）";
  if (msg.includes("二級")) return "能力不足（二級沒有三級陪同）";
  if (/限.性/.test(msg)) return "性別限制";
  if (msg.includes("4 天上限")) return "PT 每週 4 天上限";
  if (msg.includes("超過上限")) return "人數上限（含備援）";
  if (msg.includes("不在可上班範圍")) return "當天沒空（請假或時段不符）";
  if (msg.includes("不能上週六")) return "固定不能上週六";
  if (msg.includes("同時被鎖定在兩個崗位")) return "同一時段排兩個主要任務";
  if (msg.includes("沒有主要任務")) return "備援沒有主要任務";
  if (msg.includes("同一個崗位")) return "備援跟主要任務同一個崗位";
  if (msg.includes("沒有開")) return "崗位在這個時段沒開";
  if (msg.includes("正職一定要上工")) return "正職一定要上工";
  return "規則";
}

const shortageCount = (w: EngineWarning, schedule: ScheduleRow[]) => {
  if (w.target == null || !w.slot || !w.positionId || !w.date) return null;
  const filled = schedule.filter(
    (r) => r.date === w.date && r.slot === w.slot && r.position_id === w.positionId && r.priority === 1,
  ).length;
  return { filled, missing: Math.max(0, w.target - filled), target: w.target };
};

export function buildReminders(
  result: EngineResult,
  schedule: ScheduleRow[],
  monday: string,
  current: SpecialDateRow[],
  snapshot: SpecialDateRow[],
): Reminder[] {
  const out: Reminder[] = [];
  const dl = (d?: string | null) => (d ? dayLabel(d, monday) : "");
  const cat = (k: CategoryKey) => CATEGORIES.find((c) => c.key === k)!;
  const push = (k: CategoryKey, r: Omit<Reminder, "catKey" | "level" | "category">) =>
    out.push({ ...r, catKey: k, level: cat(k).level, category: cat(k).label });

  // 假日有變動（原型自己比對：草稿產生時的假日資料 vs 現在的假日資料）
  const key = (r: SpecialDateRow) => `${r.date}|${r.type}|${r.name}`;
  const added = current.filter((r) => !snapshot.some((s) => key(s) === key(r)));
  const removed = snapshot.filter((r) => !current.some((s) => key(s) === key(r)));
  if (added.length || removed.length) {
    const days = buildDayInfos(monday, current, snapshot).filter((d) => d.changed);
    push("holiday", {
      id: "holiday-changed",
      title: "假日有變動，請重排整週",
      detail:
        [
          added.length ? `草稿產生後新登記：${added.map((r) => `${formatDateLabel(r.date)} ${r.name}`).join("、")}` : "",
          removed.length ? `刪除：${removed.map((r) => `${formatDateLabel(r.date)} ${r.name}`).join("、")}` : "",
          days.length ? `受影響：${days.map((d) => `${d.label}${d.isHoliday ? "變成國定假日" : d.priority ? "變成出貨優先日" : "不再是出貨優先日"}`).join("、")}` : "",
        ]
          .filter(Boolean)
          .join("。") + "。",
      targets: days.map((d) => ({ date: d.date })),
    });
  }

  // 出貨優先日／放假資訊：每天一則
  for (const d of buildDayInfos(monday, current, current)) {
    if (d.isHoliday) push("days", { id: `day-hol-${d.date}`, title: `${d.label} ${d.holidayNames.join("、")}：不排班`, date: d.date, targets: [{ date: d.date }] });
    else if (d.priority) push("days", { id: `day-prio-${d.date}`, title: `${d.label} 出貨優先日（${d.priorityShort}）：撿貨、包裝等加人`, detail: d.priorityReason ? prettyDates(d.priorityReason) : undefined, date: d.date, targets: [{ date: d.date }] });
  }

  const missingByPerson = new Map<string, string[]>();
  result.warnings.forEach((raw, i) => {
    const msg = prettyDates(raw.message);
    const id = `w${i}`;
    const date = raw.date ?? firstDate(raw.message) ?? undefined;
    const slot = raw.slot ?? firstSlot(raw.message);
    const ptId = raw.ptId ?? personInMsg(raw.message);
    switch (raw.type) {
      case "shortage": {
        if (raw.message.includes("正職一定要上工")) {
          push("rule", { id, title: `${dl(date)} ${staffName(ptId ?? "")}：正職一定要上工`, detail: msg, date, targets: [{ date, ptId }] });
          return;
        }
        const c = shortageCount(raw, schedule);
        if (c && c.missing === 0) return; // 手動調整後已經補滿
        if (c) {
          push("shortage", {
            id,
            title: `${dl(raw.date)} ${raw.slot}・${positionName(raw.positionId!)} 缺 ${c.missing} 人`,
            detail: `需要 ${c.target} 人，目前 ${c.filled} 人`,
            date: raw.date ?? undefined,
            slot: raw.slot,
            positionId: raw.positionId,
            targets: [{ date: raw.date ?? undefined, slot: raw.slot, positionId: raw.positionId }],
          });
          return;
        }
        const positionId = positionInMsg(raw.message);
        push("shortage", { id, title: msg, date, slot, positionId, targets: [{ date, slot, positionId }] });
        return;
      }
      case "task_manual": {
        const positionId = raw.positionId ?? positionInMsg(raw.message);
        push("task", { id, title: msg, date, slot, positionId, targets: [{ date, slot, positionId }] });
        return;
      }
      case "task": {
        const positionId = positionInMsg(raw.message);
        if (raw.message.includes("指定的")) {
          push("conflict", { id, title: msg, date, slot, positionId, targets: [{ date, slot, ptId }, { date, slot, positionId }] });
        } else if (raw.message.includes("留空")) {
          push("task", { id, title: msg, date, slot, positionId, targets: [{ date, slot, positionId }] });
        } else {
          push("other", { id, title: msg, date, slot, positionId, targets: [{ date, slot, positionId }] });
        }
        return;
      }
      case "manual":
        push("thirdDay", {
          id,
          title: "本週正職第三天請手動指定",
          detail: msg.replace("本週正職第三天請手動指定", "").replace(/^（|）$/g, ""),
          targets: weekDays(monday).slice(1, 5).map((d) => ({ date: d, positionId: "printer" })),
        });
        return;
      case "locked": {
        const positionId = positionInMsg(raw.message);
        const rule = ruleName(raw.message);
        const where = [dl(date), slot, positionId ? positionName(positionId) : "", ptId ? staffName(ptId) : ""].filter(Boolean).join(" ");
        push("rule", { id, title: `${where}：${rule}`, detail: msg, date, slot, positionId, targets: [{ date, slot, positionId, ptId }] });
        return;
      }
      case "surplus":
        push("surplus", {
          id,
          title: raw.slot ? `${dl(date)} ${raw.slot} ${staffName(ptId ?? "")} 沒有工作` : `${dl(date)} ${staffName(ptId ?? "")} 整天沒排到`,
          detail: msg,
          date,
          slot: raw.slot,
          targets: [{ date, slot: raw.slot, ptId }],
        });
        return;
      case "missing_availability": {
        const name = staffName(raw.ptId!);
        missingByPerson.set(name, [...(missingByPerson.get(name) ?? []), raw.date!]);
        return;
      }
      case "priority_day":
        return; // 已經在「出貨優先日／放假資訊」逐天列出
      case "info":
        if (raw.message.includes("國定假日") || raw.message.includes("春節")) {
          if (raw.message.includes("不排班") && !raw.message.includes("印單")) return; // 逐天列過了
          push("days", { id, title: msg, date, targets: date ? [{ date }] : [] });
          return;
        }
        push("other", { id, title: msg, date, slot, targets: [{ date, slot, ptId }] });
        return;
      default:
        push("other", { id, title: msg, date, targets: date ? [{ date }] : [] });
    }
  });
  for (const [name, dates] of missingByPerson) {
    const ptId = STAFF.find((s) => s.name === name)?.id;
    push("noAvail", {
      id: `missing-${name}`,
      title: `${name} 這週沒有登記可上班時間`,
      detail: `${dates.length} 天先當全天可上班排了，請提醒她登記。`,
      targets: [{ ptId }],
    });
  }
  const order = CATEGORIES.map((c) => c.key);
  return out.sort((a, b) => order.indexOf(a.catKey) - order.indexOf(b.catKey));
}

// 某一則提醒有沒有對到這個地方（一天／一個時段／一格／一個人）
export function targetMatches(t: Target, where: { date: string; slot?: string; positionId?: string; ptId?: string }) {
  if (t.date && t.date !== where.date) return false;
  if (t.slot && where.slot && t.slot !== where.slot) return false;
  if (t.slot && !where.slot) return false;
  if (t.positionId && t.positionId !== where.positionId) return false;
  if (t.ptId && t.ptId !== where.ptId) return false;
  return true;
}

// ---- 表格用的列：時段 × 崗位 ----

export const ACTIVE_POSITIONS = POSITIONS.filter((p) => p.is_active);
export const TASK_POSITION_IDS = POSITIONS.filter((p) => p.included_in_auto_schedule === false).map((p) => p.id);

export function gridRows(schedule: ScheduleRow[], reminders: Reminder[]) {
  const rows: { slot: string; positionId: string }[] = [];
  for (const slot of SLOTS) {
    for (const p of ACTIVE_POSITIONS) {
      if (!SLOT_MAP.some((m) => m.position_id === p.id && m.slot === slot)) continue;
      const isTask = TASK_POSITION_IDS.includes(p.id);
      if (isTask && !schedule.some((r) => r.slot === slot && r.position_id === p.id) && !reminders.some((r) => r.slot === slot && r.positionId === p.id)) continue;
      rows.push({ slot, positionId: p.id });
    }
  }
  return rows;
}

export function cellKey(date: string, slot: string, positionId?: string) {
  return positionId ? `${date}|${slot}|${positionId}` : `${date}|${slot}`;
}

export function cellSignature(schedule: ScheduleRow[], date: string, slot: string) {
  return schedule
    .filter((r) => r.date === date && r.slot === slot)
    .map((r) => `${r.position_id}:${r.pt_id}:${r.priority}:${r.source}`)
    .sort()
    .join("|");
}

export function backupOptions(slot: string, primaryPositionId: string) {
  return ACTIVE_POSITIONS.filter(
    (p) => p.id !== primaryPositionId && SLOT_MAP.some((m) => m.position_id === p.id && m.slot === slot),
  );
}
