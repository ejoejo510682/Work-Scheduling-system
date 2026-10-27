import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { addDays, getMonday, todayInTaipei } from "@/lib/date";
import { scheduleWeek } from "@/lib/autoSchedule/scheduleWeek";

// 每週五早上 Vercel Cron 打這支，自動排下週（GitHub issue #7 決議；排程設定在 vercel.json）。
// Vercel 觸發時會帶 Authorization: Bearer <CRON_SECRET>，比對不符一律擋掉；這支只做「排下週」這一件事。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayInTaipei();
  const monday = addDays(getMonday(today), 7);
  const supabase = createServiceRoleClient();

  // Vercel 偶爾會同一次排程打兩次：今天已經成功排過就不再排
  const { data: run } = await supabase
    .from("auto_schedule_runs")
    .select("ran_at, trigger, status")
    .eq("week_start", monday)
    .maybeSingle();
  if (run?.trigger === "cron" && run.status === "success" && new Date(run.ran_at) >= new Date(`${today}T00:00:00+08:00`)) {
    return NextResponse.json({ ok: true, week: monday, skipped: "今天已經排過" });
  }

  const outcome = await scheduleWeek(supabase, monday, "cron", { keepExisting: true });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, week: monday }, { status: 500 });
  return NextResponse.json({ ok: true, week: monday, autoCount: outcome.autoCount });
}
