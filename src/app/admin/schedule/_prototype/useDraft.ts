"use client";

// 票3 原型：整週草稿的記憶體狀態（不會存檔）。三個版本共用同一份狀態，只是畫面長得不一樣。

import { useMemo, useState } from "react";
import {
  backupOptions,
  buildDayInfos,
  buildReminders,
  cellSignature,
  levelOf,
  positionName,
  runDraft,
  staffName,
  weekDays,
  type ManualRow,
  type ScheduleRow,
  type SpecialDateRow,
} from "./model";
import { POSITIONS } from "./fixture";
import { SLOTS } from "@/lib/constants";

export type DraftProps = {
  monday: string;
  currentSpecialDates: SpecialDateRow[];
  snapshotSpecialDates: SpecialDateRow[];
  initialManualRows: ManualRow[];
  generatedAt: string;
  specialDatesSource: "資料庫" | "原型假資料";
};

export function useDraft(props: DraftProps) {
  const { monday, currentSpecialDates } = props;
  const [snapshot, setSnapshot] = useState(props.snapshotSpecialDates);
  const [manualRows, setManualRows] = useState<ManualRow[]>(props.initialManualRows);
  const [generatedAt, setGeneratedAt] = useState(props.generatedAt);
  const [result, setResult] = useState(() => runDraft(monday, props.snapshotSpecialDates, props.initialManualRows));
  // 還沒按「重排整週」之前，手動調整直接改在畫面上的這份班表
  const [edited, setEdited] = useState<ScheduleRow[] | null>(null);
  const [pendingEdits, setPendingEdits] = useState(0);
  const [changedCells, setChangedCells] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const schedule = useMemo<ScheduleRow[]>(() => {
    const base = edited ?? result.schedule;
    return base.map((r) => {
      if (r.source !== "manual") return r;
      const m = manualRows.find(
        (x) => x.date === r.date && x.slot === r.slot && x.pt_id === r.pt_id && x.position_id === r.position_id && x.priority === r.priority,
      );
      return { ...r, kind: m?.kind ?? "edited" };
    });
  }, [edited, result, manualRows]);

  const days = useMemo(
    () => buildDayInfos(monday, currentSpecialDates, snapshot).map((d) => ({ ...d, staleHoliday: d.isHoliday && schedule.some((r) => r.date === d.date) })),
    [monday, currentSpecialDates, snapshot, schedule],
  );
  const reminders = useMemo(
    () => buildReminders(result, schedule, monday, currentSpecialDates, snapshot),
    [result, schedule, monday, currentSpecialDates, snapshot],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  };

  const rerun = () => {
    const next = runDraft(monday, currentSpecialDates, manualRows);
    const changed = new Set<string>();
    for (const d of weekDays(monday)) for (const sl of SLOTS) if (cellSignature(schedule, d, sl) !== cellSignature(next.schedule, d, sl)) changed.add(`${d}|${sl}`);
    setResult(next);
    setEdited(null);
    setPendingEdits(0);
    setSnapshot(currentSpecialDates);
    setChangedCells(changed);
    setGeneratedAt("剛剛");
    setDone(new Set());
    showToast(`原型：已重排整週（鎖定的 ${manualRows.length} 格不動，${changed.size} 格有變動，用黃框標出）。不會存檔。`);
  };

  const applyLocal = (fn: (rows: ScheduleRow[]) => ScheduleRow[]) => {
    setEdited(fn(edited ?? result.schedule));
    setPendingEdits((n) => n + 1);
  };

  const sameCell = (r: { date: string; slot: string; pt_id: string }, x: { date: string; slot: string; pt_id: string }) =>
    r.date === x.date && r.slot === x.slot && r.pt_id === x.pt_id;

  // 照系統排的樣子鎖住（主要或備援都可以）
  const pin = (row: ScheduleRow) => {
    setManualRows((ms) => [...ms, { date: row.date, slot: row.slot, position_id: row.position_id, pt_id: row.pt_id, priority: row.priority, source: "manual", kind: "pinned" }]);
    applyLocal((rows) => rows.map((r) => (r === findIn(rows, row) ? { ...r, source: "manual" as const } : r)));
    showToast(`原型：已鎖定 ${row.pt_name}「${row.position_name}${row.priority === 2 ? "（備援）" : ""}」，重排整週時不會動。`);
  };

  const unlock = (row: ScheduleRow) => {
    setManualRows((ms) => ms.filter((m) => !(sameCell(m, row) && m.position_id === row.position_id && m.priority === row.priority)));
    applyLocal((rows) => rows.map((r) => (r === findIn(rows, row) ? { ...r, source: "auto" as const } : r)));
    showToast(`原型：已解除 ${row.pt_name} 的鎖定，重排整週時系統會重新決定這一格。`);
  };

  // 改去別的崗位（主要）：這個人這個時段原本的格子（含備援）拿掉，換成手動的新格子
  const movePrimary = (row: ScheduleRow, positionId: string) => {
    setManualRows((ms) => [
      ...ms.filter((m) => !sameCell(m, row)),
      { date: row.date, slot: row.slot, position_id: positionId, pt_id: row.pt_id, priority: 1, source: "manual", kind: "edited" },
    ]);
    applyLocal((rows) => [
      ...rows.filter((r) => !sameCell(r, row)),
      { date: row.date, slot: row.slot, position_id: positionId, position_name: positionName(positionId), pt_id: row.pt_id, pt_name: row.pt_name, priority: 1, source: "manual", kind: "edited" },
    ]);
    showToast(`原型：${row.pt_name} 改去「${positionName(positionId)}」並鎖定。其他格子還沒重新組合，按「重排整週」。`);
  };

  // 設定備援：一定要是這個人這個時段已經有主要任務的格子；備援崗位這個時段要有開。
  // 能力不夠、包裝超過 4 人（含備援）只提醒、不擋
  const setBackup = (primary: ScheduleRow, positionId: string) => {
    if (!backupOptions(primary.slot, primary.position_id).some((p) => p.id === positionId)) {
      showToast(`「${positionName(positionId)}」在 ${primary.slot} 沒有開，不能當備援。`);
      return;
    }
    const notes: string[] = [];
    const level = levelOf(primary.pt_id, positionId);
    if (level === 1) notes.push("能力是一級");
    if (level === 2) notes.push("能力二級，要有三級的同事陪同");
    const pos = POSITIONS.find((p) => p.id === positionId)!;
    const occupied = schedule.filter((r) => r.date === primary.date && r.slot === primary.slot && r.position_id === positionId && r.pt_id !== primary.pt_id).length + 1;
    if (pos.max_headcount != null && occupied > pos.max_headcount) notes.push(`「${pos.name}」會有 ${occupied} 人（含備援），超過上限 ${pos.max_headcount} 人`);
    setManualRows((ms) => [
      ...ms.filter((m) => !(sameCell(m, primary) && m.priority === 2)).filter((m) => !(sameCell(m, primary) && m.priority === 1)),
      { date: primary.date, slot: primary.slot, position_id: primary.position_id, pt_id: primary.pt_id, priority: 1, source: "manual", kind: primary.source === "manual" ? primary.kind ?? "edited" : "pinned" },
      { date: primary.date, slot: primary.slot, position_id: positionId, pt_id: primary.pt_id, priority: 2, source: "manual", kind: "edited" },
    ]);
    applyLocal((rows) => [
      ...rows.filter((r) => !(sameCell(r, primary) && r.priority === 2)).map((r) => (sameCell(r, primary) && r.priority === 1 ? { ...r, source: "manual" as const } : r)),
      { date: primary.date, slot: primary.slot, position_id: positionId, position_name: pos.name, pt_id: primary.pt_id, pt_name: staffName(primary.pt_id), priority: 2, source: "manual", kind: "edited" },
    ]);
    showToast(
      `原型：${primary.pt_name} 加上「${pos.name}（備援）」並鎖定，主要任務「${primary.position_name}」一起鎖定。` +
        (notes.length ? ` 提醒：${notes.join("；")}（照樣保留）。` : ""),
    );
  };

  const toggleDone = (id: string) =>
    setDone((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return {
    monday,
    days,
    schedule,
    result,
    reminders,
    manualRows,
    pendingEdits,
    changedCells,
    generatedAt,
    toast,
    done,
    specialDatesSource: props.specialDatesSource,
    showToast,
    rerun,
    pin,
    unlock,
    movePrimary,
    setBackup,
    toggleDone,
    confirmDraft: () => showToast("原型：不會存檔（正式版這裡會把草稿確認成正式班表）。"),
  };
}

function findIn(rows: ScheduleRow[], row: ScheduleRow) {
  return rows.find(
    (r) => r.date === row.date && r.slot === row.slot && r.pt_id === row.pt_id && r.position_id === row.position_id && r.priority === row.priority,
  );
}

export type Draft = ReturnType<typeof useDraft>;
