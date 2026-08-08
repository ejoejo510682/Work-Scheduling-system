"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SLOTS, type AvailabilityRange, type Slot } from "@/lib/constants";
import { isAvailableForSlot } from "@/lib/schedule";

type Position = { id: string; name: string; sort_order: number };
type SlotMapRow = { position_id: string; slot: string };
type Headcount = { position_id: string; headcount: number };
type Pt = { id: string; name: string };
type Ability = { pt_id: string; position_id: string; level: number };
type AvailabilityRow = { pt_id: string; range: string };
type Assignment = { id: string; slot: string; position_id: string; pt_id: string; priority: number };

const HALVES: { label: string; slots: [Slot, Slot] }[] = [
  { label: "上午（整個半天）", slots: ["上午出訂單前", "上午出訂單後"] },
  { label: "下午（整個半天）", slots: ["下午出訂單前", "下午出訂單後"] },
];

export function ScheduleDay({
  date,
  positions,
  slotMap,
  headcounts,
  pt,
  abilities,
  availability,
  initialAssignments,
}: {
  date: string;
  positions: Position[];
  slotMap: SlotMapRow[];
  headcounts: Headcount[];
  pt: Pt[];
  abilities: Ability[];
  availability: AvailabilityRow[];
  initialAssignments: Assignment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const slotsByPosition = new Map<string, Set<string>>();
  for (const row of slotMap) {
    const set = slotsByPosition.get(row.position_id) ?? new Set<string>();
    set.add(row.slot);
    slotsByPosition.set(row.position_id, set);
  }

  const headcountByPosition = new Map(headcounts.map((h) => [h.position_id, h.headcount]));
  const levelByKey = new Map(abilities.map((a) => [`${a.pt_id}:${a.position_id}`, a.level]));
  const availabilityByPt = new Map(availability.map((a) => [a.pt_id, a.range as AvailabilityRange]));
  const ptById = new Map(pt.map((p) => [p.id, p]));

  const regularPositions = positions.filter((p) => (slotsByPosition.get(p.id)?.size ?? 0) > 0);
  const flexiblePositions = positions.filter((p) => (slotsByPosition.get(p.id)?.size ?? 0) === 0);

  function getRange(ptId: string): AvailabilityRange {
    return availabilityByPt.get(ptId) ?? "全天";
  }

  function getLevel(ptId: string, positionId: string): number {
    return levelByKey.get(`${ptId}:${positionId}`) ?? 1;
  }

  async function assign(slot: string, positionId: string, ptId: string, priority: 1 | 2) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("daily_schedule")
      .insert({ date, slot, position_id: positionId, pt_id: ptId, priority });
    setBusy(false);
    if (error) {
      alert(error.code === "23505" ? "這個人這個時段已經被排過了" : error.message);
      return;
    }
    setOpenPicker(null);
    router.refresh();
  }

  async function unassign(assignmentId: string) {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("daily_schedule").delete().eq("id", assignmentId);
    setBusy(false);
    router.refresh();
  }

  async function assignHalf(slots: [Slot, Slot], positionId: string, ptId: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("daily_schedule")
      .insert(slots.map((slot) => ({ date, slot, position_id: positionId, pt_id: ptId, priority: 1 })));
    setBusy(false);
    if (error) {
      alert(error.code === "23505" ? "這個人這個時段已經被排到別的崗位了" : error.message);
      return;
    }
    setOpenPicker(null);
    router.refresh();
  }

  async function unassignHalf(assignmentIds: string[]) {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("daily_schedule").delete().in("id", assignmentIds);
    setBusy(false);
    router.refresh();
  }

  // 這個時段裡，誰已經有「第一任務」了（不分崗位）
  function primaryAssigneesInSlot(slot: string): Map<string, string> {
    const map = new Map<string, string>(); // pt_id -> position_id
    for (const a of initialAssignments) {
      if (a.slot === slot && a.priority === 1) map.set(a.pt_id, a.position_id);
    }
    return map;
  }

  function backupAssigneesInSlot(slot: string): Set<string> {
    return new Set(
      initialAssignments.filter((a) => a.slot === slot && a.priority === 2).map((a) => a.pt_id),
    );
  }

  function candidatesForPrimary(slot: Slot, positionId: string): (Pt & { level: number })[] {
    const primary = primaryAssigneesInSlot(slot);
    const backup = backupAssigneesInSlot(slot);
    return pt
      .filter((p) => {
        if (getLevel(p.id, positionId) < 2) return false;
        if (!isAvailableForSlot(getRange(p.id), slot)) return false;
        if (primary.has(p.id) || backup.has(p.id)) return false; // 這個時段已經有任務了
        return true;
      })
      .map((p) => ({ ...p, level: getLevel(p.id, positionId) }))
      .sort((a, b) => b.level - a.level);
  }

  // 備援候選：這個時段已經有「第一任務」、還沒有「第二任務」、且符合這個崗位資格的人
  function candidatesForBackup(slot: Slot, positionId: string): (Pt & { level: number })[] {
    const primary = primaryAssigneesInSlot(slot);
    const backup = backupAssigneesInSlot(slot);
    return pt
      .filter((p) => {
        if (!primary.has(p.id) || primary.get(p.id) === positionId) return false;
        if (backup.has(p.id)) return false;
        if (getLevel(p.id, positionId) < 2) return false;
        if (!isAvailableForSlot(getRange(p.id), slot)) return false;
        return true;
      })
      .map((p) => ({ ...p, level: getLevel(p.id, positionId) }))
      .sort((a, b) => b.level - a.level);
  }

  function candidatesForHalf(slots: [Slot, Slot], positionId: string): (Pt & { level: number })[] {
    const busyEitherSlot = new Set(
      initialAssignments.filter((a) => slots.includes(a.slot as Slot)).map((a) => a.pt_id),
    );
    return pt
      .filter((p) => {
        if (getLevel(p.id, positionId) < 2) return false;
        if (!slots.every((s) => isAvailableForSlot(getRange(p.id), s))) return false;
        if (busyEitherSlot.has(p.id)) return false;
        return true;
      })
      .map((p) => ({ ...p, level: getLevel(p.id, positionId) }))
      .sort((a, b) => b.level - a.level);
  }

  function CandidateList({
    candidates,
    emptyText,
    onPick,
  }: {
    candidates: (Pt & { level: number })[];
    emptyText: string;
    onPick: (ptId: string) => void;
  }) {
    if (candidates.length === 0) {
      return (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {emptyText}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => (
          <button
            key={c.id}
            disabled={busy}
            onClick={() => onPick(c.id)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {c.name}・{c.level === 3 ? "三級" : "二級（訓練中）"}
          </button>
        ))}
      </div>
    );
  }

  function AssigneeChip({ assignment, slot }: { assignment: Assignment; slot: string }) {
    const person = ptById.get(assignment.pt_id);
    const conflict = !isAvailableForSlot(getRange(assignment.pt_id), slot as Slot);
    const isBackup = assignment.priority === 2;
    return (
      <span
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
          conflict
            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
            : isBackup
              ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
              : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
        }`}
      >
        {conflict && "⚠ "}
        {person?.name}
        {isBackup && !conflict && "（備援）"}
        {conflict && "（今天請假/半天）"}
        <button
          onClick={() => unassign(assignment.id)}
          disabled={busy}
          className="ml-1 text-zinc-500 hover:text-red-600 disabled:opacity-50"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <div className="mt-6 space-y-10">
      {SLOTS.map((slot) => {
        const positionsInSlot = regularPositions.filter((p) => slotsByPosition.get(p.id)?.has(slot));
        if (positionsInSlot.length === 0) return null;

        return (
          <section key={slot}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {slot}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {positionsInSlot.map((position) => {
                const required = headcountByPosition.get(position.id) ?? 1;
                const assigned = initialAssignments.filter(
                  (a) => a.slot === slot && a.position_id === position.id,
                );
                const primaryKey = `${slot}:${position.id}:primary`;
                const backupKey = `${slot}:${position.id}:backup`;
                const short = assigned.length < required;

                return (
                  <div
                    key={position.id}
                    className={`rounded border p-3 ${
                      short
                        ? "border-red-300 dark:border-red-800"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {position.name}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          short ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        已排 {assigned.length} / 需求 {required}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {assigned.map((a) => (
                        <AssigneeChip key={a.id} assignment={a} slot={slot} />
                      ))}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {openPicker === primaryKey ? (
                        <div className="w-full space-y-2">
                          <CandidateList
                            candidates={candidatesForPrimary(slot as Slot, position.id)}
                            emptyText="⚠ 人力缺口：目前沒有符合資格且有空的人選"
                            onPick={(ptId) => assign(slot, position.id, ptId, 1)}
                          />
                          <button
                            onClick={() => setOpenPicker(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOpenPicker(primaryKey)}
                          className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                        >
                          ＋ 新增人員
                        </button>
                      )}

                      {openPicker === backupKey ? (
                        <div className="w-full space-y-2">
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            從這個時段已經有第一任務的人裡面，挑一個當這裡的備援：
                          </p>
                          <CandidateList
                            candidates={candidatesForBackup(slot as Slot, position.id)}
                            emptyText="目前沒有人可以當這個崗位的備援（需要這個時段已有第一任務、且符合能力/有空）"
                            onPick={(ptId) => assign(slot, position.id, ptId, 2)}
                          />
                          <button
                            onClick={() => setOpenPicker(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOpenPicker(backupKey)}
                          className="text-xs font-medium text-sky-700 underline hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
                        >
                          ＋ 新增備援（第二任務）
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {flexiblePositions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            彈性安排（不綁固定時段）
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flexiblePositions.map((position) => {
              const required = headcountByPosition.get(position.id) ?? 1;
              return (
                <div key={position.id} className="space-y-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">{position.name}</div>
                  {HALVES.map((half) => {
                    const assigned = initialAssignments.filter(
                      (a) =>
                        a.position_id === position.id && half.slots.includes(a.slot as Slot),
                    );
                    const assignedPtIds = Array.from(new Set(assigned.map((a) => a.pt_id)));
                    const key = `${half.label}:${position.id}`;

                    return (
                      <div
                        key={half.label}
                        className={`rounded border p-3 ${
                          assignedPtIds.length < required
                            ? "border-red-300 dark:border-red-800"
                            : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">{half.label}</span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            已排 {assignedPtIds.length} / 需求 {required}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignedPtIds.map((ptId) => {
                            const person = ptById.get(ptId);
                            const ids = assigned.filter((a) => a.pt_id === ptId).map((a) => a.id);
                            const conflict = !half.slots.every((s) =>
                              isAvailableForSlot(getRange(ptId), s),
                            );
                            return (
                              <span
                                key={ptId}
                                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                                  conflict
                                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                                }`}
                              >
                                {conflict && "⚠ "}
                                {person?.name}
                                {conflict && "（今天請假/半天）"}
                                <button
                                  onClick={() => unassignHalf(ids)}
                                  disabled={busy}
                                  className="ml-1 text-zinc-500 hover:text-red-600 disabled:opacity-50"
                                >
                                  ✕
                                </button>
                              </span>
                            );
                          })}
                        </div>
                        <div className="mt-2">
                          {openPicker === key ? (
                            <div className="space-y-2">
                              <CandidateList
                                candidates={candidatesForHalf(half.slots, position.id)}
                                emptyText="⚠ 人力缺口：目前沒有符合資格且有空的人選"
                                onPick={(ptId) => assignHalf(half.slots, position.id, ptId)}
                              />
                              <button
                                onClick={() => setOpenPicker(null)}
                                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setOpenPicker(key)}
                              className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                            >
                              ＋ 新增人員
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
