"use client";

import { useEffect, useState } from "react";
import { formatDateLabel } from "@/lib/date";
import { AVAILABILITY_RANGES, type AvailabilityRange, type EmploymentType } from "@/lib/constants";

type Pt = { id: string; name: string; employment_type: EmploymentType };
type Availability = { pt_id: string; date: string; range: string };

const STORAGE_KEY = "my-availability:pt-id";

const rangeStyles: Record<string, string> = {
  全天: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  只上午: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  只下午: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  全天休假: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function weekdayLabelFor(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

export function MyAvailabilityForm({
  open,
  targetMonthDates,
  pt,
  initialAvailability,
}: {
  open: boolean;
  targetMonthDates: string[];
  pt: Pt[];
  initialAvailability: Availability[];
}) {
  // 用 localStorage 記住上次選的人；讀取一次性放在 useState 的 lazy initializer，
  // 不用 useEffect + setState（伺服器端渲染時沒有 localStorage，這裡的判斷本來就只在瀏覽器端跑得到）
  const [ptId, setPtId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && pt.some((p) => p.id === saved) ? saved : "";
  });

  useEffect(() => {
    if (ptId) localStorage.setItem(STORAGE_KEY, ptId);
  }, [ptId]);

  if (!open) return null;

  return (
    <div className="mt-6 space-y-6">
      <div>
        <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">你是誰？</label>
        <select
          value={ptId}
          onChange={(e) => setPtId(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">請選擇姓名</option>
          {pt.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.employment_type}）
            </option>
          ))}
        </select>
      </div>

      {ptId && (
        // key={ptId}：換人時整個重新掛載，能力/可上班範圍那幾頁都用同一招避免舊資料殘留
        <PersonAvailabilityEditor
          key={ptId}
          ptId={ptId}
          targetMonthDates={targetMonthDates}
          initialAvailability={initialAvailability}
        />
      )}
    </div>
  );
}

function PersonAvailabilityEditor({
  ptId,
  targetMonthDates,
  initialAvailability,
}: {
  ptId: string;
  targetMonthDates: string[];
  initialAvailability: Availability[];
}) {
  const [ranges, setRanges] = useState<Map<string, AvailabilityRange>>(() => {
    const map = new Map<string, AvailabilityRange>();
    for (const date of targetMonthDates) {
      const existing = initialAvailability.find((a) => a.pt_id === ptId && a.date === date);
      map.set(date, (existing?.range as AvailabilityRange) ?? "全天");
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    setSubmitting(true);
    setResult("idle");
    const entries = targetMonthDates.map((date) => ({ date, range: ranges.get(date) ?? "全天" }));

    const res = await fetch("/api/my-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pt_id: ptId, entries }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMessage(data.error ?? "送出失敗，請稍後再試");
      setResult("error");
      return;
    }
    setResult("success");
  }

  return (
    <>
      <div className="space-y-2">
        {targetMonthDates.map((date) => {
          const range = ranges.get(date) ?? "全天";
          return (
            <div
              key={date}
              className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {formatDateLabel(date)}（週{weekdayLabelFor(date)}）
              </span>
              <select
                value={range}
                onChange={(e) =>
                  setRanges((prev) => new Map(prev).set(date, e.target.value as AvailabilityRange))
                }
                className={`rounded border-none px-2 py-1.5 text-sm font-medium ${rangeStyles[range]}`}
              >
                {AVAILABILITY_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {result === "success" ? (
        <p className="mt-4 rounded bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
          已經送出，謝謝你！可以直接關閉這個頁面。
        </p>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded bg-zinc-900 px-4 py-3 text-base font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submitting ? "送出中…" : "送出"}
        </button>
      )}
      {result === "error" && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </>
  );
}
