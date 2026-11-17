import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getDefaultWeekMonday, getMonday } from "@/lib/date";
import { getCachedActivePt } from "@/lib/cachedReferenceData";
import { AvailabilityGrid } from "./AvailabilityGrid";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const sunday = addDays(monday, 6);

  const supabase = await createClient();
  const [pt, { data: availability }, { data: limitRows }] = await Promise.all([
    getCachedActivePt(),
    supabase
      .from("pt_daily_availability")
      .select("pt_id, date, range, filled_by")
      .gte("date", monday)
      .lte("date", sunday),
    supabase
      .from("pt_weekly_day_limits")
      .select("pt_id, week_start, max_days")
      .lte("week_start", monday)
      .order("week_start", { ascending: false }),
  ]);
  // 沒設的週沿用最近一次設定（資料由新到舊，第一筆就是最近的）
  const dayLimits: Record<string, { maxDays: number | null; fromWeek: string }> = {};
  for (const r of limitRows ?? []) {
    if (!dayLimits[r.pt_id]) dayLimits[r.pt_id] = { maxDays: r.max_days, fromWeek: r.week_start };
  }

  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">可上班範圍登記</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        每人每天預設「全天」；半天班、臨時半天請假、整天請假都在這裡設定，週排班的建議名單會依此自動排除。
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        每格下面的小字是最後誰填的：「本人」＝員工自己填寫，名字＝後台帳號改的；2026/11/07 以前的資料沒有紀錄，不會顯示。
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        「本週最多」可以把 PT 這週的天數調少（週六也算一天）；沒改的週會沿用最近一次設定，改回「照規則」就恢復最多 4 天。車趟的人天天上班，不受這個設定影響。
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/admin/availability?week=${prevWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 上一週
        </Link>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {monday} ～ {sunday}
        </span>
        <Link
          href={`/admin/availability?week=${nextWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          下一週 →
        </Link>
      </div>

      <AvailabilityGrid
        key={monday}
        monday={monday}
        pt={pt ?? []}
        initialAvailability={availability ?? []}
        initialDayLimits={dayLimits}
      />
    </div>
  );
}
