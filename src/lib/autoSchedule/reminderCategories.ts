// 草稿提醒的分類與格式：週排班表的瀏覽器端也會用到，所以跟排班演算法分開放

export type CategoryKey =
  | "shortage"
  | "task"
  | "thirdDay"
  | "holiday"
  | "rule"
  | "conflict"
  | "surplus"
  | "noAvail"
  | "days"
  | "other";

export type ReminderLevel = "要處理" | "參考";

export const CATEGORIES: { key: CategoryKey; label: string; level: ReminderLevel; hint: string }[] = [
  { key: "shortage", label: "人手不足", level: "要處理", hint: "點名字可以把人改到缺人的崗位，或到單日頁加人；人真的不夠也可以先不處理。" },
  { key: "task", label: "任務待指定", level: "要處理", hint: "到「任務登記」指定人員，或點那個時段某人的名字，把他改去任務崗位。" },
  { key: "thirdDay", label: "正職第三天", level: "要處理", hint: "選一天讓平日印單的正職印單：點那天印訂單的人改去別的崗位，再把正職改去印訂單。" },
  { key: "holiday", label: "假日有變動", level: "要處理", hint: "草稿是用舊的假日資料排的，按「重排整週」套用新的假日。" },
  { key: "rule", label: "不符合規則", level: "要處理", hint: "每則都寫出違反哪一條。可以接受就勾已看過；不行就點名字改掉或解除鎖定。" },
  { key: "conflict", label: "指定的人有衝突", level: "要處理", hint: "本週任務指定的人那個時段已經有別的工作或請假，改指定別人或手動調整。" },
  { key: "surplus", label: "人力過剩", level: "參考", hint: "這些人有空但沒排到工作，或上班當天有時段空著（正職的非出貨時段留給你手動安排），可以安排處理進貨或其他工作。" },
  { key: "noAvail", label: "沒登記可上班時間", level: "參考", hint: "系統先當全天可上班排了，請提醒本人登記。" },
  { key: "days", label: "出貨優先日／放假資訊", level: "參考", hint: "這週哪幾天加人、哪幾天不排班。" },
  { key: "other", label: "其他提示", level: "參考", hint: "上次自動排班時系統自己處理掉的情況（安排休假、印單有人頂上、任務代班……），看過就好。" },
];

// 提醒對到畫面上的哪裡：某天、某天某時段、某格（時段＋崗位）、或某個人
export type Target = { date?: string; slot?: string; positionId?: string; ptId?: string };

export type Reminder = {
  id: string;
  catKey: CategoryKey;
  title: string;
  detail?: string;
  targets: Target[];
};

// 某一則提醒有沒有對到這個地方（一天／一個時段／一格／一個人）
export function targetMatches(t: Target, where: { date: string; slot?: string; positionId?: string; ptId?: string }) {
  if (t.date && t.date !== where.date) return false;
  if (t.slot && t.slot !== where.slot) return false;
  if (t.positionId && t.positionId !== where.positionId) return false;
  if (t.ptId && t.ptId !== where.ptId) return false;
  return true;
}
