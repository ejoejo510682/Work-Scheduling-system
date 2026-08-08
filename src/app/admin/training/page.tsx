import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { TrainingPanel } from "./TrainingPanel";

export default async function TrainingPage() {
  const adminUser = await requireRole(["主管"]);

  const supabase = await createClient();
  const [{ data: pt }, { data: trainingItems }, { data: records }] = await Promise.all([
    supabase.from("pt_staff").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("training_items")
      .select("id, name, position_id, positions(name)")
      .order("name"),
    supabase
      .from("training_records")
      .select(
        "id, status, approved_at, note, pt_id, training_item_id, pt_staff(name), training_items(name, position_id)",
      )
      .order("id", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">訓練紀錄與升等核准</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        登記受訓後，該項能力會自動變成「二級・訓練中」；核准完訓後會調整為「三級・可獨立執行」。
      </p>
      <TrainingPanel
        adminUserId={adminUser.id}
        pt={pt ?? []}
        trainingItems={(trainingItems ?? []) as unknown as TrainingItemRow[]}
        initialRecords={(records ?? []) as unknown as TrainingRecordRow[]}
      />
    </div>
  );
}

export type TrainingItemRow = {
  id: string;
  name: string;
  position_id: string;
  positions: { name: string } | null;
};

export type TrainingRecordRow = {
  id: string;
  status: "進行中" | "已完成";
  approved_at: string | null;
  note: string | null;
  pt_id: string;
  training_item_id: string;
  pt_staff: { name: string } | null;
  training_items: { name: string; position_id: string } | null;
};
