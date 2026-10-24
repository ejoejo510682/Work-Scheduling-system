// 票3 原型：可以切換的版本清單。放在沒有 "use client" 的檔案，server（page.tsx）跟 client 都能讀。
// 第 2 輪 Cynthia 選了 B（逐日清單）版面，A、C 的檔案留著但不再切換過去；
// B1／B2／B3 是同一個 B 版面裡三種不同的人名格子顯示方式。

export const VARIANTS = [
  { key: "B1", name: "逐日清單・文字標籤" },
  { key: "B2", name: "逐日清單・左側色條＋圖示" },
  { key: "B3", name: "逐日清單・只標例外" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

// 網址的 variant 參數 → 版本（B 當成 B1；A、C 不再使用，回到原本的頁面）
export function parseVariant(v: string | undefined): VariantKey | undefined {
  if (v === "B") return "B1";
  return VARIANTS.find((x) => x.key === v)?.key;
}
