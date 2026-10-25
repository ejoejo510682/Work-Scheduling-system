// 週排班表右邊的「草稿提醒」：把 checkWeekSchedule 的結果整理成分類提醒（GitHub issue #5 結論，原型在 prototype/schedule-ui 分支）
import { addDays, formatDateLabel, WEEKDAY_LABELS } from "@/lib/date";
import { CLOSED_SPECIAL_DATE_TYPES, type SpecialDateType } from "@/lib/constants";
import { isPriorityShippingDay } from "./scheduleLogic";
import { CATEGORIES, type CategoryKey, type Reminder } from "./reminderCategories";

export type { Reminder };

export type CheckWarning = {
  type: string;
  date?: string | null;
  message: string;
  slot?: string;
  positionId?: string;
  ptId?: string;
  target?: number;
};

export type RunNote = { type: string; date?: string | null; ptId?: string | null; message: string };

export type SpecialDateRow = { date: string; type: string; name: string };

export type DayInfo = {
  date: string;
  label: string;
  isSaturday: boolean;
  holidayNames: string[];
  closed: boolean;
  priority: boolean;
  priorityShort: string | null;
  priorityReason: string | null;
  // 跟上次自動排班時的假日資料比，這天放不放假、是不是出貨優先日變了
  changed: boolean;
};

export function dayLabel(date: string, monday: string) {
  const i = Math.round((Date.parse(date) - Date.parse(monday)) / 86400000);
  return `${formatDateLabel(date)}（${WEEKDAY_LABELS[i] ?? ""}）`;
}

// 演算法訊息的日期是 YYYY-MM-DD，畫面上改成 M/D
export function prettyDates(text: string) {
  return text
    .replace(/\d{4}-(\d{2})-(\d{2})（週(.)）/g, (_, m, d, w) => `${Number(m)}/${Number(d)}（${w}）`)
    .replace(/\d{4}-(\d{2})-(\d{2})/g, (_, m, d) => `${Number(m)}/${Number(d)}`);
}

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
  const info = isPriorityShippingDay(date, rows);
  const closed = rows.some((r) => r.date === date && CLOSED_SPECIAL_DATE_TYPES.includes(r.type as SpecialDateType));
  return { info, closed };
}

export function buildDayInfos(monday: string, current: SpecialDateRow[], snapshot: SpecialDateRow[] | null): DayInfo[] {
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i)).map((date, i) => {
    const now = dayStatus(date, current);
    const then = snapshot ? dayStatus(date, snapshot) : now;
    return {
      date,
      label: dayLabel(date, monday),
      isSaturday: i === 5,
      holidayNames: current.filter((r) => r.date === date && r.type !== "電商檔期").map((r) => r.name),
      closed: now.closed,
      priority: now.info.isPriority,
      priorityShort: now.info.isPriority ? shortReason(now.info.reason) : null,
      priorityReason: now.info.reason,
      changed: now.closed !== then.closed || now.info.isPriority !== then.info.isPriority,
    };
  });
}

// 「不符合規則」的規則名稱
function ruleName(msg: string) {
  if (msg.includes("能力是一級")) return "能力不足（一級）";
  if (msg.includes("二級")) return "能力不足（二級沒有三級陪同）";
  if (/限.性/.test(msg)) return "性別限制";
  if (msg.includes("天上限")) return "PT 每週天數上限";
  if (msg.includes("請確認是補班")) return "正職超過 5 天（補班？）";
  if (msg.includes("超過上限")) return "人數上限（含備援）";
  if (msg.includes("不在可上班範圍")) return "當天沒空（請假或時段不符）";
  if (msg.includes("不能上週六")) return "固定不能上週六";
  if (msg.includes("兩個崗位")) return "同一時段排兩個主要任務";
  if (msg.includes("沒有主要任務")) return "備援沒有主要任務";
  if (msg.includes("同一個崗位")) return "備援跟主要任務同一個崗位";
  if (msg.includes("沒有開")) return "崗位在這個時段沒開";
  if (msg.includes("正職一定要上工")) return "正職一定要上工";
  return "規則";
}

export function buildReminders({
  monday,
  warnings,
  notes,
  dayInfos,
  current,
  snapshot,
  staffName,
  positionName,
}: {
  monday: string;
  warnings: CheckWarning[];
  notes: RunNote[];
  dayInfos: DayInfo[];
  current: SpecialDateRow[];
  snapshot: SpecialDateRow[] | null;
  staffName: (id: string) => string;
  positionName: (id: string) => string;
}): Reminder[] {
  const out: Reminder[] = [];
  const dl = (d?: string | null) => (d ? dayLabel(d, monday) : "");
  const push = (catKey: CategoryKey, r: Omit<Reminder, "catKey" | "id">) => out.push({ ...r, catKey, id: `${catKey}|${r.title}` });

  if (snapshot) {
    const weekEnd = addDays(monday, 6);
    const inWeek = (r: SpecialDateRow) => r.date >= addDays(monday, -14) && r.date <= weekEnd;
    const key = (r: SpecialDateRow) => `${r.date}|${r.type}|${r.name}`;
    const added = current.filter((r) => inWeek(r) && !snapshot.some((s) => key(s) === key(r)));
    const removed = snapshot.filter((r) => inWeek(r) && !current.some((s) => key(s) === key(r)));
    const changedDays = dayInfos.filter((d) => d.changed);
    if (changedDays.length > 0) {
      push("holiday", {
        title: "假日有變動，請重排整週",
        detail:
          [
            added.length ? `排班後新登記：${added.map((r) => `${formatDateLabel(r.date)} ${r.name}`).join("、")}` : "",
            removed.length ? `刪除：${removed.map((r) => `${formatDateLabel(r.date)} ${r.name}`).join("、")}` : "",
            `受影響：${changedDays.map((d) => `${d.label}${d.closed ? "變成不排班" : d.priority ? "變成出貨優先日" : "不再是出貨優先日"}`).join("、")}`,
          ]
            .filter(Boolean)
            .join("。") + "。",
        targets: changedDays.map((d) => ({ date: d.date })),
      });
    }
  }

  for (const d of dayInfos) {
    if (d.closed) push("days", { title: `${d.label} ${d.holidayNames.join("、")}：不排班`, targets: [{ date: d.date }] });
    else if (d.priority)
      push("days", {
        title: `${d.label} 出貨優先日（${d.priorityShort}）：撿貨、包裝等加人`,
        detail: d.priorityReason ? prettyDates(d.priorityReason) : undefined,
        targets: [{ date: d.date }],
      });
  }

  const missingByPerson = new Map<string, string[]>();
  for (const w of warnings) {
    const msg = prettyDates(w.message);
    const date = w.date ?? undefined;
    const where = (extra?: string) =>
      [dl(date), w.slot, w.positionId ? positionName(w.positionId) : "", w.ptId ? staffName(w.ptId) : "", extra].filter(Boolean).join(" ");
    switch (w.type) {
      case "shortage": {
        if (w.message.includes("正職一定要上工")) {
          push("rule", { title: `${where()}：正職一定要上工`, detail: msg, targets: [{ date, ptId: w.ptId }] });
        } else if (w.target != null && w.slot && w.positionId) {
          const filled = Number(w.message.match(/只排到 (\d+) 人/)?.[1] ?? 0);
          push("shortage", {
            title: `${dl(date)} ${w.slot}・${positionName(w.positionId)} 缺 ${w.target - filled} 人`,
            detail: `需要 ${w.target} 人，目前 ${filled} 人`,
            targets: [{ date, slot: w.slot, positionId: w.positionId }],
          });
        } else {
          push("shortage", { title: msg, targets: [{ date, positionId: w.positionId }] });
        }
        break;
      }
      case "task_manual":
        push("task", { title: msg, targets: [{ date, slot: w.slot, positionId: w.positionId }] });
        break;
      case "task":
        if (w.message.includes("指定的")) {
          push("conflict", { title: msg, targets: [{ date, slot: w.slot, ptId: w.ptId }, { date, slot: w.slot, positionId: w.positionId }] });
        } else {
          push("task", { title: msg, targets: [{ date, slot: w.slot, positionId: w.positionId }] });
        }
        break;
      case "manual":
        push("thirdDay", {
          title: "本週正職第三天請手動指定",
          detail: msg.replace("本週正職第三天請手動指定", "").replace(/^（|）$/g, ""),
          targets: Array.from({ length: 4 }, (_, i) => ({ date: addDays(monday, i + 1) })),
        });
        break;
      case "locked":
      case "overtime":
        push("rule", {
          title: `${where()}：${ruleName(w.message)}`,
          detail: msg,
          targets: [{ date, slot: w.slot, positionId: w.positionId, ptId: w.ptId }],
        });
        break;
      case "surplus":
        push("surplus", {
          title: w.slot ? `${dl(date)} ${w.slot} ${staffName(w.ptId ?? "")} 沒有工作` : `${dl(date)} ${staffName(w.ptId ?? "")} 有空、整天沒排到`,
          targets: [{ date, slot: w.slot, ptId: w.ptId }],
        });
        break;
      case "missing_availability": {
        const name = staffName(w.ptId ?? "");
        missingByPerson.set(name, [...(missingByPerson.get(name) ?? []), w.date ?? ""]);
        break;
      }
      default:
        push("other", { title: msg, targets: date ? [{ date }] : [] });
    }
  }
  for (const [name, dates] of missingByPerson) {
    push("noAvail", {
      title: `${name} 這週有 ${dates.length} 天沒有登記可上班時間`,
      detail: `${dates.map((d) => formatDateLabel(d)).join("、")} 先當全天可上班排了，請提醒本人登記。`,
      targets: [],
    });
  }
  for (const n of notes) {
    push("other", { title: prettyDates(n.message), targets: n.date ? [{ date: n.date, ptId: n.ptId ?? undefined }] : [] });
  }

  const order = CATEGORIES.map((c) => c.key);
  const seen = new Set<string>();
  return out
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .sort((a, b) => order.indexOf(a.catKey) - order.indexOf(b.catKey));
}

