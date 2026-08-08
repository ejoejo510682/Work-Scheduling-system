import { Fragment } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import type { Slot } from "@/lib/constants";
import { PrintButton } from "@/components/admin/PrintButton";

// 顏色跟倉庫原本 Excel 排程表的配色對齊：出訂單前=紅、上午出訂單後=橘、
// 下午出訂單前=藍、下午出訂單後=綠、出貨完成後=灰
const SLOT_ROWS: {
  slot: Slot;
  period: "上午" | "下午" | null;
  periodSpan: number;
  labelBg: string;
  cellBg: string;
}[] = [
  { slot: "上午出訂單前", period: "上午", periodSpan: 2, labelBg: "#B03A2E", cellBg: "#FADBD8" },
  { slot: "上午出訂單後", period: "上午", periodSpan: 0, labelBg: "#D4801F", cellBg: "#FDEBD0" },
  { slot: "下午出訂單前", period: "下午", periodSpan: 2, labelBg: "#2E6B8A", cellBg: "#D6EAF8" },
  { slot: "下午出訂單後", period: "下午", periodSpan: 0, labelBg: "#4E7A45", cellBg: "#E2EFDA" },
  { slot: "出貨完成後", period: null, periodSpan: 1, labelBg: "#6B6B6B", cellBg: "#F2F2F2" },
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
  const [{ data: positions }, { data: pt }, { data: assignments }] = await Promise.all([
    supabase.from("positions").select("id, name").eq("is_active", true),
    supabase.from("pt_staff").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("daily_schedule")
      .select("date, slot, position_id, pt_id, priority")
      .gte("date", monday)
      .lte("date", sunday),
  ]);

  const positionNameById = new Map((positions ?? []).map((p) => [p.id, p.name]));

  function cellFor(ptId: string, slot: Slot, date: string) {
    const rows = (assignments ?? []).filter(
      (a) => a.pt_id === ptId && a.slot === slot && a.date === date,
    );
    return rows
      .sort((a, b) => a.priority - b.priority)
      .map((a) => {
        const name = positionNameById.get(a.position_id) ?? "?";
        return a.priority === 2 ? `${name}（備援）` : name;
      });
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

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-xs print:text-[10px]"
          style={{ borderColor: "#999" }}
        >
          <thead>
            <tr>
              <th
                colSpan={3 + days.length}
                className="border px-2 py-2 text-center text-sm font-bold text-white print:text-sm"
                style={{ backgroundColor: "#1F3864", borderColor: "#999" }}
              >
                豐鳥(沃流) 每週工作排程表　{monday} ～ {sunday}
              </th>
            </tr>
            <tr>
              {["人員", "時段", "時間節點"].map((label) => (
                <th
                  key={label}
                  className="border px-2 py-1 text-white"
                  style={{ backgroundColor: "#2E5395", borderColor: "#999" }}
                >
                  {label}
                </th>
              ))}
              {days.map((date, i) => (
                <th
                  key={date}
                  className="border px-2 py-1 whitespace-nowrap text-white"
                  style={{ backgroundColor: "#2E5395", borderColor: "#999" }}
                >
                  {formatDateLabel(date)}週{WEEKDAY_LABELS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(pt ?? []).map((person) => (
              <Fragment key={person.id}>
                {SLOT_ROWS.map((row, rowIdx) => (
                  <tr key={`${person.id}-${row.slot}`}>
                    {rowIdx === 0 && (
                      <td
                        rowSpan={SLOT_ROWS.length}
                        className="border px-2 py-1 text-center align-middle font-bold"
                        style={{ backgroundColor: "#D9E2F3", borderColor: "#999" }}
                      >
                        {person.name}
                      </td>
                    )}
                    {row.periodSpan > 0 && (
                      <td
                        rowSpan={row.periodSpan}
                        className="border px-2 py-1 text-center align-middle font-medium"
                        style={{ backgroundColor: "#FDF0D5", borderColor: "#999" }}
                      >
                        {row.period}
                      </td>
                    )}
                    <td
                      className="border px-2 py-1 text-center whitespace-nowrap font-medium text-white"
                      style={{ backgroundColor: row.labelBg, borderColor: "#999" }}
                    >
                      {row.slot.replace("出", "")}
                    </td>
                    {days.map((date) => {
                      const lines = cellFor(person.id, row.slot, date);
                      return (
                        <td
                          key={date}
                          className="border px-2 py-1 align-top text-zinc-900"
                          style={{ backgroundColor: row.cellBg, borderColor: "#999" }}
                        >
                          {lines.length > 0
                            ? lines.map((line, idx) => <div key={idx}>{line}</div>)
                            : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
