"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SLOTS, type EmploymentType } from "@/lib/constants";
import { addDays, formatDateLabel, WEEKDAY_LABELS } from "@/lib/date";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Position = { id: string; name: string; included_in_auto_schedule: boolean };
type SlotMapRow = { position_id: string; slot: string };
type Pt = { id: string; name: string; employment_type: EmploymentType };
type Ability = { pt_id: string; position_id: string; level: number };
type TaskRequest = {
  id: string;
  date: string;
  slot: string;
  position_id: string;
  headcount: number;
  note: string | null;
};
type RequestStaff = { request_id: string; pt_id: string };
type Template = {
  id: string;
  position_id: string;
  slot: string;
  weekdays: number[];
  pt_id: string;
  substitute_pt_id: string | null;
};

// 固定任務只排週一～週五，存 1＝週一…5＝週五
const TEMPLATE_WEEKDAYS = [1, 2, 3, 4, 5];

const fieldClass =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const smallFieldClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const primaryButtonClass =
  "rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";
const linkButtonClass = "text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200";
const saveButtonClass =
  "text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-400";
const deleteButtonClass = "text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400";

const LEVEL_LABELS: Record<number, string> = { 1: "一級", 2: "二級", 3: "三級" };

// 某個崗位的候選人＋他在這個崗位的能力等級
type RankedPerson = { person: Pt; level: number };

function LevelTag({ level }: { level: number }) {
  return (
    <span className={`text-[10px] ${level === 1 ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

function PersonChip({ person, level }: { person: Pt | undefined; level: number }) {
  return (
    <span className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {person && <EmploymentTypeBadge type={person.employment_type} />}
      {person?.name ?? "（已停用）"}
      <LevelTag level={level} />
    </span>
  );
}

function StaffPicker({
  staff,
  selected,
  onChange,
}: {
  staff: RankedPerson[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {staff.map(({ person, level }) => (
        <label
          key={person.id}
          className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
            selected.includes(person.id)
              ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          <input
            type="checkbox"
            checked={selected.includes(person.id)}
            onChange={() =>
              onChange(
                selected.includes(person.id) ? selected.filter((id) => id !== person.id) : [...selected, person.id],
              )
            }
          />
          <EmploymentTypeBadge type={person.employment_type} />
          {person.name}
          <LevelTag level={level} />
        </label>
      ))}
    </div>
  );
}

function PersonSelect({
  staff,
  value,
  onChange,
  emptyLabel,
  className,
}: {
  staff: RankedPerson[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  className: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{emptyLabel}</option>
      {staff.map(({ person, level }) => (
        <option key={person.id} value={person.id}>
          {person.name}（{person.employment_type}・{LEVEL_LABELS[level]}）
        </option>
      ))}
    </select>
  );
}

function WeekdayChecks({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  const toggle = (day: number) => (value.includes(day) ? value.filter((d) => d !== day) : [...value, day]).sort();
  return (
    <div className="flex gap-2">
      {TEMPLATE_WEEKDAYS.map((day) => (
        <label key={day} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={value.includes(day)} onChange={() => onChange(toggle(day))} />
          {WEEKDAY_LABELS[day - 1]}
        </label>
      ))}
    </div>
  );
}

export function TaskRegistration({
  monday,
  positions,
  slotMap,
  pt,
  abilities,
  initialRequests,
  initialRequestStaff,
  initialTemplates,
}: {
  monday: string;
  positions: Position[];
  slotMap: SlotMapRow[];
  pt: Pt[];
  abilities: Ability[];
  initialRequests: TaskRequest[];
  initialRequestStaff: RequestStaff[];
  initialTemplates: Template[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const ptById = new Map(pt.map((p) => [p.id, p]));
  const levelByKey = new Map(abilities.map((a) => [`${a.pt_id}:${a.position_id}`, a.level]));
  const levelOf = (ptId: string, positionId: string) => levelByKey.get(`${ptId}:${positionId}`) ?? 1;
  // 任務型崗位排在前面，登記任務時最常用
  const sortedPositions = [...positions].sort(
    (a, b) => Number(a.included_in_auto_schedule) - Number(b.included_in_auto_schedule),
  );
  const slotsFor = (positionId: string) => {
    const mapped = SLOTS.filter((s) => slotMap.some((m) => m.position_id === positionId && m.slot === s));
    return mapped.length > 0 ? mapped : [...SLOTS];
  };
  const staffFor = (positionId: string): RankedPerson[] =>
    pt
      .map((person) => ({ person, level: levelOf(person.id, positionId) }))
      .sort((a, b) => b.level - a.level || a.person.name.localeCompare(b.person.name));
  const weekDates = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const dayLabel = (date: string) => `${formatDateLabel(date)}（${WEEKDAY_LABELS[weekDates.indexOf(date)]}）`;
  const staffByRequest = new Map<string, string[]>();
  for (const row of initialRequestStaff) {
    const list = staffByRequest.get(row.request_id) ?? [];
    list.push(row.pt_id);
    staffByRequest.set(row.request_id, list);
  }

  // ──────────── 本週任務 ────────────
  const firstPositionId = sortedPositions[0]?.id ?? "";
  const [reqDate, setReqDate] = useState(monday);
  const [reqPositionId, setReqPositionId] = useState(firstPositionId);
  const [reqSlot, setReqSlot] = useState<string>(slotsFor(firstPositionId)[0]);
  const [reqHeadcount, setReqHeadcount] = useState(1);
  const [reqStaff, setReqStaff] = useState<string[]>([]);
  const [reqNote, setReqNote] = useState("");
  const [reqError, setReqError] = useState<string | null>(null);

  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editHeadcount, setEditHeadcount] = useState(1);
  const [editStaff, setEditStaff] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  function changeRequestPosition(positionId: string) {
    setReqPositionId(positionId);
    setReqSlot(slotsFor(positionId)[0]);
  }

  async function addRequest(e: React.FormEvent) {
    e.preventDefault();
    if (reqStaff.length > reqHeadcount) {
      setReqError(`指定了 ${reqStaff.length} 人，比需要的 ${reqHeadcount} 人多`);
      return;
    }
    setBusy(true);
    setReqError(null);
    const supabase = createClient();
    const { data: request, error } = await supabase
      .from("task_requests")
      .insert({
        date: reqDate,
        slot: reqSlot,
        position_id: reqPositionId,
        headcount: reqHeadcount,
        note: reqNote.trim() || null,
      })
      .select("id")
      .single();
    if (error || !request) {
      setBusy(false);
      setReqError(error?.message ?? "新增失敗");
      return;
    }
    if (reqStaff.length > 0) {
      const { error: staffError } = await supabase
        .from("task_request_staff")
        .insert(reqStaff.map((pt_id) => ({ request_id: request.id, pt_id })));
      if (staffError) {
        setBusy(false);
        setReqError(`任務已新增，但指定人員沒存到：${staffError.message}`);
        router.refresh();
        return;
      }
    }
    setBusy(false);
    setReqHeadcount(1);
    setReqStaff([]);
    setReqNote("");
    router.refresh();
  }

  function startEditingRequest(request: TaskRequest) {
    setEditingRequestId(request.id);
    setEditHeadcount(request.headcount);
    setEditStaff(staffByRequest.get(request.id) ?? []);
    setEditError(null);
  }

  async function saveRequest(request: TaskRequest) {
    if (!(editHeadcount >= 1)) {
      setEditError("至少要 1 人");
      return;
    }
    if (editStaff.length > editHeadcount) {
      setEditError(`指定了 ${editStaff.length} 人，比需要的 ${editHeadcount} 人多`);
      return;
    }
    setBusy(true);
    setEditError(null);
    const supabase = createClient();
    const current = staffByRequest.get(request.id) ?? [];
    const removed = current.filter((id) => !editStaff.includes(id));
    const added = editStaff.filter((id) => !current.includes(id));
    const results = await Promise.all([
      supabase.from("task_requests").update({ headcount: editHeadcount }).eq("id", request.id),
      removed.length > 0
        ? supabase.from("task_request_staff").delete().eq("request_id", request.id).in("pt_id", removed)
        : Promise.resolve({ error: null }),
      added.length > 0
        ? supabase.from("task_request_staff").insert(added.map((pt_id) => ({ request_id: request.id, pt_id })))
        : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setEditError(failed.error.message);
      router.refresh();
      return;
    }
    setEditingRequestId(null);
    router.refresh();
  }

  async function deleteRequest(id: string) {
    if (!confirm("確定要刪除這筆本週任務嗎？")) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("task_requests").delete().eq("id", id);
    setBusy(false);
    router.refresh();
  }

  const sortedRequests = [...initialRequests].sort(
    (a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot as never) - SLOTS.indexOf(b.slot as never),
  );

  // ──────────── 固定任務 ────────────
  const [tplPositionId, setTplPositionId] = useState(firstPositionId);
  const [tplSlot, setTplSlot] = useState<string>(slotsFor(firstPositionId)[0]);
  const [tplWeekdays, setTplWeekdays] = useState<number[]>(TEMPLATE_WEEKDAYS);
  const [tplPtId, setTplPtId] = useState("");
  const [tplSubstituteId, setTplSubstituteId] = useState("");
  const [tplError, setTplError] = useState<string | null>(null);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editWeekdays, setEditWeekdays] = useState<number[]>([]);
  const [editPtId, setEditPtId] = useState("");
  const [editSubstituteId, setEditSubstituteId] = useState("");
  const [tplEditError, setTplEditError] = useState<string | null>(null);

  function changeTemplatePosition(positionId: string) {
    setTplPositionId(positionId);
    setTplSlot(slotsFor(positionId)[0]);
  }

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tplPtId) {
      setTplError("請選負責人");
      return;
    }
    if (tplWeekdays.length === 0) {
      setTplError("至少要選一天");
      return;
    }
    setBusy(true);
    setTplError(null);
    const supabase = createClient();
    const { error } = await supabase.from("task_templates").insert({
      position_id: tplPositionId,
      slot: tplSlot,
      weekdays: tplWeekdays,
      pt_id: tplPtId,
      substitute_pt_id: tplSubstituteId || null,
    });
    setBusy(false);
    if (error) {
      setTplError(error.message);
      return;
    }
    setTplPtId("");
    setTplSubstituteId("");
    setTplWeekdays(TEMPLATE_WEEKDAYS);
    router.refresh();
  }

  function startEditingTemplate(template: Template) {
    setEditingTemplateId(template.id);
    setEditWeekdays(template.weekdays);
    setEditPtId(template.pt_id);
    setEditSubstituteId(template.substitute_pt_id ?? "");
    setTplEditError(null);
  }

  async function saveTemplate(template: Template) {
    if (editWeekdays.length === 0) {
      setTplEditError("至少要選一天");
      return;
    }
    setBusy(true);
    setTplEditError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("task_templates")
      .update({ weekdays: editWeekdays, pt_id: editPtId, substitute_pt_id: editSubstituteId || null })
      .eq("id", template.id);
    setBusy(false);
    if (error) {
      setTplEditError(error.message);
      return;
    }
    setEditingTemplateId(null);
    router.refresh();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("確定要刪除這筆固定任務嗎？之後每週都不會再排。")) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("task_templates").delete().eq("id", id);
    setBusy(false);
    router.refresh();
  }

  const sortedTemplates = [...initialTemplates].sort(
    (a, b) =>
      (positionById.get(a.position_id)?.name ?? "").localeCompare(positionById.get(b.position_id)?.name ?? "") ||
      SLOTS.indexOf(a.slot as never) - SLOTS.indexOf(b.slot as never),
  );

  return (
    <div className="mt-6 space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">本週任務</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            只有這一週要做的任務。指定的人如果那個時段被排在處理進貨，會改排到任務；如果在出貨或印單，會提醒你手動調整。週六的任務只會提醒，不會自動排。
          </p>
        </div>

        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
              <tr>
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">時段</th>
                <th className="px-3 py-2">崗位</th>
                <th className="px-3 py-2">指定人員</th>
                <th className="px-3 py-2">備註</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    這週還沒有登記任務
                  </td>
                </tr>
              )}
              {sortedRequests.map((r) => {
                const named = staffByRequest.get(r.id) ?? [];
                const short = named.length < r.headcount;
                const editing = editingRequestId === r.id;
                return (
                  <tr key={r.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                      {dayLabel(r.date)}
                      {r.date === weekDates[5] && (
                        <div className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400">只提醒</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.slot}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-900 dark:text-zinc-50">
                      {positionById.get(r.position_id)?.name ?? "（已停用崗位）"}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                            需要
                            <input
                              type="number"
                              min={1}
                              value={editHeadcount}
                              onChange={(e) => setEditHeadcount(Number(e.target.value))}
                              className={`${smallFieldClass} w-14`}
                            />
                            人
                          </label>
                          <StaffPicker staff={staffFor(r.position_id)} selected={editStaff} onChange={setEditStaff} />
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveRequest(r)} disabled={busy} className={saveButtonClass}>
                              儲存
                            </button>
                            <button
                              onClick={() => setEditingRequestId(null)}
                              disabled={busy}
                              className={linkButtonClass}
                            >
                              取消
                            </button>
                            {editError && <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div
                            className={`text-xs font-medium ${
                              short ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            已指定 {named.length} / 需要 {r.headcount} 人{short && "，其餘請手動指定"}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {named.map((id) => (
                              <PersonChip key={id} person={ptById.get(id)} level={levelOf(id, r.position_id)} />
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.note ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {!editing && (
                        <div className="flex gap-3">
                          <button onClick={() => startEditingRequest(r)} disabled={busy} className={linkButtonClass}>
                            編輯
                          </button>
                          <button onClick={() => deleteRequest(r.id)} disabled={busy} className={deleteButtonClass}>
                            刪除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form onSubmit={addRequest} className="max-w-2xl space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">新增本週任務</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">日期</span>
              <select value={reqDate} onChange={(e) => setReqDate(e.target.value)} className={fieldClass}>
                {weekDates.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">崗位</span>
              <select
                value={reqPositionId}
                onChange={(e) => changeRequestPosition(e.target.value)}
                className={fieldClass}
              >
                {sortedPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">時段</span>
              <select value={reqSlot} onChange={(e) => setReqSlot(e.target.value)} className={fieldClass}>
                {slotsFor(reqPositionId).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">需要幾人</span>
              <input
                type="number"
                min={1}
                value={reqHeadcount}
                onChange={(e) => setReqHeadcount(Number(e.target.value))}
                className={`${fieldClass} w-20`}
              />
            </label>
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="mb-1 block">指定人員（可以先不選，之後再指定）</span>
            <StaffPicker staff={staffFor(reqPositionId)} selected={reqStaff} onChange={setReqStaff} />
          </div>
          <label className="block text-sm text-zinc-700 dark:text-zinc-300">
            <span className="mb-1 block">備註（選填）</span>
            <input value={reqNote} onChange={(e) => setReqNote(e.target.value)} className={`${fieldClass} w-full`} />
          </label>
          {reqError && <p className="text-sm text-red-600 dark:text-red-400">{reqError}</p>}
          <button type="submit" disabled={busy || !reqPositionId} className={primaryButtonClass}>
            新增本週任務
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">固定任務（每週重複）</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            每週固定由同一個人做的工作，一列是一個人。負責人那個時段已經有別的工作（例如印單）就不排他做，也不找人代班；負責人請假時由代班的人做，沒設代班會提醒你。
          </p>
        </div>

        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
              <tr>
                <th className="px-3 py-2">崗位</th>
                <th className="px-3 py-2">時段</th>
                <th className="px-3 py-2">星期</th>
                <th className="px-3 py-2">負責人</th>
                <th className="px-3 py-2">請假時代班</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedTemplates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                    還沒有固定任務
                  </td>
                </tr>
              )}
              {sortedTemplates.map((t) => {
                const editing = editingTemplateId === t.id;
                return (
                  <tr key={t.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                      {positionById.get(t.position_id)?.name ?? "（已停用崗位）"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">{t.slot}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {editing ? (
                        <WeekdayChecks value={editWeekdays} onChange={setEditWeekdays} />
                      ) : (
                        t.weekdays.map((d) => WEEKDAY_LABELS[d - 1]).join("、")
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <PersonSelect
                          staff={staffFor(t.position_id)}
                          value={editPtId}
                          onChange={setEditPtId}
                          emptyLabel="請選擇"
                          className={smallFieldClass}
                        />
                      ) : (
                        <div className="flex">
                          <PersonChip person={ptById.get(t.pt_id)} level={levelOf(t.pt_id, t.position_id)} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <PersonSelect
                          staff={staffFor(t.position_id)}
                          value={editSubstituteId}
                          onChange={setEditSubstituteId}
                          emptyLabel="不代班（空著並提醒）"
                          className={smallFieldClass}
                        />
                      ) : t.substitute_pt_id ? (
                        <div className="flex">
                          <PersonChip person={ptById.get(t.substitute_pt_id)} level={levelOf(t.substitute_pt_id, t.position_id)} />
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">不代班</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {editing ? (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => saveTemplate(t)}
                            disabled={busy || !editPtId}
                            className={saveButtonClass}
                          >
                            儲存
                          </button>
                          <button
                            onClick={() => setEditingTemplateId(null)}
                            disabled={busy}
                            className={linkButtonClass}
                          >
                            取消
                          </button>
                          {tplEditError && <p className="text-xs text-red-600 dark:text-red-400">{tplEditError}</p>}
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <button onClick={() => startEditingTemplate(t)} disabled={busy} className={linkButtonClass}>
                            編輯
                          </button>
                          <button onClick={() => deleteTemplate(t.id)} disabled={busy} className={deleteButtonClass}>
                            刪除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form onSubmit={addTemplate} className="max-w-2xl space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">新增固定任務</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">崗位</span>
              <select
                value={tplPositionId}
                onChange={(e) => changeTemplatePosition(e.target.value)}
                className={fieldClass}
              >
                {sortedPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">時段</span>
              <select value={tplSlot} onChange={(e) => setTplSlot(e.target.value)} className={fieldClass}>
                {slotsFor(tplPositionId).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="mb-1 block">星期</span>
            <WeekdayChecks value={tplWeekdays} onChange={setTplWeekdays} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">負責人</span>
              <PersonSelect
                staff={staffFor(tplPositionId)}
                value={tplPtId}
                onChange={setTplPtId}
                emptyLabel="請選擇"
                className={fieldClass}
              />
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mb-1 block">請假時代班（選填）</span>
              <PersonSelect
                staff={staffFor(tplPositionId)}
                value={tplSubstituteId}
                onChange={setTplSubstituteId}
                emptyLabel="不代班（空著並提醒）"
                className={fieldClass}
              />
            </label>
          </div>
          {tplError && <p className="text-sm text-red-600 dark:text-red-400">{tplError}</p>}
          <button type="submit" disabled={busy || !tplPositionId} className={primaryButtonClass}>
            新增固定任務
          </button>
        </form>
      </section>
    </div>
  );
}
