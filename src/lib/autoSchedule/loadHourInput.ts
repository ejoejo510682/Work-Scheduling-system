import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/date";

// 新版排班（時數制）試排用的資料：新版崗位、人員、能力、可上班範圍、假日、過去 8 個週六、本週任務
export async function loadHourScheduleInput(supabase: SupabaseClient, monday: string) {
  const sunday = addDays(monday, 6);
  const pastSaturdays = Array.from({ length: 8 }, (_, i) => addDays(monday, -2 - 7 * i));
  const [positions, oldPositions, staff, abilities, availability, specialDates, pastSchedule, requests] = await Promise.all([
    supabase
      .from("positions")
      .select("id, name, is_active, sort_order, included_in_auto_schedule, gender_restriction, work_windows, saturday_windows, split_halves, hours_event, hours_monday, hours_tuesday, hours_wednesday, hours_thursday, hours_friday, hours_saturday")
      .eq("hour_based", true)
      .order("sort_order"),
    supabase.from("positions").select("id, name").eq("hour_based", false),
    supabase
      .from("pt_staff")
      .select("id, name, is_active, employment_type, gender, can_work_saturday, saturday_group, auto_schedule_weekdays, schedule_order, main_position_ids, weekly_max_hours"),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
    supabase.from("pt_daily_availability").select("pt_id, date, range").gte("date", monday).lte("date", sunday),
    supabase.from("special_dates").select("date, type, name").gte("date", addDays(monday, -60)).lte("date", sunday),
    supabase.from("daily_schedule").select("date, pt_id, priority").in("date", pastSaturdays).eq("priority", 1),
    supabase
      .from("task_requests")
      .select("date, slot, position_id, headcount, task_request_staff(pt_id)")
      .gte("date", monday)
      .lte("date", sunday),
  ]);
  const oldName = new Map((oldPositions.data ?? []).map((p) => [p.id, p.name]));
  return {
    weekStart: monday,
    positions: positions.data ?? [],
    staff: staff.data ?? [],
    abilities: abilities.data ?? [],
    availability: availability.data ?? [],
    specialDates: specialDates.data ?? [],
    pastSchedule: pastSchedule.data ?? [],
    // 本週任務還是照舊崗位、舊時段登記，用舊崗位名字對到新版的任務崗位
    taskRequests: (requests.data ?? []).map((r) => ({
      date: r.date,
      slot: r.slot,
      position_name: oldName.get(r.position_id),
      pt_ids: ((r.task_request_staff as { pt_id: string }[] | null) ?? []).map((x) => x.pt_id),
    })),
  };
}
