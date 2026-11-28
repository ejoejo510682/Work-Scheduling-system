import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateLabel, getDefaultWeekMonday, getMonday, WEEKDAY_LABELS } from "@/lib/date";
import { getCachedActivePt } from "@/lib/cachedReferenceData";
import { loadHourScheduleInput } from "@/lib/autoSchedule/loadHourInput";
import { generateHourSchedule } from "@/lib/autoSchedule/hourSchedule";
import { PrintButton } from "@/components/admin/PrintButton";

// 新版試排的總班表：外觀跟舊版總班表（/admin/schedule/print）一樣，發到群組用；
// 新版是彈性上下班，對不上舊版的五個時段，所以一人一天一格直接寫幾點到幾點做什麼（2026-11-29 Cynthia 選）
type Segment = { date: string; pt_id: string; position_id: string; start: string; end: string };

const INK = "#211D18";
const MUTED = "#6E685C";
const PAPER = "#FFFFFF";
const STEEL = "#2C4A54";
const STEEL_SOFT = "#5C7880";
const STEEL_TINT = "#EEF2F1";
const AMBER = "#B96A28";
const LINE = "#D9D3C4";

const SERIF = '"Noto Serif TC", "PMingLiU", "MingLiU", serif';
const SANS = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Segoe UI", sans-serif';

const toMin = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
const showTime = (t: string) => t.replace(/^0/, "");

// 同一個崗位接著做（含午休前後）合成一行，例如 10:30-12:30、13:30-14:30 箱出貨 → 10:30-14:30 箱出貨
function dayLines(segments: Segment[]) {
  const lines: { start: string; end: string; position_id: string }[] = [];
  for (const g of [...segments].sort((a, b) => toMin(a.start) - toMin(b.start))) {
    const last = lines[lines.length - 1];
    const joins = last && last.position_id === g.position_id && (last.end === g.start || (last.end === "12:30" && g.start === "13:30"));
    if (joins) last.end = g.end;
    else lines.push({ start: g.start, end: g.end, position_id: g.position_id });
  }
  return lines;
}

export default async function HourSchedulePrintPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole(["主管", "排班人員"]);
  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));

  const supabase = await createClient();
  const [input, people] = await Promise.all([loadHourScheduleInput(supabase, monday), getCachedActivePt()]);
  const { segments } = generateHourSchedule(input) as { segments: Segment[] };
  const positionName = new Map(input.positions.map((p) => [p.id, p.name]));

  return (
    <div style={{ colorScheme: "light", fontFamily: SANS, color: INK }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          tr.person-row { break-inside: avoid; }
        }
      `}</style>

      <div className="print:hidden mb-4 flex items-center gap-3">
        <Link
          href={`/admin/schedule/hours?week=${monday}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 回新版試排
        </Link>
        <PrintButton />
      </div>

      <div className="flex items-baseline justify-between px-4 py-3" style={{ backgroundColor: STEEL, color: "#FFFFFF" }}>
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-wide" style={{ fontFamily: SERIF }}>
            豐鳥(沃流) 每週工作排程表
          </span>
          <span className="text-xs" style={{ color: "#CFE0DF" }}>
            {monday} ～ {addDays(monday, 5)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs print:text-[10px]" style={{ borderColor: LINE, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th className="border px-2 py-1.5 font-semibold" style={{ backgroundColor: STEEL_TINT, borderColor: LINE, color: STEEL }}>
                人員
              </th>
              {days.map((date, i) => (
                <th
                  key={date}
                  className="border px-2 py-1.5 whitespace-nowrap font-semibold"
                  style={{
                    backgroundColor: STEEL_TINT,
                    borderColor: LINE,
                    color: i === 5 ? AMBER : STEEL,
                    borderBottom: i === 5 ? `2px solid ${AMBER}` : undefined,
                  }}
                >
                  {formatDateLabel(date)}　週{WEEKDAY_LABELS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person, personIdx) => {
              const rowBg = personIdx % 2 === 1 ? STEEL_TINT : PAPER;
              return (
                <tr key={person.id} className="person-row">
                  <td
                    className="border px-2 py-1 text-center align-middle font-bold text-sm print:text-xs whitespace-nowrap"
                    style={{ backgroundColor: rowBg, borderColor: LINE, color: STEEL, borderLeft: `4px solid ${STEEL}` }}
                  >
                    {person.name}
                    <div style={{ fontSize: 8, fontWeight: 500, marginTop: 2, color: person.employment_type === "正職" ? AMBER : STEEL_SOFT }}>
                      {person.employment_type}
                    </div>
                  </td>
                  {days.map((date) => {
                    const mine = segments.filter((g) => g.date === date && g.pt_id === person.id);
                    const hours = mine.reduce((sum, g) => sum + (toMin(g.end) - toMin(g.start)) / 60, 0);
                    return (
                      <td key={date} className="border px-2 py-1 align-top whitespace-nowrap" style={{ backgroundColor: rowBg, borderColor: LINE, color: INK }}>
                        {mine.length === 0 ? (
                          <span style={{ color: LINE }}>－</span>
                        ) : (
                          <>
                            {dayLines(mine).map((l) => (
                              <div key={l.start}>
                                {showTime(l.start)}-{showTime(l.end)} {positionName.get(l.position_id)}
                              </div>
                            ))}
                            <div style={{ color: MUTED, fontSize: "0.9em" }}>共 {hours} 小時</div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
