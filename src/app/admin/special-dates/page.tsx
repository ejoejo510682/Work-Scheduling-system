import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { SpecialDatesTable } from "./SpecialDatesTable";

export default async function SpecialDatesPage() {
  await requireRole(["主管", "排班人員"]);

  const supabase = await createClient();
  const { data: specialDates } = await supabase
    .from("special_dates")
    .select("id, date, type, name, note")
    .order("date");

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">假日與檔期</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        國定假日、以及規律以外的自訂電商檔期（例如黑色星期五）放在這裡管理，排班時會提醒。
        每個月固定的雙字日／18號／25號檔期不用在這裡新增，系統會自動提醒。
      </p>
      <SpecialDatesTable initialSpecialDates={specialDates ?? []} />
    </div>
  );
}
