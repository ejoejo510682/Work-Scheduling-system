"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ABILITY_LEVELS, type EmploymentType } from "@/lib/constants";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Position = { id: string; name: string };
type Pt = { id: string; name: string; employment_type: EmploymentType };
type Ability = { pt_id: string; position_id: string; level: number };

const levelStyles: Record<number, string> = {
  1: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  2: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  3: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export function AbilitiesGrid({
  positions,
  pt,
  initialAbilities,
}: {
  positions: Position[];
  pt: Pt[];
  initialAbilities: Ability[];
}) {
  const router = useRouter();
  const [levels, setLevels] = useState<Map<string, number>>(
    new Map(initialAbilities.map((a) => [`${a.pt_id}:${a.position_id}`, a.level])),
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function handleChange(ptId: string, positionId: string, level: number) {
    const key = `${ptId}:${positionId}`;
    setSavingKey(key);

    const supabase = createClient();
    const { error } = await supabase
      .from("pt_abilities")
      .upsert({ pt_id: ptId, position_id: positionId, level }, { onConflict: "pt_id,position_id" });

    if (error) {
      alert(`儲存失敗：${error.message}`);
      setSavingKey(null);
      return;
    }

    setLevels((prev) => new Map(prev).set(key, level));
    router.refresh();
    setSavingKey(null);
  }

  if (pt.length === 0) {
    return <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">還沒有人員資料，先到「人員名單」新增。</p>;
  }

  return (
    <div className="mt-6 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
      <table className="text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-800">
          <tr>
            <th className="sticky left-0 bg-zinc-100 px-3 py-2 text-left dark:bg-zinc-800">人員</th>
            {positions.map((p) => (
              <th key={p.id} className="px-3 py-2 text-left whitespace-nowrap">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pt.map((person) => (
            <tr key={person.id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="sticky left-0 bg-white px-3 py-2 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
                <span className="flex items-center gap-2">
                  {person.name}
                  <EmploymentTypeBadge type={person.employment_type} />
                </span>
              </td>
              {positions.map((p) => {
                const key = `${person.id}:${p.id}`;
                const level = levels.get(key) ?? 1;
                return (
                  <td key={p.id} className="px-3 py-2">
                    <select
                      value={level}
                      disabled={savingKey === key}
                      onChange={(e) => handleChange(person.id, p.id, Number(e.target.value))}
                      className={`rounded border-none px-2 py-1 text-xs font-medium ${levelStyles[level]}`}
                    >
                      {ABILITY_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
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
