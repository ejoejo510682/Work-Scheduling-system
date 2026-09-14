import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 崗位、人員名單這類資料很少變動（通常一天改不到一次），但排班相關頁面幾乎每次點擊都要重新問一次。
// 這裡快取 60 秒：對排班操作來說幾乎不會察覺差異，但能省下大量重複查詢。
// 用 service role 讀（不是看誰登入），因為這份資料本來就是所有後台帳號都看得到的，沒有依人而異的權限差異；
// unstable_cache 內部不能碰 cookies，用一般登入者的 client 會直接違反這個限制。
// 崗位管理、人員名單頁本身（真正在編輯這些資料的地方）刻意不套用快取，改了要馬上看到自己的結果。

export const getCachedPositions = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("positions")
      .select("id, name, sort_order, is_active")
      .order("sort_order");
    return data ?? [];
  },
  ["positions"],
  { revalidate: 60 },
);

export const getCachedActivePositions = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("positions")
      .select("id, name, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    return data ?? [];
  },
  ["positions-active"],
  { revalidate: 60 },
);

export const getCachedPositionSlotMap = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase.from("position_slot_map").select("position_id, slot");
    return data ?? [];
  },
  ["position-slot-map"],
  { revalidate: 60 },
);

export const getCachedPositionHeadcount = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase.from("position_headcount").select("position_id, headcount");
    return data ?? [];
  },
  ["position-headcount"],
  { revalidate: 60 },
);

export const getCachedActivePt = unstable_cache(
  async () => {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("pt_staff")
      .select("id, name, employment_type")
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  },
  ["pt-staff-active"],
  { revalidate: 60 },
);
