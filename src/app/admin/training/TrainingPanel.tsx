"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TrainingItemRow, TrainingRecordRow } from "./page";
import type { EmploymentType } from "@/lib/constants";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Pt = { id: string; name: string; employment_type: EmploymentType };

const statusStyles: Record<string, string> = {
  進行中: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  已完成: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export function TrainingPanel({
  adminUserId,
  pt,
  trainingItems,
  initialRecords,
}: {
  adminUserId: string;
  pt: Pt[];
  trainingItems: TrainingItemRow[];
  initialRecords: TrainingRecordRow[];
}) {
  const router = useRouter();
  const [ptId, setPtId] = useState(pt[0]?.id ?? "");
  const [trainingItemId, setTrainingItemId] = useState(trainingItems[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!ptId || !trainingItemId) return;
    setSaving(true);
    setError(null);

    const item = trainingItems.find((t) => t.id === trainingItemId);
    if (!item) {
      setSaving(false);
      return;
    }

    const supabase = createClient();

    const { error: insertError } = await supabase
      .from("training_records")
      .insert({ pt_id: ptId, training_item_id: trainingItemId, status: "進行中" });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    const { data: existingAbility } = await supabase
      .from("pt_abilities")
      .select("level")
      .eq("pt_id", ptId)
      .eq("position_id", item.position_id)
      .maybeSingle();

    if (!existingAbility || existingAbility.level < 2) {
      await supabase
        .from("pt_abilities")
        .upsert(
          { pt_id: ptId, position_id: item.position_id, level: 2 },
          { onConflict: "pt_id,position_id" },
        );
    }

    setSaving(false);
    router.refresh();
  }

  async function handleApprove(record: TrainingRecordRow) {
    if (!record.training_items) return;
    setApprovingId(record.id);

    const supabase = createClient();

    await supabase
      .from("training_records")
      .update({ status: "已完成", approved_by: adminUserId, approved_at: new Date().toISOString() })
      .eq("id", record.id);

    await supabase.from("pt_abilities").upsert(
      { pt_id: record.pt_id, position_id: record.training_items.position_id, level: 3 },
      { onConflict: "pt_id,position_id" },
    );

    setApprovingId(null);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <form
        onSubmit={handleRegister}
        className="flex max-w-xl flex-wrap items-end gap-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">人員</label>
          <select
            value={ptId}
            onChange={(e) => setPtId(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {pt.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.employment_type}）
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">訓練項目</label>
          <select
            value={trainingItemId}
            onChange={(e) => setTrainingItemId(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {trainingItems.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{t.positions?.name}）
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "登記中…" : "登記受訓"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">人員</th>
              <th className="px-3 py-2">訓練項目</th>
              <th className="px-3 py-2">狀態</th>
              <th className="px-3 py-2">核准時間</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {initialRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  還沒有訓練紀錄
                </td>
              </tr>
            )}
            {initialRecords.map((r) => (
              <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                  <span className="flex items-center gap-2">
                    {r.pt_staff && <EmploymentTypeBadge type={r.pt_staff.employment_type} />}
                    {r.pt_staff?.name}
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.training_items?.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-1 text-xs font-medium ${statusStyles[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  {r.approved_at ? new Date(r.approved_at).toLocaleDateString("zh-TW") : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.status === "進行中" && (
                    <button
                      onClick={() => handleApprove(r)}
                      disabled={approvingId === r.id}
                      className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {approvingId === r.id ? "處理中…" : "核准完訓"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
