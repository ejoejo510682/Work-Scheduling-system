import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("admin_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "主管") {
    return NextResponse.json({ error: "只有主管可以新增帳號" }, { status: 403 });
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };
  const { email, password, name, role } = body;

  if (!email || !password || !name || (role !== "主管" && role !== "排班人員")) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "建立登入帳號失敗" },
      { status: 400 },
    );
  }

  const { error: insertError } = await admin
    .from("admin_users")
    .insert({ id: created.user.id, email, name, role });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
