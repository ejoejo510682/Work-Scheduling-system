"use client";

// 版本 B「逐日清單」：左邊一天一張卡片往下排（每張卡片裡是各時段），右邊固定一欄提醒清單，
// 可以勾「已看過」，點一則提醒會捲到那一格並閃一下。重排整週放在提醒清單最上面。

import { useState } from "react";
import { SLOTS } from "@/lib/constants";
import { ACTIVE_POSITIONS, positionName, type Reminder } from "./model";
import { DayMarks, Legend, PendingBanner, PersonChip, Toast, useModals } from "./ui";
import type { Draft } from "./useDraft";

export const VARIANT_B_NAME = "逐日清單";

const anchorId = (date: string, slot?: string) => `b-${date}${slot ? `-${SLOTS.indexOf(slot as (typeof SLOTS)[number])}` : ""}`;

export function VariantB({ draft }: { draft: Draft }) {
  const { openTasks, openDates, modals } = useModals(draft);
  const [flash, setFlash] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const todo = draft.reminders.filter((r) => r.level === "要處理");
  const info = draft.reminders.filter((r) => r.level === "參考");
  const remaining = todo.filter((r) => !draft.done.has(r.id)).length;

  const jump = (r: Reminder) => {
    if (!r.date) return;
    const id = anchorId(r.date, r.slot);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1800);
  };

  const item = (r: Reminder) => (
    <li key={r.id} className="flex items-start gap-2 py-1">
      <input type="checkbox" checked={draft.done.has(r.id)} onChange={() => draft.toggleDone(r.id)} className="mt-1" title="已看過" />
      <button
        type="button"
        onClick={() => jump(r)}
        className={`flex-1 text-left text-xs ${draft.done.has(r.id) ? "text-zinc-400 line-through" : r.level === "要處理" ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"} ${r.date ? "hover:underline" : "cursor-default"}`}
      >
        <span className={`mr-1 rounded px-1 text-[10px] ${r.category === "假日有變動" ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" : r.level === "要處理" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
          {r.category}
        </span>
        {r.title}
        {r.detail && <span className="block text-[11px] text-zinc-500">{r.detail}</span>}
      </button>
    </li>
  );

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="order-2 space-y-3 lg:order-1">
        <PendingBanner draft={draft} />
        <Legend />
        {draft.days.map((d) => {
          const rows = draft.schedule.filter((r) => r.date === d.date);
          const dayNotes = draft.reminders.filter((r) => r.date === d.date);
          return (
            <section key={d.date} id={anchorId(d.date)} className={`rounded border bg-white dark:bg-zinc-900 ${flash === anchorId(d.date) ? "border-yellow-400 ring-2 ring-yellow-400" : "border-zinc-200 dark:border-zinc-800"}`}>
              <header className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 dark:border-zinc-800 ${d.isHoliday ? "bg-zinc-100 dark:bg-zinc-950" : d.priority ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{d.label}</span>
                <DayMarks day={d} />
                {dayNotes.length > 0 && (
                  <span className="ml-auto text-xs text-zinc-500">
                    提醒 {dayNotes.filter((n) => n.level === "要處理").length} 要處理／{dayNotes.filter((n) => n.level === "參考").length} 參考
                  </span>
                )}
              </header>
              {d.staleHoliday && (
                <p className="bg-violet-50 px-3 py-1.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-300">這天現在是國定假日，但草稿是用舊的假日資料排的，還有排班。按「重排整週」會清空。</p>
              )}
              {d.isHoliday && !d.staleHoliday ? (
                <p className="px-3 py-4 text-sm text-zinc-500">國定假日，不排班。</p>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {SLOTS.map((slot) => {
                    const slotRows = rows.filter((r) => r.slot === slot);
                    if (d.isSaturday && slot === "出貨完成後") return null;
                    const notes = draft.reminders.filter((r) => r.date === d.date && r.slot === slot && r.level === "要處理");
                    const id = anchorId(d.date, slot);
                    const changed = draft.changedCells.has(`${d.date}|${slot}`);
                    const positions = ACTIVE_POSITIONS.filter((p) => slotRows.some((r) => r.position_id === p.id) || notes.some((n) => n.positionId === p.id));
                    return (
                      <div
                        key={slot}
                        id={id}
                        className={`grid gap-2 px-3 py-2 sm:grid-cols-[110px_1fr] ${flash === id ? "bg-yellow-100 dark:bg-yellow-950" : changed ? "bg-yellow-50 ring-2 ring-inset ring-yellow-400 dark:bg-yellow-950" : ""}`}
                      >
                        <div className="text-xs font-medium text-zinc-500">{slot}</div>
                        <div className="space-y-1">
                          {positions.length === 0 && <span className="text-xs text-zinc-400">—</span>}
                          {positions.map((p) => {
                            const people = slotRows.filter((r) => r.position_id === p.id).sort((a, b) => a.priority - b.priority);
                            const pn = notes.filter((n) => n.positionId === p.id);
                            return (
                              <div key={p.id} className="flex flex-wrap items-center gap-1">
                                <span className="w-20 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">{positionName(p.id)}</span>
                                {people.map((r) => (
                                  <PersonChip key={`${r.pt_id}|${r.priority}`} row={r} draft={draft} />
                                ))}
                                {pn.map((n) => (
                                  <span key={n.id} className="text-xs font-medium text-red-600 dark:text-red-400">
                                    ← {n.category === "人手不足" ? n.title.replace(/^.*?(缺 \d+ 人)$/, "$1") : n.title.replace(/^.*」/, "")}
                                  </span>
                                ))}
                              </div>
                            );
                          })}
                          {notes.filter((n) => !n.positionId).map((n) => (
                            <div key={n.id} className="text-xs text-red-600 dark:text-red-400">{n.title}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* 右邊：提醒清單（手機上在最上面） */}
      <aside className="order-1 lg:order-2">
        <div className="space-y-3 rounded border border-zinc-200 bg-white p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">草稿提醒</div>
            <div className="text-xs text-zinc-500">{draft.generatedAt} 產生・要處理還剩 {remaining} 則</div>
          </div>
          <button type="button" onClick={draft.rerun} className="w-full rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
            重排整週（鎖定的格子不動）
          </button>
          <div>
            <div className="text-xs font-medium text-red-700 dark:text-red-400">要處理（{todo.length}）</div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{todo.map(item)}</ul>
          </div>
          <div>
            <button type="button" onClick={() => setShowInfo((s) => !s)} className="text-xs font-medium text-zinc-600 underline dark:text-zinc-400">
              參考（{info.length}）{showInfo ? "收起" : "展開"}
            </button>
            {showInfo && <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{info.map(item)}</ul>}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button type="button" onClick={openTasks} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              任務登記
            </button>
            <button type="button" onClick={openDates} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              假日與檔期
            </button>
            <button type="button" onClick={draft.confirmDraft} className="ml-auto rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              確認草稿
            </button>
          </div>
        </div>
      </aside>
      {modals}
      <Toast text={draft.toast} />
    </div>
  );
}

