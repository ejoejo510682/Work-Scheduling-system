"use client";

// 週排班表 B3 版面（GitHub issue #5 結論）：左邊逐日清單、格子只標例外；右邊分類的草稿提醒＋重排整週
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SLOTS, type EmploymentType } from "@/lib/constants";
import { CATEGORIES, targetMatches, type CategoryKey, type Reminder, type Target } from "@/lib/autoSchedule/reminderCategories";

type DayInfo = {
  date: string;
  label: string;
  isSaturday: boolean;
  holidayNames: string[];
  closed: boolean;
  priority: boolean;
  priorityShort: string | null;
  changed: boolean;
  campaign: string | null;
};
type Row = {
  id: string;
  date: string;
  slot: string;
  position_id: string;
  pt_id: string;
  priority: 1 | 2;
  source: "auto" | "manual" | "locked";
};
type Position = { id: string; name: string; group: string; isTask: boolean };
type Staff = { id: string; name: string; employmentType: EmploymentType };
type Idle = { ptId: string; name: string; atCap: boolean };
type LastRun = { ranAt: string; trigger: string; status: string; error: string | null } | null;
type Where = { date: string; slot?: string; positionId?: string; ptId?: string };
type MenuState = { rowId: string; mode: "main" | "move" | "backup" } | null;

// 會在格子上標出問題的提醒分類
const CELL_PROBLEM_CATS: CategoryKey[] = ["shortage", "rule", "task", "conflict"];

const legend = [
  { label: "系統排的", className: "px-1 text-zinc-800 dark:text-zinc-200" },
  { label: "🔒 鎖定", className: "rounded bg-sky-600 px-1.5 font-bold text-white" },
  { label: "✎ 手動改過", className: "rounded bg-amber-500 px-1.5 font-bold text-white" },
  { label: "任務", className: "rounded bg-violet-600 px-1.5 font-bold text-white" },
  { label: "備援", className: "rounded border-2 border-dashed border-orange-500 px-1.5 text-orange-700 dark:text-orange-300" },
];

function chipClass(row: Row, position: Position | undefined) {
  if (row.priority === 2) return "rounded border-2 border-dashed border-orange-500 px-1.5 text-orange-700 dark:text-orange-300";
  if (position?.isTask) return "rounded bg-violet-600 px-1.5 font-bold text-white";
  if (row.source === "locked") return "rounded bg-sky-600 px-1.5 font-bold text-white";
  if (row.source === "manual") return "rounded bg-amber-500 px-1.5 font-bold text-white";
  return "rounded px-1 text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800";
}

function chipPrefix(row: Row, position: Position | undefined) {
  if (row.priority === 2 || position?.isTask) return "";
  if (row.source === "locked") return "🔒 ";
  if (row.source === "manual") return "✎ ";
  return "";
}

function cellId(date: string, slot: string, positionId: string) {
  return `cell-${date}-${slot}-${positionId}`;
}

function elementIdFor(t: Target) {
  if (t.date && t.slot && t.positionId) return cellId(t.date, t.slot, t.positionId);
  return t.date ? `day-${t.date}` : null;
}

export function WeekBoard({
  monday,
  dayInfos,
  rows,
  positions,
  slotMap,
  staff,
  reminders,
  idleByDate,
  dayOffNotes,
  lastRun,
  cronMissed,
}: {
  monday: string;
  dayInfos: DayInfo[];
  rows: Row[];
  positions: Position[];
  slotMap: { position_id: string; slot: string }[];
  staff: Staff[];
  reminders: Reminder[];
  idleByDate: Record<string, Idle[]>;
  dayOffNotes: { date: string; ptId: string }[];
  lastRun: LastRun;
  cronMissed: boolean;
}) {
  const router = useRouter();
  const [selectedCat, setSelectedCat] = useState<CategoryKey | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const seenKey = `schedule-seen-${monday}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(seenKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 已看過的勾選存在瀏覽器裡，畫面載入後才讀得到
      if (saved) setSeen(new Set(JSON.parse(saved) as string[]));
    } catch {
      // 私密瀏覽等情況讀不到就算了，只是勾選不會留著
    }
  }, [seenKey]);

  function toggleSeen(id: string) {
    const next = new Set(seen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeen(next);
    try {
      localStorage.setItem(seenKey, JSON.stringify([...next]));
    } catch {
      // 存不進去就只在這次畫面有效
    }
  }

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const slotOpen = (positionId: string, slot: string) => slotMap.some((m) => m.position_id === positionId && m.slot === slot);
  const dayOff = new Set(dayOffNotes.map((n) => `${n.date}|${n.ptId}`));

  const activeTargets = selectedCat ? reminders.filter((r) => r.catKey === selectedCat).flatMap((r) => r.targets) : [];
  const highlighted = (where: Where) => activeTargets.some((t) => targetMatches(t, where));
  // 名字本身只在提醒是針對某個人時才框起來
  const personHighlighted = (where: Required<Where>) => activeTargets.some((t) => t.ptId && targetMatches(t, where));

  function cellProblems(date: string, slot: string, positionId: string) {
    return reminders.filter(
      (r) =>
        CELL_PROBLEM_CATS.includes(r.catKey) &&
        r.targets.some((t) => t.slot && t.positionId && targetMatches(t, { date, slot, positionId })),
    );
  }

  function problemText(r: Reminder) {
    if (r.catKey === "shortage") return r.title.match(/缺 \d+ 人/)?.[0] ?? "缺人";
    if (r.catKey === "rule") return r.title.split("：").pop() ?? "不符合規則";
    if (r.catKey === "conflict") return "指定的人有衝突";
    return r.title.match(/需要安排 \d+ 人/)?.[0] ?? "任務待處理";
  }

  // 某天某時段要列出的崗位：有排人的崗位，加上沒人但有提醒（例如缺人）的崗位；沒人也沒問題的不列，畫面才不會一堆「—」
  function positionsInSlot(date: string, slot: string) {
    return positions.filter(
      (p) =>
        rows.some((r) => r.date === date && r.slot === slot && r.position_id === p.id) ||
        cellProblems(date, slot, p.id).length > 0,
    );
  }

  async function run() {
    const verb = rows.length > 0 ? "重排整週" : "自動排班";
    if (!confirm(`要${verb}嗎？\n\n你鎖定或手動改過的格子會保留；系統排的格子會重新排。`)) return;
    setRunning(true);
    setMessage(null);
    const response = await fetch("/api/auto-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: monday }),
    });
    const body = await response.json();
    setRunning(false);
    setMessage(
      response.ok
        ? { kind: "ok", text: `${verb}完成：系統排了 ${body.autoCount} 格，右邊提醒已更新。` }
        : { kind: "error", text: body.error ?? `${verb}失敗` },
    );
    router.refresh();
  }

  async function act(change: (supabase: ReturnType<typeof createClient>) => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error } = await change(createClient());
    setBusy(false);
    setMenu(null);
    if (error) {
      setMessage({ kind: "error", text: `修改失敗：${error.message}` });
      return;
    }
    router.refresh();
  }

  function goTo(r: Reminder) {
    const id = r.targets.map(elementIdFor).find((x) => x && document.getElementById(x));
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash((current) => (current === id ? null : current)), 1600);
  }

  function renderMenu(row: Row) {
    if (!menu || menu.rowId !== row.id) return null;
    const position = positionById.get(row.position_id);
    const primary = rows.find((r) => r.date === row.date && r.slot === row.slot && r.pt_id === row.pt_id && r.priority === 1);
    const backup = rows.find((r) => r.date === row.date && r.slot === row.slot && r.pt_id === row.pt_id && r.priority === 2);
    const openHere = positions.filter((p) => slotOpen(p.id, row.slot));
    const button = "rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

    if (menu.mode === "move" || menu.mode === "backup") {
      const exclude = menu.mode === "move" ? row.position_id : primary?.position_id;
      return (
        <div className="mt-1 flex flex-wrap items-center gap-1 rounded bg-zinc-50 p-2 dark:bg-zinc-900">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            {menu.mode === "move" ? `把${staffById.get(row.pt_id)?.name}改去：` : `${staffById.get(row.pt_id)?.name}做完主要工作後支援：`}
          </span>
          {openHere
            .filter((p) => p.id !== exclude)
            .map((p) => (
              <button
                key={p.id}
                disabled={busy}
                className={button}
                onClick={() =>
                  menu.mode === "move"
                    ? act((s) => s.from("daily_schedule").update({ position_id: p.id, source: "manual" }).eq("id", row.id))
                    : backup
                      ? act((s) => s.from("daily_schedule").update({ position_id: p.id, source: "manual" }).eq("id", backup.id))
                      : act((s) =>
                          s.from("daily_schedule").insert({
                            date: row.date,
                            slot: row.slot,
                            position_id: p.id,
                            pt_id: row.pt_id,
                            priority: 2,
                            source: "manual",
                          }),
                        )
                }
              >
                {p.name}
              </button>
            ))}
          <button className={button} onClick={() => setMenu({ rowId: row.id, mode: "main" })}>
            返回
          </button>
        </div>
      );
    }

    return (
      <div className="mt-1 flex flex-wrap items-center gap-1 rounded bg-zinc-50 p-2 dark:bg-zinc-900">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {staffById.get(row.pt_id)?.name}・{position?.name}
          {row.priority === 2 ? "（備援）" : ""}：
        </span>
        {row.source === "auto" ? (
          <button
            disabled={busy}
            className={button}
            onClick={() => act((s) => s.from("daily_schedule").update({ source: "locked" }).eq("id", row.id))}
          >
            🔒 鎖定這一格
          </button>
        ) : (
          <button
            disabled={busy}
            className={button}
            onClick={() => act((s) => s.from("daily_schedule").update({ source: "auto" }).eq("id", row.id))}
          >
            解除鎖定（交給系統重排）
          </button>
        )}
        <button disabled={busy} className={button} onClick={() => setMenu({ rowId: row.id, mode: "move" })}>
          改去別的崗位…
        </button>
        {row.priority === 1 && (
          <button disabled={busy} className={button} onClick={() => setMenu({ rowId: row.id, mode: "backup" })}>
            {backup ? "改備援…" : "加備援…"}
          </button>
        )}
        <button
          disabled={busy}
          className={`${button} text-red-600 dark:text-red-400`}
          onClick={() => act((s) => s.from("daily_schedule").delete().eq("id", row.id))}
        >
          移除這一格
        </button>
        <button className={button} onClick={() => setMenu(null)}>
          取消
        </button>
      </div>
    );
  }

  function renderCell(date: string, slot: string, p: Position) {
    const id = cellId(date, slot, p.id);
    const cellRows = rows
      .filter((r) => r.date === date && r.slot === slot && r.position_id === p.id)
      .sort((a, b) => a.priority - b.priority);
    const problems = cellProblems(date, slot, p.id);
    const dim = selectedCat && !highlighted({ date, slot, positionId: p.id });
    const lit = selectedCat && !dim;
    return (
      <div
        key={id}
        id={id}
        className={`rounded px-2 py-1 transition ${problems.length > 0 ? "ring-2 ring-red-500" : ""} ${
          lit ? "bg-yellow-100 dark:bg-yellow-900/40" : ""
        } ${dim ? "opacity-40" : ""} ${flash === id ? "animate-pulse ring-4 ring-yellow-400" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="w-20 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{p.name}</span>
          {cellRows.length === 0 && <span className="text-xs text-zinc-400">—</span>}
          {cellRows.map((r) => (
            <button
              key={r.id}
              onClick={() => setMenu(menu?.rowId === r.id ? null : { rowId: r.id, mode: "main" })}
              className={`${chipClass(r, p)} ${
                personHighlighted({ date, slot, positionId: p.id, ptId: r.pt_id }) ? "outline outline-2 outline-yellow-400" : ""
              }`}
              title="點一下可以鎖定、改崗位、加備援"
            >
              {chipPrefix(r, p)}
              {staffById.get(r.pt_id)?.name ?? "（已停用）"}
              {r.priority === 2 && <span className="text-[10px]">（備援）</span>}
            </button>
          ))}
          {problems.map((r) => (
            <span key={r.id} className="text-xs font-medium text-red-600 dark:text-red-400">
              {problemText(r)}
            </span>
          ))}
        </div>
        {cellRows.map((r) => renderMenu(r))}
      </div>
    );
  }

  function renderDay(d: DayInfo) {
    const dayDim = selectedCat && !highlighted({ date: d.date }) && !activeTargets.some((t) => t.date === d.date);
    const idle = idleByDate[d.date] ?? [];
    return (
      <section
        key={d.date}
        id={`day-${d.date}`}
        className={`rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${dayDim ? "opacity-60" : ""} ${
          flash === `day-${d.date}` ? "animate-pulse ring-4 ring-yellow-400" : ""
        }`}
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <span className="font-bold text-zinc-900 dark:text-zinc-50">{d.label}</span>
          {d.holidayNames.map((n) => (
            <span key={n} className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              {n}
            </span>
          ))}
          {d.closed && <span className="text-xs font-medium text-red-700 dark:text-red-400">不排班</span>}
          {d.priority && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-300">
              出貨優先日（{d.priorityShort}）
            </span>
          )}
          {d.campaign && !d.closed && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-300">
              {d.campaign}
            </span>
          )}
          {d.changed && (
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">假日有變動，請重排</span>
          )}
          {!d.closed && (
            <Link href={`/admin/schedule/${d.date}`} className="ml-auto text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
              單日頁編輯 →
            </Link>
          )}
        </header>
        {!d.closed && (
          <div className="space-y-2 px-3 py-2">
            {SLOTS.map((slot) => {
              const inSlot = positionsInSlot(d.date, slot);
              if (inSlot.length === 0) return null;
              if (d.isSaturday && slot === "出貨完成後" && !rows.some((r) => r.date === d.date && r.slot === slot)) return null;
              return (
                <div key={slot}>
                  <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{slot}</div>
                  <div className="mt-0.5 space-y-0.5">{inSlot.map((p) => renderCell(d.date, slot, p))}</div>
                </div>
              );
            })}
            {idle.length > 0 && (
              <div className="border-t border-dashed border-zinc-200 pt-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                <span className="font-medium">有空沒排到：</span>
                {idle.map((x, i) => (
                  <span
                    key={x.ptId}
                    className={selectedCat && highlighted({ date: d.date, ptId: x.ptId }) ? "rounded bg-yellow-100 dark:bg-yellow-900/40" : ""}
                  >
                    {i > 0 && "、"}
                    {x.name}
                    {dayOff.has(`${d.date}|${x.ptId}`) ? "（系統安排休假）" : x.atCap ? "（本週天數已滿）" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  const countOf = (key: CategoryKey) => reminders.filter((r) => r.catKey === key).length;
  const listed = selectedCat
    ? reminders.filter((r) => r.catKey === selectedCat)
    : reminders.filter((r) => CATEGORIES.find((c) => c.key === r.catKey)?.level === "要處理");
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          {legend.map((l) => (
            <span key={l.label} className={l.className}>
              {l.label}
            </span>
          ))}
          <span className="rounded px-1.5 ring-2 ring-red-500">有問題的那一行</span>
        </div>
        {rows.length === 0 && (
          <p className="rounded border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            這週還沒有排班。按右邊的「⚙ 自動排班」由系統排出草稿，或點每一天的「單日頁編輯」自己排。
          </p>
        )}
        {dayInfos.map((d) => renderDay(d))}
      </div>

      <aside className="space-y-3 self-start lg:sticky lg:top-4">
        <div className="space-y-2 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-bold text-zinc-900 dark:text-zinc-50">草稿提醒</h2>
          {cronMissed && lastRun?.status !== "failed" && (
            <p className="rounded bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              這週五早上的自動排班沒有執行，請按下面的按鈕自己排一次。
            </p>
          )}
          {lastRun?.status === "failed" && (
            <p className="rounded bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {fmtTime(lastRun.ranAt)} 的{lastRun.trigger === "cron" ? "每週五自動排班" : "自動排班"}失敗：{lastRun.error}
              。請再按一次下面的按鈕。
            </p>
          )}
          {lastRun?.status === "success" && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              上次自動排班：{fmtTime(lastRun.ranAt)}（{lastRun.trigger === "cron" ? "每週五自動" : "手動按的"}）
            </p>
          )}
          <button
            onClick={run}
            disabled={running}
            className="w-full rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {running ? "排班中…" : rows.length > 0 ? "⚙ 重排整週（鎖定的格子不動）" : "⚙ 自動排班"}
          </button>
          {message && (
            <p className={`text-sm ${message.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {message.text}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          {(["要處理", "參考"] as const).map((level) => (
            <div key={level}>
              <div className="mb-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">{level}</div>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.filter((c) => c.level === level).map((c) => {
                  const n = countOf(c.key);
                  const active = selectedCat === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setSelectedCat(active ? null : c.key)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : n === 0
                            ? "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                            : level === "要處理"
                              ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                              : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {c.label} {n}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedCat
                ? CATEGORIES.find((c) => c.key === selectedCat)?.hint
                : "下面是所有「要處理」的提醒。點上面的分類只看那一類，班表上相關的格子會用黃色標出來。"}
            </p>
            {listed.length === 0 && <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">沒有提醒 🎉</p>}
            <ul className="mt-2 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {listed.map((r) => (
                <li key={r.id} className={`text-sm ${seen.has(r.id) ? "opacity-50" : ""}`}>
                  <div className={`text-zinc-900 dark:text-zinc-50 ${seen.has(r.id) ? "line-through" : ""}`}>{r.title}</div>
                  {r.detail && <div className="text-xs text-zinc-500 dark:text-zinc-400">{r.detail}</div>}
                  <div className="mt-0.5 flex items-center gap-3 text-xs">
                    {r.targets.some((t) => t.date) && (
                      <button onClick={() => goTo(r)} className="text-sky-700 hover:underline dark:text-sky-400">
                        去看
                      </button>
                    )}
                    <label className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                      <input type="checkbox" checked={seen.has(r.id)} onChange={() => toggleSeen(r.id)} />
                      已看過
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
