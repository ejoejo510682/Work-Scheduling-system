import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, WEEKDAY_LABELS } from "@/lib/date";
import { SLOTS } from "@/lib/constants";

export default async function AdminHomePage() {
  await requireRole(["主管", "排班人員"]);

  const monday = getDefaultWeekMonday();
  const supabase = await createClient();
  const [{ data: requests }, { data: requestStaff }] = await Promise.all([
    supabase
      .from("task_requests")
      .select("id, date, slot, headcount, positions(name)")
      .gte("date", monday)
      .lte("date", addDays(monday, 5)),
    supabase.from("task_request_staff").select("request_id"),
  ]);

  const namedCount = new Map<string, number>();
  for (const row of requestStaff ?? []) namedCount.set(row.request_id, (namedCount.get(row.request_id) ?? 0) + 1);
  const taskList = [...(requests ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot),
  );
  const shortCount = taskList.filter((t) => (namedCount.get(t.id) ?? 0) < t.headcount).length;
  const weekdayOf = (date: string) => WEEKDAY_LABELS[(new Date(`${date}T00:00:00`).getDay() + 6) % 7];

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">今日總覽</h1>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/admin/availability?week=${monday}`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          更新可上班範圍
        </Link>
        <Link
          href={`/admin/schedule?week=${monday}`}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          本週排班
        </Link>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">本週任務</h2>
          <Link
            href={`/admin/weekly-tasks?week=${monday}`}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            任務登記 →
          </Link>
        </div>

        {taskList.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">這週還沒有登記任務。</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              共 {taskList.length} 個任務
              {shortCount > 0 && <span className="text-amber-700 dark:text-amber-400">，{shortCount} 個還沒指定滿人</span>}
            </p>
            <ul className="mt-3 space-y-2">
              {taskList.map((task) => {
                const named = namedCount.get(task.id) ?? 0;
                const position = task.positions as unknown as { name: string } | null;
                return (
                  <li
                    key={task.id}
                    className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <span className="text-sm text-zinc-900 dark:text-zinc-50">
                      {formatDateLabel(task.date)}（{weekdayOf(task.date)}）{task.slot}・{position?.name}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        named < task.headcount ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      已指定 {named} / {task.headcount} 人
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
