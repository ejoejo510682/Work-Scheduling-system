import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "主管" | "排班人員";

type AdminUserRow = { id: string; role: string; name: string };

// layout 跟每個 page 都會各自呼叫 requireRole，用 cache() 包住實際查詢，
// 同一次請求裡不管呼叫幾次都只會真的問 Supabase 一次，不然每次都要多等好幾百毫秒。
// 查詢改用 current_admin_profile()（資料庫函式，靠 auth.uid() 認人），不用先打一次
// getUser() 問「這是誰」再查角色，省掉一趟網路來回。
const getAuthState = cache(async (): Promise<{ adminUser: AdminUserRow | null }> => {
  const supabase = await createClient();

  const { data } = await supabase.rpc("current_admin_profile");
  const adminUser = (data?.[0] as AdminUserRow | undefined) ?? null;

  return { adminUser };
});

// 在後台頁面的 layout 或 API Route 開頭呼叫，確認已登入且角色符合
export async function requireRole(allowedRoles: AdminRole[]) {
  const { adminUser } = await getAuthState();

  if (!adminUser) {
    redirect("/login");
  }

  if (!allowedRoles.includes(adminUser.role as AdminRole)) {
    redirect("/");
  }

  return adminUser;
}
