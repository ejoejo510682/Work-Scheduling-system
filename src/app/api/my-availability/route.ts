import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSubmissionWindow, toDateStr } from "@/lib/date";
import { AVAILABILITY_RANGES, type AvailabilityRange } from "@/lib/constants";

type Entry = { date: string; range: AvailabilityRange };

export async function POST(request: Request) {
  const body = (await request.json()) as { pt_id?: string; entries?: Entry[] };
  const { pt_id, entries } = body;

  if (!pt_id || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  // 前端的「現在開不開放」只是體驗，這裡才是真正把關的地方
  const window = getSubmissionWindow(toDateStr(new Date()));
  if (!window.open) {
    return NextResponse.json({ error: "目前不在開放填寫的時間內" }, { status: 403 });
  }

  const validDates = new Set(window.targetMonthDates);
  for (const entry of entries) {
    if (!validDates.has(entry.date) || !AVAILABILITY_RANGES.includes(entry.range)) {
      return NextResponse.json({ error: "送出的日期或選項不正確" }, { status: 400 });
    }
  }

  const supabase = createServiceRoleClient();

  const { data: person } = await supabase
    .from("pt_staff")
    .select("id")
    .eq("id", pt_id)
    .eq("is_active", true)
    .single();

  if (!person) {
    return NextResponse.json({ error: "找不到這個人員或已停用" }, { status: 400 });
  }

  const { error } = await supabase
    .from("pt_daily_availability")
    .upsert(
      entries.map((e) => ({ pt_id, date: e.date, range: e.range })),
      { onConflict: "pt_id,date" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
