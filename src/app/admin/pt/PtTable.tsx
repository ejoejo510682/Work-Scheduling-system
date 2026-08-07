"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Pt = { id: string; name: string; is_active: boolean };

export function PtTable({ initialPt }: { initialPt: Pt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("pt_staff").insert({ name: name.trim() });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setName("");
    setSaving(false);
    router.refresh();
  }

  async function toggleActive(pt: Pt) {
    const supabase = createClient();
    await supabase.from("pt_staff").update({ is_active: !pt.is_active }).eq("id", pt.id);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {initialPt.map((pt) => (
              <tr key={pt.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">{pt.name}</td>
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
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">新增 PT</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="姓名"
          className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "新增中…" : "新增 PT"}
        </button>
      </form>
    </div>
  );
}
