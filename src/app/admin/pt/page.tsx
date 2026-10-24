import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { PtTable } from "./PtTable";

export default async function PtPage() {
  await requireRole(["主管"]);

  const supabase = await createClient();
  const { data: pt } = await supabase
    .from("pt_staff")
    .select(
      "id, name, is_active, employment_type, primary_group, gender, can_work_saturday, saturday_group, auto_schedule_weekdays, is_weekday_printer",
    )
    .order("name");

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">人員名單管理</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        新增人員時，所有崗位能力預設為一級、每日可上班範圍預設全天；離職請用停用，保留過去班表紀錄。正職有協助出貨工作時也可以加進來，用身份別區分。下拉選單、勾選改完會直接存檔，自動排班會照這些設定排人。
      </p>
      <PtTable initialPt={pt ?? []} />
    </div>
  );
}
