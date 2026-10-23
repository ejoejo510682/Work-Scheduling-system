"use client";

// 版本 C「先看提醒」：一打開先看到待辦清單（要處理／參考），每則有「去處理」打開那一天的小表格，
// 在小表格裡直接鎖定、改崗位、加備援；整週總表收在最下面，需要時才展開。

import { useState } from "react";
import { SLOTS } from "@/lib/constants";
import { ACTIVE_POSITIONS, positionName, type DayInfo, type Reminder } from "./model";
import { DayMarks, Legend, Modal, PendingBanner, PersonChip, Toast, useModals } from "./ui";
import type { Draft } from "./useDraft";

export const VARIANT_C_NAME = "先看提醒";

function DayGrid({ draft, day, focus }: { draft: Draft; day: DayInfo; focus?: Reminder }) {
  if (day.isHoliday && !day.staleHoliday) return <p className="text-sm text-zinc-500">國定假日，不排班。</p>;
  const rows = draft.schedule.filter((r) => r.date === day.date);
  const positions = ACTIVE_POSITIONS.filter((p) => rows.some((r) => r.position_id === p.id) || (focus?.positionId === p.id && focus.date === day.date));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-1 text-left text-xs text-zinc-500">時段</th>
            {positions.map((p) => (
              <th key={p.id} className="border-l border-zinc-200 p-1 text-left text-xs text-zinc-500 dark:border-zinc-800">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((slot) => (
            <tr key={slot} className={`border-t border-zinc-200 dark:border-zinc-800 ${draft.changedCells.has(`${day.date}|${slot}`) ? "bg-yellow-50 dark:bg-yellow-950" : ""}`}>
              <td className="p-1 text-xs text-zinc-500">{slot}</td>
              {positions.map((p) => {
                const people = rows.filter((r) => r.slot === slot && r.position_id === p.id).sort((a, b) => a.priority - b.priority);
                const isFocus = focus && focus.slot === slot && focus.positionId === p.id;
                const notes = draft.reminders.filter((r) => r.date === day.date && r.slot === slot && r.positionId === p.id && r.level === "要處理");
                return (
                  <td key={p.id} className={`border-l border-zinc-200 p-1 align-top dark:border-zinc-800 ${isFocus ? "bg-red-50 ring-2 ring-inset ring-red-400 dark:bg-red-950" : ""}`}>
                    {people.map((r) => (
                      <PersonChip key={`${r.pt_id}|${r.priority}`} row={r} draft={draft} compact />
                    ))}
                    {notes.map((n) => (
                      <span key={n.id} className="ml-1 text-[10px] font-medium text-red-600 dark:text-red-400">{n.category === "人手不足" ? "缺人" : n.category}</span>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VariantC({ draft }: { draft: Draft }) {
  const { openTasks, openDates, modals } = useModals(draft);
  const [open, setOpen] = useState<Reminder | null>(null);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showWeek, setShowWeek] = useState(false);
  const todo = draft.reminders.filter((r) => r.level === "要處理");
  const info = draft.reminders.filter((r) => r.level === "參考");
  const doneCount = todo.filter((r) => draft.done.has(r.id)).length;
  const groups = [...new Set(todo.map((r) => r.category))];
  const dayOf = (date?: string | null) => draft.days.find((d) => d.date === date);

  const panelDay = open ? dayOf(open.date ?? pickDay) : undefined;

  return (
    <div className="mt-6 space-y-4">
      {/* 狀態列 */}
      <div className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-base font-bold text-zinc-900 dark:text-zinc-50">這週草稿還有 {todo.length - doneCount} 件要處理</div>
            <div className="text-xs text-zinc-500">{draft.generatedAt} 產生・已處理 {doneCount}／{todo.length}・參考 {info.length} 則</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={draft.rerun} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
              重排整週
            </button>
            <button
              type="button"
              onClick={draft.confirmDraft}
              className={`rounded px-3 py-1.5 text-sm font-medium ${doneCount === todo.length ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}
              title={doneCount === todo.length ? "" : "還有要處理的提醒，仍然可以確認"}
            >
              確認草稿
            </button>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full bg-emerald-500" style={{ width: `${todo.length ? (doneCount / todo.length) * 100 : 100}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft.days.map((d) => (
            <button key={d.date} type="button" onClick={() => { setPickDay(d.date); setOpen({ id: `day-${d.date}`, level: "參考", category: "整天", title: `${d.label} 整天班表`, date: d.date }); }} className="rounded border border-zinc-200 px-2 py-1 text-left text-xs hover:border-zinc-400 dark:border-zinc-700">
              <div className="font-medium">{d.label}</div>
              <DayMarks day={d} vertical />
            </button>
          ))}
        </div>
      </div>

      <PendingBanner draft={draft} />
      <Legend />

      {/* 要處理 */}
      <div className="space-y-3">
        {groups.map((g) => (
          <section key={g} className="rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className={`border-b px-3 py-2 text-sm font-medium dark:border-zinc-800 ${g === "假日有變動" ? "text-violet-800 dark:text-violet-300" : "text-red-700 dark:text-red-400"}`}>
              {g}（{todo.filter((r) => r.category === g).length}）
            </h3>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {todo.filter((r) => r.category === g).map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${draft.done.has(r.id) ? "opacity-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${draft.done.has(r.id) ? "line-through" : "text-zinc-900 dark:text-zinc-100"}`}>{r.title}</div>
                    {r.detail && <div className="text-xs text-zinc-500">{r.detail}</div>}
                  </div>
                  <button type="button" onClick={() => { setPickDay(null); setOpen(r); }} className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                    去處理
                  </button>
                  <button type="button" onClick={() => draft.toggleDone(r.id)} className="rounded border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700">
                    {draft.done.has(r.id) ? "取消" : "標記已處理"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {todo.length === 0 && <p className="text-sm text-zinc-500">沒有要處理的提醒。</p>}
      </div>

      {/* 參考 */}
      <section className="rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <button type="button" onClick={() => setShowInfo((s) => !s)} className="w-full px-3 py-2 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
          參考（{info.length}）{showInfo ? "▲" : "▼"}
          <span className="ml-2 text-xs font-normal text-zinc-500">出貨優先日、沒登記可上班、人力過剩、提示…</span>
        </button>
        {showInfo && (
          <ul className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {info.map((r) => (
              <li key={r.id} className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mr-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">{r.category}</span>
                {r.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openTasks} className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          任務登記
        </button>
        <button type="button" onClick={openDates} className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          假日與檔期
        </button>
      </div>

      {/* 整週總表（收起來） */}
      <section className="rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <button type="button" onClick={() => setShowWeek((s) => !s)} className="w-full px-3 py-2 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
          整週總表 {showWeek ? "▲ 收起" : "▼ 展開"}
        </button>
        {showWeek && (
          <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <Legend />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="p-1 text-left text-zinc-500">時段</th>
                    {draft.days.map((d) => (
                      <th key={d.date} className="border-l border-zinc-200 p-1 text-left align-top dark:border-zinc-800">
                        {d.label}
                        <DayMarks day={d} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((slot) => (
                    <tr key={slot} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="p-1 align-top text-zinc-500">{slot}</td>
                      {draft.days.map((d) => (
                        <td key={d.date} className={`border-l border-zinc-200 p-1 align-top dark:border-zinc-800 ${d.isHoliday ? (d.staleHoliday ? "opacity-50" : "bg-zinc-100 dark:bg-zinc-950") : ""} ${draft.changedCells.has(`${d.date}|${slot}`) ? "ring-2 ring-inset ring-yellow-400" : ""}`}>
                          {ACTIVE_POSITIONS.map((p) => {
                            const people = draft.schedule.filter((r) => r.date === d.date && r.slot === slot && r.position_id === p.id);
                            if (!people.length) return null;
                            return (
                              <div key={p.id}>
                                <span className="text-zinc-500">{positionName(p.id)}：</span>
                                {people.map((r) => (
                                  <PersonChip key={`${r.pt_id}|${r.priority}`} row={r} draft={draft} compact />
                                ))}
                              </div>
                            );
                          })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 去處理：那一天的小表格 */}
      {open && (
        <Modal title={open.date || pickDay ? `${panelDay?.label ?? ""} 去處理` : open.title} onClose={() => setOpen(null)}>
          <div className="mb-3 rounded bg-zinc-50 p-2 text-sm dark:bg-zinc-950">
            <div className="font-medium text-zinc-900 dark:text-zinc-50">{open.title}</div>
            {open.detail && <div className="text-xs text-zinc-500">{open.detail}</div>}
          </div>
          {open.category === "假日有變動" ? (
            <div className="space-y-2 text-sm">
              <p>草稿是用舊的假日資料排的。下面標「假日有變動」的日子會不一樣：</p>
              <ul className="space-y-1">
                {draft.days.filter((d) => d.changed).map((d) => (
                  <li key={d.date} className="flex items-center gap-2">
                    <span className="w-20">{d.label}</span>
                    <DayMarks day={d} />
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => { draft.rerun(); setOpen(null); }} className="rounded bg-violet-600 px-3 py-1 text-sm font-medium text-white">
                重排整週（套用新的假日）
              </button>
            </div>
          ) : open.category === "正職第三天" ? (
            <div className="space-y-2 text-sm">
              <p>選一天讓王瀞玉印單：點那天印訂單的人 → 改去別的崗位，或把王瀞玉改去印訂單。</p>
              <div className="flex flex-wrap gap-2">
                {draft.days.slice(1, 5).filter((d) => !d.isHoliday).map((d) => (
                  <button key={d.date} type="button" onClick={() => setPickDay(d.date)} className={`rounded border px-2 py-1 text-xs ${pickDay === d.date ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-700"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              {pickDay && dayOf(pickDay) && <DayGrid draft={draft} day={dayOf(pickDay)!} />}
            </div>
          ) : panelDay ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <DayMarks day={panelDay} />
              </div>
              <DayGrid draft={draft} day={panelDay} focus={open} />
              <p className="mt-2 text-xs text-zinc-500">點人名可以鎖定、改崗位、加備援；改完記得「重排整週」讓系統重新組合其他格子。</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">這則提醒沒有對應到某一天，請到「任務登記」或「假日與檔期」處理。</p>
          )}
          {open.level === "要處理" && (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => { draft.toggleDone(open.id); setOpen(null); }} className="rounded border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
                {draft.done.has(open.id) ? "取消已處理" : "標記已處理並關閉"}
              </button>
            </div>
          )}
        </Modal>
      )}
      {modals}
      <Toast text={draft.toast} />
    </div>
  );
}
