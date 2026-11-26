"use client";

// 新版排班（時數制）的崗位設定：可以做的時間、四種日子的最高可安排時數。切換到新版之前，舊版自動排班不會用到這些崗位
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type HourPosition = {
  id: string;
  name: string;
  included_in_auto_schedule: boolean;
  gender_restriction: "男" | "女" | null;
  work_windows: [string, string][];
  hours_event: number | null;
  hours_mon_tue: number | null;
  hours_normal: number | null;
  hours_saturday: number | null;
};

type HoursKey = "hours_event" | "hours_mon_tue" | "hours_normal" | "hours_saturday";
const HOURS_COLUMNS: { key: HoursKey; label: string }[] = [
  { key: "hours_event", label: "活動日" },
  { key: "hours_mon_tue", label: "週一、週二" },
  { key: "hours_normal", label: "一般日" },
  { key: "hours_saturday", label: "週六" },
];

const toMinutes = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
const pad = (t: string) => (t.length === 4 ? `0${t}` : t);
const showTime = (t: string) => t.replace(/^0/, "");

function formatWindows(windows: [string, string][]) {
  return windows.map(([s, e]) => `${showTime(s)}-${showTime(e)}`).join("、");
}

// 「9:00-12:30、13:30-17:30」→ [["09:00","12:30"],["13:30","17:30"]]；不合規則回傳錯誤訊息
function parseWindows(text: string): [string, string][] | string {
  const parts = text.split(/[、,，\s]+/).filter(Boolean);
  if (parts.length === 0) return "請填可以做的時間";
  const windows: [string, string][] = [];
  for (const part of parts) {
    const m = part.match(/^(\d{1,2}:\d{2})[-~～](\d{1,2}:\d{2})$/);
    if (!m) return `看不懂「${part}」，請用 9:00-12:30 這種格式`;
    const [start, end] = [pad(m[1]), pad(m[2])];
    const [s, e] = [toMinutes(start), toMinutes(end)];
    if (s % 30 !== 0 || e % 30 !== 0) return `「${part}」要以 30 分鐘為單位`;
    if (s >= e) return `「${part}」開始要早於結束`;
    if (s < toMinutes("08:30") || e > toMinutes("17:30")) return `「${part}」要在 8:30-17:30 之間`;
    if (s < toMinutes("13:30") && e > toMinutes("12:30")) return `「${part}」不能包含午休 12:30-13:30`;
    windows.push([start, end]);
  }
  return windows.sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));
}

const inputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function HourPositionsTable({ positions }: { positions: HourPosition[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">新版崗位（時數制，還沒啟用）</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        新版排班照時數排人：每個崗位設可以做的時間，跟每天最高可以安排的時數（正職也算在內），系統照排班順序排到上限為止。
        切換到新版之前，現在的自動排班不會用到這些崗位。能力等級請到「能力等級設定」填標有「（新）」的欄位。
      </p>
      <div className="mt-3 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">崗位</th>
              <th className="px-3 py-2">可以做的時間</th>
              {HOURS_COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 whitespace-nowrap">
                  {c.label}（小時）
                </th>
              ))}
              <th className="px-3 py-2">限性別</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <HourPositionRow key={p.id} position={p} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        可以做的時間用 30 分鐘為單位、在 8:30-17:30 之間、避開午休 12:30-13:30，好幾段用「、」隔開。時數留空代表還沒設定。
      </p>
    </section>
  );
}

function HourPositionRow({ position }: { position: HourPosition }) {
  const router = useRouter();
  const [windowsText, setWindowsText] = useState(formatWindows(position.work_windows));
  const [hours, setHours] = useState<Record<HoursKey, string>>({
    hours_event: position.hours_event?.toString() ?? "",
    hours_mon_tue: position.hours_mon_tue?.toString() ?? "",
    hours_normal: position.hours_normal?.toString() ?? "",
    hours_saturday: position.hours_saturday?.toString() ?? "",
  });
  const [gender, setGender] = useState(position.gender_restriction ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save() {
    const windows = parseWindows(windowsText);
    if (typeof windows === "string") {
      setMessage({ kind: "error", text: windows });
      return;
    }
    const patch: Record<string, unknown> = { work_windows: windows, gender_restriction: gender || null };
    for (const c of HOURS_COLUMNS) {
      const raw = hours[c.key].trim();
      if (raw === "") {
        patch[c.key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || (n * 2) % 1 !== 0) {
        setMessage({ kind: "error", text: `${c.label}的時數要是 0 以上、以 0.5 小時為單位` });
        return;
      }
      patch[c.key] = n;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await createClient().from("positions").update(patch).eq("id", position.id);
    setSaving(false);
    if (error) {
      setMessage({ kind: "error", text: `儲存失敗：${error.message}` });
      return;
    }
    setWindowsText(formatWindows(windows));
    setMessage({ kind: "ok", text: "已儲存" });
    router.refresh();
  }

  return (
    <tr className="border-t border-zinc-200 align-top dark:border-zinc-800">
      <td className="px-3 py-2 font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-50">
        {position.name}
        {!position.included_in_auto_schedule && <span className="ml-1 text-xs font-normal text-violet-600 dark:text-violet-400">任務</span>}
      </td>
      <td className="px-3 py-2">
        <input
          value={windowsText}
          onChange={(e) => setWindowsText(e.target.value)}
          aria-label={`${position.name}可以做的時間`}
          className={`${inputClass} w-56`}
        />
      </td>
      {HOURS_COLUMNS.map((c) => (
        <td key={c.key} className="px-3 py-2">
          <input
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={hours[c.key]}
            onChange={(e) => setHours({ ...hours, [c.key]: e.target.value })}
            aria-label={`${position.name}${c.label}最高時數`}
            className={`${inputClass} w-20`}
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <select value={gender} onChange={(e) => setGender(e.target.value)} aria-label={`${position.name}限性別`} className={inputClass}>
          <option value="">不限</option>
          <option value="男">男</option>
          <option value="女">女</option>
        </select>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        {message && (
          <p className={`mt-1 text-xs ${message.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {message.text}
          </p>
        )}
      </td>
    </tr>
  );
}
