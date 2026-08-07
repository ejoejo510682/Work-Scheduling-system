import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { PositionsTable } from "./PositionsTable";

export default async function PositionsPage() {
  await requireRole(["主管"]);

  const supabase = await createClient();
  const [{ data: positions }, { data: headcounts }, { data: slotMap }] = await Promise.all([
    supabase.from("positions").select("id, name, is_active, sort_order").order("sort_order"),
    supabase.from("position_headcount").select("position_id, headcount"),
    supabase.from("position_slot_map").select("position_id, slot"),
  ]);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">崗位管理</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        新增崗位時會自動建立同名的訓練項目；標準需求人力與適用時段建立後可再編輯。
      </p>
      <PositionsTable
        initialPositions={positions ?? []}
        initialHeadcounts={headcounts ?? []}
        initialSlotMap={slotMap ?? []}
      />
    </div>
  );
}
