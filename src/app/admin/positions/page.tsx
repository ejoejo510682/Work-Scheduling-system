import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { PositionsTable } from "./PositionsTable";
import { HourPositionsTable, type HourPosition } from "./HourPositionsTable";

export default async function PositionsPage() {
  await requireRole(["主管"]);

  const supabase = await createClient();
  const [{ data: positions }, { data: headcounts }, { data: slotMap }, { data: preferred }, { data: staff }, { data: hourPositions }] =
    await Promise.all([
      supabase
        .from("positions")
        .select(
          "id, name, is_active, sort_order, work_group, included_in_auto_schedule, gender_restriction, max_headcount, fill_first",
        )
        .eq("hour_based", false)
        .order("sort_order"),
      supabase
        .from("position_headcount")
        .select(
          "id, position_id, slot, headcount, monday_headcount, tuesday_headcount, wednesday_headcount, thursday_headcount, friday_headcount, priority_headcount",
        ),
      supabase.from("position_slot_map").select("position_id, slot"),
      supabase.from("position_preferred_staff").select("position_id, pt_id, rank").order("rank"),
      supabase.from("pt_staff").select("id, name, employment_type, gender").eq("is_active", true).order("name"),
      supabase
        .from("positions")
        .select("id, name, included_in_auto_schedule, gender_restriction, work_windows, saturday_windows, split_halves, hours_event, hours_mon_tue, hours_wednesday, hours_thu_fri, hours_saturday")
        .eq("hour_based", true)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">崗位管理</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        新增崗位時會自動建立同名的訓練項目；需求人數、適用時段、自動排班設定建立後都可以再編輯。
      </p>
      <PositionsTable
        initialPositions={positions ?? []}
        initialHeadcounts={headcounts ?? []}
        initialSlotMap={slotMap ?? []}
        initialPreferred={preferred ?? []}
        staff={staff ?? []}
      />
      <HourPositionsTable positions={(hourPositions ?? []) as HourPosition[]} />
    </div>
  );
}
