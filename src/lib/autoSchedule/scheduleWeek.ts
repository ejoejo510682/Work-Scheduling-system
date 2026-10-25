import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/date";
import { loadAutoScheduleInput } from "./loadInput";
import { generateWeekSchedule } from "./scheduleLogic";

type Warning = { type: string; message: string; date?: string | null; ptId?: string };

// 系統自己處理掉、不用 Cynthia 動手的情況，記在這週的排班紀錄，週排班表放在「其他提示」
function isNote(w: Warning) {
  return w.type === "day_off" || (w.type === "info" && !w.message.includes("不排班")) || (w.type === "task" && w.message.includes("由代班"));
}

// 排一整週並寫回班表：Cynthia 自己排或改過（manual）、鎖定（locked）的格子保留，系統排的（auto）全部重算。
// 每週五的自動排班（trigger＝cron）也用這個。
export async function scheduleWeek(supabase: SupabaseClient, monday: string, trigger: "manual" | "cron") {
  const run = { week_start: monday, ran_at: new Date().toISOString(), trigger };
  try {
    const input = await loadAutoScheduleInput(supabase, monday);
    const result = generateWeekSchedule(input);
    const autoRows = result.schedule
      .filter((r) => r.source === "auto")
      .map((r) => ({ date: r.date, slot: r.slot, position_id: r.position_id, pt_id: r.pt_id, priority: r.priority, source: "auto" }));

    const { error: deleteError } = await supabase
      .from("daily_schedule")
      .delete()
      .eq("source", "auto")
      .gte("date", monday)
      .lte("date", addDays(monday, 6));
    if (deleteError) throw new Error(`清除舊的自動排班失敗：${deleteError.message}`);
    if (autoRows.length > 0) {
      const { error: insertError } = await supabase.from("daily_schedule").insert(autoRows);
      if (insertError) throw new Error(`寫入班表失敗：${insertError.message}。系統排的格子已清空，請再按一次自動排班`);
    }

    await supabase.from("auto_schedule_runs").upsert({
      ...run,
      status: "success",
      error: null,
      special_dates: input.specialDates,
      notes: (result.warnings as Warning[])
        .filter(isNote)
        .map((w) => ({ type: w.type, date: w.date ?? null, ptId: w.ptId ?? null, message: w.message })),
    });
    return { ok: true as const, autoCount: autoRows.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await supabase.from("auto_schedule_runs").upsert({ ...run, status: "failed", error });
    return { ok: false as const, error };
  }
}
