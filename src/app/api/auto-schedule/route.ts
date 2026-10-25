import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/date";
import { loadAutoScheduleInput } from "@/lib/autoSchedule/loadInput";
import { generateWeekSchedule } from "@/lib/autoSchedule/scheduleLogic";
import { scheduleWeek } from "@/lib/autoSchedule/scheduleWeek";

// dryRun＝true 只回傳結果不寫入；ignoreExisting＝true 不管這週已經排的班、從空白重排（比對過去班表用，只能試算）
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
  const monday = getMonday(body.week);

  if (body.dryRun === true) {
    const input = await loadAutoScheduleInput(supabase, monday, { ignoreExisting: body.ignoreExisting === true });
    const result = generateWeekSchedule(input);
    return NextResponse.json({ ok: true, week: monday, schedule: result.schedule, warnings: result.warnings });
  }
  if (body.ignoreExisting) {
    return NextResponse.json({ error: "從空白重排只能試算，不能寫入" }, { status: 400 });
  }

  const outcome = await scheduleWeek(supabase, monday, "manual");
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 500 });
  return NextResponse.json({ ok: true, week: monday, autoCount: outcome.autoCount });
}
