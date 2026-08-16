import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { AbilitiesGrid } from "./AbilitiesGrid";

export default async function AbilitiesPage() {
  await requireRole(["主管"]);

  const supabase = await createClient();
  const [{ data: positions }, { data: pt }, { data: abilities }] = await Promise.all([
    supabase.from("positions").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("pt_staff").select("id, name, employment_type").eq("is_active", true).order("name"),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
  ]);

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">能力等級設定</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        沒有特別設定的格子預設是「一級・完全不會」。這裡可以直接調整等級，不需要透過訓練紀錄。
      </p>
      <AbilitiesGrid
        positions={positions ?? []}
        pt={pt ?? []}
        initialAbilities={abilities ?? []}
      />
    </div>
  );
}
