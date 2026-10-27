import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getDefaultWeekMonday, getMonday, todayInTaipei } from "@/lib/date";
import { ecommerceCampaignLabel } from "@/lib/specialDates";
import { loadAutoScheduleInput } from "@/lib/autoSchedule/loadInput";
import { checkWeekSchedule } from "@/lib/autoSchedule/scheduleLogic";
import { buildDayInfos, buildReminders, type CheckWarning, type RunNote, type SpecialDateRow } from "@/lib/autoSchedule/reminders";
import { WeekBoard } from "./WeekBoard";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  const supabase = await createClient();
  const [input, { data: run }] = await Promise.all([
    loadAutoScheduleInput(supabase, monday),
    supabase
      .from("auto_schedule_runs")
      .select("ran_at, trigger, status, error, special_dates, notes")
      .eq("week_start", monday)
      .maybeSingle(),
  ]);

  const rows = input.currentWeekSchedule as {
    id: string;
    date: string;
    slot: string;
    position_id: string;
    pt_id: string;
    priority: 1 | 2;
    source: "auto" | "manual" | "locked";
  }[];
  const staffName = (id: string) => input.staff.find((s) => s.id === id)?.name ?? "（已停用）";
  const positionName = (id: string) => input.positions.find((p) => p.id === id)?.name ?? "（已停用崗位）";
  // 只有成功排過的那次才拿來比對假日有沒有變動
  const snapshot = run?.status === "success" ? (run.special_dates as SpecialDateRow[]) : null;
  const dayInfos = buildDayInfos(monday, input.specialDates, snapshot).map((d) => ({
    ...d,
    campaign: ecommerceCampaignLabel(d.date),
  }));
  // 這週還沒排班時不檢查，不然每一格都會顯示缺人
  const check = rows.length > 0 ? checkWeekSchedule(input) : { warnings: [], idleByDate: {} };
  const notes = run?.status === "success" ? (run.notes as RunNote[]) : [];
  // 每週五早上 8 點多會自動排下週（vercel.json）。還沒到的週、已經過了週五 10 點卻沒有任何排班紀錄，就提醒沒有執行
  const friday = addDays(monday, -3);
  const today = todayInTaipei();
  const hourInTaipei = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hour12: false }).format(new Date()));
  const cronMissed =
    monday > today &&
    (today > friday || (today === friday && hourInTaipei >= 10)) &&
    !(run && new Date(run.ran_at) >= new Date(`${friday}T00:00:00+08:00`));
  const reminders = buildReminders({
    monday,
    warnings: check.warnings as CheckWarning[],
    notes,
    dayInfos,
    current: input.specialDates,
    snapshot,
    staffName,
    positionName,
  });

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">週排班表</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        按「自動排班」由系統依規則排整週；你自己改過或鎖定的格子重排時會保留。點名字可以鎖定、改崗位、加備援，要新增人員請進單日頁。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/schedule?week=${prevWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 上一週
        </Link>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {monday} ～ {addDays(monday, 6)}
        </span>
        <Link
          href={`/admin/schedule?week=${nextWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          下一週 →
        </Link>
        <Link
          href={`/admin/schedule/picking-list?week=${monday}`}
          className="ml-auto rounded border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          📋 撿貨名單
        </Link>
        <Link
          href={`/admin/schedule/print?week=${monday}`}
          className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          🖨 列印／匯出 PDF
        </Link>
      </div>

      <WeekBoard
        key={monday}
        monday={monday}
        dayInfos={dayInfos}
        rows={rows}
        positions={input.positions
          .filter((p) => p.is_active)
          .map((p) => ({ id: p.id, name: p.name, group: p.work_group, isTask: p.included_in_auto_schedule === false }))}
        slotMap={input.slotMap}
        staff={input.staff
          .filter((s) => s.is_active)
          .map((s) => ({ id: s.id, name: s.name, employmentType: s.employment_type }))}
        reminders={reminders}
        idleByDate={check.idleByDate as Record<string, { ptId: string; name: string; atCap: boolean }[]>}
        dayOffNotes={notes.filter((n) => n.type === "day_off").map((n) => ({ date: n.date ?? "", ptId: n.ptId ?? "" }))}
        lastRun={run ? { ranAt: run.ran_at, trigger: run.trigger, status: run.status, error: run.error } : null}
        cronMissed={cronMissed}
      />
    </div>
  );
}
