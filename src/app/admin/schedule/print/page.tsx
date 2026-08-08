import { Fragment } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import type { Slot } from "@/lib/constants";
import { PrintButton } from "@/components/admin/PrintButton";

// 設計系統：以「出貨單/提單」的紙本質感為方向——暖色調的墨與紙、
// 一個沉穩的鋼青色（沃流＝水流）當主結構色、一個琥珀色（倉儲膠帶色）當唯一強調色。
// 時段不再用大面積色塊填滿儲存格（會犧牲對比與辨識度），改用細左邊條 + 小標籤，
// 讓顏色留在「結構」上，文字閱讀維持乾淨的黑墨字。
const INK = "#211D18";
const MUTED = "#6E685C";
const PAPER = "#FFFFFF";
const STEEL = "#2C4A54";
const STEEL_SOFT = "#5C7880";
const STEEL_TINT = "#EEF2F1";
const AMBER = "#B96A28";
const AMBER_TINT = "#FBEFE1";
const LINE = "#D9D3C4";

const SERIF = '"Noto Serif TC", "PMingLiU", "MingLiU", serif';
const SANS = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Segoe UI", sans-serif';

const SLOT_ROWS: {
  slot: Slot;
  label: string;
  period: "上午" | "下午" | null;
  periodSpan: number;
  accent: string;
}[] = [
  { slot: "上午出訂單前", label: "出訂單前", period: "上午", periodSpan: 2, accent: AMBER },
  { slot: "上午出訂單後", label: "出訂單後", period: "上午", periodSpan: 0, accent: STEEL },
  { slot: "下午出訂單前", label: "出訂單前", period: "下午", periodSpan: 2, accent: AMBER },
  { slot: "下午出訂單後", label: "出訂單後", period: "下午", periodSpan: 0, accent: STEEL },
  { slot: "出貨完成後", label: "出貨完成後", period: null, periodSpan: 1, accent: MUTED },
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
      .map((a) => ({
        name: positionNameById.get(a.position_id) ?? "?",
        backup: a.priority === 2,
      }));
  }

  return (
    <div style={{ colorScheme: "light", fontFamily: SANS, color: INK }}>
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          tbody.person-block { break-inside: avoid; }
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

      {/* 單頭：仿出貨單的抬頭列，標題用襯線字加粗，跟內文的黑體區隔出「文件感」 */}
      <div
        className="flex items-baseline justify-between px-4 py-3 mb-0"
        style={{ backgroundColor: STEEL, color: "#FFFFFF" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-wide" style={{ fontFamily: SERIF }}>
            豐鳥(沃流) 每週工作排程表
          </span>
          <span className="text-xs" style={{ color: "#CFE0DF" }}>
            {monday} ～ {sunday}
          </span>
        </div>
      </div>

      {/* 圖例：說明左邊條顏色與（備援）標示的意思，只出現一次，維持精簡 */}
      <div
        className="flex items-center gap-5 px-4 py-1.5 print:text-[9px] text-[10px]"
        style={{ backgroundColor: AMBER_TINT, color: MUTED, borderBottom: `1px solid ${LINE}` }}
      >
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 10, height: 3, backgroundColor: AMBER }} />
          出訂單前
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 10, height: 3, backgroundColor: STEEL }} />
          出訂單後
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 10, height: 3, backgroundColor: MUTED }} />
          出貨完成後
        </span>
        <span className="italic">（備援）＝支援任務，非主要任務</span>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-xs print:text-[10px]"
          style={{ borderColor: LINE, fontVariantNumeric: "tabular-nums" }}
        >
          <thead>
            <tr>
              {["人員", "時段", "時間節點"].map((label) => (
                <th
                  key={label}
                  className="border px-2 py-1.5 font-semibold"
                  style={{ backgroundColor: STEEL_TINT, borderColor: LINE, color: STEEL }}
                >
                  {label}
                </th>
              ))}
              {days.map((date, i) => {
                const isWeekend = i >= 5;
                return (
                  <th
                    key={date}
                    className="border px-2 py-1.5 whitespace-nowrap font-semibold"
                    style={{
                      backgroundColor: STEEL_TINT,
                      borderColor: LINE,
                      color: isWeekend ? AMBER : STEEL,
                      borderBottom: isWeekend ? `2px solid ${AMBER}` : undefined,
                    }}
                  >
                    {formatDateLabel(date)}　週{WEEKDAY_LABELS[i]}
                  </th>
                );
              })}
            </tr>
          </thead>
          {(pt ?? []).map((person, personIdx) => {
            const banded = personIdx % 2 === 1;
            const rowBg = banded ? STEEL_TINT : PAPER;
            return (
              <tbody key={person.id} className="person-block">
                {SLOT_ROWS.map((row, rowIdx) => (
                  <tr key={`${person.id}-${row.slot}`} style={{ borderTop: rowIdx === 0 ? `2px dashed ${LINE}` : undefined }}>
                    {rowIdx === 0 && (
                      <td
                        rowSpan={SLOT_ROWS.length}
                        className="border px-2 py-1 text-center align-middle font-bold text-sm print:text-xs"
                        style={{
                          backgroundColor: rowBg,
                          borderColor: LINE,
                          color: STEEL,
                          borderLeft: `4px solid ${STEEL}`,
                        }}
                      >
                        {person.name}
                      </td>
                    )}
                    {row.periodSpan > 0 && (
                      <td
                        rowSpan={row.periodSpan}
                        className="border px-1.5 py-1 text-center align-middle font-medium"
                        style={{ backgroundColor: rowBg, borderColor: LINE, color: MUTED }}
                      >
                        {row.period}
                      </td>
                    )}
                    <td
                      className="border px-1.5 py-1 text-center whitespace-nowrap font-medium"
                      style={{
                        backgroundColor: rowBg,
                        borderColor: LINE,
                        color: INK,
                        borderLeft: `3px solid ${row.accent}`,
                      }}
                    >
                      {row.label}
                    </td>
                    {days.map((date) => {
                      const entries = cellFor(person.id, row.slot, date);
                      return (
                        <td
                          key={date}
                          className="border px-2 py-1 align-top"
                          style={{ backgroundColor: rowBg, borderColor: LINE, color: INK }}
                        >
                          {entries.length > 0
                            ? entries.map((e, idx) => (
                                <div key={idx} style={e.backup ? { color: MUTED, fontStyle: "italic" } : undefined}>
                                  {e.name}
                                  {e.backup && "（備援）"}
                                </div>
                              ))
                            : <span style={{ color: LINE }}>－</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}
