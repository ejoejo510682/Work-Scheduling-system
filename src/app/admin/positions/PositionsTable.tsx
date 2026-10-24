"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GENDERS, SLOTS, WORK_GROUPS, type EmploymentType, type Gender, type WorkGroup } from "@/lib/constants";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Position = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  work_group: WorkGroup;
  included_in_auto_schedule: boolean;
  gender_restriction: Gender | null;
  max_headcount: number | null;
  fill_first: boolean;
};
type Headcount = {
  id: string;
  position_id: string;
  slot: string | null;
  headcount: number;
  monday_headcount: number | null;
  priority_headcount: number | null;
};
type SlotMapRow = { position_id: string; slot: string };
type PreferredRow = { position_id: string; pt_id: string; rank: number };
type Staff = { id: string; name: string; employment_type: EmploymentType; gender: Gender };

// 編輯中的人數用字串存，空白代表「跟平常一樣」
type HeadcountDraft = { slot: string | null; headcount: string; monday: string; priority: string };
type AutoDraft = {
  included: boolean;
  fillFirst: boolean;
  gender: Gender | "";
  preferred: string[];
};

const inputClass =
  "w-14 rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const selectClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const editButtonClass = "shrink-0 text-xs font-normal text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200";
const saveButtonClass =
  "text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-400";
const cancelButtonClass = "text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300";
const chipClass = "rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

function optionalCount(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function PositionsTable({
  initialPositions,
  initialHeadcounts,
  initialSlotMap,
  initialPreferred,
  staff,
}: {
  initialPositions: Position[];
  initialHeadcounts: Headcount[];
  initialSlotMap: SlotMapRow[];
  initialPreferred: PreferredRow[];
  staff: Staff[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [editingHeadcountId, setEditingHeadcountId] = useState<string | null>(null);
  const [headcountDrafts, setHeadcountDrafts] = useState<HeadcountDraft[]>([]);
  const [maxDraft, setMaxDraft] = useState("");
  const [headcountError, setHeadcountError] = useState<string | null>(null);

  const [editingSlotsId, setEditingSlotsId] = useState<string | null>(null);
  const [editingSlotsValue, setEditingSlotsValue] = useState<string[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [editingAutoId, setEditingAutoId] = useState<string | null>(null);
  const [autoDraft, setAutoDraft] = useState<AutoDraft | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);

  const slotsByPosition = new Map<string, string[]>();
  for (const row of initialSlotMap) {
    const list = slotsByPosition.get(row.position_id) ?? [];
    list.push(row.slot);
    slotsByPosition.set(row.position_id, list);
  }
  const orderedSlots = (positionId: string) =>
    SLOTS.filter((s) => (slotsByPosition.get(positionId) ?? []).includes(s));

  const headcountsByPosition = new Map<string, Headcount[]>();
  for (const h of initialHeadcounts) {
    const list = headcountsByPosition.get(h.position_id) ?? [];
    list.push(h);
    headcountsByPosition.set(h.position_id, list);
  }
  // 有綁時段的崗位每個時段一列；彈性崗位只有一列 slot = null
  function headcountRowsFor(positionId: string): { slot: string | null; row: Headcount | undefined }[] {
    const rows = headcountsByPosition.get(positionId) ?? [];
    const positionSlots = orderedSlots(positionId);
    if (positionSlots.length === 0) return [{ slot: null, row: rows.find((r) => r.slot === null) }];
    return positionSlots.map((slot) => ({ slot, row: rows.find((r) => r.slot === slot) }));
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const preferredByPosition = new Map<string, string[]>();
  for (const row of initialPreferred) {
    const list = preferredByPosition.get(row.position_id) ?? [];
    list.push(row.pt_id);
    preferredByPosition.set(row.position_id, list);
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

    const headcountSlots: (string | null)[] = slots.length > 0 ? slots : [null];
    const headcountRows = headcountSlots.map((slot) => ({ position_id: position.id, slot, headcount }));

    await Promise.all([
      supabase.from("training_items").insert({ position_id: position.id, name: `${name.trim()}訓練` }),
      supabase.from("position_headcount").insert(headcountRows),
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

  async function changeWorkGroup(position: Position, group: WorkGroup) {
    setSavingId(position.id);
    const supabase = createClient();
    const { error } = await supabase.from("positions").update({ work_group: group }).eq("id", position.id);
    setSavingId(null);
    if (error) {
      alert(`更新失敗：${error.message}`);
      return;
    }
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
    setHeadcountDrafts(
      headcountRowsFor(position.id).map(({ slot, row }) => ({
        slot,
        headcount: String(row?.headcount ?? 1),
        monday: row?.monday_headcount == null ? "" : String(row.monday_headcount),
        priority: row?.priority_headcount == null ? "" : String(row.priority_headcount),
      })),
    );
    setMaxDraft(position.max_headcount == null ? "" : String(position.max_headcount));
    setHeadcountError(null);
  }

  function updateHeadcountDraft(index: number, patch: Partial<HeadcountDraft>) {
    setHeadcountDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function saveHeadcount(position: Position) {
    const numbers = headcountDrafts.flatMap((d) => [Number(d.headcount), optionalCount(d.monday), optionalCount(d.priority)]);
    if (headcountDrafts.some((d) => d.headcount.trim() === "") || numbers.some((n) => n !== null && !(n >= 1))) {
      setHeadcountError("人數至少要 1 人");
      return;
    }
    const max = optionalCount(maxDraft);
    if (max !== null && !(max >= 1)) {
      setHeadcountError("上限至少要 1 人，不設上限請留空");
      return;
    }
    setSaving(true);
    setHeadcountError(null);
    const supabase = createClient();
    const existing = headcountRowsFor(position.id);

    const results = await Promise.all([
      ...headcountDrafts.map((d, i) => {
        const values = {
          headcount: Number(d.headcount),
          monday_headcount: optionalCount(d.monday),
          priority_headcount: optionalCount(d.priority),
        };
        const row = existing[i]?.row;
        return row
          ? supabase.from("position_headcount").update(values).eq("id", row.id)
          : supabase.from("position_headcount").insert({ position_id: position.id, slot: d.slot, ...values });
      }),
      supabase.from("positions").update({ max_headcount: max }).eq("id", position.id),
    ]);

    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setHeadcountError(failed.error.message);
      router.refresh();
      return;
    }
    setEditingHeadcountId(null);
    router.refresh();
  }

  function startEditingSlots(position: Position) {
    setEditingSlotsId(position.id);
    setEditingSlotsValue(slotsByPosition.get(position.id) ?? []);
    setSlotsError(null);
  }

  function toggleEditingSlot(slot: string) {
    setEditingSlotsValue((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  async function saveSlots(position: Position) {
    setSaving(true);
    setSlotsError(null);
    const supabase = createClient();
    const current = slotsByPosition.get(position.id) ?? [];
    const toAdd = editingSlotsValue.filter((s) => !current.includes(s));
    const toRemove = current.filter((s) => !editingSlotsValue.includes(s));

    // 只增刪有變動的時段，不先整批刪除再重建，避免中途失敗時把原本的時段設定弄丟
    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("position_slot_map")
        .delete()
        .eq("position_id", position.id)
        .in("slot", toRemove);
      if (deleteError) {
        setSlotsError(deleteError.message);
        setSaving(false);
        return;
      }
    }
    if (toAdd.length > 0) {
      const { error: insertError } = await supabase
        .from("position_slot_map")
        .insert(toAdd.map((slot) => ({ position_id: position.id, slot })));
      if (insertError) {
        setSlotsError(insertError.message);
        setSaving(false);
        router.refresh();
        return;
      }
    }

    // 需求人數跟著時段走：新時段沿用這個崗位原本的人數，拿掉的時段刪掉人數
    const rows = headcountsByPosition.get(position.id) ?? [];
    const template = rows[0];
    const copy = {
      headcount: template?.headcount ?? 1,
      monday_headcount: template?.monday_headcount ?? null,
      priority_headcount: template?.priority_headcount ?? null,
    };
    const nextSlots: (string | null)[] = editingSlotsValue.length > 0 ? editingSlotsValue : [null];
    const staleIds = rows.filter((r) => !nextSlots.includes(r.slot)).map((r) => r.id);
    const missing = nextSlots.filter((slot) => !rows.some((r) => r.slot === slot));
    await Promise.all([
      staleIds.length > 0 ? supabase.from("position_headcount").delete().in("id", staleIds) : Promise.resolve(),
      missing.length > 0
        ? supabase.from("position_headcount").insert(missing.map((slot) => ({ position_id: position.id, slot, ...copy })))
        : Promise.resolve(),
    ]);

    setSaving(false);
    setEditingSlotsId(null);
    router.refresh();
  }

  function startEditingAuto(position: Position) {
    setEditingAutoId(position.id);
    setAutoDraft({
      included: position.included_in_auto_schedule,
      fillFirst: position.fill_first,
      gender: position.gender_restriction ?? "",
      preferred: preferredByPosition.get(position.id) ?? [],
    });
    setAutoError(null);
  }

  function movePreferred(index: number, delta: number) {
    setAutoDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.preferred];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, preferred: next };
    });
  }

  async function saveAuto(position: Position) {
    if (!autoDraft) return;
    setSaving(true);
    setAutoError(null);
    const supabase = createClient();
    const current = preferredByPosition.get(position.id) ?? [];
    const removed = current.filter((id) => !autoDraft.preferred.includes(id));

    const results = await Promise.all([
      supabase
        .from("positions")
        .update({
          included_in_auto_schedule: autoDraft.included,
          fill_first: autoDraft.fillFirst,
          gender_restriction: autoDraft.gender || null,
        })
        .eq("id", position.id),
      removed.length > 0
        ? supabase.from("position_preferred_staff").delete().eq("position_id", position.id).in("pt_id", removed)
        : Promise.resolve({ error: null }),
      autoDraft.preferred.length > 0
        ? supabase.from("position_preferred_staff").upsert(
            autoDraft.preferred.map((pt_id, i) => ({ position_id: position.id, pt_id, rank: i + 1 })),
            { onConflict: "position_id,pt_id" },
          )
        : Promise.resolve({ error: null }),
    ]);

    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setAutoError(failed.error.message);
      router.refresh();
      return;
    }
    setEditingAutoId(null);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">崗位</th>
              <th className="px-3 py-2">組別</th>
              <th className="px-3 py-2">需求人數</th>
              <th className="px-3 py-2">適用時段</th>
              <th className="px-3 py-2">自動排班</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {initialPositions.map((p) => {
              const preferredNames = (preferredByPosition.get(p.id) ?? []).map(
                (id) => staffById.get(id)?.name ?? "（已停用）",
              );
              return (
                <Fragment key={p.id}>
                  <tr className="border-t border-zinc-200 align-top dark:border-zinc-800">
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
                          <button onClick={() => saveRename(p)} disabled={saving} className={saveButtonClass}>
                            儲存
                          </button>
                          <button onClick={() => setEditingId(null)} disabled={saving} className={cancelButtonClass}>
                            取消
                          </button>
                          {renameError && <p className="text-xs text-red-600 dark:text-red-400">{renameError}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span>{p.name}</span>
                          <button onClick={() => startEditing(p)} className={editButtonClass}>
                            編輯
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={p.work_group}
                        disabled={savingId === p.id}
                        onChange={(e) => changeWorkGroup(p, e.target.value as WorkGroup)}
                        className={selectClass}
                      >
                        {WORK_GROUPS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      <div className="flex items-start gap-2">
                        <div className="space-y-0.5">
                          {headcountRowsFor(p.id).map(({ slot, row }) => (
                            <div key={slot ?? "flex"} className="whitespace-nowrap">
                              {slot && <span className="text-xs text-zinc-500 dark:text-zinc-400">{slot}　</span>}
                              {row ? `${row.headcount} 人` : "—"}
                              {row?.monday_headcount != null && (
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                  ・週一 {row.monday_headcount}
                                </span>
                              )}
                              {row?.priority_headcount != null && (
                                <span className="text-xs text-sky-700 dark:text-sky-400">
                                  ・出貨優先日 {row.priority_headcount}
                                </span>
                              )}
                            </div>
                          ))}
                          {p.max_headcount != null && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              上限 {p.max_headcount} 人（含備援）
                            </div>
                          )}
                        </div>
                        <button onClick={() => startEditingHeadcount(p)} className={editButtonClass}>
                          編輯
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {editingSlotsId === p.id ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {SLOTS.map((slot) => (
                              <label
                                key={slot}
                                className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={editingSlotsValue.includes(slot)}
                                  onChange={() => toggleEditingSlot(slot)}
                                />
                                {slot}
                              </label>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveSlots(p)} disabled={saving} className={saveButtonClass}>
                              儲存
                            </button>
                            <button
                              onClick={() => setEditingSlotsId(null)}
                              disabled={saving}
                              className={cancelButtonClass}
                            >
                              取消
                            </button>
                            {slotsError && <p className="text-xs text-red-600 dark:text-red-400">{slotsError}</p>}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{orderedSlots(p.id).join("、") || "彈性（不綁定固定時段）"}</span>
                          <button onClick={() => startEditingSlots(p)} className={editButtonClass}>
                            編輯
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-wrap gap-1">
                          {p.included_in_auto_schedule ? (
                            <>
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                自動排
                              </span>
                              {p.fill_first && <span className={chipClass}>優先排滿</span>}
                              {p.gender_restriction && <span className={chipClass}>限{p.gender_restriction}</span>}
                              {preferredNames.length > 0 && (
                                <span className={chipClass}>優先人選：{preferredNames.join(" → ")}</span>
                              )}
                            </>
                          ) : (
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                              不自動排（用任務登記）
                            </span>
                          )}
                        </div>
                        <button onClick={() => startEditingAuto(p)} className={editButtonClass}>
                          編輯
                        </button>
                      </div>
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

                  {editingHeadcountId === p.id && (
                    <tr className="bg-zinc-50 dark:bg-zinc-900">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="space-y-3">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            「週一」「出貨優先日」留空代表跟平常一樣。週一剛好也是出貨優先日時，取兩者中較多的人數。
                          </p>
                          <table className="text-sm">
                            <thead className="text-left text-xs text-zinc-500 dark:text-zinc-400">
                              <tr>
                                <th className="pr-4 font-normal">時段</th>
                                <th className="pr-4 font-normal">平常</th>
                                <th className="pr-4 font-normal">週一</th>
                                <th className="pr-4 font-normal">出貨優先日</th>
                              </tr>
                            </thead>
                            <tbody>
                              {headcountDrafts.map((d, i) => (
                                <tr key={d.slot ?? "flex"}>
                                  <td className="py-1 pr-4 text-zinc-700 dark:text-zinc-300">{d.slot ?? "彈性"}</td>
                                  <td className="py-1 pr-4">
                                    <input
                                      type="number"
                                      min={1}
                                      value={d.headcount}
                                      onChange={(e) => updateHeadcountDraft(i, { headcount: e.target.value })}
                                      className={inputClass}
                                      aria-label={`${d.slot ?? "彈性"}平常人數`}
                                    />
                                  </td>
                                  <td className="py-1 pr-4">
                                    <input
                                      type="number"
                                      min={1}
                                      value={d.monday}
                                      placeholder="同平常"
                                      onChange={(e) => updateHeadcountDraft(i, { monday: e.target.value })}
                                      className={`${inputClass} w-20`}
                                      aria-label={`${d.slot ?? "彈性"}週一人數`}
                                    />
                                  </td>
                                  <td className="py-1 pr-4">
                                    <input
                                      type="number"
                                      min={1}
                                      value={d.priority}
                                      placeholder="同平常"
                                      onChange={(e) => updateHeadcountDraft(i, { priority: e.target.value })}
                                      className={`${inputClass} w-20`}
                                      aria-label={`${d.slot ?? "彈性"}出貨優先日人數`}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            同一時段最多
                            <input
                              type="number"
                              min={1}
                              value={maxDraft}
                              placeholder="不限"
                              onChange={(e) => setMaxDraft(e.target.value)}
                              className={`${inputClass} w-20`}
                            />
                            人（備援也算在內，例如包裝只有 4 個工位）
                          </label>
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveHeadcount(p)} disabled={saving} className={saveButtonClass}>
                              儲存
                            </button>
                            <button
                              onClick={() => setEditingHeadcountId(null)}
                              disabled={saving}
                              className={cancelButtonClass}
                            >
                              取消
                            </button>
                            {headcountError && (
                              <p className="text-xs text-red-600 dark:text-red-400">{headcountError}</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {editingAutoId === p.id && autoDraft && (
                    <tr className="bg-zinc-50 dark:bg-zinc-900">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="max-w-xl space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={autoDraft.included}
                              onChange={() => setAutoDraft({ ...autoDraft, included: !autoDraft.included })}
                            />
                            納入自動排班（不勾＝任務型崗位，例如處理批發訂單，改用任務登記指定人）
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={autoDraft.fillFirst}
                              onChange={() => setAutoDraft({ ...autoDraft, fillFirst: !autoDraft.fillFirst })}
                            />
                            優先排滿（每個出貨崗位先各 1 人後，先把這個崗位排滿再排其他崗位）
                          </label>
                          <label className="flex items-center gap-2">
                            性別限制
                            <select
                              value={autoDraft.gender}
                              onChange={(e) => setAutoDraft({ ...autoDraft, gender: e.target.value as Gender | "" })}
                              className={selectClass}
                            >
                              <option value="">不限</option>
                              {GENDERS.map((g) => (
                                <option key={g} value={g}>
                                  限{g}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="space-y-1">
                            <div>優先人選（排這個崗位時照順序先挑，都排不了才用一般順序）</div>
                            {autoDraft.preferred.length === 0 && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">沒有設定</p>
                            )}
                            <ol className="space-y-1">
                              {autoDraft.preferred.map((id, i) => {
                                const s = staffById.get(id);
                                return (
                                  <li key={id} className="flex items-center gap-2">
                                    <span className="w-5 text-right text-xs text-zinc-500">{i + 1}.</span>
                                    <span>{s?.name ?? "（已停用）"}</span>
                                    {s && <EmploymentTypeBadge type={s.employment_type} />}
                                    {s && autoDraft.gender && s.gender !== autoDraft.gender && (
                                      <span className="text-xs text-red-600 dark:text-red-400">
                                        不符合性別限制，不會被排
                                      </span>
                                    )}
                                    <button
                                      onClick={() => movePreferred(i, -1)}
                                      disabled={i === 0}
                                      className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
                                      aria-label="往前"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      onClick={() => movePreferred(i, 1)}
                                      disabled={i === autoDraft.preferred.length - 1}
                                      className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
                                      aria-label="往後"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      onClick={() =>
                                        setAutoDraft({
                                          ...autoDraft,
                                          preferred: autoDraft.preferred.filter((x) => x !== id),
                                        })
                                      }
                                      className="text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                                    >
                                      移除
                                    </button>
                                  </li>
                                );
                              })}
                            </ol>
                            <select
                              value=""
                              onChange={(e) =>
                                e.target.value &&
                                setAutoDraft({ ...autoDraft, preferred: [...autoDraft.preferred, e.target.value] })
                              }
                              className={selectClass}
                            >
                              <option value="">＋ 加入優先人選…</option>
                              {staff
                                .filter((s) => !autoDraft.preferred.includes(s.id))
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}（{s.employment_type}）
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveAuto(p)} disabled={saving} className={saveButtonClass}>
                              儲存
                            </button>
                            <button
                              onClick={() => setEditingAutoId(null)}
                              disabled={saving}
                              className={cancelButtonClass}
                            >
                              取消
                            </button>
                            {autoError && <p className="text-xs text-red-600 dark:text-red-400">{autoError}</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            需求人數（每個時段都先用這個人數，建立後可以分時段調整）
          </label>
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
