"use client";

// 票3「草稿提醒要長什麼樣子」UI 原型（throwaway prototype，分支 prototype/schedule-ui，不會合併進 main）：
// 掛在既有的週排班表頁 /admin/schedule?week=...&variant=B1|B2|B3，用底部浮動列切換。
// 第 1 輪有 A（週總表）／B（逐日清單）／C（先看提醒）三個版面，Cynthia 選了 B；
// 第 2 輪全部用 B 版面，切換的是三種人名格子的顯示方式（VariantA.tsx、VariantC.tsx 留在分支上，不再切換過去）。
// 草稿是在瀏覽器裡跑 scheduleLogic.js（排班演算法原型）算出來的；所有按鈕只改記憶體狀態，不會存檔。

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDraft, type DraftProps } from "./useDraft";
import { VariantB } from "./VariantB";
import { VARIANTS, type VariantKey } from "./variants";

export type { VariantKey };

export function PrototypeShell({ variant, ...props }: DraftProps & { variant: VariantKey }) {
  const draft = useDraft(props);
  return (
    <>
      <div className="mt-4 rounded border border-dashed border-fuchsia-400 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-200">
        原型（票3 草稿提醒）：草稿是瀏覽器裡用排班演算法原型＋假資料算出來的，按鈕都不會存檔。特殊日期來源：{props.specialDatesSource}。
        {props.snapshotSpecialDates.length !== props.currentSpecialDates.length && " 這份草稿故意用「颱風假、補假登記之前」的假日資料產生，示範「假日有變動，請重排」。"}
      </div>
      <VariantB draft={draft} mode={variant} />
      <PrototypeSwitcher current={variant} week={props.monday} />
    </>
  );
}

function PrototypeSwitcher({ current, week }: { current: VariantKey; week: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const index = VARIANTS.findIndex((v) => v.key === current);
  const go = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    router.replace(`${pathname}?week=${week}&variant=${next.key}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const v = VARIANTS[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-700 px-2 py-1.5 text-sm text-white shadow-xl print:hidden">
      <button type="button" onClick={() => go(-1)} className="rounded-full px-3 py-1 hover:bg-fuchsia-600" aria-label="上一種顯示方式">
        ←
      </button>
      <span className="min-w-48 text-center font-medium">
        {v.key}（{v.name}）
      </span>
      <button type="button" onClick={() => go(1)} className="rounded-full px-3 py-1 hover:bg-fuchsia-600" aria-label="下一種顯示方式">
        →
      </button>
    </div>
  );
}
