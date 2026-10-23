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

// ---- 提醒 ----

export type ReminderLevel = "要處理" | "參考";

export type Reminder = {
  id: string;
  level: ReminderLevel;
  category: string;
  title: string;
  detail?: string;
  date?: string;
  slot?: string;
  positionId?: string;
};

// 演算法的訊息日期是 YYYY-MM-DD，畫面上改成 M/D（例如 2026-10-28（週三） → 10/28（三））
export function prettyDates(text: string) {
  return text
    .replace(/d{4}-(d{2})-(d{2})（週(.)）/g, (_, m, d, w) => `${Number(m)}/${Number(d)}（${w}）`)
    .replace(/d{4}-(d{2})-(d{2})/g, (_, m, d) => `${Number(m)}/${Number(d)}`);
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

  // 假日有變動（原型自己比對：草稿產生時的假日資料 vs 現在的假日資料）
  const key = (r: SpecialDateRow) => `${r.date}|${r.type}|${r.name}`;
  const added = current.filter((r) => !snapshot.some((s) => key(s) === key(r)));
  const removed = snapshot.filter((r) => !current.some((s) => key(s) === key(r)));
  if (added.length || removed.length) {
    const days = buildDayInfos(monday, current, snapshot).filter((d) => d.changed);
    out.push({
      id: "holiday-changed",
      level: "要處理",
      category: "假日有變動",
      title: "假日有變動，請重排整週",
      detail:
        [
          added.length ? `草稿產生後新登記：${added.map((r) => `${formatDateLabel(r.date)} ${r.name}`).join("、")}` : "",
          removed.length ? `刪除：${removed.map((r) => `${formatDateLabel(r.date)} ${r.name}`).join("、")}` : "",
          days.length ? `受影響的日子：${days.map((d) => `${d.label}${d.isHoliday ? "變成國定假日" : d.priority ? "變成出貨優先日" : "不再是出貨優先日"}`).join("、")}` : "",
        ]
          .filter(Boolean)
          .join("。") + "。",
    });
  }

  const missingByPerson = new Map<string, string[]>();
  result.warnings.forEach((raw, i) => {
    const w = { ...raw, message: prettyDates(raw.message) };
    const id = `w${i}`;
    switch (w.type) {
      case "shortage": {
        const c = shortageCount(w, schedule);
        if (c && c.missing === 0) return; // 手動調整後已經補滿
        out.push({
          id,
          level: "要處理",
          category: "人手不足",
          title: c ? `${dl(w.date)} ${w.slot} ${positionName(w.positionId!)} 缺 ${c.missing} 人` : w.message,
          detail: c ? `需要 ${c.target} 人，目前 ${c.filled} 人` : undefined,
          date: w.date ?? undefined,
          slot: w.slot,
          positionId: w.positionId,
        });
        return;
      }
      case "task_manual":
        out.push({ id, level: "要處理", category: "任務待指定", title: w.message, date: w.date ?? undefined, slot: w.slot, positionId: w.positionId });
        return;
      case "manual":
        out.push({ id, level: "要處理", category: "正職第三天", title: "本週正職第三天請手動指定", detail: w.message.replace("本週正職第三天請手動指定", "").replace(/^（|）$/g, "") });
        return;
      case "locked":
        out.push({ id, level: "要處理", category: "手動調整", title: w.message, date: w.date ?? undefined });
        return;
      case "task":
        out.push({
          id,
          level: /留空|請手動|請 Cynthia/.test(w.message) ? "要處理" : "參考",
          category: "任務",
          title: w.message,
          date: w.date ?? undefined,
        });
        return;
      case "surplus":
        out.push({ id, level: "參考", category: "人力過剩", title: w.message, date: w.date ?? undefined, slot: w.slot });
        return;
      case "missing_availability": {
        const name = staffName(w.ptId!);
        missingByPerson.set(name, [...(missingByPerson.get(name) ?? []), w.date!]);
        return;
      }
      case "priority_day":
        out.push({ id, level: "參考", category: "出貨優先日", title: w.message });
        return;
      default:
        out.push({ id, level: "參考", category: "提示", title: w.message, date: w.date ?? undefined });
    }
  });
  for (const [name, dates] of missingByPerson) {
    out.push({
      id: `missing-${name}`,
      level: "參考",
      category: "沒登記可上班",
      title: `${name} 這週沒有登記可上班時間（${dates.length} 天暫時當全天可上班）`,
      detail: "請提醒她登記，或確認這樣排可以。",
    });
  }
  return out;
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
