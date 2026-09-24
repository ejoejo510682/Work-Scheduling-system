import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import type { Slot } from "@/lib/constants";
import { getCachedActivePositions, getCachedActivePt } from "@/lib/cachedReferenceData";
import { CopyTextButton } from "@/components/admin/CopyTextButton";

// 撿貨人員名單只看這個崗位——印訂單的人需要知道「今天早上/下午找誰撿貨」，
// 不用像週排班表那樣列出每個崗位，所以固定抓「撿貨」這個崗位名稱就好。
const PICKING_POSITION_NAME = "撿貨";

const MORNING_SLOTS: Slot[] = ["上午出訂單前", "上午出訂單後"];
const AFTERNOON_SLOTS: Slot[] = ["下午出訂單前", "下午出訂單後", "出貨完成後"];

export default async function PickingListPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  const [positions, pt] = await Promise.all([getCachedActivePositions(), getCachedActivePt()]);
  const pickingPosition = (positions ?? []).find((p) => p.name === PICKING_POSITION_NAME);

  if (!pickingPosition) {
    return (
      <div>
        <p className="text-sm text-red-600 dark:text-red-400">
          找不到「{PICKING_POSITION_NAME}」這個崗位，請確認崗位管理裡的名稱是否有變動。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("daily_schedule")
    .select("date, slot, pt_id, priority")
    .eq("position_id", pickingPosition.id)
    .gte("date", monday)
    .lte("date", sunday);

  const ptNameById = new Map((pt ?? []).map((p) => [p.id, p.name]));

  function namesFor(date: string, slots: Slot[]): string {
    const rows = (assignments ?? [])
      .filter((a) => a.date === date && slots.includes(a.slot as Slot))
      .sort((a, b) => a.priority - b.priority);
    const seen = new Set<string>();
    const names: string[] = [];
    for (const row of rows) {
      const name = ptNameById.get(row.pt_id);
      if (!name || seen.has(row.pt_id)) continue;
      seen.add(row.pt_id);
      names.push(row.priority === 2 ? `${name}（備援）` : name);
    }
    return names.length > 0 ? names.join("、") : "（無）";
  }

  const lines: string[] = [`撿貨人員清單　${monday} ～ ${sunday}`, ""];
  days.forEach((date, i) => {
    lines.push(`週${WEEKDAY_LABELS[i]} ${formatDateLabel(date)}`);
    lines.push(`早上：${namesFor(date, MORNING_SLOTS)}`);
    lines.push(`下午：${namesFor(date, AFTERNOON_SLOTS)}`);
    lines.push("");
  });
  const fullText = lines.join("\n").trimEnd();

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/schedule?week=${monday}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 回到週排班表
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">撿貨人員名單</h1>
        <Link
          href={`/admin/schedule/picking-list?week=${prevWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← 上一週
        </Link>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {monday} ～ {sunday}
        </span>
        <Link
          href={`/admin/schedule/picking-list?week=${nextWeek}`}
          className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          下一週 →
        </Link>
        <div className="ml-auto">
          <CopyTextButton text={fullText} />
        </div>
      </div>

      <pre className="mt-4 whitespace-pre-wrap rounded border border-zinc-200 bg-white p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
        {fullText}
      </pre>
    </div>
  );
}
