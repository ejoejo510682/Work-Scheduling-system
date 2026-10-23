"use client";

// 版本 A「週總表」：一張大表（列＝時段 × 崗位、欄＝週一～週六），提醒變成格子裡的徽章，
// 上方一條摘要列放整週層級的提醒跟所有按鈕。

import { Fragment, useState } from "react";
import { cellKey, gridRows, positionName, type Reminder } from "./model";
import { DayMarks, Legend, PendingBanner, PersonChip, Toast, useModals } from "./ui";
import type { Draft } from "./useDraft";

export const VARIANT_A_NAME = "週總表";

export function VariantA({ draft }: { draft: Draft }) {
  const { openTasks, openDates, modals } = useModals(draft);
  const [showAll, setShowAll] = useState(false);
  const rows = gridRows(draft.schedule, draft.reminders);
  const todo = draft.reminders.filter((r) => r.level === "要處理");
  const info = draft.reminders.filter((r) => r.level === "參考");
  const weekLevel = draft.reminders.filter((r) => !r.date && r.level === "要處理");
  const byCell = new Map<string, Reminder[]>();
  for (const r of draft.reminders) {
    if (r.date && r.slot && r.positionId) {
      const k = cellKey(r.date, r.slot, r.positionId);
      byCell.set(k, [...(byCell.get(k) ?? []), r]);
    }
  }
  const dayLevel = (date: string) => draft.reminders.filter((r) => r.date === date && !(r.slot && r.positionId));
  const counts = (list: Reminder[]) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()];
  };

  return (
    <div className="mt-6 space-y-3">
      {/* 摘要列：整週層級的提醒＋所有按鈕 */}
      <div className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">自動排班草稿</span>
          <span className="text-xs text-zinc-500">（{draft.generatedAt} 產生）</span>
          <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          {counts(todo).map(([c, n]) => (
            <span key={c} className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              {c} {n}
            </span>
          ))}
          {counts(info).map(([c, n]) => (
            <span key={c} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {c} {n}
            </span>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={openTasks} className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              任務登記
            </button>
            <button type="button" onClick={openDates} className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              假日與檔期
            </button>
            <button type="button" onClick={draft.rerun} className="rounded bg-sky-600 px-3 py-1 text-sm font-medium text-white hover:bg-sky-500">
              重排整週
            </button>
            <button type="button" onClick={draft.confirmDraft} className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
              確認草稿
            </button>
          </div>
        </div>
        {weekLevel.length > 0 && (
          <ul className="mt-2 space-y-1">
            {weekLevel.map((r) => (
              <li
                key={r.id}
                className={`rounded px-2 py-1 text-sm ${r.category === "假日有變動" ? "bg-violet-50 text-violet-900 dark:bg-violet-950 dark:text-violet-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
              >
                <b>{r.title}</b>
                {r.detail && <span className="ml-1 text-xs">{r.detail}</span>}
                {r.category === "假日有變動" && (
                  <button type="button" onClick={draft.rerun} className="ml-2 rounded bg-violet-600 px-2 py-0.5 text-xs text-white">
                    重排整週
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 text-xs text-zinc-500 underline">
          {showAll ? "收起全部提醒" : `看全部提醒（${draft.reminders.length}）`}
        </button>
        {showAll && (
          <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto text-xs">
            {draft.reminders.map((r) => (
              <li key={r.id} className={r.level === "要處理" ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}>
                [{r.category}] {r.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PendingBanner draft={draft} />
      <Legend />

      {/* 週總表 */}
      <div className="overflow-x-auto rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-950">
              <th className="w-24 border-b border-zinc-200 p-2 text-left text-xs text-zinc-500 dark:border-zinc-800">時段</th>
              <th className="w-24 border-b border-zinc-200 p-2 text-left text-xs text-zinc-500 dark:border-zinc-800">崗位</th>
              {draft.days.map((d) => {
                const notes = dayLevel(d.date);
                return (
                  <th key={d.date} className={`border-b border-l border-zinc-200 p-2 text-left align-top dark:border-zinc-800 ${d.isHoliday ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}>
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{d.label}</div>
                    <div className="mt-1">
                      <DayMarks day={d} />
                    </div>
                    {notes.length > 0 && (
                      <div className="mt-1 text-[10px] font-normal text-zinc-500" title={notes.map((n) => n.title).join("\n")}>
                        這天另有 {notes.length} 則提醒（滑過看）
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const firstOfSlot = idx === 0 || rows[idx - 1].slot !== row.slot;
              const span = rows.filter((r) => r.slot === row.slot).length;
              return (
                <tr key={`${row.slot}|${row.positionId}`} className={firstOfSlot ? "border-t-2 border-zinc-300 dark:border-zinc-700" : ""}>
                  {firstOfSlot && (
                    <td rowSpan={span} className="border-b border-zinc-200 bg-zinc-50 p-2 align-top text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                      {row.slot}
                    </td>
                  )}
                  <td className="border-b border-zinc-200 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">{positionName(row.positionId)}</td>
                  {draft.days.map((d) => {
                    if (d.isHoliday && !d.staleHoliday)
                      return (
                        <td key={d.date} className="border-b border-l border-zinc-200 bg-zinc-100 p-1 text-center text-[10px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                          {firstOfSlot ? "不排班" : ""}
                        </td>
                      );
                    const people = draft.schedule
                      .filter((r) => r.date === d.date && r.slot === row.slot && r.position_id === row.positionId)
                      .sort((a, b) => a.priority - b.priority);
                    const notes = byCell.get(cellKey(d.date, row.slot, row.positionId)) ?? [];
                    const changed = draft.changedCells.has(`${d.date}|${row.slot}`);
                    return (
                      <td
                        key={d.date}
                        className={`border-b border-l border-zinc-200 p-1 align-top dark:border-zinc-800 ${d.staleHoliday ? "opacity-50" : ""} ${changed ? "bg-yellow-50 ring-2 ring-inset ring-yellow-400 dark:bg-yellow-950" : ""} ${notes.some((n) => n.level === "要處理") ? "bg-red-50/50 dark:bg-red-950/30" : ""}`}
                      >
                        {people.map((p) => (
                          <PersonChip key={`${p.pt_id}|${p.priority}`} row={p} draft={draft} />
                        ))}
                        {notes.map((n) => (
                          <Fragment key={n.id}>
                            <span
                              title={n.title + (n.detail ? `（${n.detail}）` : "")}
                              className={`m-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${n.category === "任務待指定" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"}`}
                            >
                              {n.category === "人手不足" ? `缺 ${n.title.match(/缺 (\d+) 人/)?.[1] ?? "?"} 人` : n.category === "任務待指定" ? `待指定 ${n.title.match(/安排 (\d+) 人/)?.[1] ?? ""} 人` : n.category}
                            </span>
                          </Fragment>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modals}
      <Toast text={draft.toast} />
    </div>
  );
}
