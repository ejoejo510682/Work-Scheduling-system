import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import { ecommerceCampaignLabel } from "@/lib/specialDates";
import { ScheduleDay } from "./ScheduleDay";

export default async function ScheduleDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireRole(["主管", "排班人員"]);
  const { date } = await params;

  const monday = getMonday(date);
  const sunday = addDays(monday, 6);
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const [y, m, d] = date.split("-").map(Number);
  const weekdayLabel = WEEKDAY_LABELS[(new Date(y, m - 1, d).getDay() + 6) % 7];

  const supabase = await createClient();
  const [
    { data: positions },
    { data: slotMap },
    { data: headcounts },
    { data: pt },
    { data: abilities },
    { data: availability },
    { data: assignments },
    { data: weekAssignments },
    { data: specialDates },
  ] = await Promise.all([
    supabase.from("positions").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("position_slot_map").select("position_id, slot"),
    supabase.from("position_headcount").select("position_id, headcount"),
    supabase.from("pt_staff").select("id, name, employment_type").eq("is_active", true).order("name"),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
    supabase.from("pt_daily_availability").select("pt_id, range").eq("date", date),
    supabase.from("daily_schedule").select("id, slot, position_id, pt_id, priority").eq("date", date),
    // 用來算「這個人這週已經排幾天班」，一週上限 4 天的警示要看整週，不能只看今天
    supabase.from("daily_schedule").select("date, pt_id").gte("date", monday).lte("date", sunday),
    supabase.from("special_dates").select("name, type").eq("date", date),
  ]);

  const campaignLabel = ecommerceCampaignLabel(date);
  const hasReminder = (specialDates ?? []).length > 0 || campaignLabel;

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/schedule?week=${monday}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 回到週總覽
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Link
          href={`/admin/schedule/${prevDate}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 前一天
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {date}（週{weekdayLabel}）排班
        </h1>
        <Link
          href={`/admin/schedule/${nextDate}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          後一天 →
        </Link>
      </div>

      {hasReminder && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
          <span className="font-medium text-amber-800 dark:text-amber-300">今天提醒：</span>
          {(specialDates ?? []).map((sd) => (
            <span
              key={sd.name}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                sd.type === "國定假日"
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
              }`}
            >
              {sd.name}
            </span>
          ))}
          {campaignLabel && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-300">
              {campaignLabel}
            </span>
          )}
        </div>
      )}

      <ScheduleDay
        date={date}
        positions={positions ?? []}
        slotMap={slotMap ?? []}
        headcounts={headcounts ?? []}
        pt={pt ?? []}
        abilities={abilities ?? []}
        availability={availability ?? []}
        initialAssignments={assignments ?? []}
        weekAssignments={weekAssignments ?? []}
      />
    </div>
  );
}
