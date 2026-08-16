"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/constants";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Pt = { id: string; name: string; is_active: boolean; employment_type: EmploymentType };

const typeSelectStyles: Record<EmploymentType, string> = {
  PT: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  正職: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
};

export function PtTable({ initialPt }: { initialPt: Pt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("PT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("pt_staff")
      .insert({ name: name.trim(), employment_type: employmentType });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setName("");
    setEmploymentType("PT");
    setSaving(false);
    router.refresh();
  }

  async function toggleActive(pt: Pt) {
    const supabase = createClient();
    await supabase.from("pt_staff").update({ is_active: !pt.is_active }).eq("id", pt.id);
    router.refresh();
  }

  async function changeEmploymentType(pt: Pt, type: EmploymentType) {
    setSavingId(pt.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("pt_staff")
      .update({ employment_type: type })
      .eq("id", pt.id);
    setSavingId(null);
    if (error) {
      alert(`更新失敗：${error.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">身份別</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {initialPt.map((pt) => (
              <tr key={pt.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                  <span className="flex items-center gap-2">
                    {pt.name}
                    <EmploymentTypeBadge type={pt.employment_type} />
                  </span>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={pt.employment_type}
                    disabled={savingId === pt.id}
                    onChange={(e) => changeEmploymentType(pt, e.target.value as EmploymentType)}
                    className={`rounded border-none px-2 py-1 text-xs font-medium ${typeSelectStyles[pt.employment_type]}`}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleActive(pt)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      pt.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {pt.is_active ? "在職" : "已停用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleAdd}
        className="max-w-sm space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">新增人員</h2>
        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">姓名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="姓名"
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">身份別</label>
          <div className="flex gap-3">
            {EMPLOYMENT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="employment_type"
                  checked={employmentType === t}
                  onChange={() => setEmploymentType(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "新增中…" : "新增人員"}
        </button>
      </form>
    </div>
  );
}
