import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSubmissionWindow, todayInTaipei, formatDateLabel } from "@/lib/date";
import { MyAvailabilityForm } from "./MyAvailabilityForm";

// 這頁沒有用到 cookies()/searchParams，Next.js 預設可能會把它當成靜態頁在 build 時就固定住，
// 但這裡的「今天是不是開放時間」跟「下個月是哪個月」一定要每次請求都重新算，不能凍結在部署當下
export const dynamic = "force-dynamic";

export default async function MyAvailabilityPage() {
  const window = getSubmissionWindow(todayInTaipei());

  const supabase = createServiceRoleClient();
  const { data: pt } = await supabase
    .from("pt_staff")
    .select("id, name, employment_type")
    .eq("is_active", true)
    .order("name");

  let availability: { pt_id: string; date: string; range: string }[] = [];
  if (window.open) {
    const { data } = await supabase
      .from("pt_daily_availability")
      .select("pt_id, date, range")
      .in("date", window.targetMonthDates);
    availability = data ?? [];
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-white px-4 py-6 dark:bg-zinc-950">
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">填寫下個月可上班日期</h1>
      {window.open ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          請選擇你的名字，填寫 {formatDateLabel(window.targetMonthDates[0])} ～{" "}
          {formatDateLabel(window.targetMonthDates[window.targetMonthDates.length - 1])} 每一天能不能上班，
          {formatDateLabel(window.closesAt)} 前都可以回來修改。
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          每個月 1～20 號才能填寫，現在已經過了這個月的填寫期限，下次開放時間是{" "}
          {formatDateLabel(window.opensAt)} ～ {formatDateLabel(window.closesAt)}，開放後再回來這個頁面填寫下個月的可上班日期。
        </p>
      )}
      <MyAvailabilityForm
        open={window.open}
        targetMonthDates={window.targetMonthDates}
        pt={pt ?? []}
        initialAvailability={availability}
      />
    </div>
  );
}
