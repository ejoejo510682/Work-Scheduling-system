import { Fragment } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import type { Slot } from "@/lib/constants";
import { PrintButton } from "@/components/admin/PrintButton";

// 統一用同一個藍色色系，「出訂單前/出訂單後」只靠深淺區分，上午下午共用同一組顏色；
// 「出貨完成後」是唯一跳出來的顏色（灰），代表跟前面的訂單流程性質不同
const NAVY = "#1F3864";
const HEADER_BLUE = "#2E5395";
const PERSON_BG = "#C9D5EA";
const PERIOD_BG = "#E8E2D3";
const INK = "#1A1A1A";

const SLOT_ROWS: {
  slot: Slot;
  label: string;
  period: "上午" | "下午" | null;
  periodSpan: number;
  labelBg: string;
  cellBg: string;
}[] = [
  { slot: "上午出訂單前", label: "出訂單前", period: "上午", periodSpan: 2, labelBg: "#5B7FA6", cellBg: "#E4EAF3" },
  { slot: "上午出訂單後", label: "出訂單後", period: "上午", periodSpan: 0, labelBg: "#33547A", cellBg: "#D6DFEC" },
  { slot: "下午出訂單前", label: "出訂單前", period: "下午", periodSpan: 2, labelBg: "#5B7FA6", cellBg: "#E4EAF3" },
  { slot: "下午出訂單後", label: "出訂單後", period: "下午", periodSpan: 0, labelBg: "#33547A", cellBg: "#D6DFEC" },
  { slot: "出貨完成後", label: "出貨完成後", period: null, periodSpan: 1, labelBg: "#6B6B6B", cellBg: "#ECECEC" },
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
    <div style={{ colorScheme: "light" }}>
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

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
        <table className="w-full border-collapse text-xs print:text-[10px]" style={{ borderColor: "#999" }}>
          <thead>
            <tr>
              <th
                colSpan={3 + days.length}
                className="border px-2 py-2 text-center text-sm font-bold print:text-sm"
                style={{ backgroundColor: NAVY, borderColor: "#999", color: "#FFFFFF" }}
              >
                豐鳥(沃流) 每週工作排程表　{monday} ～ {sunday}
              </th>
            </tr>
            <tr>
              {["人員", "時段", "時間節點"].map((label) => (
                <th
                  key={label}
                  className="border px-2 py-1"
                  style={{ backgroundColor: HEADER_BLUE, borderColor: "#999", color: "#FFFFFF" }}
                >
                  {label}
                </th>
              ))}
              {days.map((date, i) => (
                <th
                  key={date}
                  className="border px-2 py-1 whitespace-nowrap"
                  style={{ backgroundColor: HEADER_BLUE, borderColor: "#999", color: "#FFFFFF" }}
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
                        style={{ backgroundColor: PERSON_BG, borderColor: "#999", color: INK }}
                      >
                        {person.name}
                      </td>
                    )}
                    {row.periodSpan > 0 && (
                      <td
                        rowSpan={row.periodSpan}
                        className="border px-2 py-1 text-center align-middle font-medium"
                        style={{ backgroundColor: PERIOD_BG, borderColor: "#999", color: INK }}
                      >
                        {row.period}
                      </td>
                    )}
                    <td
                      className="border px-2 py-1 text-center whitespace-nowrap font-medium"
                      style={{ backgroundColor: row.labelBg, borderColor: "#999", color: "#FFFFFF" }}
                    >
                      {row.label}
                    </td>
                    {days.map((date) => {
                      const lines = cellFor(person.id, row.slot, date);
                      return (
                        <td
                          key={date}
                          className="border px-2 py-1 align-top"
                          style={{ backgroundColor: row.cellBg, borderColor: "#999", color: INK }}
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
