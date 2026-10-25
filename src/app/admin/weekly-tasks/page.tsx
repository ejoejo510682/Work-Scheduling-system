import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getDefaultWeekMonday, getMonday } from "@/lib/date";
import { getCachedActivePt, getCachedPositionSlotMap } from "@/lib/cachedReferenceData";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";
import { TaskRegistration } from "./TaskRegistration";

const oldStatusStyles: Record<string, string> = {
  待處理: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  進行中: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  已完成: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export default async function TaskRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const saturday = addDays(monday, 5);
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  const supabase = await createClient();
  const [
    pt,
    slotMap,
    { data: positions },
    { data: abilities },
    { data: requests },
    { data: requestStaff },
    { data: templates },
    { data: oldTasks },
    { data: oldAssignments },
  ] = await Promise.all([
    getCachedActivePt(),
    getCachedPositionSlotMap(),
    supabase
      .from("positions")
      .select("id, name, included_in_auto_schedule")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
    supabase
      .from("task_requests")
      .select("id, date, slot, position_id, headcount, note")
      .gte("date", monday)
      .lte("date", saturday)
      .order("date"),
    supabase.from("task_request_staff").select("request_id, pt_id"),
    supabase.from("task_templates").select("id, position_id, slot, weekdays, pt_id, substitute_pt_id").order("created_at"),
    supabase.from("weekly_tasks").select("id, name, note, status").eq("week_start", monday).order("created_at"),
    supabase.from("weekly_task_assignments").select("task_id, pt_id"),
  ]);

  const requestIds = new Set((requests ?? []).map((r) => r.id));
  const ptById = new Map(pt.map((p) => [p.id, p]));

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">任務登記</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        處理批發訂單、處理退貨、盤點這類有任務才需要排人的工作登記在這裡。自動排班會把指定的人排進班表；沒指定的位子不會自動挑人，會在週排班表提醒你手動指定。
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Link
          href={`/admin/weekly-tasks?week=${prevWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 上一週
        </Link>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {monday} ～ {saturday}
        </span>
        <Link
          href={`/admin/weekly-tasks?week=${nextWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          下一週 →
        </Link>
      </div>

      <TaskRegistration
        key={monday}
        monday={monday}
        positions={positions ?? []}
        slotMap={slotMap}
        pt={pt}
        abilities={abilities ?? []}
        initialRequests={requests ?? []}
        initialRequestStaff={(requestStaff ?? []).filter((s) => requestIds.has(s.request_id))}
        initialTemplates={templates ?? []}
      />

      {(oldTasks ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">舊版追加任務（只能查看）</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            改用任務登記之前建立的紀錄，留著方便查看，不能再修改。
          </p>
          <ul className="mt-3 space-y-2">
            {(oldTasks ?? []).map((task) => (
              <li key={task.id} className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{task.name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${oldStatusStyles[task.status]}`}>
                    {task.status}
                  </span>
                  {(oldAssignments ?? [])
                    .filter((a) => a.task_id === task.id)
                    .map((a) => {
                      const person = ptById.get(a.pt_id);
                      return (
                        <span
                          key={a.pt_id}
                          className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          {person && <EmploymentTypeBadge type={person.employment_type} />}
                          {person?.name ?? "（已停用）"}
                        </span>
                      );
                    })}
                </div>
                {task.note && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{task.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
