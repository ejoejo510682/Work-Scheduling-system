import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "主管" | "排班人員";

// 在後台頁面的 layout 或 API Route 開頭呼叫，確認已登入且角色符合
export async function requireRole(allowedRoles: AdminRole[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (!adminUser || !allowedRoles.includes(adminUser.role as AdminRole)) {
    redirect("/");
  }

  return adminUser;
}
