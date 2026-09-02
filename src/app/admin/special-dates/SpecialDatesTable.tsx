"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SPECIAL_DATE_TYPES, type SpecialDateType } from "@/lib/constants";

type SpecialDate = {
  id: string;
  date: string;
  type: SpecialDateType;
  name: string;
  note: string | null;
};

const typeStyles: Record<SpecialDateType, string> = {
  國定假日: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  電商檔期: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
};

export function SpecialDatesTable({ initialSpecialDates }: { initialSpecialDates: SpecialDate[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [type, setType] = useState<SpecialDateType>("國定假日");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("special_dates")
      .insert({ date, type, name: name.trim(), note: note.trim() || null });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setDate("");
    setName("");
    setNote("");
    setSaving(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆日期嗎？")) return;
    const supabase = createClient();
    await supabase.from("special_dates").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">日期</th>
              <th className="px-3 py-2">類型</th>
              <th className="px-3 py-2">名稱</th>
              <th className="px-3 py-2">備註</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {initialSpecialDates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  還沒有資料
                </td>
              </tr>
            )}
            {initialSpecialDates.map((sd) => (
              <tr key={sd.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">{sd.date}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-1 text-xs font-medium ${typeStyles[sd.type]}`}>
                    {sd.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{sd.name}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{sd.note ?? "—"}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleDelete(sd.id)}
                    className="text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleAdd}
        className="max-w-md space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">新增日期</h2>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">類型</label>
          <div className="flex gap-3">
            {SPECIAL_DATE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="special_date_type"
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">名稱</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：中秋節、黑色星期五"
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">備註（選填）</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "新增中…" : "新增"}
        </button>
      </form>
    </div>
  );
}
