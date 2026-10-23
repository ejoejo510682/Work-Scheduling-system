"use client";

// 票3 原型：三個版本共用的小元件（人名小卡＋操作選單、日期標記、圖例、任務登記、假日與檔期、提示訊息）

import { useState } from "react";
import { SLOTS } from "@/lib/constants";
import { formatDateLabel } from "@/lib/date";
import { ACTIVE_POSITIONS, SLOT_MAP, STAFF, TASK_POSITION_IDS, backupOptions, positionName, staffName, weekDays, type DayInfo, type ScheduleRow } from "./model";
import { TASK_TEMPLATES, taskRequestsFor } from "./fixture";
import { addDays } from "@/lib/date";
import type { Draft } from "./useDraft";

// ---------------------------------------------------------------- 人名小卡

export function chipStyle(r: ScheduleRow) {
  if (r.task) return "border border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
  if (r.source === "manual" && r.kind === "pinned")
    return `border-2 border-zinc-700 bg-white text-zinc-900 dark:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-50 ${r.priority === 2 ? "border-dashed" : ""}`;
  if (r.source === "manual")
    return `border-2 border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-100 ${r.priority === 2 ? "border-dashed" : ""}`;
  if (r.priority === 2) return "border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  return "border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
}

export function chipTags(r: ScheduleRow) {
  const tags: string[] = [];
  if (r.priority === 2) tags.push("備");
  if (r.task) tags.push(r.substituteFor ? `代${staffName(r.substituteFor).slice(-2)}` : "任務");
  if (r.source === "manual") tags.push(r.kind === "pinned" ? "鎖" : "改");
  return tags;
}

export function PersonChip({ row, draft, compact }: { row: ScheduleRow; draft: Draft; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const tags = chipTags(row);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`m-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${chipStyle(row)} hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600`}
        title="點一下：鎖定／改崗位／加備援"
      >
        {row.pt_name}
        {!compact &&
          tags.map((t) => (
            <span key={t} className="rounded bg-black/5 px-1 text-[10px] font-medium dark:bg-white/10">
              {t}
            </span>
          ))}
      </button>
      {open && <ChipMenu row={row} draft={draft} onClose={() => setOpen(false)} />}
    </span>
  );
}

function ChipMenu({ row, draft, onClose }: { row: ScheduleRow; draft: Draft; onClose: () => void }) {
  const [mode, setMode] = useState<"menu" | "move" | "backup">("menu");
  const isTask = !!row.task;
  const movable = ACTIVE_POSITIONS.filter((p) => p.id !== row.position_id && SLOT_MAP.some((m) => m.position_id === p.id && m.slot === row.slot));
  const backups = backupOptions(row.slot, row.position_id);
  const close = () => {
    setMode("menu");
    onClose();
  };
  const btn = "block w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <>
      <span className="fixed inset-0 z-30" onClick={close} />
      <span className="absolute left-0 top-full z-40 mt-1 block w-56 rounded border border-zinc-200 bg-white p-2 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <span className="mb-1 block text-xs font-medium text-zinc-900 dark:text-zinc-50">
          {row.pt_name}・{formatDateLabel(row.date)} {row.slot}
        </span>
        <span className="mb-2 block text-[11px] text-zinc-500 dark:text-zinc-400">
          {row.position_name}
          {row.priority === 2 ? "（備援）" : "（主要）"}・
          {isTask ? "任務（在「任務登記」管理）" : row.source === "manual" ? (row.kind === "pinned" ? "已鎖定（照系統排的）" : "手動改過（已鎖定）") : "系統排的"}
        </span>
        {isTask ? null : mode === "menu" ? (
          <>
            {row.source === "manual" ? (
              <button type="button" className={btn} onClick={() => { draft.unlock(row); close(); }}>
                解除鎖定（重排時讓系統決定）
              </button>
            ) : (
              <button type="button" className={btn} onClick={() => { draft.pin(row); close(); }}>
                鎖定這一格（重排時不動）
              </button>
            )}
            {row.priority === 1 && (
              <>
                <button type="button" className={btn} onClick={() => setMode("move")}>
                  改去別的崗位（主要）…
                </button>
                <button type="button" className={btn} onClick={() => setMode("backup")}>
                  加／改備援…
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <span className="mb-1 block text-[11px] text-zinc-500">
              {mode === "move" ? "改去哪個崗位（這個時段有開的）" : "做完主要任務後去支援哪個崗位（這個時段有開的）"}
            </span>
            {(mode === "move" ? movable : backups).map((p) => (
              <button
                key={p.id}
                type="button"
                className={btn}
                onClick={() => {
                  if (mode === "move") draft.movePrimary(row, p.id);
                  else draft.setBackup(row, p.id);
                  close();
                }}
              >
                {p.name}
                {TASK_POSITION_IDS.includes(p.id) ? "（任務型）" : ""}
              </button>
            ))}
            <button type="button" className={`${btn} text-zinc-500`} onClick={() => setMode("menu")}>
              ← 返回
            </button>
          </>
        )}
      </span>
    </>
  );
}

// ---------------------------------------------------------------- 日期標記

export function DayMarks({ day, vertical }: { day: DayInfo; vertical?: boolean }) {
  const badges: { text: string; cls: string; title?: string }[] = [];
  for (const n of day.holidayNames) {
    badges.push({
      text: n.includes("颱風") ? `${n}（臨時停班）` : n,
      cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    });
  }
  if (day.isHoliday) badges.push({ text: "不排班", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" });
  if (day.priority)
    badges.push({ text: `出貨優先日・${day.priorityShort}`, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300", title: day.priorityReason ?? undefined });
  if (day.staleHoliday) badges.push({ text: "草稿裡還有排班，重排後清空", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" });
  if (day.changed) badges.push({ text: "假日有變動", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" });
  if (badges.length === 0) return null;
  return (
    <span className={`flex ${vertical ? "flex-col items-start" : "flex-wrap"} gap-1`}>
      {badges.map((b) => (
        <span key={b.text} title={b.title} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}>
          {b.text}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- 圖例

export function Legend() {
  const sample = (cls: string, text: string, tag?: string) => (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${cls}`}>
      {text}
      {tag && <span className="rounded bg-black/5 px-1 text-[10px] dark:bg-white/10">{tag}</span>}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
      <span className="font-medium">圖例：</span>
      {sample("border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200", "系統排的")}
      {sample("border-2 border-zinc-700 bg-white text-zinc-900 dark:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-50", "鎖定", "鎖")}
      {sample("border-2 border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-100", "手動改過", "改")}
      {sample("border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400", "備援", "備")}
      {sample("border-2 border-dashed border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-100", "手動備援", "備・改")}
      {sample("border border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200", "任務", "任務")}
      <span className="rounded bg-yellow-100 px-1.5 py-0.5 ring-2 ring-yellow-400 dark:bg-yellow-950">重排後有變動</span>
      <span className="text-zinc-500">點人名可以鎖定、改崗位、加備援</span>
    </div>
  );
}

// ---------------------------------------------------------------- 提示訊息

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="fixed right-4 top-4 z-50 max-w-sm rounded border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      {text}
    </div>
  );
}

export function PendingBanner({ draft }: { draft: Draft }) {
  if (!draft.pendingEdits) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
      已手動調整 {draft.pendingEdits} 次，其他格子還沒重新組合。
      <button type="button" onClick={draft.rerun} className="rounded bg-sky-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-sky-500">
        重排整週
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- 任務登記（本週任務／固定任務）

const inputCls = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-8 w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            關閉
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TaskModal({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [tab, setTab] = useState<"once" | "weekly">("once");
  const days = weekDays(draft.monday).slice(0, 5);
  const taskPositions = ACTIVE_POSITIONS.filter((p) => TASK_POSITION_IDS.includes(p.id));
  const requests = taskRequestsFor(draft.monday, addDays);
  const tabBtn = (k: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`rounded-t border-b-2 px-3 py-1.5 text-sm ${tab === k ? "border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-50" : "border-transparent text-zinc-500"}`}
    >
      {label}
    </button>
  );
  const peoplePicker = (
    <div className="flex flex-wrap gap-2">
      {STAFF.map((s) => (
        <label key={s.id} className="flex items-center gap-1 text-xs">
          <input type="checkbox" /> {s.name}
        </label>
      ))}
    </div>
  );
  return (
    <Modal title="任務登記（處理批發訂單、處理退貨、盤點）" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        任務每天最後才排：出貨、處理進貨都排完後才放進去。本週任務沒指定人的位子，系統不會自己挑人，會在草稿提醒裡請你手動指定。
      </p>
      <div className="mb-3 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {tabBtn("once", "本週任務（單次）")}
        {tabBtn("weekly", "固定任務（每週重複）")}
      </div>
      {tab === "once" ? (
        <div className="space-y-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="py-1">日期</th><th>時段</th><th>崗位</th><th>人數</th><th>指定人員</th><th>草稿結果</th></tr>
            </thead>
            <tbody>
              {requests.map((r, i) => {
                const placed = draft.schedule.filter((x) => x.task === "本週任務" && x.date === r.date && x.slot === r.slot && x.position_id === r.position_id);
                return (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1">{formatDateLabel(r.date)}</td>
                    <td>{r.slot}</td>
                    <td>{positionName(r.position_id)}</td>
                    <td>{r.headcount}</td>
                    <td>{r.pt_id ? staffName(r.pt_id) : <span className="text-amber-700 dark:text-amber-400">（沒指定）</span>}</td>
                    <td className="text-xs">{placed.length ? `已排：${placed.map((x) => x.pt_name).join("、")}` : ""}{placed.length < r.headcount ? `${placed.length ? "；" : ""}還要手動指定 ${r.headcount - placed.length} 人` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="grid gap-3 rounded border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-800">
            <label className="text-xs">日期<select className={inputCls}>{days.map((d) => <option key={d}>{formatDateLabel(d)}</option>)}</select></label>
            <label className="text-xs">時段<select className={inputCls}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-xs">崗位<select className={inputCls}>{taskPositions.map((p) => <option key={p.id}>{p.name}</option>)}</select></label>
            <label className="text-xs">人數<input type="number" min={1} defaultValue={1} className={inputCls} /></label>
            <div className="text-xs sm:col-span-2">指定人員（可不選，不選就留給你手動指定）{peoplePicker}</div>
            <div className="sm:col-span-2">
              <button type="button" onClick={() => draft.showToast("原型：不會存檔（新增本週任務）。")} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                新增本週任務
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="py-1">崗位</th><th>時段</th><th>星期</th><th>指定人員</th><th>請假時代班</th></tr>
            </thead>
            <tbody>
              {groupTemplates().map((t) => (
                <tr key={t.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1">{positionName(t.position_id)}</td>
                  <td>{t.slot}</td>
                  <td>週一～週五</td>
                  <td>{t.people.join("、")}</td>
                  <td>{t.substitute ?? <span className="text-zinc-400">無（留空並提醒）</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-zinc-500">指定人員那個時段已經有別的主要工作（例如印單）就不排他、也不找代班；請假才找代班。</p>
          <div className="grid gap-3 rounded border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-800">
            <label className="text-xs">崗位<select className={inputCls}>{taskPositions.map((p) => <option key={p.id}>{p.name}</option>)}</select></label>
            <label className="text-xs">時段<select className={inputCls}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <div className="text-xs sm:col-span-2">
              星期
              <div className="flex gap-2">{["一", "二", "三", "四", "五"].map((d) => <label key={d} className="flex items-center gap-1"><input type="checkbox" defaultChecked /> 週{d}</label>)}</div>
            </div>
            <div className="text-xs sm:col-span-2">指定人員{peoplePicker}</div>
            <label className="text-xs">請假時代班（可留空）<select className={inputCls}><option>（無）</option>{STAFF.map((s) => <option key={s.id}>{s.name}</option>)}</select></label>
            <div className="sm:col-span-2">
              <button type="button" onClick={() => draft.showToast("原型：不會存檔（新增固定任務）。")} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                新增固定任務
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function groupTemplates() {
  const map = new Map<string, { key: string; position_id: string; slot: string; people: string[]; substitute: string | null }>();
  for (const t of TASK_TEMPLATES) {
    const key = `${t.position_id}|${t.slot}`;
    const g = map.get(key) ?? { key, position_id: t.position_id, slot: t.slot, people: [], substitute: t.substitute_pt_id ? staffName(t.substitute_pt_id) : null };
    g.people.push(staffName(t.pt_id));
    map.set(key, g);
  }
  return [...map.values()];
}

// ---------------------------------------------------------------- 假日與檔期（靜態示意）

export const SPECIAL_TYPES_FUTURE = [
  { type: "國定假日", note: "不排班；連假（含週末）1～3 天後第 1 個、4 天以上後第 1、2 個上班平日是出貨優先日" },
  { type: "電商檔期", note: "出貨優先日；落在週六、週日、國定假日就順延到下一個上班平日" },
  { type: "出貨優先日", note: "手動設定（例如臨時大量訂單），撿貨、包裝、無包裝出貨、出箱貨 +1" },
  { type: "颱風假（臨時停班）", note: "跟國定假日一樣不排班、算進連假；通常是臨時登記，登記後已產生的草稿會提醒「假日有變動，請重排」" },
];

export function SpecialDatesModal({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const days = weekDays(draft.monday);
  return (
    <Modal title="假日與檔期（示意）" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        類型選項會變成下面四種。這裡是靜態示意，不會存檔。特殊日期資料來源：{draft.specialDatesSource}。
      </p>
      <ul className="mb-4 space-y-1 text-sm">
        {SPECIAL_TYPES_FUTURE.map((t) => (
          <li key={t.type}>
            <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium dark:bg-zinc-800">{t.type}</span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{t.note}</span>
          </li>
        ))}
      </ul>
      <div className="mb-4 grid gap-3 rounded border border-zinc-200 p-3 sm:grid-cols-4 dark:border-zinc-800">
        <label className="text-xs">日期<input type="date" defaultValue={days[2]} className={inputCls} /></label>
        <label className="text-xs">類型<select className={inputCls}>{SPECIAL_TYPES_FUTURE.map((t) => <option key={t.type}>{t.type}</option>)}</select></label>
        <label className="text-xs sm:col-span-2">名稱<input defaultValue="颱風假" className={inputCls} /></label>
        <div className="sm:col-span-4">
          <button type="button" onClick={() => draft.showToast("原型：不會存檔（新增特殊日期）。正式版存了之後，這週草稿會跳「假日有變動，請重排」。")} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
            新增
          </button>
        </div>
      </div>
      <div className="text-xs text-zinc-500">這週各天：</div>
      <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
        {draft.days.map((d) => (
          <li key={d.date} className="flex items-center gap-2">
            <span className="w-20">{d.label}</span>
            <DayMarks day={d} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// 共用的「功能按鈕」，各版本自己決定放哪裡
export function useModals(draft: Draft) {
  const [which, setWhich] = useState<"task" | "dates" | null>(null);
  return {
    openTasks: () => setWhich("task"),
    openDates: () => setWhich("dates"),
    modals: (
      <>
        {which === "task" && <TaskModal draft={draft} onClose={() => setWhich(null)} />}
        {which === "dates" && <SpecialDatesModal draft={draft} onClose={() => setWhich(null)} />}
      </>
    ),
  };
}

export const dayRows = (draft: Draft, date: string) => draft.schedule.filter((r) => r.date === date);
