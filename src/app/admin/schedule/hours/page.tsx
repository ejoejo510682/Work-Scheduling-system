import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { addDays, getDefaultWeekMonday, getMonday } from "@/lib/date";
import { loadHourScheduleInput } from "@/lib/autoSchedule/loadHourInput";
import { generateHourSchedule } from "@/lib/autoSchedule/hourSchedule";
import { LightModeToggle } from "./LightModeToggle";

// 新版排班（時數制）試排頁：每次打開都照目前的設定重新試排，不存檔、不影響現在的班表
type Segment = { date: string; pt_id: string; position_id: string; start: string; end: string };
type Warning = { type: string; message: string };

const COLORS: Record<string, string> = {
  印訂單: "#f9a8d4",
  出貨: "#93c5fd",
  箱出貨: "#fcd34d",
  無包裝出貨: "#86efac",
  車趟: "#fdba74",
  一倉進退貨處理: "#c4b5fd",
  二倉團購進出貨: "#a5b4fc",
  內勤窗口: "#67e8f9",
  處理批發訂單: "#f0abfc",
};
const SHORT: Record<string, string> = {
  印訂單: "印",
  出貨: "出貨",
  箱出貨: "箱",
  無包裝出貨: "無包",
  車趟: "車",
  一倉進退貨處理: "一倉",
  二倉團購進出貨: "二倉",
  內勤窗口: "內勤",
  處理批發訂單: "批發",
};
const BLOCKS = [...Array.from({ length: 8 }, (_, i) => 510 + i * 30), ...Array.from({ length: 8 }, (_, i) => 810 + i * 30)];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ORDER_RANK: Record<string, number> = { 優先: 0, 一般: 1, 最後: 2 };
const WARNING_GROUPS: [string, string][] = [
  ["shortage", "時數不夠／排不進去"],
  ["task", "本週任務"],
  ["order", "排班順序"],
  ["surplus", "有空沒工作"],
  ["day_off", "系統安排休假"],
  ["missing_availability", "沒登記可上班時間"],
];

const toMin = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const dayLabel = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${y}/${String(m).padStart(2, "0")}/${String(dd).padStart(2, "0")}（${WEEKDAYS[new Date(y, m - 1, dd).getDay()]}）`;
};

export default async function HourSchedulePreviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole(["主管", "排班人員"]);
  const params = await searchParams;
  const monday = params.week ? getMonday(params.week) : getDefaultWeekMonday();
  const supabase = await createClient();
  const input = await loadHourScheduleInput(supabase, monday);
  const result = generateHourSchedule(input) as {
    segments: Segment[];
    warnings: Warning[];
    hoursByStaff: Record<string, number>;
    capByDayPosition: Record<string, number>;
    filledByDayPosition: Record<string, number>;
  };

  const positions = input.positions.filter((p) => p.is_active !== false);
  const posName = (id: string) => positions.find((p) => p.id === id)?.name ?? "";
  const staff = input.staff.filter((s) => s.is_active);
  const days = [...new Set(Object.keys(result.capByDayPosition).map((k) => k.split("|")[0]))].sort();
  const hours = (id: string) => result.hoursByStaff[id] ?? 0;
  const total = (type: string) => staff.filter((s) => s.employment_type === type).reduce((sum, s) => sum + hours(s.id), 0);
  const people = [...staff].sort(
    (a, b) =>
      b.employment_type.localeCompare(a.employment_type) ||
      (ORDER_RANK[a.schedule_order] ?? 1) - (ORDER_RANK[b.schedule_order] ?? 1) ||
      hours(b.id) - hours(a.id),
  );
  const navClass = "rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
  const th = "border border-zinc-200 bg-zinc-100 px-2 py-1 font-medium dark:border-zinc-700 dark:bg-zinc-800";
  const td = "border border-zinc-200 px-2 py-1 dark:border-zinc-700";

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">新版試排（時數制）</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        照「崗位管理 → 新版崗位」的時數上限、能力等級、主要崗位、可上班範圍登記，每次打開這頁都重新試排一次。
        <span className="font-medium text-zinc-900 dark:text-zinc-50">只是試排，不會存檔，也不會改到現在的週排班表。</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={`/admin/schedule/hours?week=${addDays(monday, -7)}`} className={navClass}>
          ← 上一週
        </Link>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {dayLabel(monday)} ～ {dayLabel(addDays(monday, 5))}
        </span>
        <Link href={`/admin/schedule/hours?week=${addDays(monday, 7)}`} className={navClass}>
          下一週 →
        </Link>
        <div className="ml-auto flex gap-3">
          <LightModeToggle />
          <Link href={`/admin/schedule/hours/print?week=${monday}`} className={navClass}>
            🖨 總班表（列印／PDF）
          </Link>
          <Link href={`/admin/schedule?week=${monday}`} className={navClass}>
            回現在的週排班表
          </Link>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 text-xs">
        {positions.map((p) => (
          <span key={p.id} className="rounded px-2 py-0.5 text-zinc-900" style={{ background: COLORS[p.name] ?? "#e4e4e7" }}>
            {p.name}
          </span>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="font-bold text-zinc-900 dark:text-zinc-50">每人本週時數</h2>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          PT 合計 <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{total("PT")}</span> 小時・正職 {total("正職")} 小時
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>人</th>
                <th className={th}>身分</th>
                <th className={th}>排班順序</th>
                <th className={th}>主要崗位</th>
                <th className={th}>本週時數</th>
              </tr>
            </thead>
            <tbody>
              {people.map((s) => (
                <tr key={s.id}>
                  <td className={`${td} font-medium text-zinc-900 dark:text-zinc-50`}>{s.name}</td>
                  <td className={td}>{s.employment_type}</td>
                  <td className={td}>{s.employment_type === "PT" ? (s.schedule_order === "最後" ? "最後才排" : s.schedule_order) : "—"}</td>
                  <td className={td}>{(s.main_position_ids ?? []).map(posName).filter(Boolean).join("、")}</td>
                  <td className={`${td} text-right font-bold`}>{hours(s.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-bold text-zinc-900 dark:text-zinc-50">每個崗位：排到 / 上限（小時）</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>崗位</th>
                {days.map((d) => (
                  <th key={d} className={th}>
                    {dayLabel(d).slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td className={`${td} font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-50`}>{p.name}</td>
                  {days.map((d) => {
                    const cap = result.capByDayPosition[`${d}|${p.id}`] ?? 0;
                    const filled = result.filledByDayPosition[`${d}|${p.id}`] ?? 0;
                    const short = p.included_in_auto_schedule !== false && filled < cap;
                    return (
                      <td
                        key={d}
                        className={`${td} text-center ${short ? "font-bold text-red-600 dark:text-red-400" : cap ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-400"}`}
                      >
                        {cap ? `${filled} / ${cap}` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {days.map((d) => {
        const working = people.filter((s) => result.segments.some((g) => g.date === d && g.pt_id === s.id));
        return (
          <section key={d} className="mt-6">
            <h2 className="font-bold text-zinc-900 dark:text-zinc-50">{dayLabel(d)}</h2>
            {working.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-500">這天沒有排到人。</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className={th}>人</th>
                      {BLOCKS.map((b, i) => [
                        i === 8 ? <th key="lunch" className="w-2 bg-zinc-300 dark:bg-zinc-600" title="午休 12:30-13:30" /> : null,
                        <th key={b} className={`${th} font-normal`}>
                          {fmt(b)}
                        </th>,
                      ])}
                      <th className={th}>時數</th>
                      <th className={th}>上下班</th>
                    </tr>
                  </thead>
                  <tbody>
                    {working.map((s) => {
                      const segs = result.segments.filter((g) => g.date === d && g.pt_id === s.id).sort((a, b) => toMin(a.start) - toMin(b.start));
                      const at = (b: number) => segs.find((g) => toMin(g.start) <= b && b < toMin(g.end));
                      const worked = segs.reduce((sum, g) => sum + (toMin(g.end) - toMin(g.start)) / 60, 0);
                      return (
                        <tr key={s.id}>
                          <td className={`${td} font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-50`}>
                            {s.name}
                            {s.employment_type === "正職" && <span className="text-zinc-500">（正）</span>}
                          </td>
                          {BLOCKS.map((b, i) => {
                            const g = at(b);
                            const n = g ? posName(g.position_id) : "";
                            return [
                              i === 8 ? <td key="lunch" className="bg-zinc-300 dark:bg-zinc-600" /> : null,
                              <td
                                key={b}
                                className={`${td} text-center whitespace-nowrap ${g ? "text-zinc-900" : ""}`}
                                style={g ? { background: COLORS[n] ?? "#e4e4e7" } : undefined}
                              >
                                {g ? (SHORT[n] ?? n) : ""}
                              </td>,
                            ];
                          })}
                          <td className={`${td} text-right`}>{worked}</td>
                          <td className={`${td} whitespace-nowrap`}>
                            {segs[0].start}-{segs[segs.length - 1].end}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <section className="mt-8">
        <h2 className="font-bold text-zinc-900 dark:text-zinc-50">提醒</h2>
        {WARNING_GROUPS.map(([type, label]) => {
          const list = result.warnings.filter((w) => w.type === type);
          if (list.length === 0) return null;
          return (
            <div key={type} className="mt-3">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {label}（{list.length}）
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {list.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
