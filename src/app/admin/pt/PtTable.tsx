"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  WORK_GROUPS,
  type EmploymentType,
  type Gender,
  type SaturdayGroup,
  type WorkGroup,
} from "@/lib/constants";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Pt = {
  id: string;
  name: string;
  is_active: boolean;
  employment_type: EmploymentType;
  primary_group: WorkGroup;
  gender: Gender;
  can_work_saturday: boolean;
  saturday_group: SaturdayGroup | null;
  auto_schedule_weekdays: boolean;
  is_weekday_printer: boolean;
  shipping_support_position_id: string | null;
};

type PtPatch = Partial<Omit<Pt, "id" | "name">>;

// 「週六」一欄同時管 can_work_saturday 跟 saturday_group：PT 要分「多」「少」組，正職只分輪不輪
type SaturdayChoice = "多" | "少" | "輪流" | "不排";

function saturdayChoiceOf(pt: Pick<Pt, "employment_type" | "can_work_saturday" | "saturday_group">) {
  if (!pt.can_work_saturday) return "不排";
  if (pt.employment_type === "正職") return "輪流";
  return pt.saturday_group ?? "";
}

function saturdayPatch(choice: SaturdayChoice): PtPatch {
  if (choice === "不排") return { can_work_saturday: false, saturday_group: null };
  if (choice === "輪流") return { can_work_saturday: true, saturday_group: null };
  return { can_work_saturday: true, saturday_group: choice };
}

function saturdayOptions(type: EmploymentType): { value: SaturdayChoice; label: string }[] {
  return type === "正職"
    ? [
        { value: "輪流", label: "輪流上週六" },
        { value: "不排", label: "不排週六" },
      ]
    : [
        { value: "多", label: "「多」組" },
        { value: "少", label: "「少」組" },
        { value: "不排", label: "不排週六" },
      ];
}

const typeSelectStyles: Record<EmploymentType, string> = {
  PT: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  正職: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
};

const selectClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function PtTable({
  initialPt,
  shippingPositions,
}: {
  initialPt: Pt[];
  shippingPositions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("PT");
  const [gender, setGender] = useState<Gender | null>(null);
  const [primaryGroup, setPrimaryGroup] = useState<WorkGroup>("出貨組");
  const [saturday, setSaturday] = useState<SaturdayChoice>("少");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!gender) {
      setError("請選擇性別");
      return;
    }
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.from("pt_staff").insert({
      name: name.trim(),
      employment_type: employmentType,
      gender,
      primary_group: primaryGroup,
      ...saturdayPatch(saturday),
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setName("");
    setEmploymentType("PT");
    setGender(null);
    setPrimaryGroup("出貨組");
    setSaturday("少");
    setSaving(false);
    router.refresh();
  }

  function changeNewEmploymentType(type: EmploymentType) {
    setEmploymentType(type);
    setSaturday(type === "正職" ? "不排" : "少");
  }

  async function toggleActive(pt: Pt) {
    const supabase = createClient();
    await supabase.from("pt_staff").update({ is_active: !pt.is_active }).eq("id", pt.id);
    router.refresh();
  }

  function startEditing(pt: Pt) {
    setEditingId(pt.id);
    setEditingName(pt.name);
    setRenameError(null);
  }

  async function saveRename(pt: Pt) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === pt.name) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    setRenameError(null);
    const supabase = createClient();

    const { error: renameError } = await supabase
      .from("pt_staff")
      .update({ name: trimmed })
      .eq("id", pt.id);

    setSaving(false);
    if (renameError) {
      setRenameError(renameError.message);
      return;
    }

    setEditingId(null);
    router.refresh();
  }

  async function updatePt(pt: Pt, patch: PtPatch) {
    setSavingId(pt.id);
    const supabase = createClient();
    const { error } = await supabase.from("pt_staff").update(patch).eq("id", pt.id);
    setSavingId(null);
    if (error) {
      alert(`更新失敗：${error.message}`);
      return;
    }
    router.refresh();
  }

  function changeEmploymentType(pt: Pt, type: EmploymentType) {
    // 換身份別時，只屬於另一種身份的設定一起清掉，避免留下看不到的舊值
    const patch: PtPatch =
      type === "正職"
        ? { employment_type: type, saturday_group: null }
        : { employment_type: type, is_weekday_printer: false, saturday_group: pt.can_work_saturday ? "少" : null };
    updatePt(pt, patch);
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">身份別</th>
              <th className="px-3 py-2">主要組別</th>
              <th className="px-3 py-2">性別</th>
              <th className="px-3 py-2">週六</th>
              <th className="px-3 py-2">平日自動排班</th>
              <th className="px-3 py-2">平日正職印單</th>
              <th className="px-3 py-2">支援出貨只排</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {initialPt.map((pt) => {
              const busy = savingId === pt.id;
              const saturdayValue = saturdayChoiceOf(pt);
              return (
                <tr key={pt.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                    {editingId === pt.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(pt);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                        />
                        <button
                          onClick={() => saveRename(pt)}
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
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {pt.name}
                        <EmploymentTypeBadge type={pt.employment_type} />
                        <button
                          onClick={() => startEditing(pt)}
                          className="text-xs font-normal text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          編輯
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={pt.employment_type}
                      disabled={busy}
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
                    <select
                      value={pt.primary_group}
                      disabled={busy}
                      onChange={(e) => updatePt(pt, { primary_group: e.target.value as WorkGroup })}
                      className={selectClass}
                    >
                      {WORK_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={pt.gender}
                      disabled={busy}
                      onChange={(e) => updatePt(pt, { gender: e.target.value as Gender })}
                      className={selectClass}
                    >
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={saturdayValue}
                      disabled={busy}
                      onChange={(e) => updatePt(pt, saturdayPatch(e.target.value as SaturdayChoice))}
                      className={`${selectClass} ${saturdayValue === "" && pt.is_active ? "border-red-400 dark:border-red-700" : ""}`}
                    >
                      {saturdayValue === "" && (
                        <option value="" disabled>
                          請選組別
                        </option>
                      )}
                      {saturdayOptions(pt.employment_type).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={pt.auto_schedule_weekdays}
                      disabled={busy}
                      onChange={() => updatePt(pt, { auto_schedule_weekdays: !pt.auto_schedule_weekdays })}
                      aria-label={`${pt.name}平日自動排班`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {pt.employment_type === "正職" ? (
                      <input
                        type="checkbox"
                        checked={pt.is_weekday_printer}
                        disabled={busy}
                        onChange={() => updatePt(pt, { is_weekday_printer: !pt.is_weekday_printer })}
                        aria-label={`${pt.name}平日正職印單`}
                      />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {pt.primary_group === "進貨組" ? (
                      <select
                        value={pt.shipping_support_position_id ?? ""}
                        disabled={busy}
                        onChange={(e) => updatePt(pt, { shipping_support_position_id: e.target.value || null })}
                        className={selectClass}
                      >
                        <option value="">不限</option>
                        {shippingPositions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="max-w-3xl space-y-1 rounded border border-zinc-200 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <div>
          <dt className="inline font-medium text-zinc-900 dark:text-zinc-50">主要組別：</dt>
          <dd className="inline">
            自動排班先用同組的人；出貨組只有出貨優先日才找進貨組支援，進貨組以半天為單位，只支援上午的出貨。
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-900 dark:text-zinc-50">性別：</dt>
          <dd className="inline">崗位管理裡設了性別限制的崗位（例如出箱貨限男），只會排符合的人。</dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-900 dark:text-zinc-50">週六：</dt>
          <dd className="inline">
            週六排 1 位正職＋3 位 PT（「多」組 2 位、「少」組 1 位，「多」是三級崗位多的人），組內離上次上週六最久的人先排。
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-900 dark:text-zinc-50">平日自動排班：</dt>
          <dd className="inline">沒勾的人週一～週五系統不會自動排（例如內勤），週六照常。</dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-900 dark:text-zinc-50">平日正職印單：</dt>
          <dd className="inline">週一和正職第三天由這位正職印訂單。</dd>
        </div>
        <div>
          <dt className="inline font-medium text-zinc-900 dark:text-zinc-50">支援出貨只排：</dt>
          <dd className="inline">進貨組的人支援出貨時只排這個崗位（例如連陳軒只排撿貨），不限就照能力排。</dd>
        </div>
      </dl>

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
                  onChange={() => changeNewEmploymentType(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">性別</label>
          <div className="flex gap-3">
            {GENDERS.map((g) => (
              <label key={g} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="radio" name="gender" checked={gender === g} onChange={() => setGender(g)} />
                {g}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">主要組別</label>
          <div className="flex gap-3">
            {WORK_GROUPS.map((g) => (
              <label key={g} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="primary_group"
                  checked={primaryGroup === g}
                  onChange={() => setPrimaryGroup(g)}
                />
                {g}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">週六</label>
          <select
            value={saturday}
            onChange={(e) => setSaturday(e.target.value as SaturdayChoice)}
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          >
            {saturdayOptions(employmentType).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
