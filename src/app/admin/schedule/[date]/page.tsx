import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/date";
import { ScheduleDay } from "./ScheduleDay";

export default async function ScheduleDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireRole(["主管", "排班人員"]);
  const { date } = await params;

  const supabase = await createClient();
  const [
    { data: positions },
    { data: slotMap },
    { data: headcounts },
    { data: pt },
    { data: abilities },
    { data: availability },
    { data: assignments },
  ] = await Promise.all([
    supabase.from("positions").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("position_slot_map").select("position_id, slot"),
    supabase.from("position_headcount").select("position_id, headcount"),
    supabase.from("pt_staff").select("id, name").eq("is_active", true).order("name"),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
    supabase.from("pt_daily_availability").select("pt_id, range").eq("date", date),
    supabase.from("daily_schedule").select("id, slot, position_id, pt_id, priority").eq("date", date),
  ]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/schedule?week=${getMonday(date)}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 回到週總覽
        </Link>
      </div>
      <h1 className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-50">{date} 排班</h1>

      <ScheduleDay
        date={date}
        positions={positions ?? []}
        slotMap={slotMap ?? []}
        headcounts={headcounts ?? []}
        pt={pt ?? []}
        abilities={abilities ?? []}
        availability={availability ?? []}
        initialAssignments={assignments ?? []}
      />
    </div>
  );
}
