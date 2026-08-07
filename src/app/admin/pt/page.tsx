import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { PtTable } from "./PtTable";

export default async function PtPage() {
  await requireRole(["主管"]);

  const supabase = await createClient();
  const { data: pt } = await supabase
    .from("pt_staff")
    .select("id, name, is_active")
    .order("name");

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">PT 名單管理</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        新增 PT 時，所有崗位能力預設為一級、每日可上班範圍預設全天；離職請用停用，保留過去班表紀錄。
      </p>
      <PtTable initialPt={pt ?? []} />
    </div>
  );
}
