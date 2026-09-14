import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "主管" | "排班人員";

type AdminUserRow = { id: string; role: string; name: string };

// layout 跟每個 page 都會各自呼叫 requireRole，用 cache() 包住實際查詢，
// 同一次請求裡不管呼叫幾次都只會真的問 Supabase 一次，不然每次都要多等好幾百毫秒
const getAuthState = cache(async (): Promise<{ userId: string | null; adminUser: AdminUserRow | null }> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, adminUser: null };

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, role, name")
    .eq("id", user.id)
    .single();

  return { userId: user.id, adminUser };
});

// 在後台頁面的 layout 或 API Route 開頭呼叫，確認已登入且角色符合
export async function requireRole(allowedRoles: AdminRole[]) {
  const { userId, adminUser } = await getAuthState();

  if (!userId) {
    redirect("/login");
  }

  if (!adminUser || !allowedRoles.includes(adminUser.role as AdminRole)) {
    redirect("/");
  }

  return adminUser;
}
