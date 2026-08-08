import type { AvailabilityRange, Slot } from "@/lib/constants";

const MORNING_SLOTS: Slot[] = ["上午出訂單前", "上午出訂單後"];
const AFTERNOON_SLOTS: Slot[] = ["下午出訂單前", "下午出訂單後"];

// 每日可上班範圍是否涵蓋這個時段
export function isAvailableForSlot(range: AvailabilityRange, slot: Slot): boolean {
  if (range === "全天休假") return false;
  if (range === "全天") return true;
  if (range === "只上午") return (MORNING_SLOTS as string[]).includes(slot);
  if (range === "只下午") return (AFTERNOON_SLOTS as string[]).includes(slot);
  return false; // 出貨完成後只有「全天」的人可以上，上面已經處理過
}
