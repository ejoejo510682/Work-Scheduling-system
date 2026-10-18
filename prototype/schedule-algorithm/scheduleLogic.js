// ============================================================================
// 排班演算法原型（throwaway prototype，對應 GitHub issue #4）
// ----------------------------------------------------------------------------
// 這是一組「純函式」模組：沒有 DOM、沒有 fetch、沒有 Supabase client，
// 輸入純資料、輸出純資料，將來驗證沒問題後可以直接搬進 src/lib/。
//
// 主要進入點：generateWeekSchedule(input) => { schedule, warnings }
//
// 本檔案同時被 schedule-prototype.html 用 <script src="scheduleLogic.js">
// 引入，以及（若要）用 Node/Jest 直接 require 測試，所以結尾同時輸出
// 到 window 跟 module.exports，本身邏輯不依賴任何環境。
// ============================================================================

"use strict";

// ----------------------------------------------------------------------------
// 一、常數（對照 CLAUDE.md 第四章 / supabase migrations 的 check 限制）
// ----------------------------------------------------------------------------

const SLOTS = ["上午出訂單前", "上午出訂單後", "下午出訂單前", "下午出訂單後", "出貨完成後"];

// 星期索引：0=一...5=六，6=日（週日不排班，店休）
const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];

const GROUP_SHIPPING = "出貨組";
const GROUP_INBOUND = "進貨組";
const GROUP_FLEX = "不固定";

// ----------------------------------------------------------------------------
// 二、日期工具（純函式，沿用 src/lib/date.ts 同樣「用字串處理日期」的作法，
//     避免時區換算誤差；這裡重新寫一份是因為本模組不能依賴專案內其他檔案，
//     要能被整個搬走）
// ----------------------------------------------------------------------------

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

// 0=一...5=六，6=日
function getWeekdayIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay(); // 0=日...6=六
  return js === 0 ? 6 : js - 1;
}

function isSunday(dateStr) {
  return getWeekdayIndex(dateStr) === 6;
}

function isSaturday(dateStr) {
  return getWeekdayIndex(dateStr) === 5;
}

// 給定週一日期，回傳整週 7 天（一～日）
function getWeekDates(weekStartMonday) {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(weekStartMonday, i));
}

// ----------------------------------------------------------------------------
// 三、電商檔期規律（複製自 src/lib/specialDates.ts 的邏輯：
//     雙字日／18號／25號 是固定重複規律，不用存資料庫，直接算）
// ----------------------------------------------------------------------------

function ecommerceCampaignLabel(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  if (d === m) return `雙${m}檔期`;
  if (d === 18) return "18號檔期";
  if (d === 25) return "25號檔期";
  return null;
}

// ----------------------------------------------------------------------------
// 四、出貨優先日判斷
//
// 【開放判斷 #2】「連假後的 2 個工作天」定義：
// 把「國定假日」與「週日」視為同一種「不上班日」，往後找最長的連續不上班區間，
// 區間結束後的第 1、2 個「工作天」（工作天 = 非週日，六照常上班）就是出貨優先日，
// 第 3 個工作天起恢復正常。
//
// 具體走一次範例：假設 10/10（六）是國定假日，10/11（日）本來就店休。
//   - 從 10/10 開始，10/11 也不上班 → 連續不上班區間＝[10/10, 10/11]
//   - 區間結束後，10/12（一）＝第1個工作天、10/13（二）＝第2個工作天 → 都是出貨優先日
//   - 10/14（三）起恢復正常基準人數
//
// 另一個例子：若只有 10/1（四）單獨一天國定假日，10/2（五）正常上班：
//   - 連續不上班區間＝[10/1]（10/2 非假日非週日，區間到此結束）
//   - 10/2（五）＝第1個工作天、10/3（六，照常上班也算工作天）＝第2個工作天 → 皆出貨優先日
//   - 10/4（日）店休跳過，10/5（一）才是「回歸正常」的日子
// ----------------------------------------------------------------------------

function isHolidayDate(dateStr, specialDates) {
  return specialDates.some((s) => s.date === dateStr && s.type === "國定假日");
}

function findSpecialDate(dateStr, specialDates) {
  return specialDates.find((s) => s.date === dateStr) || null;
}

// 找出以 holidayDate 為起點、往後連續「國定假日或週日」的最後一天
function getHolidayRunEnd(holidayDate, specialDates) {
  let cursor = holidayDate;
  for (let i = 0; i < 14; i++) {
    const next = addDaysStr(cursor, 1);
    if (isSunday(next) || isHolidayDate(next, specialDates)) {
      cursor = next;
    } else {
      break;
    }
  }
  return cursor;
}

/**
 * 判斷某天是不是「出貨優先日」，以及加人數是多少。
 * 判斷依據（票2 決議第五條）：
 *   (a) 當天本身是 special_dates 裡的日期（國定假日或電商檔期）
 *   (b) 當天是電商檔期的計算規律（雙字日／18號／25號）
 *   (c) 當天是「連假」結束後的第 1 或第 2 個工作天
 */
function isPriorityShippingDay(dateStr, specialDates) {
  const direct = findSpecialDate(dateStr, specialDates);
  if (direct) {
    return {
      isPriority: true,
      reason: `${direct.type}：${direct.name}`,
      extraHeadcount: direct.extra_headcount == null ? 1 : direct.extra_headcount,
    };
  }

  const campaign = ecommerceCampaignLabel(dateStr);
  if (campaign) {
    return { isPriority: true, reason: `電商檔期：${campaign}`, extraHeadcount: 1 };
  }

  // (c) 連假後 2 個工作天：往回找最近的國定假日，看它的連假區間有沒有把今天蓋進去
  for (let back = 1; back <= 10; back++) {
    const candidateHoliday = addDaysStr(dateStr, -back);
    if (!isHolidayDate(candidateHoliday, specialDates)) continue;

    const runEnd = getHolidayRunEnd(candidateHoliday, specialDates);
    // runEnd 之後第一個工作天一定不是假日也不是週日（getHolidayRunEnd 的迴圈保證）
    const workday1 = addDaysStr(runEnd, 1);
    let workday2 = addDaysStr(workday1, 1);
    if (isSunday(workday2)) workday2 = addDaysStr(workday2, 1); // 跳過週日，往後找下一個工作天

    if (dateStr === workday1 || dateStr === workday2) {
      const holidayRow = findSpecialDate(candidateHoliday, specialDates);
      return {
        isPriority: true,
        reason: `連假後工作天（連假：${holidayRow ? holidayRow.name : candidateHoliday}）`,
        extraHeadcount: holidayRow && holidayRow.extra_headcount != null ? holidayRow.extra_headcount : 1,
      };
    }
    // 只要往回找到一個國定假日就可以判斷完畢，不用再往更早找
    break;
  }

  return { isPriority: false, reason: null, extraHeadcount: 0 };
}

// ----------------------------------------------------------------------------
// 五、可上班範圍是否涵蓋某時段
//     複製自 src/lib/schedule.ts 的 isAvailableForSlot，保持跟正式系統一致：
//     「出貨完成後」只有登記「全天」的人可以上。
// ----------------------------------------------------------------------------

const MORNING_SLOTS = ["上午出訂單前", "上午出訂單後"];
const AFTERNOON_SLOTS = ["下午出訂單前", "下午出訂單後"];

function isAvailableForSlot(range, slot) {
  if (range === "全天休假") return false;
  if (range === "全天") return true;
  if (range === "只上午") return MORNING_SLOTS.includes(slot);
  if (range === "只下午") return AFTERNOON_SLOTS.includes(slot);
  return false;
}

function getAvailability(ptId, dateStr, availabilityRows) {
  return availabilityRows.find((a) => a.pt_id === ptId && a.date === dateStr) || null;
}

// ----------------------------------------------------------------------------
// 六、能力相關
// ----------------------------------------------------------------------------

function getLevel(ptId, positionId, abilities) {
  const row = abilities.find((a) => a.pt_id === ptId && a.position_id === positionId);
  return row ? row.level : 1; // 沒登記視為一級（不會）
}

// 數某人「三級崗位」的數量，可限定在某個崗位集合內（用於「同組內三級崗位多的先排」）
function countLevel3(ptId, abilities, positionIds) {
  return abilities.filter(
    (a) => a.pt_id === ptId && a.level === 3 && (!positionIds || positionIds.includes(a.position_id))
  ).length;
}

// ----------------------------------------------------------------------------
// 七、排班情境（context）：把一週會重複用到的東西包起來，減少參數傳遞
// ----------------------------------------------------------------------------

// 【修正 4】崗位要先過濾 is_active（已停用，例如「處理團購訂單」）跟
// included_in_auto_schedule（細節未定案、自動排班先完全跳過，例如「處理批發訂單」）。
// 過濾後的 positions 才是整個排班流程會用到的崗位清單，被濾掉的崗位從頭到尾不會
// 出現在任何候選名單、目標人數、警示訊息裡，等於「單純當它不存在」。
function buildContext(input) {
  const { positions, staff, abilities, headcounts, slotMap, availability, specialDates } = input;

  const usablePositions = positions.filter((p) => p.is_active !== false && p.included_in_auto_schedule !== false);

  const positionById = new Map(usablePositions.map((p) => [p.id, p]));
  const headcountByPosition = new Map(headcounts.map((h) => [h.position_id, h.headcount]));
  const activeStaff = staff.filter((s) => s.is_active);

  const slotsForPosition = new Map();
  for (const p of usablePositions) {
    slotsForPosition.set(
      p.id,
      slotMap.filter((sm) => sm.position_id === p.id).map((sm) => sm.slot)
    );
  }

  const shippingPositionIds = usablePositions.filter((p) => p.group === GROUP_SHIPPING).map((p) => p.id);
  const inboundPositionIds = usablePositions.filter((p) => p.group === GROUP_INBOUND).map((p) => p.id);

  return {
    positions: usablePositions,
    positionById,
    headcountByPosition,
    activeStaff,
    abilities,
    availability,
    specialDates,
    slotsForPosition,
    shippingPositionIds,
    inboundPositionIds,
    // 執行過程中累積的狀態
    ptDaysUsedThisWeek: new Map(activeStaff.map((s) => [s.id, 0])),
    assignedTodayBySlot: new Map(), // key: date+slot -> Set(ptId) 誰在這個時段已經有「第一任務」
    scheduleRows: [],
    warnings: [],
    priorityDaysFound: [],
  };
}

function slotKey(date, slot) {
  return `${date}__${slot}`;
}

function isAssignedThisSlot(ctx, date, slot, ptId) {
  const set = ctx.assignedTodayBySlot.get(slotKey(date, slot));
  return !!set && set.has(ptId);
}

function markAssignedThisSlot(ctx, date, slot, ptId) {
  const key = slotKey(date, slot);
  if (!ctx.assignedTodayBySlot.has(key)) ctx.assignedTodayBySlot.set(key, new Set());
  ctx.assignedTodayBySlot.get(key).add(ptId);
}

// 【修正 4】positions.max_headcount：某個崗位在某個時段「物理上」的絕對人數上限
// （目前只有「包裝」= 4，因為包裝站只有 4 個實體工位）。這跟 position_headcount
// 基準人數是不同的概念：基準是「正常情況要排幾人」，上限是「無論如何都不能超過」，
// 出貨優先日加人、平均分攤補人、正職強制上工……所有路徑都要檔在這道關卡之後。
function currentPriorityCount(ctx, date, slot, positionId) {
  return ctx.scheduleRows.filter(
    (r) => r.date === date && r.slot === slot && r.position_id === positionId && r.priority === 1
  ).length;
}

function hasCapacity(ctx, date, slot, position) {
  if (position.max_headcount == null) return true;
  return currentPriorityCount(ctx, date, slot, position.id) < position.max_headcount;
}

function commitAssignment(ctx, date, slot, position, ptId, priority) {
  const staffRow = ctx.activeStaff.find((s) => s.id === ptId);
  ctx.scheduleRows.push({
    date,
    slot,
    position_id: position.id,
    position_name: position.name,
    pt_id: ptId,
    pt_name: staffRow ? staffRow.name : ptId,
    priority,
    source: "auto",
  });
  if (priority === 1) markAssignedThisSlot(ctx, date, slot, ptId);
}

// ----------------------------------------------------------------------------
// 八、能力門檻檢查：一級不能排；二級要「同時段、同崗位」已有一位三級才能排
//
// 【開放判斷 #5】同一人在同一時段，是否能「第一任務＋別人崗位的第二任務（備援）」
// 同時存在？決定：可以。daily_schedule 的 priority 欄位本來就是設計成「同一人在
// 同一時段可以有第一、第二任務」（見 migration 0002 註解），所以備援指的是「這個
// 人本身已經在排的崗位之外，多標記一個他也能支援的崗位」，不是找另一個閒置的人、
// 也不會造成這個人要分身去別的崗位。因此備援資格檢查只針對「這個人自己的能力」，
// 不會再去檢查他是否已經被佔用。
// ----------------------------------------------------------------------------

function qualifiesForPrimary(ptId, positionId, abilities, alreadyAssignedLevel3Exists) {
  const level = getLevel(ptId, positionId, abilities);
  if (level === 3) return true;
  if (level === 2) return alreadyAssignedLevel3Exists;
  return false;
}

// ----------------------------------------------------------------------------
// 九、候選人排序
//
// 【開放判斷 #4】「三級崗位多」同分時怎麼排序？決定：
//   1. 三級崗位數（在相關組別內）多的在前
//   2. 本週目前已經被排的天數少的在前（讓工作量盡量平均分散，不要每次都同一批人被疊加）
//   3. 姓名字串排序（純粹為了讓同一份資料每次跑出來的結果都一樣、方便 Cynthia 比對；
//      這個順序本身沒有業務意義，只是一個穩定、確定性的 tie-break，Cynthia 如果有
//      想要的優先順序（例如資深／年齡）可以再換）
// ----------------------------------------------------------------------------

function rankCandidates(candidateIds, ctx, groupPositionIds) {
  return [...candidateIds].sort((a, b) => {
    const l3a = countLevel3(a, ctx.abilities, groupPositionIds);
    const l3b = countLevel3(b, ctx.abilities, groupPositionIds);
    if (l3a !== l3b) return l3b - l3a;

    const daysA = ctx.ptDaysUsedThisWeek.get(a) || 0;
    const daysB = ctx.ptDaysUsedThisWeek.get(b) || 0;
    if (daysA !== daysB) return daysA - daysB;

    const staffA = ctx.activeStaff.find((s) => s.id === a);
    const staffB = ctx.activeStaff.find((s) => s.id === b);
    return (staffA ? staffA.name : a).localeCompare(staffB ? staffB.name : b, "zh-Hant");
  });
}

// ----------------------------------------------------------------------------
// 十、PT 每週 4 天上限 + 可上班範圍 → 算出某天「可以考慮」的人
// ----------------------------------------------------------------------------

function isUnderWeeklyCap(ptId, staffRow, ctx) {
  if (staffRow.employment_type !== "PT") return true; // 正職沒有 4 天上限
  return (ctx.ptDaysUsedThisWeek.get(ptId) || 0) < 4;
}

function isAvailableForSlotToday(ptId, date, slot, ctx) {
  const avail = getAvailability(ptId, date, ctx.availability);
  if (!avail) {
    // 未登記可上班時間：票2 決議第十條，預設視為全天可上班，但要列入草稿提醒
    if (!ctx.warnings.some((w) => w.type === "missing_availability" && w.date === date && w.ptId === ptId)) {
      const staffRow = ctx.activeStaff.find((s) => s.id === ptId);
      ctx.warnings.push({
        type: "missing_availability",
        date,
        ptId,
        message: `${staffRow ? staffRow.name : ptId} 在 ${date} 沒有登記可上班時間，暫時視為全天可上班`,
      });
    }
    return true;
  }
  return isAvailableForSlot(avail.range, slot);
}

// ----------------------------------------------------------------------------
// 十一、挑人順序主邏輯（票2 決議第六條）：
//   step1：各組先用主要組別相符的人填
//   step2：出貨仍缺 → 用「不固定」補（出貨優先日也可以用固定進貨組）
//   step3：進貨仍缺 → 用「不固定」+ 排不進出貨崗位的出貨組人員補
//   step4：仍有剩餘 → 不排班，標示「人力過剩」（在每天結束後統一算）
// ----------------------------------------------------------------------------

function buildEligiblePool(positionIds, date, slot, ctx, excludeIds) {
  const exclude = excludeIds || new Set();
  return ctx.activeStaff
    .filter((s) => !exclude.has(s.id))
    .filter((s) => isUnderWeeklyCap(s.id, s, ctx))
    .filter((s) => isAvailableForSlotToday(s.id, date, slot, ctx))
    .filter((s) => !isAssignedThisSlot(ctx, date, slot, s.id))
    .filter((s) => positionIds.some((pid) => getLevel(s.id, pid, ctx.abilities) >= 2))
    .map((s) => s.id);
}

// 把一個候選池塞進一個崗位的目標人數，回傳實際補進去的人數
function fillPosition(ctx, date, slot, position, target, candidatePool, groupPositionIdsForRanking) {
  if (target <= 0) return 0;
  let filledCount = currentPriorityCount(ctx, date, slot, position.id);
  if (filledCount >= target) return 0;

  const remainingPool = candidatePool.filter((id) => !isAssignedThisSlot(ctx, date, slot, id));
  const ranked = rankCandidates(remainingPool, ctx, groupPositionIdsForRanking);

  let added = 0;
  // 第一輪：三級的人（target 已經在 baseTarget 裡鉏過 max_headcount，這裡的
  // hasCapacity 檢查是防呆：萬一呼叫端自己傳了一個超過上限的 target 進來，
  // 也不會讓單一崗位單一時段的人數衝破硬性上限）
  for (const ptId of ranked) {
    if (filledCount >= target || !hasCapacity(ctx, date, slot, position)) break;
    if (getLevel(ptId, position.id, ctx.abilities) === 3) {
      commitAssignment(ctx, date, slot, position, ptId, 1);
      filledCount++;
      added++;
    }
  }
  // 第二輪：二級的人（此崗位此時段已經有三級的人陪同才能排）
  const hasLevel3Now = ctx.scheduleRows.some(
    (r) =>
      r.date === date &&
      r.slot === slot &&
      r.position_id === position.id &&
      r.priority === 1 &&
      getLevel(r.pt_id, position.id, ctx.abilities) === 3
  );
  if (hasLevel3Now) {
    for (const ptId of ranked) {
      if (filledCount >= target || !hasCapacity(ctx, date, slot, position)) break;
      if (isAssignedThisSlot(ctx, date, slot, ptId)) continue;
      if (getLevel(ptId, position.id, ctx.abilities) === 2) {
        commitAssignment(ctx, date, slot, position, ptId, 1);
        filledCount++;
        added++;
      }
    }
  }
  return added;
}

// 計算某崗位在某時段/當天的目標需求人數（基準人數 + 出貨優先日加人 + 平日保底/分攤規則）
// 這個函式只算「理論目標」，實際填不填得滿要看有沒有人；詳細的平均分攤邏輯在
// assignSlot 裡面，因為分攤需要知道「剩餘人力夠不夠兩邊都滿足」才能決定怎麼砍。
function baseTarget(position, ctx, isPriority, extraHeadcount) {
  const base = ctx.headcountByPosition.get(position.id) || 0;
  let target = isPriority && position.priority_day_bonus ? base + extraHeadcount : base;
  // 硬性上限：不管基準人數、出貨優先日加人加到多少，target 本身就先鉏到上限，
  // 後面所有 fillPosition / flex 補人的流程都是照 target 填，天生就不會超過
  if (position.max_headcount != null) target = Math.min(target, position.max_headcount);
  return target;
}

// ----------------------------------------------------------------------------
// 十二、印訂單輪排（票2 決議第七條）
//
// 正職 3 天固定：週一、週六、「第 3 天」＝當週出貨優先日（沒有則週二）
// PT 3 天：剩下 3 天，在「印訂單三級」的 PT 之間輪，原則是「上週拿 2 天的人這週拿 1 天」
// ----------------------------------------------------------------------------

function computePrinterRotation(input, ctx) {
  const weekDates = getWeekDates(input.weekStart).slice(0, 6); // 一～六
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");
  const priorityInfoByDate = new Map(weekDates.map((d) => [d, isPriorityShippingDay(d, ctx.specialDates)]));

  // 正職的 3 天
  const fullTimePrinters = ctx.activeStaff.filter(
    (s) => s.employment_type === "正職" && getLevel(s.id, printerPosition.id, ctx.abilities) >= 2
  );
  const monday = weekDates[0];
  const saturday = weekDates[5];
  const priorityWeekday = weekDates
    .slice(1, 5) // 二～五
    .find((d) => priorityInfoByDate.get(d).isPriority);
  const thirdDay = priorityWeekday || weekDates[1]; // 沒有出貨優先日就用週二

  function pickFullTimePrinter(date) {
    const level3 = fullTimePrinters.filter((s) => getLevel(s.id, printerPosition.id, ctx.abilities) === 3);
    const pool = level3.length > 0 ? level3 : fullTimePrinters;
    if (pool.length === 0) {
      ctx.warnings.push({
        type: "info",
        date,
        message: `${date} 找不到任何正職可以印訂單（三級或二級），印訂單崗位需要人工調整`,
      });
      return null;
    }
    // 固定用姓名排序挑第一位，實務上這天應該都是同一位固定的正職
    return [...pool].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))[0].id;
  }

  const assignments = new Map();
  assignments.set(monday, pickFullTimePrinter(monday));
  assignments.set(saturday, pickFullTimePrinter(saturday));
  assignments.set(thirdDay, pickFullTimePrinter(thirdDay));

  // PT 的 3 天 = 剩下的平日（二～五，去掉 thirdDay）
  const ptDays = weekDates.slice(1, 5).filter((d) => d !== thirdDay);

  const ptPrinters = ctx.activeStaff.filter(
    (s) => s.employment_type === "PT" && getLevel(s.id, printerPosition.id, ctx.abilities) === 3
  );

  // 讀上週的 daily_schedule，算每個人上週印訂單排了幾天
  const lastWeekCounts = new Map(ptPrinters.map((s) => [s.id, 0]));
  for (const row of input.previousWeekSchedule || []) {
    if (row.position_id !== printerPosition.id && row.position_name !== "印訂單") continue;
    if (row.priority !== 1) continue;
    if (lastWeekCounts.has(row.pt_id)) {
      lastWeekCounts.set(row.pt_id, lastWeekCounts.get(row.pt_id) + 1);
    }
  }

  if (ptPrinters.length === 0) {
    ctx.warnings.push({
      type: "info",
      date: input.weekStart,
      message: "沒有任何 PT 達到印訂單三級，PT 的 3 個印訂單班次需要主管另外安排或加派訓練",
    });
  } else {
    // 上週拿的天數少（含完全沒上週資料、沒被排過的新人＝0 天）的人優先拿本週 2 天
    const sortedByLastWeek = [...ptPrinters].sort((a, b) => {
      const diff = (lastWeekCounts.get(a.id) || 0) - (lastWeekCounts.get(b.id) || 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "zh-Hant");
    });

    const primary = sortedByLastWeek[0];
    const secondary = sortedByLastWeek.length > 1 ? sortedByLastWeek[1] : null;

    if (!secondary) {
      ctx.warnings.push({
        type: "info",
        date: input.weekStart,
        message: `印訂單三級的 PT 只有 ${primary.name} 一位，本週 3 天印訂單班只能由同一人連續負擔，建議安排第 2 人受訓`,
      });
      for (const d of ptDays) assignments.set(d, primary.id);
    } else {
      // primary 拿 2 天、secondary 拿 1 天
      assignments.set(ptDays[0], primary.id);
      assignments.set(ptDays[1], primary.id);
      assignments.set(ptDays[2], secondary.id);
    }
  }

  return { assignments, thirdDay, priorityInfoByDate };
}

// computePrinterRotation 是在「一週開始前」一次決定好輪排名單的純函式，不知道排班
// 過程中途誰已經用掉幾天。但實際指派要逐天進行時，輪到的人可能在那天之前，已經因為
// 一般出貨/進貨的指派用完 4 天上限（例如同時又被排了很多撿貨/包裝班）。
// 這個函式在真正要落地指派印訂單那一天，重新確認一次：輪到的人還有名額嗎？
// 沒有的話，從其他印訂單合格的人裡面找一個還沒到上限的頂上，都找不到才留空+警告。
function printerIsUsable(ptId, staffRow, date, ctx) {
  if (!isUnderWeeklyCap(ptId, staffRow, ctx)) return false;
  // 印訂單要同時顧到上午、下午兩個「出訂單前」時段，兩個都要能上班才算
  return (
    isAvailableForSlotToday(ptId, date, "上午出訂單前", ctx) && isAvailableForSlotToday(ptId, date, "下午出訂單前", ctx)
  );
}

function resolvePrinterForDate(rotation, date, ctx) {
  const candidateId = rotation.assignments.get(date);
  if (!candidateId) return null;
  const staffRow = ctx.activeStaff.find((s) => s.id === candidateId);
  if (!staffRow) return null;
  if (printerIsUsable(candidateId, staffRow, date, ctx)) return candidateId;

  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");
  const altCandidates = ctx.activeStaff.filter(
    (s) =>
      s.id !== candidateId &&
      getLevel(s.id, printerPosition.id, ctx.abilities) >= 2 &&
      printerIsUsable(s.id, s, date, ctx)
  );
  if (altCandidates.length > 0) {
    const alt = [...altCandidates].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))[0];
    ctx.warnings.push({
      type: "info",
      date,
      message: `原本輪排到 ${staffRow.name} 印訂單，但當天請假或已達本週 4 天上限，改由 ${alt.name} 頂上`,
    });
    return alt.id;
  }
  ctx.warnings.push({
    type: "shortage",
    date,
    message: `${date} 印訂單：輪排到的 ${staffRow.name} 當天請假或已達本週 4 天上限，且找不到其他符合資格的人，印訂單需要人工排`,
  });
  return null;
}

// ----------------------------------------------------------------------------
// 十三、備援（第二順位）指派（票2 決議第九條）
// ----------------------------------------------------------------------------

function assignBackups(ctx, date, slot) {
  const primariesThisSlot = ctx.scheduleRows.filter(
    (r) => r.date === date && r.slot === slot && r.priority === 1
  );
  for (const row of primariesThisSlot) {
    const position = ctx.positionById.get(row.position_id);
    if (!position || !position.default_backup_position_id) continue;
    const backupPosition = ctx.positionById.get(position.default_backup_position_id);
    if (!backupPosition) continue;

    const level = getLevel(row.pt_id, backupPosition.id, ctx.abilities);
    if (level === 3) {
      commitAssignment(ctx, date, slot, backupPosition, row.pt_id, 2);
      continue;
    }
    if (level === 2) {
      // 二級要「這個備援崗位、這個時段」已經有一位三級的人（不論是第一或第二任務）才能排
      const hasLevel3InBackup = ctx.scheduleRows.some(
        (r) =>
          r.date === date &&
          r.slot === slot &&
          r.position_id === backupPosition.id &&
          getLevel(r.pt_id, backupPosition.id, ctx.abilities) === 3
      );
      if (hasLevel3InBackup) {
        commitAssignment(ctx, date, slot, backupPosition, row.pt_id, 2);
      }
      // 不符合能力規則就留空，不產生任何列，也不算警告（票2決議：不符合時留空）
    }
  }
}

// ----------------------------------------------------------------------------
// 十四、單一時段的指派流程（平日，週一～週五）
//
// 【開放判斷 #3】週三～週五人手不足時「兩邊平均分攤」，缺口是奇數時怎麼辦？
// 決定：出貨組拿 ceil(可用人力/2)，進貨組拿剩下的（floor）。理由：出貨有外部
// 收件車/快遞取貨的截止時間壓力，缺人直接影響當天能不能出貨；進貨處理相對有
// 彈性，稍微延後到明天通常不會立刻出事。如果其中一組缺口本身小、分不到那麼多
// 可用人力也用不完，剩下的人力會補給另一組，不會讓人平白閒置。
// ----------------------------------------------------------------------------

function assignSlot(ctx, date, slot, isPriority, extraHeadcount, skipPositionIds) {
  const skip = skipPositionIds || new Set();
  const allActivePositions = ctx.positions.filter(
    (p) => (ctx.slotsForPosition.get(p.id) || []).includes(slot) && !skip.has(p.id)
  );
  const shippingPositions = allActivePositions.filter((p) => p.group === GROUP_SHIPPING);
  const inboundPositions = allActivePositions.filter((p) => p.group === GROUP_INBOUND);

  const weekday = getWeekdayIndex(date); // 0=一...4=五
  const isMonTue = weekday === 0 || weekday === 1;

  // 目標人數：先算「理論基準」
  const shippingTargets = new Map(shippingPositions.map((p) => [p.id, baseTarget(p, ctx, isPriority, extraHeadcount)]));
  let inboundTargets;
  if (isMonTue) {
    // 週一週二：進貨保底 2 人，不是逐崗位基準人數加總
    inboundTargets = new Map(inboundPositions.map((p) => [p.id, 0]));
    let remaining = 2;
    // 優先滿足「處理進貨」，因為貨要先進來才有東西可處理；剩下名額再給團購訂單
    const sortedInbound = [...inboundPositions].sort((a, b) =>
      a.name === "處理進貨" ? -1 : b.name === "處理進貨" ? 1 : 0
    );
    for (const p of sortedInbound) {
      const want = Math.min(remaining, ctx.headcountByPosition.get(p.id) || 0);
      inboundTargets.set(p.id, want);
      remaining -= want;
    }
  } else {
    inboundTargets = new Map(inboundPositions.map((p) => [p.id, baseTarget(p, ctx, isPriority, extraHeadcount)]));
  }

  // step1：主要組別相符的人先填
  const shippingPrimaryPool = buildEligiblePool(
    shippingPositions.map((p) => p.id),
    date,
    slot,
    ctx,
    null
  ).filter((id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_SHIPPING);

  for (const p of [...shippingPositions].sort(
    (a, b) => (ctx.headcountByPosition.get(b.id) || 0) - (ctx.headcountByPosition.get(a.id) || 0)
  )) {
    fillPosition(ctx, date, slot, p, shippingTargets.get(p.id), shippingPrimaryPool, ctx.shippingPositionIds);
  }

  const inboundPrimaryPool = buildEligiblePool(
    inboundPositions.map((p) => p.id),
    date,
    slot,
    ctx,
    null
  ).filter((id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_INBOUND);

  for (const p of [...inboundPositions].sort(
    (a, b) => (ctx.headcountByPosition.get(b.id) || 0) - (ctx.headcountByPosition.get(a.id) || 0)
  )) {
    fillPosition(ctx, date, slot, p, inboundTargets.get(p.id), inboundPrimaryPool, ctx.inboundPositionIds);
  }

  // 算出兩邊還缺多少
  const shipGap = shippingPositions.reduce((sum, p) => {
    const filled = ctx.scheduleRows.filter(
      (r) => r.date === date && r.slot === slot && r.position_id === p.id && r.priority === 1
    ).length;
    return sum + Math.max(0, shippingTargets.get(p.id) - filled);
  }, 0);
  const inGap = inboundPositions.reduce((sum, p) => {
    const filled = ctx.scheduleRows.filter(
      (r) => r.date === date && r.slot === slot && r.position_id === p.id && r.priority === 1
    ).length;
    return sum + Math.max(0, inboundTargets.get(p.id) - filled);
  }, 0);

  // step2：出貨仍缺 → 先用「不固定」的人補；出貨優先日時，固定進貨組的人也要
  // 納入出貨組的挑人順序，但【修正 3】仍然要排在「不固定」之後（票0規則六第2點）。
  // 所以這裡分成兩個獨立的候選池，填的時候也分兩階段呼叫 fillFromFlexPool：
  // 不固定的人先盡量填，填不完才讓固定進貨組的人補剩下的缺口。
  const shippingFlexCandidates = new Set(
    buildEligiblePool(shippingPositions.map((p) => p.id), date, slot, ctx, null).filter(
      (id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_FLEX
    )
  );
  const shippingPriorityInboundCandidates = isPriority
    ? new Set(
        buildEligiblePool(shippingPositions.map((p) => p.id), date, slot, ctx, null).filter(
          (id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_INBOUND
        )
      )
    : new Set();
  // step3：進貨仍缺 → 不固定的人 ＋ 排不進出貨崗位的出貨組人員
  const inboundFlexCandidates = new Set(
    buildEligiblePool(inboundPositions.map((p) => p.id), date, slot, ctx, null).filter((id) => {
      const g = ctx.activeStaff.find((s) => s.id === id).primary_group;
      return g === GROUP_FLEX || g === GROUP_SHIPPING;
    })
  );

  let shipAllocation = shipGap;
  let inAllocation = inGap;

  if (weekday >= 2 && weekday <= 4) {
    // 週三～週五才套用「平均分攤」；人力足夠時不用砍，直接照 step2/step3 全部補滿
    const combinedFlexSupply = new Set([
      ...shippingFlexCandidates,
      ...shippingPriorityInboundCandidates,
      ...inboundFlexCandidates,
    ]).size;
    const combinedGap = shipGap + inGap;
    if (shipGap > 0 && inGap > 0 && combinedFlexSupply < combinedGap) {
      // 只有「出貨、進貨兩邊都還缺人」且補不滿時，才需要平均分攤；
      // 只有一邊缺人的話，直接把可用的人力全部給那一邊就好，不用套分攤規則
      let shipTarget = Math.min(shipGap, Math.ceil(combinedFlexSupply / 2));
      let inTarget = Math.min(inGap, combinedFlexSupply - shipTarget);
      let used = shipTarget + inTarget;
      let leftover = combinedFlexSupply - used;
      if (leftover > 0) {
        const shipMore = Math.min(shipGap - shipTarget, leftover);
        shipTarget += shipMore;
        leftover -= shipMore;
        const inMore = Math.min(inGap - inTarget, leftover);
        inTarget += inMore;
      }
      shipAllocation = shipTarget;
      inAllocation = inTarget;

      ctx.warnings.push({
        type: "shortage",
        date,
        message: `${date} ${slot}：出貨、進貨兩邊人手都不足，依規則平均分攤可動用的人力（出貨最多補 ${shipAllocation} 人／缺 ${shipGap} 人，進貨最多補 ${inAllocation} 人／缺 ${inGap} 人；實際排不排得進去還要看能力是否符合，詳見下方各崗位缺口）`,
      });
    }
  }

  const usedByFlex = fillFromFlexPool(
    ctx,
    date,
    slot,
    shippingPositions,
    shippingTargets,
    shippingFlexCandidates,
    shipAllocation,
    ctx.shippingPositionIds
  );
  // 【修正 3】不固定的人補不完，才讓出貨優先日的固定進貨組的人補剩下的缺口
  fillFromFlexPool(
    ctx,
    date,
    slot,
    shippingPositions,
    shippingTargets,
    shippingPriorityInboundCandidates,
    shipAllocation - usedByFlex,
    ctx.shippingPositionIds
  );
  fillFromFlexPool(ctx, date, slot, inboundPositions, inboundTargets, inboundFlexCandidates, inAllocation, ctx.inboundPositionIds);

  // 填完之後，再檢查一次還有沒有真正排不出來的缺口（非週三～週五的人手不足，或分攤後仍然不夠）
  // 【補充決議】每個出貨崗位在它適用的時段裡至少要排到 1 人是硬性規則；這裡不用特別
  // 寫一條新判斷——只要該崗位的基準人數（target）設定正確（> 0），0 人自然就會落在
  // filled < target 的條件裡，照樣跳出「需要 X 人只排到 Y 人」的警示。
  for (const p of allActivePositions) {
    const filled = currentPriorityCount(ctx, date, slot, p.id);
    const targetMap = p.group === GROUP_SHIPPING ? shippingTargets : inboundTargets;
    const target = targetMap.get(p.id) || 0;
    if (filled < target) {
      ctx.warnings.push({
        type: "shortage",
        date,
        message: `${date} ${slot} ${p.name}：需要 ${target} 人，只排到 ${filled} 人`,
      });
    }
  }

  assignBackups(ctx, date, slot);
}

// 回傳實際補進去的人數，讓呼叫端知道這個池子補了多少、還剩多少 allowance 可以讓
// 下一階段的池子（例如【修正3】固定進貨組）接著補
function fillFromFlexPool(ctx, date, slot, positions, targets, flexCandidateSet, allowance, groupPositionIds) {
  if (allowance <= 0) return 0;
  let remainingAllowance = allowance;
  let totalAdded = 0;
  for (const p of [...positions].sort((a, b) => (targets.get(b.id) || 0) - (targets.get(a.id) || 0))) {
    if (remainingAllowance <= 0) break;
    const filled = currentPriorityCount(ctx, date, slot, p.id);
    const gap = Math.max(0, (targets.get(p.id) || 0) - filled);
    if (gap <= 0) continue;
    const want = Math.min(gap, remainingAllowance);
    const pool = [...flexCandidateSet].filter((id) => !isAssignedThisSlot(ctx, date, slot, id));
    const added = fillPosition(ctx, date, slot, p, filled + want, pool, groupPositionIds);
    remainingAllowance -= added;
    totalAdded += added;
  }
  return totalAdded;
}

// ----------------------------------------------------------------------------
// 十五、週六特別處理（票2 決議第八條）
//
// 【開放判斷 #1】daily_schedule.slot 要填什麼？決定：套用現有 4 個平日時段
// （上午出訂單前／上午出訂單後／下午出訂單前／下午出訂單後），不使用「出貨完成後」，
// 讓同一批人整天都掛在同樣的崗位上，等於用「同一個人、同一個崗位、連續 4 個既有
// 時段」來表達「一個區塊做到完」，不需要改資料庫 schema 多加一個列舉值。
// 缺點：UI 上看起來像是週六也分了 4 段，其實是同一段，Cynthia 如果覺得這樣
// 誤導，之後可以考慮幫 daily_schedule.slot 加一個專屬的「週六整天」選項。
// ----------------------------------------------------------------------------

const SATURDAY_SLOTS = ["上午出訂單前", "上午出訂單後", "下午出訂單前", "下午出訂單後"];

function assignSaturday(ctx, date, printerId) {
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");
  const pickingPosition = ctx.positions.find((p) => p.name === "撿貨");
  const packingPosition = ctx.positions.find((p) => p.name === "包裝");
  const noPackagePosition = ctx.positions.find((p) => p.name === "無包裝出貨");

  // 正職：先印單（第一段），印完支援其他出貨崗位（後三段）
  let fullTimeId = printerId;
  if (fullTimeId) {
    commitAssignment(ctx, date, SATURDAY_SLOTS[0], printerPosition, fullTimeId, 1);
    for (const slot of SATURDAY_SLOTS.slice(1)) {
      commitAssignment(ctx, date, slot, pickingPosition, fullTimeId, 1);
    }
  } else {
    // 【修正 2】印訂單輪排那天找不到可用的人，不代表週六就放棄湊正職——票2決議
    // 第八條／補充決議都說週六是「硬性」1 正職 + 3 PT，所以還是要盡量找一位當天
    // 可上班、有出貨能力的正職頂上（他當天不印單，整天支援出貨）
    const fallbackFullTime = ctx.activeStaff.find(
      (s) =>
        s.employment_type === "正職" &&
        isUnderWeeklyCap(s.id, s, ctx) &&
        isAvailableForSlotToday(s.id, date, SATURDAY_SLOTS[0], ctx) &&
        ctx.shippingPositionIds.some((pid) => getLevel(s.id, pid, ctx.abilities) >= 2)
    );
    if (fallbackFullTime) {
      fullTimeId = fallbackFullTime.id;
      for (const slot of SATURDAY_SLOTS) {
        commitAssignment(ctx, date, slot, pickingPosition, fullTimeId, 1);
      }
      ctx.warnings.push({
        type: "info",
        date,
        message: `${date}（週六）印訂單輪排到的人當天不可用，改由 ${fallbackFullTime.name} 擔任當天的正職人力（整天支援出貨，不印訂單）`,
      });
    }
  }

  // 剩下的候選 PT：排除印訂單/正職的人，依可上班範圍、能力篩選，
  // 三級崗位數（出貨組崗位內）排序，取前 2 位（多）+ 1 位（少）
  const shippingPositionIds = ctx.shippingPositionIds;
  const ptPool = ctx.activeStaff.filter(
    (s) =>
      s.employment_type === "PT" &&
      s.id !== fullTimeId &&
      isUnderWeeklyCap(s.id, s, ctx) &&
      isAvailableForSlotToday(s.id, date, SATURDAY_SLOTS[0], ctx) &&
      shippingPositionIds.some((pid) => getLevel(s.id, pid, ctx.abilities) >= 2)
  );

  const ranked = [...ptPool].sort(
    (a, b) => countLevel3(b.id, ctx.abilities, shippingPositionIds) - countLevel3(a.id, ctx.abilities, shippingPositionIds)
  );

  const highAbility = ranked.slice(0, 2); // 三級崗位多的 2 位
  const lowAbility = ranked.length > 2 ? [ranked[ranked.length - 1]] : [];

  const saturdayPtPositions = [pickingPosition, packingPosition, noPackagePosition];
  const chosenPts = [...highAbility, ...lowAbility];

  for (let i = 0; i < chosenPts.length; i++) {
    const staffRow = chosenPts[i];
    // 依能力輪流挑一個當天這個人做得來的出貨崗位；三級優先選三級的崗位，否則找有二級
    // 且已經有三級陪同的崗位；找不到就排進「撿貨」當保底（撿貨是週六主力工作）
    let chosenPosition =
      saturdayPtPositions.find((p) => getLevel(staffRow.id, p.id, ctx.abilities) === 3) || pickingPosition;
    for (const slot of SATURDAY_SLOTS) {
      // 「包裝」硬性上限 4 人，週六也不能破例——這個時段若包裝已經滿了，改排撿貨保底
      const posForSlot = hasCapacity(ctx, date, slot, chosenPosition) ? chosenPosition : pickingPosition;
      commitAssignment(ctx, date, slot, posForSlot, staffRow.id, 1);
    }
  }

  // 【修正 2】週六一定要湊滿 4 人（1 正職 + 3 PT）是硬性規則，湊不滿不能悄悄放著，
  // 草稿提醒裡要看得到明確的缺口
  const totalHeadcount = (fullTimeId ? 1 : 0) + chosenPts.length;
  if (totalHeadcount < 4) {
    const parts = [];
    if (!fullTimeId) parts.push("正職 0/1 位");
    if (chosenPts.length < 3) parts.push(`PT ${chosenPts.length}/3 位`);
    ctx.warnings.push({
      type: "shortage",
      date,
      message: `${date}（週六）人數沒有湊滿硬性規定的 4 人（1 正職 + 3 PT），目前只排到 ${totalHeadcount} 人（${parts.join("、")}），需要人工調整`,
    });
  }
}

// ----------------------------------------------------------------------------
// 十五之一、【修正 1】正職一定要被排到工作崗位
//
// 票0規則二：「上工到下班，每個時段都要有工作」；補充決議再次強調「正職只要當天
// 有上班、沒請假，就一定要被排到工作，不能空著不排」。
//
// 問題根源：平常 assignSlot／assignSaturday 是按「目標人數（target）」在填，
// 填滿 target 就停手，不會特別保留名額給正職。而 rankCandidates 的排序裡有一條
// 「本週已經上班天數少的人優先」的 tie-break——這條本來是為了讓 PT 的工作量平均，
// 但正職本來就該每天上班、天數本來就會比較高，副作用是：到了週間，正職在候選池
// 裡的排名反而會被天數較少的 PT 擠到後面，如果當天 target 卡得比較緊，正職就可能
// 整天一個崗位都分不到，被誤判成「人力過剩」。
//
// 修法不是去動搖 PT 排序公平性那條規則，而是在每天的正常排班流程跑完之後，加一道
// 「保底檢查」：只要這個正職今天不是請假，且一整天完全沒被排進任何崗位，就直接
// 從他有能力（二級以上）又還有名額的崗位裡找位子塞進去（同時遵守包裝 4 人上限等
// 硬性上限），每個可上班的時段都補。真的連一個崗位都塞不進去（例如今天所有他會
// 的崗位全部滿額），才留下明確的警示，交給人工處理。
// ----------------------------------------------------------------------------

function ensureFullTimeWorked(ctx, date, slots, skipPositionIds) {
  const skip = skipPositionIds || new Set();
  const fullTimers = ctx.activeStaff.filter((s) => s.employment_type === "正職");

  for (const s of fullTimers) {
    const avail = getAvailability(s.id, date, ctx.availability);
    if (avail && avail.range === "全天休假") continue; // 請假，不受這條規則約束

    const hasAnyRowToday = ctx.scheduleRows.some((r) => r.date === date && r.pt_id === s.id && r.priority === 1);
    if (hasAnyRowToday) continue; // 正常流程已經排到工作，沒事

    let assignedAny = false;
    for (const slot of slots) {
      if (!isAvailableForSlotToday(s.id, date, slot, ctx)) continue;
      if (isAssignedThisSlot(ctx, date, slot, s.id)) continue;

      const candidatePositions = ctx.positions.filter(
        (p) =>
          !skip.has(p.id) &&
          (ctx.slotsForPosition.get(p.id) || []).includes(slot) &&
          getLevel(s.id, p.id, ctx.abilities) >= 2 &&
          hasCapacity(ctx, date, slot, p)
      );
      if (candidatePositions.length === 0) continue;

      // 同主要組別優先，其次不限組別；三級優先，二級要這個崗位這個時段已經有
      // 三級的人才能排（沿用既有能力規則）
      const sameGroupPool = candidatePositions.filter((p) => p.group === s.primary_group);
      const pool = sameGroupPool.length > 0 ? sameGroupPool : candidatePositions;

      let chosen = pool.find((p) => getLevel(s.id, p.id, ctx.abilities) === 3);
      if (!chosen) {
        chosen = pool.find((p) =>
          ctx.scheduleRows.some(
            (r) => r.date === date && r.slot === slot && r.position_id === p.id && getLevel(r.pt_id, p.id, ctx.abilities) === 3
          )
        );
      }
      if (!chosen) continue;

      commitAssignment(ctx, date, slot, chosen, s.id, 1);
      assignedAny = true;
    }

    if (!assignedAny) {
      ctx.warnings.push({
        type: "shortage",
        date,
        message: `${date}：正職 ${s.name} 當天有上班，但找不到任何符合能力、還有名額的崗位可以排，違反「正職一定要上工」的規則，需要人工處理`,
      });
    }
  }
}

// ----------------------------------------------------------------------------
// 十六、人力過剩判斷（票2 決議第六條 step4）
// ----------------------------------------------------------------------------

function markSurplus(ctx, date) {
  const assignedToday = new Set(ctx.scheduleRows.filter((r) => r.date === date && r.priority === 1).map((r) => r.pt_id));
  for (const s of ctx.activeStaff) {
    if (assignedToday.has(s.id)) continue;
    // 【修正 1】平日的正職不會落到「人力過剩」這個分類——規則是正職一定要上工，
    // ensureFullTimeWorked 已經處理過：排到了就不會進到這裡；真的排不進去，
    // 那邊也已經留下專屬的「需要人工處理」警示，這裡不用再重複講一次（而且講成
    // 「人力過剩」語意上也不對，那是指「有空的人沒事做」，不是「該上工卻排不進去」）。
    // 週六不適用這條跳過：週六本來就是固定 1 正職＋3 PT 的小隊（票2決議第八條），
    // 其他「這天也登記可上班、但沒被排進這 4 人小隊」的正職維持原本的提醒方式，
    // 不會被 ensureFullTimeWorked 強塞進去（那樣會破壞週六固定小隊的設計）。
    if (s.employment_type !== "PT" && !isSaturday(date)) continue;
    const avail = getAvailability(s.id, date, ctx.availability);
    const isOff = avail && avail.range === "全天休假";
    if (isOff) continue;
    if (s.employment_type === "PT" && !isUnderWeeklyCap(s.id, s, ctx)) {
      // 已達本週 4 天上限，不算「人力過剩」（那是規則刻意排除，不是沒人要排他）
      // 但還是要明確告訴 Cynthia「這個人今天本來能上班，是被 4 天上限擋下來的」
      ctx.warnings.push({
        type: "info",
        date,
        message: `${date}：${s.name} 當天可上班，但本週已達 PT 4 天上限，依規則不排班`,
      });
      continue;
    }
    ctx.warnings.push({
      type: "surplus",
      date,
      message: `${date}：${s.name} 當天可上班但沒有被排進任何崗位（人力過剩）`,
    });
  }
}

// ----------------------------------------------------------------------------
// 十七、主流程：generateWeekSchedule
// ----------------------------------------------------------------------------

function generateWeekSchedule(input) {
  const ctx = buildContext(input);
  const weekDates = getWeekDates(input.weekStart);
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");

  const rotation = computePrinterRotation(input, ctx);

  for (const priorityDate of weekDates.slice(0, 6)) {
    const info = isPriorityShippingDay(priorityDate, ctx.specialDates);
    if (info.isPriority) {
      ctx.priorityDaysFound.push({ date: priorityDate, reason: info.reason, extraHeadcount: info.extraHeadcount });
    }
  }
  if (ctx.priorityDaysFound.length > 0) {
    ctx.warnings.push({
      type: "priority_day",
      date: input.weekStart,
      message: `本週出貨優先日：${ctx.priorityDaysFound.map((d) => `${d.date}（${d.reason}）`).join("、")}`,
    });
  } else {
    ctx.warnings.push({ type: "priority_day", date: input.weekStart, message: "本週沒有出貨優先日" });
  }

  for (const date of weekDates) {
    if (isSunday(date)) continue; // 週日店休，不排班

    if (isSaturday(date)) {
      // 注意：週六不套用 ensureFullTimeWorked。週六本來就是票2決議第八條訂出來的
      // 「固定 4 人（1正職+3PT）」小隊，不是「今天登記可上班的正職全部都要上工」
      // ——這跟平日「正職一定要上工」的保底規則是兩回事，套用下去反而會把週六
      // 其他沒被排進這 4 人小隊、但剛好也登記可上班的正職硬塞進來，破壞這條
      // 已經確定不能動的週六規則。週六唯一需要保底的只有「這 1 位正職湊不湊得到」，
      // 那已經在 assignSaturday 內用 fallbackFullTime／「湊不滿4人」警示處理過了。
      assignSaturday(ctx, date, resolvePrinterForDate(rotation, date, ctx));
    } else {
      const info = isPriorityShippingDay(date, ctx.specialDates);
      const printerId = resolvePrinterForDate(rotation, date, ctx);
      const skip = new Set();
      if (printerId) {
        for (const slot of ["上午出訂單前", "下午出訂單前"]) {
          commitAssignment(ctx, date, slot, printerPosition, printerId, 1);
        }
        skip.add(printerPosition.id);
      }
      // assignSlot 內部在每個時段結束時都會呼叫一次 assignBackups()，印訂單的第一
      // 任務列在這裡先寫進 ctx.scheduleRows，所以印訂單的備援（印訂單→包裝）
      // 也會在對應時段被一併算到，不需要另外再跑一次（跑兩次會重複產生備援列）
      for (const slot of SLOTS) {
        assignSlot(ctx, date, slot, info.isPriority, info.extraHeadcount, skip);
      }
      // 【修正 1】正常流程跑完後，保底檢查今天所有正職是不是都真的被排到工作了
      ensureFullTimeWorked(ctx, date, SLOTS, skip);
    }

    // 更新本週已使用天數 + 算人力過剩
    for (const s of ctx.activeStaff) {
      const hasAnyRowToday = ctx.scheduleRows.some((r) => r.date === date && r.pt_id === s.id && r.priority === 1);
      if (hasAnyRowToday) {
        ctx.ptDaysUsedThisWeek.set(s.id, (ctx.ptDaysUsedThisWeek.get(s.id) || 0) + 1);
      }
    }
    markSurplus(ctx, date);
  }

  return { schedule: ctx.scheduleRows, warnings: ctx.warnings };
}

// ----------------------------------------------------------------------------
// 十八、對外輸出
// ----------------------------------------------------------------------------

const ScheduleLogic = {
  SLOTS,
  WEEKDAY_NAMES,
  generateWeekSchedule,
  isPriorityShippingDay,
  computePrinterRotation,
  ecommerceCampaignLabel,
  getWeekDates,
  addDaysStr,
  getWeekdayIndex,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ScheduleLogic;
}
if (typeof window !== "undefined") {
  window.ScheduleLogic = ScheduleLogic;
}
