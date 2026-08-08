"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDateLabel, WEEKDAY_LABELS } from "@/lib/date";
import { AVAILABILITY_RANGES, type AvailabilityRange } from "@/lib/constants";

type Pt = { id: string; name: string };
type Availability = { pt_id: string; date: string; range: string };

const rangeStyles: Record<string, string> = {
  全天: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  只上午: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  只下午: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  全天休假: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
};

export function AvailabilityGrid({
  monday,
  pt,
  initialAvailability,
}: {
  monday: string;
  pt: Pt[];
  initialAvailability: Availability[];
}) {
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [ranges, setRanges] = useState<Map<string, AvailabilityRange>>(
    new Map(
      initialAvailability.map((a) => [`${a.pt_id}:${a.date}`, a.range as AvailabilityRange]),
    ),
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function handleChange(ptId: string, date: string, range: AvailabilityRange) {
    const key = `${ptId}:${date}`;
    setSavingKey(key);

    const supabase = createClient();
    const { error } = await supabase
      .from("pt_daily_availability")
      .upsert({ pt_id: ptId, date, range }, { onConflict: "pt_id,date" });

    setSavingKey(null);

    if (error) {
      alert(`儲存失敗：${error.message}`);
      return;
    }

    setRanges((prev) => new Map(prev).set(key, range));
    router.refresh();
  }

  if (pt.length === 0) {
    return <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">還沒有 PT 資料。</p>;
  }

  return (
    <div className="mt-6 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
      <table className="text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-800">
          <tr>
            <th className="sticky left-0 bg-zinc-100 px-3 py-2 text-left dark:bg-zinc-800">PT</th>
            {days.map((date, i) => (
              <th key={date} className="px-3 py-2 text-left whitespace-nowrap">
                週{WEEKDAY_LABELS[i]} {formatDateLabel(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pt.map((person) => (
            <tr key={person.id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="sticky left-0 bg-white px-3 py-2 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
                {person.name}
              </td>
              {days.map((date) => {
                const key = `${person.id}:${date}`;
                const range = ranges.get(key) ?? "全天";
                return (
                  <td key={date} className="px-3 py-2">
                    <select
                      value={range}
                      disabled={savingKey === key}
                      onChange={(e) =>
                        handleChange(person.id, date, e.target.value as AvailabilityRange)
                      }
                      className={`rounded border-none px-2 py-1 text-xs font-medium ${rangeStyles[range]}`}
                    >
                      {AVAILABILITY_RANGES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
