import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { AccountsTable } from "./AccountsTable";

export default async function AccountsPage() {
  await requireRole(["主管"]);

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("admin_users")
    .select("id, email, name, role")
    .order("name");

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">帳號管理</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        新增可以登入後台的帳號。密碼由你設定，新增後直接告訴對方帳密即可登入，不用經過信箱驗證。
      </p>
      <AccountsTable initialAccounts={accounts ?? []} />
    </div>
  );
}
