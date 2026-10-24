"use client";

// 票3 第 2 輪：B 版面裡三種「人名格子」顯示方式，用底部浮動列切換
//   B1 文字標籤：不是系統排的人，名字旁邊一律加文字標籤（鎖定／手動／備援／任務），顏色只是輔助
//   B2 左側色條＋圖示：每個名字左邊一條粗色條＋小圖示，對比最強，配大圖例
//   B3 只標例外：系統排的名字就是純文字；手動、鎖定、備援、任務才用粗體實心底色凸顯；有問題的格子整格框紅

import { useState } from "react";
import { staffName, type ScheduleRow } from "./model";
import { ChipMenu } from "./ui";
import type { Draft } from "./useDraft";

export type CellMode = "B1" | "B2" | "B3";

type Kind = "system" | "pinned" | "edited" | "backup" | "editedBackup" | "pinnedBackup" | "task" | "substitute";

export function kindOf(r: ScheduleRow): Kind {
  if (r.task) return r.substituteFor ? "substitute" : "task";
  if (r.priority === 2) return r.source === "manual" ? (r.kind === "pinned" ? "pinnedBackup" : "editedBackup") : "backup";
  if (r.source === "manual") return r.kind === "pinned" ? "pinned" : "edited";
  return "system";
}

// ------------------------------------------------------------ 小圖示（單色，跟著文字顏色）

function Icon({ name, className = "h-3 w-3" }: { name: "lock" | "hand" | "backup" | "task" | "swap"; className?: string }) {
  const common = { className, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "lock":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common}>
          <path d="M3 13l1-3 7-7 2 2-7 7-3 1z" />
        </svg>
      );
    case "backup":
      return (
        <svg {...common}>
          <path d="M4 3v5a2 2 0 0 0 2 2h7" />
          <path d="M10 7l3 3-3 3" />
        </svg>
      );
    case "task":
      return (
        <svg {...common}>
          <rect x="3.5" y="2.5" width="9" height="11" rx="1.5" />
          <path d="M6 8l1.5 1.5L10.5 6.5" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <path d="M3 5h9l-2-2M13 11H4l2 2" />
        </svg>
      );
  }
}

// ------------------------------------------------------------ 各模式的樣式

const B1_TAGS: Record<Kind, { text: string; cls: string }[]> = {
  system: [],
  pinned: [{ text: "鎖定", cls: "border-zinc-700 text-zinc-800 dark:border-zinc-300 dark:text-zinc-100" }],
  edited: [{ text: "手動", cls: "border-sky-700 text-sky-800 dark:border-sky-300 dark:text-sky-200" }],
  backup: [{ text: "備援", cls: "border-zinc-500 text-zinc-600 dark:border-zinc-400 dark:text-zinc-300" }],
  editedBackup: [
    { text: "備援", cls: "border-zinc-500 text-zinc-600 dark:border-zinc-400 dark:text-zinc-300" },
    { text: "手動", cls: "border-sky-700 text-sky-800 dark:border-sky-300 dark:text-sky-200" },
  ],
  pinnedBackup: [
    { text: "備援", cls: "border-zinc-500 text-zinc-600 dark:border-zinc-400 dark:text-zinc-300" },
    { text: "鎖定", cls: "border-zinc-700 text-zinc-800 dark:border-zinc-300 dark:text-zinc-100" },
  ],
  task: [{ text: "任務", cls: "border-emerald-700 text-emerald-800 dark:border-emerald-300 dark:text-emerald-200" }],
  substitute: [{ text: "任務・代班", cls: "border-emerald-700 text-emerald-800 dark:border-emerald-300 dark:text-emerald-200" }],
};

const B2_BAR: Record<Kind, { bar: string; icon?: "lock" | "hand" | "backup" | "task" | "swap"; iconCls: string }> = {
  system: { bar: "border-l-zinc-300 dark:border-l-zinc-600", iconCls: "" },
  pinned: { bar: "border-l-zinc-900 dark:border-l-zinc-100", icon: "lock", iconCls: "text-zinc-900 dark:text-zinc-100" },
  edited: { bar: "border-l-sky-600 dark:border-l-sky-400", icon: "hand", iconCls: "text-sky-700 dark:text-sky-300" },
  backup: { bar: "border-l-orange-500 dark:border-l-orange-400", icon: "backup", iconCls: "text-orange-600 dark:text-orange-300" },
  editedBackup: { bar: "border-l-sky-600 dark:border-l-sky-400", icon: "backup", iconCls: "text-sky-700 dark:text-sky-300" },
  pinnedBackup: { bar: "border-l-zinc-900 dark:border-l-zinc-100", icon: "backup", iconCls: "text-zinc-900 dark:text-zinc-100" },
  task: { bar: "border-l-emerald-600 dark:border-l-emerald-400", icon: "task", iconCls: "text-emerald-700 dark:text-emerald-300" },
  substitute: { bar: "border-l-emerald-600 dark:border-l-emerald-400", icon: "swap", iconCls: "text-emerald-700 dark:text-emerald-300" },
};

const B3_STYLE: Record<Kind, string> = {
  system: "text-zinc-700 dark:text-zinc-300",
  pinned: "bg-zinc-900 font-bold text-white dark:bg-zinc-100 dark:text-zinc-900",
  edited: "bg-sky-700 font-bold text-white dark:bg-sky-400 dark:text-zinc-950",
  backup: "border-2 border-dashed border-orange-500 font-bold text-orange-700 dark:border-orange-400 dark:text-orange-300",
  editedBackup: "border-2 border-dashed border-white bg-sky-700 font-bold text-white outline outline-2 outline-sky-700 dark:border-zinc-950 dark:bg-sky-400 dark:text-zinc-950 dark:outline-sky-400",
  pinnedBackup: "border-2 border-dashed border-white bg-zinc-900 font-bold text-white outline outline-2 outline-zinc-900 dark:border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:outline-zinc-100",
  task: "bg-emerald-700 font-bold text-white dark:bg-emerald-400 dark:text-zinc-950",
  substitute: "bg-emerald-700 font-bold text-white dark:bg-emerald-400 dark:text-zinc-950",
};

// ------------------------------------------------------------ 人名格子

export function ModeChip({ row, draft, mode, highlight, dim }: { row: ScheduleRow; draft: Draft; mode: CellMode; highlight?: boolean; dim?: boolean }) {
  const [open, setOpen] = useState(false);
  const k = kindOf(row);
  const state = `${highlight ? "ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-zinc-900" : ""} ${dim ? "opacity-30" : ""}`;
  let body: React.ReactNode;
  let cls: string;
  if (mode === "B1") {
    cls = "rounded px-1.5 py-0.5 text-sm text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800";
    body = (
      <>
        {row.pt_name}
        {B1_TAGS[k].map((t) => (
          <span key={t.text} className={`ml-1 rounded border px-1 text-[11px] font-semibold leading-4 ${t.cls}`}>
            {t.text}
          </span>
        ))}
        {row.substituteFor && <span className="ml-1 text-[11px] text-zinc-500 dark:text-zinc-400">（代 {staffName(row.substituteFor)}）</span>}
      </>
    );
  } else if (mode === "B2") {
    const s = B2_BAR[k];
    cls = `inline-flex items-center gap-1 rounded-r border border-l-[6px] border-zinc-200 bg-white py-0.5 pl-1.5 pr-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${s.bar}`;
    body = (
      <>
        {s.icon && <Icon name={s.icon} className={`h-3.5 w-3.5 ${s.iconCls}`} />}
        {row.pt_name}
      </>
    );
  } else {
    cls = `rounded px-1.5 py-0.5 text-sm ${B3_STYLE[k]}`;
    body = row.pt_name;
  }
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`m-0.5 ${cls} ${state}`} title="點一下：鎖定／改崗位／加備援">
        {body}
      </button>
      {open && <ChipMenu row={row} draft={draft} onClose={() => setOpen(false)} />}
    </span>
  );
}

// ------------------------------------------------------------ 圖例

export function ModeLegend({ mode }: { mode: CellMode }) {
  const fake = (k: Kind, name: string): ScheduleRow => ({
    date: "",
    slot: "",
    position_id: "",
    position_name: "",
    pt_id: k,
    pt_name: name,
    priority: k.toLowerCase().includes("backup") ? 2 : 1,
    source: k === "system" || k === "backup" || k === "task" || k === "substitute" ? "auto" : "manual",
    kind: k.startsWith("pinned") ? "pinned" : "edited",
    task: k === "task" || k === "substitute" ? "固定任務" : undefined,
  });
  const items: [Kind, string, string][] = [
    ["system", "王小明", "系統排的"],
    ["pinned", "王小明", "鎖定（照系統排的鎖住）"],
    ["edited", "王小明", "手動改過（也會鎖定）"],
    ["backup", "王小明", "備援（系統排的）"],
    ["editedBackup", "王小明", "手動加的備援"],
    ["task", "王小明", "任務（退貨、批發、盤點）"],
  ];
  const sample = (k: Kind, name: string) => {
    const row = fake(k, name);
    if (mode === "B1")
      return (
        <span className="text-sm text-zinc-900 dark:text-zinc-100">
          {name}
          {B1_TAGS[k].map((t) => (
            <span key={t.text} className={`ml-1 rounded border px-1 text-[11px] font-semibold ${t.cls}`}>{t.text}</span>
          ))}
        </span>
      );
    if (mode === "B2") {
      const s = B2_BAR[k];
      return (
        <span className={`inline-flex items-center gap-1 rounded-r border border-l-[6px] border-zinc-200 bg-white py-0.5 pl-1.5 pr-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${s.bar}`}>
          {s.icon && <Icon name={s.icon} className={`h-3.5 w-3.5 ${s.iconCls}`} />}
          {row.pt_name}
        </span>
      );
    }
    return <span className={`rounded px-1.5 py-0.5 text-sm ${B3_STYLE[k]}`}>{name}</span>;
  };
  return (
    <div className={`rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900 ${mode === "B2" ? "grid gap-2 sm:grid-cols-3" : "flex flex-wrap items-center gap-x-4 gap-y-2"}`}>
      <span className={`text-xs font-medium text-zinc-700 dark:text-zinc-300 ${mode === "B2" ? "sm:col-span-3" : ""}`}>
        圖例（{mode === "B1" ? "文字標籤" : mode === "B2" ? "左側色條＋圖示" : "只標例外"}）：
      </span>
      {items.map(([k, name, label]) => (
        <span key={k} className={`flex items-center gap-2 ${mode === "B2" ? "text-sm" : "text-xs"} text-zinc-600 dark:text-zinc-400`}>
          {sample(k, name)}
          {label}
        </span>
      ))}
      {mode === "B3" && (
        <span className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="rounded px-2 py-0.5 text-sm ring-2 ring-red-500">整格框紅</span>
          有問題的格子（缺人、不符合規則）
        </span>
      )}
      <span className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="rounded px-1.5 py-0.5 text-sm ring-2 ring-amber-400">黃框</span>
        目前選的提醒類別對到的人或格子
      </span>
      <span className="text-xs text-zinc-500">點名字可以鎖定、改崗位、加備援</span>
    </div>
  );
}
