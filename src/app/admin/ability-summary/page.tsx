import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { ABILITY_LEVELS } from "@/lib/constants";

const levelStyles: Record<number, string> = {
  1: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
  2: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  3: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

const levelText: Record<number, string> = { 1: "一級", 2: "二級", 3: "三級" };

export default async function AbilitySummaryPage() {
  await requireRole(["主管", "排班人員"]);

  const supabase = await createClient();
  const [{ data: positions }, { data: pt }, { data: abilities }] = await Promise.all([
    supabase.from("positions").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("pt_staff").select("id, name").eq("is_active", true).order("name"),
    supabase.from("pt_abilities").select("pt_id, position_id, level"),
  ]);

  const levelByCell = new Map(
    (abilities ?? []).map((a) => [`${a.pt_id}:${a.position_id}`, a.level]),
  );

  return (
    <div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">能力總表</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        每位 PT 在各崗位上的能力等級（查詢用，如需調整請由主管到「能力等級設定」修改）。
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        {ABILITY_LEVELS.map((l) => (
          <span
            key={l.value}
            className={`rounded px-2 py-1 text-xs font-medium ${levelStyles[l.value]}`}
          >
            {l.label}
          </span>
        ))}
      </div>

      {!pt || pt.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">還沒有 PT 資料。</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className="sticky left-0 bg-zinc-100 px-3 py-2 text-left dark:bg-zinc-800">PT</th>
                {(positions ?? []).map((p) => (
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
                    {person.name}
                  </td>
                  {(positions ?? []).map((p) => {
                    const level = levelByCell.get(`${person.id}:${p.id}`) ?? 1;
                    return (
                      <td key={p.id} className="px-3 py-2">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs font-medium ${levelStyles[level]}`}
                        >
                          {levelText[level]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
