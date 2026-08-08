import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { getDefaultWeekMonday } from "@/lib/date";

const statusStyles: Record<string, string> = {
  待處理: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  進行中: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  已完成: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export default async function AdminHomePage() {
  await requireRole(["主管", "排班人員"]);

  const monday = getDefaultWeekMonday();
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("weekly_tasks")
    .select("id, name, status")
    .eq("week_start", monday)
    .order("created_at");

  const taskList = tasks ?? [];
  const doneCount = taskList.filter((t) => t.status === "已完成").length;

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
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">本週追加任務</h2>
          <Link
            href="/admin/weekly-tasks"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            查看全部 →
          </Link>
        </div>

        {taskList.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">這週還沒有追加任務。</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              共 {taskList.length} 個任務，已完成 {doneCount} 個
            </p>
            <ul className="mt-3 space-y-2">
              {taskList.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <span className="text-sm text-zinc-900 dark:text-zinc-50">{task.name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[task.status]}`}>
                    {task.status}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
