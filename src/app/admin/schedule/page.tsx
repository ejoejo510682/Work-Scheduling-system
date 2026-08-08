import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { addDays, getDefaultWeekMonday, getMonday, formatDateLabel, WEEKDAY_LABELS } from "@/lib/date";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">週排班表</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        選一天進去安排每個時段、每個崗位的人力；同一頁也能處理臨時請假的替補。
      </p>

      <div className="mt-4 flex items-center gap-3">
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
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
        {days.map((date, i) => (
          <Link
            key={date}
            href={`/admin/schedule/${date}`}
            className="rounded border border-zinc-200 bg-white p-4 text-center hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <div className="text-xs text-zinc-500 dark:text-zinc-400">週{WEEKDAY_LABELS[i]}</div>
            <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">
              {formatDateLabel(date)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
