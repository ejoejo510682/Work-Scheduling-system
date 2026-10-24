"use client";

// 版本 B「逐日清單」（第 2 輪，Cynthia 選了這個版面）：
//   左邊一天一張卡片往下排（每張卡片裡是各時段、各崗位）；
//   右邊提醒面板「照類別分」：上方類別按鈕（含數量），選一個類別只看那一類，左邊對到的人／格子用黃框標出、其他變淡；
//   每則提醒有「去看」（捲過去並閃一下）跟「已看過」勾選。
// 人名格子的顯示方式有三種（B1／B2／B3），用底部浮動列切換。

import { useState } from "react";
import { SLOTS } from "@/lib/constants";
import { ACTIVE_POSITIONS, CATEGORIES, positionName, targetMatches, type CategoryKey, type Reminder, type Target } from "./model";
import { ModeChip, ModeLegend, type CellMode } from "./chips";
import { DayMarks, PendingBanner, Toast, useModals } from "./ui";
import type { Draft } from "./useDraft";

export const VARIANT_B_NAME = "逐日清單";

const slotIdx = (slot: string) => SLOTS.indexOf(slot as (typeof SLOTS)[number]);
const anchorId = (date: string, slot?: string, positionId?: string) =>
  `b-${date}${slot ? `-${slotIdx(slot)}` : ""}${slot && positionId ? `-${positionId}` : ""}`;

// 一則提醒要捲到哪裡：最精確的那個位置
function anchorFor(t: Target) {
  if (!t.date) return null;
  return anchorId(t.date, t.slot, t.positionId);
}

export function VariantB({ draft, mode = "B1" }: { draft: Draft; mode?: CellMode }) {
  const { openTasks, openDates, modals } = useModals(draft);
  const [active, setActive] = useState<CategoryKey | "all">("all");
  const [flash, setFlash] = useState<Target | null>(null);

  const counts = new Map<CategoryKey, number>();
  for (const r of draft.reminders) counts.set(r.catKey, (counts.get(r.catKey) ?? 0) + 1);
  const shown = active === "all" ? draft.reminders : draft.reminders.filter((r) => r.catKey === active);
  const activeTargets: Target[] = active === "all" ? [] : shown.flatMap((r) => r.targets);
  const filtering = active !== "all";
  const todoLeft = draft.reminders.filter((r) => r.level === "要處理" && !draft.done.has(r.id)).length;

  // 要處理的提醒對到的格子（每個版本都顯示在格子旁邊；B3 另外整格框紅）
  const problemNotes = (date: string, slot: string, positionId: string) =>
    draft.reminders.filter(
      (r) => r.level === "要處理" && r.targets.some((t) => t.date === date && t.slot === slot && t.positionId === positionId),
    );

  const lineHit = (date: string, slot: string, positionId: string) =>
    activeTargets.some((t) => (t.slot || t.positionId) && !t.ptId && targetMatches(t, { date, slot, positionId }));
  const chipHit = (date: string, slot: string, positionId: string, ptId: string) =>
    activeTargets.some((t) => t.ptId && targetMatches(t, { date, slot, positionId, ptId }));
  const slotHit = (date: string, slot: string) => activeTargets.some((t) => t.date === date && t.slot === slot);
  const dayHit = (date: string) => activeTargets.some((t) => t.date === date && !t.slot && !t.positionId && !t.ptId);
  const flashOn = (date: string, slot?: string, positionId?: string) =>
    !!flash && flash.date === date && (flash.slot ?? undefined) === slot && (flash.positionId ?? undefined) === positionId;

  const goTo = (r: Reminder) => {
    const t = r.targets.find((x) => x.date) ?? null;
    if (!t) {
      // 沒有日期（例如沒登記可上班的人）：切到這個類別，讓左邊標出那個人
      setActive(r.catKey);
      return;
    }
    let id = anchorFor(t);
    // 那一格不存在（例如那個崗位當天沒人）就退一層到時段、再退到那一天
    if (id && !document.getElementById(id) && t.slot) id = anchorId(t.date!, t.slot);
    if (id && !document.getElementById(id)) id = anchorId(t.date!);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (active !== r.catKey && active !== "all") setActive(r.catKey);
    setFlash(t);
    window.setTimeout(() => setFlash((f) => (f === t ? null : f)), 2000);
  };

  const catButton = (key: CategoryKey | "all", label: string, n: number, level?: "要處理" | "參考") => {
    const on = active === key;
    const empty = n === 0;
    return (
      <button
        key={key}
        type="button"
        disabled={empty}
        onClick={() => setActive(key)}
        className={`rounded-full border px-2.5 py-1 text-xs ${
          on
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
            : empty
              ? "cursor-default border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
              : level === "要處理"
                ? "border-red-300 text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`}
      >
        {label} <b>{n}</b>
      </button>
    );
  };

  const activeCat = CATEGORIES.find((c) => c.key === active);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="order-2 space-y-3 lg:order-1">
        <PendingBanner draft={draft} />
        <ModeLegend mode={mode} />
        {draft.days.map((d) => {
          const rows = draft.schedule.filter((r) => r.date === d.date);
          const headerHit = dayHit(d.date);
          return (
            <section
              key={d.date}
              id={anchorId(d.date)}
              className={`rounded border bg-white dark:bg-zinc-900 ${flashOn(d.date) ? "border-amber-400 ring-4 ring-amber-400" : headerHit ? "border-amber-400 ring-2 ring-amber-400" : "border-zinc-200 dark:border-zinc-800"}`}
            >
              <header className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 dark:border-zinc-800 ${d.isHoliday ? "bg-zinc-100 dark:bg-zinc-950" : d.priority ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{d.label}</span>
                <DayMarks day={d} />
              </header>
              {d.staleHoliday && (
                <p className="bg-violet-50 px-3 py-1.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                  這天現在是國定假日，但草稿是用舊的假日資料排的，還有排班。按「重排整週」會清空。
                </p>
              )}
              {d.isHoliday && !d.staleHoliday ? (
                <p className="px-3 py-4 text-sm text-zinc-500">國定假日，不排班。</p>
              ) : (
                <div className={`divide-y divide-zinc-100 dark:divide-zinc-800 ${d.staleHoliday ? "opacity-60" : ""}`}>
                  {SLOTS.map((slot) => {
                    if (d.isSaturday && slot === "出貨完成後") return null;
                    const slotRows = rows.filter((r) => r.slot === slot);
                    const positions = ACTIVE_POSITIONS.filter(
                      (p) => slotRows.some((r) => r.position_id === p.id) || draft.reminders.some((r) => r.targets.some((t) => t.date === d.date && t.slot === slot && t.positionId === p.id)),
                    );
                    const changed = draft.changedCells.has(`${d.date}|${slot}`);
                    return (
                      <div
                        key={slot}
                        id={anchorId(d.date, slot)}
                        className={`grid gap-2 px-3 py-2 sm:grid-cols-[110px_1fr] ${slotHit(d.date, slot) ? "border-l-4 border-amber-400" : ""} ${flashOn(d.date, slot) ? "bg-amber-100 dark:bg-amber-950" : changed ? "bg-yellow-50 dark:bg-yellow-950/60" : ""}`}
                      >
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {slot}
                          {changed && <span className="ml-1 rounded bg-yellow-200 px-1 text-[10px] text-yellow-900 dark:bg-yellow-800 dark:text-yellow-100">重排後有變動</span>}
                        </div>
                        <div className="space-y-1">
                          {positions.length === 0 && <span className="text-xs text-zinc-400">—</span>}
                          {positions.map((p) => {
                            const people = slotRows.filter((r) => r.position_id === p.id).sort((a, b) => a.priority - b.priority);
                            const notes = problemNotes(d.date, slot, p.id);
                            const hit = lineHit(d.date, slot, p.id);
                            const anyChipHit = people.some((r) => chipHit(d.date, slot, p.id, r.pt_id));
                            const dimLine = filtering && !hit && !anyChipHit;
                            const problemBox = mode === "B3" && notes.length > 0;
                            return (
                              <div
                                key={p.id}
                                id={anchorId(d.date, slot, p.id)}
                                className={`flex flex-wrap items-center gap-1 rounded px-1 ${problemBox ? "ring-2 ring-red-500" : ""} ${hit ? "bg-amber-50 ring-2 ring-amber-400 dark:bg-amber-950/50" : ""} ${flashOn(d.date, slot, p.id) ? "bg-amber-200 dark:bg-amber-900" : ""} ${dimLine ? "opacity-30" : ""}`}
                              >
                                <span className="w-24 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">{positionName(p.id)}</span>
                                {people.map((r) => {
                                  const ch = chipHit(d.date, slot, p.id, r.pt_id);
                                  return <ModeChip key={`${r.pt_id}|${r.priority}`} row={r} draft={draft} mode={mode} highlight={ch} dim={filtering && !ch && !hit && anyChipHit} />;
                                })}
                                {notes.map((n) => (
                                  <span key={n.id} className="text-xs font-semibold text-red-700 dark:text-red-400">
                                    {n.catKey === "shortage" ? n.title.replace(/^.*?(缺 \d+ 人)$/, "$1") : n.catKey === "rule" ? n.title.replace(/^.*：/, "") : n.catKey === "task" ? "待指定" : n.category}
                                  </span>
                                ))}
                              </div>
                            );
                          })}
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

      {/* 右邊：提醒面板（照類別分；手機上在最上面） */}
      <aside className="order-1 lg:order-2">
        <div className="space-y-3 rounded border border-zinc-200 bg-white p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">草稿提醒</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{draft.generatedAt} 產生・要處理還剩 {todoLeft} 則</div>
            </div>
            <button type="button" onClick={draft.rerun} className="shrink-0 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
              重排整週
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">{catButton("all", "全部", draft.reminders.length)}</div>
            <div>
              <div className="mb-1 text-[11px] font-medium text-red-700 dark:text-red-400">要處理</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.filter((c) => c.level === "要處理").map((c) => catButton(c.key, c.label, counts.get(c.key) ?? 0, c.level))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">參考</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.filter((c) => c.level === "參考").map((c) => catButton(c.key, c.label, counts.get(c.key) ?? 0, c.level))}
              </div>
            </div>
          </div>

          {activeCat && (
            <div className={`rounded px-2 py-1.5 text-xs ${activeCat.level === "要處理" ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
              <b>{activeCat.label}：</b>
              {activeCat.hint}
            </div>
          )}

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {shown.map((r, i) => {
              const showHeader = active === "all" && (i === 0 || shown[i - 1].catKey !== r.catKey);
              return (
                <li key={r.id} className="py-1.5">
                  {showHeader && (
                    <div className={`mb-1 mt-2 text-[11px] font-semibold ${r.level === "要處理" ? "text-red-700 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                      {r.category}（{counts.get(r.catKey)}）
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={draft.done.has(r.id)} onChange={() => draft.toggleDone(r.id)} className="mt-1" title="已看過" />
                    <div className={`min-w-0 flex-1 text-xs ${draft.done.has(r.id) ? "text-zinc-400 line-through dark:text-zinc-600" : "text-zinc-900 dark:text-zinc-100"}`}>
                      {r.title}
                      {r.detail && <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{r.detail}</span>}
                    </div>
                    <button type="button" onClick={() => goTo(r)} className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                      去看
                    </button>
                  </div>
                </li>
              );
            })}
            {shown.length === 0 && <li className="py-2 text-xs text-zinc-500">這一類沒有提醒。</li>}
          </ul>

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
