"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EmploymentType } from "@/lib/constants";
import { EmploymentTypeBadge } from "@/components/admin/EmploymentTypeBadge";

type Position = { id: string; name: string };
type Pt = { id: string; name: string; employment_type: EmploymentType };
type Task = {
  id: string;
  name: string;
  note: string | null;
  required_position_id: string | null;
  required_level: number | null;
  status: "待處理" | "進行中" | "已完成";
};
type Assignment = { id: string; task_id: string; pt_id: string };
type Ability = { pt_id: string; position_id: string; level: number };

const STATUS_OPTIONS = ["待處理", "進行中", "已完成"] as const;

const statusStyles: Record<string, string> = {
  待處理: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  進行中: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  已完成: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export function WeeklyTasksPanel({
  weekStart,
  isManager,
  positions,
  pt,
  abilities,
  initialTasks,
  initialAssignments,
}: {
  weekStart: string;
  isManager: boolean;
  positions: Position[];
  pt: Pt[];
  abilities: Ability[];
  initialTasks: Task[];
  initialAssignments: Assignment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [requiredPositionId, setRequiredPositionId] = useState("");
  const [requiredLevel, setRequiredLevel] = useState(2);

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const ptById = new Map(pt.map((p) => [p.id, p]));
  const levelByKey = new Map(abilities.map((a) => [`${a.pt_id}:${a.position_id}`, a.level]));

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);

    const supabase = createClient();
    const { error } = await supabase.from("weekly_tasks").insert({
      week_start: weekStart,
      name: name.trim(),
      note: note.trim() || null,
      required_position_id: requiredPositionId || null,
      required_level: requiredPositionId ? requiredLevel : null,
    });

    setBusy(false);
    if (error) {
      alert(`建立失敗：${error.message}`);
      return;
    }
    setName("");
    setNote("");
    setRequiredPositionId("");
    router.refresh();
  }

  async function deleteTask(taskId: string) {
    if (!confirm("確定要刪除這個任務嗎？")) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("weekly_tasks").delete().eq("id", taskId);
    setBusy(false);
    router.refresh();
  }

  async function updateStatus(taskId: string, status: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("weekly_tasks").update({ status }).eq("id", taskId);
    setBusy(false);
    if (error) {
      alert(`更新失敗：${error.message}`);
      return;
    }
    router.refresh();
  }

  async function assignPt(taskId: string, ptId: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("weekly_task_assignments")
      .insert({ task_id: taskId, pt_id: ptId });
    setBusy(false);
    if (error) {
      alert(error.code === "23505" ? "這個人已經被指派過這個任務了" : error.message);
      return;
    }
    setOpenPicker(null);
    router.refresh();
  }

  async function unassign(assignmentId: string) {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("weekly_task_assignments").delete().eq("id", assignmentId);
    setBusy(false);
    router.refresh();
  }

  function candidatesFor(task: Task): Pt[] {
    const assignedIds = new Set(
      initialAssignments.filter((a) => a.task_id === task.id).map((a) => a.pt_id),
    );
    return pt.filter((p) => {
      if (assignedIds.has(p.id)) return false;
      if (task.required_position_id && task.required_level) {
        const level = levelByKey.get(`${p.id}:${task.required_position_id}`) ?? 1;
        if (level < task.required_level) return false;
      }
      return true;
    });
  }

  return (
    <div className="mt-6 space-y-8">
      {isManager && (
        <form
          onSubmit={createTask}
          className="max-w-xl space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">建立任務</h2>
          <div>
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">任務名稱</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">說明（選填）</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
                需要的崗位能力（選填）
              </label>
              <select
                value={requiredPositionId}
                onChange={(e) => setRequiredPositionId(e.target.value)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              >
                <option value="">不限制</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {requiredPositionId && (
              <div>
                <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">至少等級</label>
                <select
                  value={requiredLevel}
                  onChange={(e) => setRequiredLevel(Number(e.target.value))}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value={2}>二級以上</option>
                  <option value={3}>三級</option>
                </select>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            建立任務
          </button>
        </form>
      )}

      <div className="space-y-4">
        {initialTasks.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">這週還沒有追加任務。</p>
        )}
        {initialTasks.map((task) => {
          const assigned = initialAssignments.filter((a) => a.task_id === task.id);
          const requiredPosition = task.required_position_id
            ? positionById.get(task.required_position_id)
            : null;

          return (
            <div
              key={task.id}
              className="rounded border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{task.name}</span>
                    {requiredPosition && (
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        需要 {requiredPosition.name} {task.required_level === 3 ? "三級" : "二級以上"}
                      </span>
                    )}
                  </div>
                  {task.note && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{task.note}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={task.status}
                    onChange={(e) => updateStatus(task.id, e.target.value)}
                    disabled={busy}
                    className={`rounded border-none px-2 py-1 text-xs font-medium ${statusStyles[task.status]}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {isManager && (
                    <button
                      onClick={() => deleteTask(task.id)}
                      disabled={busy}
                      className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {assigned.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1.5 rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {ptById.get(a.pt_id) && (
                      <EmploymentTypeBadge type={ptById.get(a.pt_id)!.employment_type} />
                    )}
                    {ptById.get(a.pt_id)?.name}
                    <button
                      onClick={() => unassign(a.id)}
                      disabled={busy}
                      className="ml-1 text-zinc-500 hover:text-red-600 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              <div className="mt-2">
                {openPicker === task.id ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {candidatesFor(task).map((c) => (
                        <button
                          key={c.id}
                          disabled={busy}
                          onClick={() => assignPt(task.id, c.id)}
                          className="flex items-center gap-1.5 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          <EmploymentTypeBadge type={c.employment_type} />
                          {c.name}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setOpenPicker(null)}
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setOpenPicker(task.id)}
                    className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                  >
                    ＋ 指派人員
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
