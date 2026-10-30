import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/date";

// 預設的備援對照寫在程式裡（2026-10-24 決議：很少變動，不做成設定）
const DEFAULT_BACKUPS: Record<string, string> = { 撿貨: "包裝" };
// 「上次上週六」往回看幾週（週六輪流用）
const SATURDAY_LOOKBACK_WEEKS = 8;
// 連假、檔期順延要往回看的天數（演算法最多往回找 60 天）
const SPECIAL_DATES_LOOKBACK_DAYS = 60;

// 把排班演算法需要的資料一次讀好，整理成 generateWeekSchedule 的輸入格式。
// ignoreExisting＝true 時不讀這週已經排的班（比對過去班表用：讓系統從空白重排一次）
export async function loadAutoScheduleInput(
  supabase: SupabaseClient,
  monday: string,
  { ignoreExisting = false }: { ignoreExisting?: boolean } = {},
) {
  const sunday = addDays(monday, 6);
  const monthStart = `${monday.slice(0, 7)}-01`;
  const pastSaturdays = Array.from({ length: SATURDAY_LOOKBACK_WEEKS }, (_, i) => addDays(monday, -2 - 7 * i));

  const [
    { data: positions, error: positionsError },
    { data: staff },
    { data: abilities },
    { data: headcounts },
    { data: slotMap },
    { data: availability },
    { data: specialDates },
    { data: currentWeek },
    { data: previousWeek },
    { data: pastSaturdayRows },
    { data: preferred },
    { data: templates },
    { data: requests },
    { data: monthLeave },
  ] = await Promise.all([
    supabase
      .from("positions")
      .select("id, name, is_active, sort_order, work_group, included_in_auto_schedule, gender_restriction, max_headcount, fill_first")
      .order("sort_order"),
    supabase
      .from("pt_staff")
      .select(
        "id, name, is_active, employment_type, primary_group, gender, can_work_saturday, saturday_group, auto_schedule_weekdays, is_weekday_printer, shipping_support_position_id, skip_priority_shipping_support",
      ),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
    supabase.from("position_headcount").select("position_id, slot, headcount, monday_headcount, priority_headcount"),
    supabase.from("position_slot_map").select("position_id, slot"),
    supabase.from("pt_daily_availability").select("pt_id, date, range").gte("date", monday).lte("date", sunday),
    supabase
      .from("special_dates")
      .select("date, type, name")
      .gte("date", addDays(monday, -SPECIAL_DATES_LOOKBACK_DAYS))
      .lte("date", sunday),
    ignoreExisting
      ? Promise.resolve({ data: [] })
      : supabase
          .from("daily_schedule")
          .select("id, date, slot, position_id, pt_id, priority, source")
          .gte("date", monday)
          .lte("date", sunday),
    supabase
      .from("daily_schedule")
      .select("date, slot, position_id, pt_id, priority")
      .gte("date", addDays(monday, -7))
      .lte("date", addDays(monday, -1)),
    supabase.from("daily_schedule").select("date, pt_id, priority").in("date", pastSaturdays),
    supabase.from("position_preferred_staff").select("position_id, pt_id, rank"),
    supabase.from("task_templates").select("position_id, slot, weekdays, pt_id, substitute_pt_id"),
    supabase
      .from("task_requests")
      .select("date, slot, position_id, headcount, task_request_staff(pt_id)")
      .gte("date", monday)
      .lte("date", sunday),
    // 這週一所在月份的全天休假（挑人時請假少的優先）
    supabase
      .from("pt_daily_availability")
      .select("pt_id")
      .eq("range", "全天休假")
      .gte("date", monthStart)
      .lte("date", addDays(addDays(monthStart, 31).slice(0, 7) + "-01", -1)),
  ]);

  if (positionsError) throw new Error(`讀取崗位失敗：${positionsError.message}`);

  const positionIdByName = new Map((positions ?? []).map((p) => [p.name, p.id]));
  const printer = (staff ?? []).find((s) => s.is_active && s.employment_type === "正職" && s.is_weekday_printer);

  return {
    weekStart: monday,
    positions: (positions ?? []).map((p) => ({
      ...p,
      group: p.work_group,
      default_backup_position_id: positionIdByName.get(DEFAULT_BACKUPS[p.name]) ?? null,
    })),
    staff: staff ?? [],
    abilities: abilities ?? [],
    headcounts: headcounts ?? [],
    slotMap: slotMap ?? [],
    availability: availability ?? [],
    specialDates: specialDates ?? [],
    currentWeekSchedule: currentWeek ?? [],
    previousWeekSchedule: previousWeek ?? [],
    pastSchedule: pastSaturdayRows ?? [],
    positionPreferredStaff: preferred ?? [],
    // 資料庫存 1＝週一…5＝週五，演算法用 0＝週一…4＝週五
    taskTemplates: (templates ?? []).map((t) => ({ ...t, weekdays: (t.weekdays as number[]).map((d) => d - 1) })),
    taskRequests: (requests ?? []).map((r) => ({
      date: r.date,
      slot: r.slot,
      position_id: r.position_id,
      headcount: r.headcount,
      pt_ids: (r.task_request_staff as { pt_id: string }[]).map((s) => s.pt_id),
    })),
    weekdayFtPrinterId: printer?.id ?? null,
    monthLeaveCounts: (monthLeave ?? []).reduce<Record<string, number>>((counts, r) => {
      counts[r.pt_id] = (counts[r.pt_id] ?? 0) + 1;
      return counts;
    }, {}),
  };
}
