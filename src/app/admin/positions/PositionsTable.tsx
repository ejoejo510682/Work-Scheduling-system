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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [editingHeadcountId, setEditingHeadcountId] = useState<string | null>(null);
  const [editingHeadcountValue, setEditingHeadcountValue] = useState(1);
  const [headcountError, setHeadcountError] = useState<string | null>(null);

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

  function startEditing(position: Position) {
    setEditingId(position.id);
    setEditingName(position.name);
    setRenameError(null);
  }

  async function saveRename(position: Position) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === position.name) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    setRenameError(null);
    const supabase = createClient();

    const { error: renameError } = await supabase
      .from("positions")
      .update({ name: trimmed })
      .eq("id", position.id);

    if (renameError) {
      setRenameError(renameError.message);
      setSaving(false);
      return;
    }

    // 崗位訓練項目是新增崗位時自動建立的同名項目，改名一起同步，避免兩邊看起來對不上
    await supabase
      .from("training_items")
      .update({ name: `${trimmed}訓練` })
      .eq("position_id", position.id)
      .eq("name", `${position.name}訓練`);

    setSaving(false);
    setEditingId(null);
    router.refresh();
  }

  function startEditingHeadcount(position: Position) {
    setEditingHeadcountId(position.id);
    setEditingHeadcountValue(headcountByPosition.get(position.id) ?? 1);
    setHeadcountError(null);
  }

  async function saveHeadcount(position: Position) {
    if (editingHeadcountValue < 1) {
      setHeadcountError("至少要 1 人");
      return;
    }
    setSaving(true);
    setHeadcountError(null);
    const supabase = createClient();

    const { error: upsertError } = await supabase
      .from("position_headcount")
      .upsert(
        { position_id: position.id, headcount: editingHeadcountValue },
        { onConflict: "position_id" },
      );

    if (upsertError) {
      setHeadcountError(upsertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditingHeadcountId(null);
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
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                  {editingId === p.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(p);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                      />
                      <button
                        onClick={() => saveRename(p)}
                        disabled={saving}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-400"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                        className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
                      >
                        取消
                      </button>
                      {renameError && <p className="text-xs text-red-600 dark:text-red-400">{renameError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      <button
                        onClick={() => startEditing(p)}
                        className="text-xs font-normal text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        編輯
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                  {editingHeadcountId === p.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="number"
                        min={1}
                        value={editingHeadcountValue}
                        onChange={(e) => setEditingHeadcountValue(Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveHeadcount(p);
                          if (e.key === "Escape") setEditingHeadcountId(null);
                        }}
                        className="w-16 rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                      />
                      <button
                        onClick={() => saveHeadcount(p)}
                        disabled={saving}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-400"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditingHeadcountId(null)}
                        disabled={saving}
                        className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
                      >
                        取消
                      </button>
                      {headcountError && (
                        <p className="text-xs text-red-600 dark:text-red-400">{headcountError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{headcountByPosition.get(p.id) ?? "—"} 人</span>
                      <button
                        onClick={() => startEditingHeadcount(p)}
                        className="text-xs font-normal text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        編輯
                      </button>
                    </div>
                  )}
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
