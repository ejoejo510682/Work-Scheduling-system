import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getMonday, toDateStr } from "@/lib/date";
import { AvailabilityGrid } from "./AvailabilityGrid";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = getMonday(params.week ?? toDateStr(new Date()));
  const sunday = addDays(monday, 6);

  const supabase = await createClient();
  const [{ data: pt }, { data: availability }] = await Promise.all([
    supabase.from("pt_staff").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("pt_daily_availability")
      .select("pt_id, date, range")
      .gte("date", monday)
      .lte("date", sunday),
  ]);

  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">可上班範圍登記</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        每人每天預設「全天」；半天班、臨時半天請假、整天請假都在這裡設定，週排班的建議名單會依此自動排除。
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

      <AvailabilityGrid monday={monday} pt={pt ?? []} initialAvailability={availability ?? []} />
    </div>
  );
}
