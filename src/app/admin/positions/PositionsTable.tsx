"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SLOTS } from "@/lib/constants";

type Position = { id: string; name: string; is_active: boolean; sort_order: number };
type Headcount = { position_id: string; headcount: number };
type SlotMapRow = { position_id: string; slot: string };

export function PositionsTable({
  initialPositions,
  initialHeadcounts,
  initialSlotMap,
}: {
  initialPositions: Position[];
  initialHeadcounts: Headcount[];
  initialSlotMap: SlotMapRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headcountByPosition = new Map(initialHeadcounts.map((h) => [h.position_id, h.headcount]));
  const slotsByPosition = new Map<string, string[]>();
  for (const row of initialSlotMap) {
    const list = slotsByPosition.get(row.position_id) ?? [];
    list.push(row.slot);
    slotsByPosition.set(row.position_id, list);
  }

  function toggleSlot(slot: string) {
    setSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();

    const { data: position, error: positionError } = await supabase
      .from("positions")
      .insert({ name: name.trim(), sort_order: initialPositions.length })
      .select()
      .single();

    if (positionError || !position) {
      setError(positionError?.message ?? "新增失敗");
      setSaving(false);
      return;
    }

    await Promise.all([
      supabase.from("training_items").insert({ position_id: position.id, name: `${name.trim()}訓練` }),
      supabase.from("position_headcount").insert({ position_id: position.id, headcount }),
      slots.length > 0
        ? supabase
            .from("position_slot_map")
            .insert(slots.map((slot) => ({ position_id: position.id, slot })))
        : Promise.resolve(),
    ]);

    setName("");
    setHeadcount(1);
    setSlots([]);
    setSaving(false);
    router.refresh();
  }

  async function toggleActive(position: Position) {
    const supabase = createClient();
    await supabase.from("positions").update({ is_active: !position.is_active }).eq("id", position.id);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">崗位</th>
              <th className="px-3 py-2">標準需求人力</th>
              <th className="px-3 py-2">適用時段</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {initialPositions.map((p) => (
              <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">{p.name}</td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                  {headcountByPosition.get(p.id) ?? "—"} 人
                </td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                  {(slotsByPosition.get(p.id) ?? []).join("、") || "彈性（不綁定固定時段）"}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      p.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {p.is_active ? "啟用中" : "已停用"}
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
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">新增崗位</h2>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">崗位名稱</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">標準需求人力</label>
          <input
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(Number(e.target.value))}
            className="w-24 rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            適用時段（不勾選代表彈性，不綁定固定時段）
          </label>
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((slot) => (
              <label
                key={slot}
                className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
              >
                <input type="checkbox" checked={slots.includes(slot)} onChange={() => toggleSlot(slot)} />
                {slot}
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
          {saving ? "新增中…" : "新增崗位"}
        </button>
      </form>
    </div>
  );
}
