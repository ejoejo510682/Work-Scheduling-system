import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addDays, getMonday } from "@/lib/date";
import { loadAutoScheduleInput } from "@/lib/autoSchedule/loadInput";
import { generateWeekSchedule } from "@/lib/autoSchedule/scheduleLogic";

// 自動排班一整週：Cynthia 自己排或改過的格子（source = manual）保留不動，系統排的格子（auto）全部重算。
// dryRun＝true 只回傳結果不寫入；ignoreExisting＝true 不管這週已經排的班、從空白重排（比對過去班表用，一定要搭配 dryRun）
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: profile } = await supabase.rpc("current_admin_profile");
  const role = (profile?.[0] as { role: string } | undefined)?.role;
  if (role !== "主管" && role !== "排班人員") {
    return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  }

  const body = (await request.json()) as { week?: string; dryRun?: boolean; ignoreExisting?: boolean };
  if (!body.week || !/^\d{4}-\d{2}-\d{2}$/.test(body.week)) {
    return NextResponse.json({ error: "缺少要排的週次" }, { status: 400 });
  }
  const dryRun = body.dryRun === true;
  const ignoreExisting = body.ignoreExisting === true;
  if (ignoreExisting && !dryRun) {
    return NextResponse.json({ error: "從空白重排只能試算，不能寫入" }, { status: 400 });
  }

  const monday = getMonday(body.week);
  const input = await loadAutoScheduleInput(supabase, monday, { ignoreExisting });
  const result = generateWeekSchedule(input);
  const autoRows = result.schedule
    .filter((r) => r.source === "auto")
    .map((r) => ({ date: r.date, slot: r.slot, position_id: r.position_id, pt_id: r.pt_id, priority: r.priority, source: "auto" }));

  if (!dryRun) {
    const { error: deleteError } = await supabase
      .from("daily_schedule")
      .delete()
      .eq("source", "auto")
      .gte("date", monday)
      .lte("date", addDays(monday, 6));
    if (deleteError) return NextResponse.json({ error: `清除舊的自動排班失敗：${deleteError.message}` }, { status: 500 });

    if (autoRows.length > 0) {
      const { error: insertError } = await supabase.from("daily_schedule").insert(autoRows);
      if (insertError) {
        return NextResponse.json(
          { error: `寫入班表失敗：${insertError.message}。系統排的格子已清空，請再按一次自動排班` },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    week: monday,
    dryRun,
    autoCount: autoRows.length,
    schedule: dryRun ? result.schedule : undefined,
    warnings: result.warnings,
    printerPlan: result.printerPlan,
  });
}
