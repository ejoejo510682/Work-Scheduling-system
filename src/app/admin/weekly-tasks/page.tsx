import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getDefaultWeekMonday, getMonday } from "@/lib/date";
import { WeeklyTasksPanel } from "./WeeklyTasksPanel";

export default async function WeeklyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const adminUser = await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  const supabase = await createClient();
  const [{ data: positions }, { data: pt }, { data: abilities }, { data: tasks }, { data: assignments }] =
    await Promise.all([
      supabase.from("positions").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("pt_staff").select("id, name, employment_type").eq("is_active", true).order("name"),
      supabase.from("pt_abilities").select("pt_id, position_id, level"),
      supabase
        .from("weekly_tasks")
        .select("id, name, note, required_position_id, required_level, status")
        .eq("week_start", monday)
        .order("id"),
      supabase
        .from("weekly_task_assignments")
        .select("id, task_id, pt_id")
        .order("id"),
    ]);

  const taskIds = new Set((tasks ?? []).map((t) => t.id));
  const relevantAssignments = (assignments ?? []).filter((a) => taskIds.has(a.task_id));

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">本週追加任務</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        除了日常崗位以外的臨時任務，只綁定「這一週」，不指定週內哪一天完成。
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/admin/weekly-tasks?week=${prevWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 上一週
        </Link>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {monday} 那一週
        </span>
        <Link
          href={`/admin/weekly-tasks?week=${nextWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          下一週 →
        </Link>
      </div>

      <WeeklyTasksPanel
        key={monday}
        weekStart={monday}
        isManager={adminUser.role === "主管"}
        positions={positions ?? []}
        pt={pt ?? []}
        abilities={abilities ?? []}
        initialTasks={tasks ?? []}
        initialAssignments={relevantAssignments}
      />
    </div>
  );
}
