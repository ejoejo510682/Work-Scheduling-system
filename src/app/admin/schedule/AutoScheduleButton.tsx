"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Warning = { type: string; date: string; message: string };

// 提醒先粗分兩類顯示；完整的分類提醒面板在週排班表改版時做
const ACTION_TYPES = new Set(["shortage", "task_manual", "task", "manual", "locked", "overtime"]);

export function AutoScheduleButton({ monday }: { monday: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ autoCount: number; warnings: Warning[] } | null>(null);

  async function run() {
    if (!confirm("要自動排這一週嗎？\n\n你自己排或改過的格子會保留；系統之前排的格子會重新排。")) return;
    setRunning(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/auto-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: monday }),
    });
    const body = await response.json();
    setRunning(false);
    if (!response.ok) {
      setError(body.error ?? "自動排班失敗");
      return;
    }
    setResult({ autoCount: body.autoCount, warnings: body.warnings });
    router.refresh();
  }

  const actionItems = result?.warnings.filter((w) => ACTION_TYPES.has(w.type)) ?? [];
  const referenceItems = result?.warnings.filter((w) => !ACTION_TYPES.has(w.type)) ?? [];

  return (
    <div className="mt-4">
      <button
        onClick={run}
        disabled={running}
        className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {running ? "排班中…" : "⚙ 自動排班"}
      </button>

      {error && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-3 rounded border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            自動排班完成：系統排了 {result.autoCount} 格。點每一天進去可以看、可以改。
          </p>
          {actionItems.length > 0 && (
            <div>
              <h3 className="font-medium text-red-700 dark:text-red-400">要處理（{actionItems.length}）</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-700 dark:text-zinc-300">
                {actionItems.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}
          {referenceItems.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-400">
                參考（{referenceItems.length}）
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
                {referenceItems.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
