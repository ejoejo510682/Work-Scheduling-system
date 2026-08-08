import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import { SLOTS, type Slot } from "@/lib/constants";
import { PrintButton } from "@/components/admin/PrintButton";

const HALVES: { label: string; slots: [Slot, Slot] }[] = [
  { label: "上午", slots: ["上午出訂單前", "上午出訂單後"] },
  { label: "下午", slots: ["下午出訂單前", "下午出訂單後"] },
];

export default async function SchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(["主管", "排班人員"]);

  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const supabase = await createClient();
  const [{ data: positions }, { data: slotMap }, { data: pt }, { data: assignments }] =
    await Promise.all([
      supabase.from("positions").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("position_slot_map").select("position_id, slot"),
      supabase.from("pt_staff").select("id, name").eq("is_active", true),
      supabase
        .from("daily_schedule")
        .select("date, slot, position_id, pt_id, priority")
        .gte("date", monday)
        .lte("date", sunday),
    ]);

  const ptById = new Map((pt ?? []).map((p) => [p.id, p.name]));
  const slotsByPosition = new Map<string, Set<string>>();
  for (const row of slotMap ?? []) {
    const set = slotsByPosition.get(row.position_id) ?? new Set<string>();
    set.add(row.slot);
    slotsByPosition.set(row.position_id, set);
  }

  const regularPositions = (positions ?? []).filter((p) => (slotsByPosition.get(p.id)?.size ?? 0) > 0);
  const flexiblePositions = (positions ?? []).filter(
    (p) => (slotsByPosition.get(p.id)?.size ?? 0) === 0,
  );

  function namesFor(positionId: string, date: string, slot: string) {
    const rows = (assignments ?? []).filter(
      (a) => a.position_id === positionId && a.date === date && a.slot === slot,
    );
    return rows
      .sort((a, b) => a.priority - b.priority)
      .map((a) => (ptById.get(a.pt_id) ?? "?") + (a.priority === 2 ? "(備援)" : ""));
  }

  function namesForHalf(positionId: string, date: string, slots: [Slot, Slot]) {
    const rows = (assignments ?? []).filter(
      (a) => a.position_id === positionId && a.date === date && slots.includes(a.slot as Slot),
    );
    const uniqueNames = Array.from(new Set(rows.map((a) => ptById.get(a.pt_id))));
    return uniqueNames;
  }

  return (
    <div>
      <div className="print:hidden mb-4 flex items-center gap-3">
        <Link
          href={`/admin/schedule?week=${monday}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 回到週排班表
        </Link>
        <PrintButton />
      </div>

      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 print:text-black">
        週班表 {monday} ～ {sunday}
      </h1>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs print:text-[10px]">
          <thead>
            <tr>
              <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left dark:border-zinc-700 dark:bg-zinc-800 print:border-black print:bg-white print:text-black">
                崗位
              </th>
              {days.map((date, i) => (
                <th
                  key={date}
                  className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left dark:border-zinc-700 dark:bg-zinc-800 print:border-black print:bg-white print:text-black"
                >
                  週{WEEKDAY_LABELS[i]} {formatDateLabel(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regularPositions.map((position) => (
              <tr key={position.id}>
                <td className="border border-zinc-300 px-2 py-1 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-50 print:border-black print:text-black">
                  {position.name}
                </td>
                {days.map((date) => {
                  const slots = SLOTS.filter((s) => slotsByPosition.get(position.id)?.has(s));
                  const lines = slots
                    .map((s) => {
                      const names = namesFor(position.id, date, s);
                      return names.length > 0 ? `${s.replace("出", "")}：${names.join("、")}` : null;
                    })
                    .filter(Boolean);
                  return (
                    <td
                      key={date}
                      className="border border-zinc-300 px-2 py-1 align-top text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 print:border-black print:text-black"
                    >
                      {lines.length > 0 ? (
                        lines.map((line, idx) => <div key={idx}>{line}</div>)
                      ) : (
                        <span className="text-zinc-400 print:text-zinc-500">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {flexiblePositions.map((position) => (
              <tr key={position.id}>
                <td className="border border-zinc-300 px-2 py-1 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-50 print:border-black print:text-black">
                  {position.name}（彈性）
                </td>
                {days.map((date) => {
                  const lines = HALVES.map((half) => {
                    const names = namesForHalf(position.id, date, half.slots);
                    return names.length > 0 ? `${half.label}：${names.join("、")}` : null;
                  }).filter(Boolean);
                  return (
                    <td
                      key={date}
                      className="border border-zinc-300 px-2 py-1 align-top text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 print:border-black print:text-black"
                    >
                      {lines.length > 0 ? (
                        lines.map((line, idx) => <div key={idx}>{line}</div>)
                      ) : (
                        <span className="text-zinc-400 print:text-zinc-500">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
