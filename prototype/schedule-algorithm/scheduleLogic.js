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
// 四、出貨優先日判斷（第十四次補充決議重新定義）
//
// 「不上班日」＝週日、國定假日（週六是國定假日也算）。不上班日完全不排班，也不是出貨優先日。
// 出貨優先日（撿貨、包裝、無包裝出貨、出箱貨 +1，仍受 max_headcount 限制）：
//   (a) 檔期活動日：雙字日／18號／25號，或 special_dates 的「電商檔期」。檔期剛好落在不上班日，
//       就順延到下一個上班日（例：25 號是週日 → 26 號週一算檔期）
//   (b) 一段連續不上班日（裡面至少有一天國定假日）之後的「第一個」上班日（第二個上班日不再算）
//   (c) special_dates 的「出貨優先日」：Cynthia 手動設定（例如臨時大量訂單）
// 同一天符合好幾個理由也只加一次：有 special_dates 列設定 extra_headcount 就用那個值（好幾列取最大），
// 沒有就是 +1。
// ----------------------------------------------------------------------------

function isHolidayDate(dateStr, specialDates) {
  return specialDates.some((s) => s.date === dateStr && s.type === "國定假日");
}

function isWorkingDay(dateStr, specialDates) {
  return !isSunday(dateStr) && !isHolidayDate(dateStr, specialDates);
}

// 這天本身的檔期理由（規律或 special_dates 的電商檔期列），沒有回傳 null
function campaignOn(dateStr, specialDates) {
  const row = specialDates.find((s) => s.date === dateStr && s.type === "電商檔期");
  if (row) return { label: `電商檔期：${row.name}`, row };
  const label = ecommerceCampaignLabel(dateStr);
  return label ? { label: `電商檔期：${label}`, row: null } : null;
}

/**
 * 判斷某天是不是「出貨優先日」，以及加人數是多少。
 * 回傳 { isPriority, reason, extraHeadcount, nonWorking }；不上班日一律 isPriority=false、nonWorking=true。
 */
function isPriorityShippingDay(dateStr, specialDates) {
  if (!isWorkingDay(dateStr, specialDates)) {
    return { isPriority: false, reason: null, extraHeadcount: 0, nonWorking: true };
  }
  const reasons = [];
  const rows = [];

  const own = campaignOn(dateStr, specialDates);
  if (own) {
    reasons.push(own.label);
    if (own.row) rows.push(own.row);
  }

  // 往回看緊接在今天之前的連續不上班日：裡面的檔期順延到今天；裡面有國定假日，今天就是連假後第一個上班日
  let hadHoliday = false;
  for (let back = 1; back <= 14; back++) {
    const d = addDaysStr(dateStr, -back);
    if (isWorkingDay(d, specialDates)) break;
    const moved = campaignOn(d, specialDates);
    if (moved) {
      reasons.push(`${moved.label}（${d} 不上班，順延到這天）`);
      if (moved.row) rows.push(moved.row);
    }
    const holiday = specialDates.find((s) => s.date === d && s.type === "國定假日");
    if (holiday) {
      hadHoliday = true;
      rows.push(holiday);
    }
  }
  if (hadHoliday) reasons.push("連假後第一個上班日");

  const manual = specialDates.find((s) => s.date === dateStr && s.type === "出貨優先日");
  if (manual) {
    reasons.push(`手動設定的出貨優先日：${manual.name}`);
    rows.push(manual);
  }

  if (reasons.length === 0) return { isPriority: false, reason: null, extraHeadcount: 0, nonWorking: false };
  const setExtras = rows.filter((r) => r.extra_headcount != null).map((r) => r.extra_headcount);
  return {
    isPriority: true,
    reason: reasons.join("、"),
    extraHeadcount: setExtras.length > 0 ? Math.max(...setExtras) : 1,
    nonWorking: false,
  };
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
// included_in_auto_schedule（任務型崗位，怎麼排還沒定案、自動排班先完全跳過：
// 目前是「處理批發訂單」「處理退貨」「盤點」三個）。
// 過濾後的 positions 才是整個排班流程會用到的崗位清單，被濾掉的崗位從頭到尾不會
// 出現在任何候選名單、目標人數、警示訊息裡，等於「單純當它不存在」。
function buildContext(input) {
  const { positions, staff, abilities, headcounts, slotMap, availability, specialDates } = input;

  const usablePositions = positions.filter((p) => p.is_active !== false && p.included_in_auto_schedule !== false);

  const positionById = new Map(usablePositions.map((p) => [p.id, p]));
  // position_headcount：沒有 slot 的列是崗位的基準人數；有 slot 的列（第十四次補充決議：撿貨下午出訂單後 2 人）
  // 只覆蓋那個時段
  const headcountByPosition = new Map(headcounts.filter((h) => !h.slot).map((h) => [h.position_id, h.headcount]));
  const slotHeadcount = new Map(headcounts.filter((h) => h.slot).map((h) => [`${h.position_id}|${h.slot}`, h.headcount]));
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
    // 手動鎖定的格子可能落在不納入自動排班的崗位（例如處理批發訂單），查名稱要用完整清單
    allPositionById: new Map(positions.map((p) => [p.id, p])),
    slotMap, // 完整的 position_slot_map（含不自動排的崗位），檢查手動備援的崗位這個時段有沒有開用
    // ptId -> Set(date)：「預先佔用」的日子＝手動鎖定格子的日子（applyLockedRows）＋有優先人選
    // 的崗位整週先規劃排到的日子（planPreferredPositions）。這些日子一開始就算進 PT 4 天上限
    lockedDaysByPt: new Map(),
    // 第十次補充決議：崗位優先人選 position_id -> [pt_id...]（rank 小的在前）
    preferredByPosition: buildPreferredMap(input),
    taskTemplates: input.taskTemplates || [],
    taskRequests: input.taskRequests || [],
    lastSaturday: buildLastSaturdayMap(input), // ptId -> 最近一次上週六的日期（週六輪流用）
    saturdayRotation: null, // 這週六怎麼挑人的說明（畫面上顯示用），見 assignSaturday
    fillTrace: [], // 每個時段崗位的補人順序與「能排人數」（驗證能排的人越少越先排用），見 fillByScarcity
    preferredPlan: [], // 有優先人選的崗位整週先規劃的結果，見 planPreferredPositions
    slotTargets: new Map(), // date|slot|positionId -> 那格的目標人數（任務把人從處理進貨移走後要重算缺口用）
    taskLog: [], // 任務型崗位每一筆任務怎麼處理（排入／代班／跳過／留空），見 processTemplatesForDay、processRequestsForDay
    headcountByPosition,
    slotHeadcount,
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

// 第五次補充決議：max_headcount 算的是「第一任務＋備援」合計（包裝站 4 個工位，
// 做完撿貨過來支援包裝的人也要佔一個工位），所以這裡不分 priority 全部算
function occupiedCount(ctx, date, slot, positionId) {
  return ctx.scheduleRows.filter((r) => r.date === date && r.slot === slot && r.position_id === positionId).length;
}

function hasCapacity(ctx, date, slot, position) {
  if (position.max_headcount == null) return true;
  return occupiedCount(ctx, date, slot, position.id) < position.max_headcount;
}

function buildPreferredMap(input) {
  const map = new Map();
  const rows = [...(input.positionPreferredStaff || [])].sort((a, b) => a.rank - b.rank);
  for (const r of rows) {
    if (!map.has(r.position_id)) map.set(r.position_id, []);
    map.get(r.position_id).push(r.pt_id);
  }
  return map;
}

function canWorkSaturday(staffRow) {
  return staffRow.can_work_saturday !== false;
}

// 第五次補充決議：性別限制是「能不能排」，跟能力等級（會不會做）分開。
// positions.gender_restriction 為 null＝不限；目前只有出箱貨限「男」
function genderOk(staffRow, position) {
  return !position || !position.gender_restriction || (!!staffRow && staffRow.gender === position.gender_restriction);
}

function genderOkById(ctx, ptId, position) {
  return genderOk(ctx.activeStaff.find((s) => s.id === ptId), position);
}

function lookupStaffName(ctx, ptId) {
  const s = ctx.activeStaff.find((x) => x.id === ptId);
  return s ? s.name : ptId;
}

// ----------------------------------------------------------------------------
// 七之一、手動鎖定的格子（票1 第三次補充決議：手動調整後重排整週）
//
// input.currentWeekSchedule = 這週目前的 daily_schedule 內容。只有 source='manual'
// 的列會被當成「鎖定」讀進來；source='auto' 的列一律丟掉、整週重新計算（草稿階段
// 還沒跟任何人講定，所以以整體最好的組合為優先，不需要盡量維持上一次的安排）。
//
// 鎖定的列在排班一開始就先寫進 ctx.scheduleRows，所以它自然會：
//   - 佔掉那個人那個時段（markAssignedThisSlot）
//   - 算進該崗位的人數與 max_headcount（currentPriorityCount 是直接數 scheduleRows）
//   - 算進 PT 每週 4 天上限（ptDaysUsedThisWeek 一開始就先把鎖定的日子算進去，
//     等於「預留」那幾天；見 isUnderWeeklyCap）
//   - 算進印訂單輪排（見 computePrinterRotation 的 lockedPrinterByDate）
// 鎖定的列本身違反規則時，照樣保留（尊重 Cynthia 的調整），只在提醒裡標出來。
// ----------------------------------------------------------------------------

function applyLockedRows(ctx, input) {
  const locked = (input.currentWeekSchedule || []).filter((r) => r.source === "manual");

  for (const r of locked) {
    const position = ctx.allPositionById.get(r.position_id);
    const priority = r.priority || 1;
    if (priority === 1 && isAssignedThisSlot(ctx, r.date, r.slot, r.pt_id)) {
      ctx.warnings.push({
        type: "locked",
        date: r.date,
        message: `手動鎖定：${lookupStaffName(ctx, r.pt_id)} 在 ${r.date} ${r.slot} 同時被鎖定在兩個崗位（第一任務重複），請確認`,
      });
    }
    ctx.scheduleRows.push({
      date: r.date,
      slot: r.slot,
      position_id: r.position_id,
      position_name: position ? position.name : r.position_id,
      pt_id: r.pt_id,
      pt_name: lookupStaffName(ctx, r.pt_id),
      priority,
      source: "manual",
      ...(r.task ? { task: r.task } : {}),
    });
    if (priority === 1) markAssignedThisSlot(ctx, r.date, r.slot, r.pt_id);
    if (!ctx.lockedDaysByPt.has(r.pt_id)) ctx.lockedDaysByPt.set(r.pt_id, new Set());
    ctx.lockedDaysByPt.get(r.pt_id).add(r.date);
  }

  for (const [ptId, days] of ctx.lockedDaysByPt) {
    ctx.ptDaysUsedThisWeek.set(ptId, days.size);
  }

  validateLockedRows(ctx, locked);
}

function validateLockedRows(ctx, locked) {
  const flag = (r, why) =>
    ctx.warnings.push({
      type: "locked",
      date: r.date,
      message: `手動鎖定違反規則：${lookupStaffName(ctx, r.pt_id)} ${r.date} ${r.slot}「${(ctx.allPositionById.get(r.position_id) || {}).name || r.position_id}」—${why}（已保留這個手動調整）`,
    });

  for (const r of locked) {
    const staffRow = ctx.activeStaff.find((s) => s.id === r.pt_id);
    if (!staffRow) continue;
    const avail = getAvailability(r.pt_id, r.date, ctx.availability);
    if (avail && !isAvailableForSlot(avail.range, r.slot)) flag(r, `當天登記「${avail.range}」，這個時段不在可上班範圍內`);
    if (isSaturday(r.date) && !canWorkSaturday(staffRow)) flag(r, "這個人固定不能上週六");
    if (getLevel(r.pt_id, r.position_id, ctx.abilities) === 1) flag(r, "這個崗位的能力是一級（不能排）");
    if (r.priority === 2 && !ctx.slotMap.some((sm) => sm.position_id === r.position_id && sm.slot === r.slot)) {
      flag(r, "手動備援的崗位在這個時段沒有開");
    }
    const position = ctx.allPositionById.get(r.position_id);
    if (position && !genderOk(staffRow, position)) flag(r, `這個崗位限${position.gender_restriction}性，${staffRow.name}是${staffRow.gender}性`);
    if (position && position.max_headcount != null) {
      // 上限含備援：第一任務＋備援合計（此時只有手動鎖定的列，自動排班還沒開始）
      const count = occupiedCount(ctx, r.date, r.slot, r.position_id);
      if (count > position.max_headcount) flag(r, `這個時段「${position.name}」手動鎖定的第一任務＋備援已經 ${count} 人，超過上限 ${position.max_headcount} 人`);
    }
  }

  for (const [ptId, days] of ctx.lockedDaysByPt) {
    const staffRow = ctx.activeStaff.find((s) => s.id === ptId);
    if (staffRow && staffRow.employment_type === "PT" && days.size > 4) {
      ctx.warnings.push({
        type: "locked",
        date: [...days].sort()[0],
        message: `手動鎖定違反規則：PT ${staffRow.name} 本週被手動鎖定了 ${days.size} 天，超過每週 4 天上限（已保留這些手動調整）`,
      });
    }
  }
}

// 手動鎖定的備援（priority＝2）要等整週排完才看得出來的問題，只提醒、照樣保留：
//   - 這個人這個時段沒有主要任務（備援是做完主要任務才去支援）
//   - 備援崗位跟主要任務是同一個崗位
//   - 能力二級，但這個崗位這個時段沒有三級的人
// 預設的備援對應（撿貨 → 包裝）只管自動排班，手動可以選這個時段有開的任何崗位。
function validateLockedBackupsAfterFill(ctx) {
  for (const r of ctx.scheduleRows.filter((x) => x.source === "manual" && x.priority === 2)) {
    const name = lookupStaffName(ctx, r.pt_id);
    const position = ctx.allPositionById.get(r.position_id);
    const posName = position ? position.name : r.position_id;
    const flag = (why) =>
      ctx.warnings.push({
        type: "locked",
        date: r.date,
        message: `手動鎖定的備援：${name} ${r.date} ${r.slot}「${posName}（備援）」—${why}（已保留這個手動調整）`,
      });
    const primary = ctx.scheduleRows.find((x) => x.date === r.date && x.slot === r.slot && x.pt_id === r.pt_id && x.priority === 1);
    if (!primary) flag("這個人這個時段沒有主要任務");
    else if (primary.position_id === r.position_id) flag("跟這個人這個時段的主要任務是同一個崗位");
    if (
      getLevel(r.pt_id, r.position_id, ctx.abilities) === 2 &&
      !ctx.scheduleRows.some(
        (x) => x.date === r.date && x.slot === r.slot && x.position_id === r.position_id && getLevel(x.pt_id, r.position_id, ctx.abilities) === 3
      )
    ) {
      flag("能力二級，這個崗位這個時段沒有三級的人陪同");
    }
  }
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

// ptDaysUsedThisWeek 一開始就包含「手動鎖定的日子」（預留），所以排其他天時會把
// 鎖定的那幾天先扣掉；排的正好是鎖定的那天時，那天本來就算過了，不會多用一天
function isUnderWeeklyCap(ptId, staffRow, ctx, date) {
  if (staffRow.employment_type !== "PT") return true; // 正職沒有 4 天上限
  const lockedDays = ctx.lockedDaysByPt.get(ptId);
  if (date && lockedDays && lockedDays.has(date)) return true;
  return (ctx.ptDaysUsedThisWeek.get(ptId) || 0) < 4;
}

// 第十一次補充決議：pt_staff.auto_schedule_weekdays＝false 的人（內勤，目前是許庭瑄）週一～週五
// 完全不自動排，只在 Cynthia 手動指派（鎖定）時出現；週六不受影響。
function autoScheduleOk(staffRow, date) {
  return isSaturday(date) || !staffRow || staffRow.auto_schedule_weekdays !== false;
}

// 「這個人這個時段能不能被自動排」：照當天登記的可上班範圍，再加上平日不自動排的人一律不行。
// 幾乎所有自動排班的流程（候選池、印單、正職保底、整週先規劃、週六挑人）都經過這裡，
// 所以平日不自動排的規則集中在這一處；手動鎖定的檢查（validateLockedRows）直接看可上班範圍，不受影響。
function isAvailableForSlotToday(ptId, date, slot, ctx) {
  if (!autoScheduleOk(ctx.activeStaff.find((s) => s.id === ptId), date)) return false;
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
// 十一、挑人順序主邏輯（票1 第二次補充決議：取消「不固定」組別後的版本）：
//   step1：各組先用主要組別相符的人填；同組內三級崗位多的先排
//   step2：出貨仍缺 → 平常不補；只有出貨優先日才用進貨組的人補
//   step3：進貨仍缺 → 用排不進出貨崗位的出貨組人員補
//   step4：仍有剩餘 → 不排班，標示「人力過剩」（在每天結束後統一算）
// ----------------------------------------------------------------------------

function buildEligiblePool(positionIds, date, slot, ctx, excludeIds) {
  const exclude = excludeIds || new Set();
  return ctx.activeStaff
    .filter((s) => !exclude.has(s.id))
    .filter((s) => isUnderWeeklyCap(s.id, s, ctx, date))
    .filter((s) => isAvailableForSlotToday(s.id, date, slot, ctx))
    .filter((s) => !isAssignedThisSlot(ctx, date, slot, s.id))
    .filter((s) =>
      positionIds.some((pid) => getLevel(s.id, pid, ctx.abilities) >= 2 && genderOk(s, ctx.positionById.get(pid)))
    )
    .map((s) => s.id);
}

// 把一個候選池塞進一個崗位的目標人數，回傳實際補進去的人數
function fillPosition(ctx, date, slot, position, target, candidatePool, groupPositionIdsForRanking) {
  if (target <= 0) return 0;
  let filledCount = currentPriorityCount(ctx, date, slot, position.id);
  if (filledCount >= target) return 0;

  // 性別限制：不符合的人直接不列入這個崗位的候選
  const remainingPool = candidatePool.filter(
    (id) => !isAssignedThisSlot(ctx, date, slot, id) && genderOkById(ctx, id, position)
  );
  // 第十次補充決議：這個崗位有設優先人選的話，候選池裡的優先人選照 rank 排在最前面，
  // 其他人再照一般挑人順序（能力、性別、可上班、4 天上限等條件，候選池跟下面的能力檢查已經處理）
  const preferred = (ctx.preferredByPosition.get(position.id) || []).filter((id) => remainingPool.includes(id));
  const ranked = [
    ...preferred,
    ...rankCandidates(remainingPool.filter((id) => !preferred.includes(id)), ctx, groupPositionIdsForRanking),
  ];

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
// 第八次補充決議：positions.monday_headcount（可為 null）＝週一專用的基準人數（目前只有
// 無包裝出貨 = 3）。週一加人跟出貨優先日加人不疊加，最後一律被 max_headcount 鉏住
// （無包裝出貨上限 3：平日優先日 2+1=3、週一 3、週一又是優先日 3+1 → 3）。
function baseTarget(position, ctx, isPriority, extraHeadcount, date, slot) {
  const isMonday = !!date && getWeekdayIndex(date) === 0;
  const slotKeyHc = `${position.id}|${slot}`;
  const base =
    isMonday && position.monday_headcount != null
      ? position.monday_headcount
      : slot && ctx.slotHeadcount.has(slotKeyHc)
      ? ctx.slotHeadcount.get(slotKeyHc)
      : ctx.headcountByPosition.get(position.id) || 0;
  let target = isPriority && position.priority_day_bonus ? base + extraHeadcount : base;
  // 硬性上限：不管基準人數、出貨優先日加人加到多少，target 本身就先鉏到上限，
  // 後面所有 fillPosition / flex 補人的流程都是照 target 填，天生就不會超過
  if (position.max_headcount != null) target = Math.min(target, position.max_headcount);
  return target;
}

// ----------------------------------------------------------------------------
// 十二、印訂單輪排（票2 決議第七條）
//
// 正職 3 天：週一、週六固定，「第 3 天」照第十二次補充決議選（見下方 thirdDay）
// PT 3 天：剩下 3 天，在「印訂單三級」的 PT 之間輪，原則是「上週拿 2 天的人這週拿 1 天」
// ----------------------------------------------------------------------------

function computePrinterRotation(input, ctx) {
  const weekDates = getWeekDates(input.weekStart).slice(0, 6); // 一～六
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");
  const priorityInfoByDate = new Map(weekDates.map((d) => [d, isPriorityShippingDay(d, ctx.specialDates)]));

  // 正職的 3 天（印訂單目前沒有性別限制，但輪排一樣先過性別檢查，之後有限制也不會排錯）
  const fullTimePrinters = ctx.activeStaff.filter(
    (s) =>
      s.employment_type === "正職" &&
      genderOk(s, printerPosition) &&
      getLevel(s.id, printerPosition.id, ctx.abilities) >= 2
  );
  const monday = weekDates[0];
  const saturday = weekDates[5];
  const ptPrinters = ctx.activeStaff.filter(
    (s) => s.employment_type === "PT" && genderOk(s, printerPosition) && getLevel(s.id, printerPosition.id, ctx.abilities) === 3
  );

  // 手動鎖定的印訂單格子（第三次補充決議：鎖定的格子要算進印訂單輪排）：
  // 那天的印單人就是鎖定的人，輪排不再另外指派
  const lockedPrinterByDate = new Map();
  for (const r of ctx.scheduleRows) {
    if (r.source === "manual" && r.position_id === printerPosition.id && r.priority === 1 && !lockedPrinterByDate.has(r.date)) {
      lockedPrinterByDate.set(r.date, r.pt_id);
    }
  }

  // 正職印單的「第三天」（第十二次補充決議，第十三次修正）
  //   1. 當週週二～週五有出貨優先日 → 選出貨優先日（有好幾天時選最早）
  //   2. 沒有 → 週二～週五裡如果有「沒有任何會印單的 PT 可上班」的日子（看當天的可上班登記：
  //      印訂單三級、平日有納入自動排班的 PT，沒有一位兩個「出訂單前」時段都能上班），那天一定要有人印，
  //      由王瀞玉印，算她的第三天；符合的不只一天選最早
  //   3. 都沒有 → 週二～週五全部照 PT 輪排印，不留空；整週只跳一條「本週正職第三天請手動指定」
  const priorityWeekday = weekDates
    .slice(1, 5) // 二～五
    .find((d) => priorityInfoByDate.get(d).isPriority);
  const registeredFor = (s, d, slot) => {
    const a = getAvailability(s.id, d, ctx.availability);
    return !a || isAvailableForSlot(a.range, slot); // 沒登記照既有規則視為全天可上班
  };
  const working = (d) => isWorkingDay(d, ctx.specialDates);
  const noPtPrinterDays = weekDates
    .slice(1, 5)
    .filter(
      (d) =>
        working(d) &&
        !ptPrinters.some(
          (s) => s.auto_schedule_weekdays !== false && registeredFor(s, d, "上午出訂單前") && registeredFor(s, d, "下午出訂單前")
        )
    );
  const thirdDay = priorityWeekday || noPtPrinterDays[0] || null;
  const thirdDayReason = priorityWeekday ? "出貨優先日" : thirdDay ? "沒有會印單的 PT 可上班" : null;
  if (!thirdDay) {
    ctx.warnings.push({
      type: "manual",
      date: input.weekStart,
      message: "本週正職第三天請手動指定（本週週二～週五沒有出貨優先日，每天也都有會印單的 PT 可上班；週二～週五先照 PT 輪排印單）",
    });
  }
  // 第十四次補充決議：國定假日完全不排班。週一是國定假日 → 王瀞玉週一不印單，也不另外改到別天
  if (!working(monday)) {
    ctx.warnings.push({
      type: "info",
      date: monday,
      message: `${monday}（週一）是國定假日，週一不排班，正職週一印單這週取消（不另外改到別天）`,
    });
  }
  // 平日的正職印單日（週一、第 3 天）固定由 input.weekdayFtPrinterId 指定的正職負責
  // （第七次補充決議：王瀞玉）。她當天請假或沒空時，resolvePrinterForDate 會照原本的
  // 規則找其他符合資格的人頂上並留下提醒。沒有指定（或指定的人不會印單）才退回舊做法：
  // 印單三級的正職裡用姓名排序挑第一位。
  const fixedWeekdayPrinter = fullTimePrinters.find((s) => s.id === input.weekdayFtPrinterId) || null;

  function pickFullTimePrinter(date) {
    if (lockedPrinterByDate.has(date)) return lockedPrinterByDate.get(date);
    if (!isSaturday(date) && fixedWeekdayPrinter) return fixedWeekdayPrinter.id;
    // 週六印單的正職必須是能上週六的人（第三次補充決議：can_work_saturday）
    const eligible = isSaturday(date) ? fullTimePrinters.filter(canWorkSaturday) : fullTimePrinters;
    const level3 = eligible.filter((s) => getLevel(s.id, printerPosition.id, ctx.abilities) === 3);
    const pool = level3.length > 0 ? level3 : eligible;
    if (pool.length === 0) {
      ctx.warnings.push({
        type: "info",
        date,
        message: `${date} 找不到任何正職可以印訂單（三級或二級），印訂單崗位需要人工調整`,
      });
      return null;
    }
    // 沒有指定固定印單正職時的退路：姓名排序挑第一位，讓結果每次都一樣
    return [...pool].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))[0].id;
  }

  // 正職印單 3 天的分法（第七次補充決議）：
  //   - 週六：由當週輪到上週六的正職印——在能上週六、會印單的正職（王瀞玉、許庭瑄）之間
  //     輪流，離上次上週六最久的先；同樣久時，印單三級優先，再用姓名。輪到的人週六沒空，
  //     就換下一位（週六最先排，這時還沒有任何平日指派，所以只看請假跟手動鎖定）。
  //   - 週一、第 3 天（出貨優先日或沒有會印單的 PT 可上班的那天）：固定由王瀞玉印（weekdayFtPrinterId）。
  //   所以同一週的週六印單者，可能跟週一／第 3 天不同人。
  function pickSaturdayFullTime() {
    if (lockedPrinterByDate.has(saturday)) return lockedPrinterByDate.get(saturday);
    const candidates = fullTimePrinters.filter(canWorkSaturday);
    const order = [...candidates].sort((a, b) => {
      const la = ctx.lastSaturday.get(a.id) || "";
      const lb = ctx.lastSaturday.get(b.id) || "";
      if (la !== lb) return la < lb ? -1 : 1;
      const lv = getLevel(b.id, printerPosition.id, ctx.abilities) - getLevel(a.id, printerPosition.id, ctx.abilities);
      if (lv !== 0) return lv;
      return a.name.localeCompare(b.name, "zh-Hant");
    });
    const usable = order.find((s) => printerIsUsable(s.id, s, saturday, ctx));
    const chosen = usable || order[0] || null;
    ctx.saturdayRotation = {
      fullTime: order.map((s) => ({
        id: s.id,
        name: s.name,
        lastSaturday: ctx.lastSaturday.get(s.id) || null,
        status:
          chosen && s.id === chosen.id && usable
            ? "排入（輪到了，當天也印訂單）"
            : printerIsUsable(s.id, s, saturday, ctx)
            ? "沒輪到（另一位更久沒上週六）"
            : "週六請假／沒空",
        picked: !!(usable && s.id === usable.id),
      })),
    };
    if (!chosen) return pickFullTimePrinter(saturday);
    return chosen.id;
  }

  const assignments = new Map();
  if (working(monday)) assignments.set(monday, pickFullTimePrinter(monday));
  // 週六是國定假日：這週沒有週六班，週六正職輪流也不往前推（沒人上，下週照樣輪到同一位）
  if (working(saturday)) assignments.set(saturday, pickSaturdayFullTime());
  if (thirdDay) assignments.set(thirdDay, pickFullTimePrinter(thirdDay));

  // PT 的天數 = 剩下的平日（二～五，去掉第三天；沒有第三天就是 4 天）；被手動鎖定印單的日子直接照鎖定的人
  const ptDaysAll = weekDates.slice(1, 5).filter((d) => d !== thirdDay && working(d));
  for (const d of ptDaysAll) if (lockedPrinterByDate.has(d)) assignments.set(d, lockedPrinterByDate.get(d));
  const ptDays = ptDaysAll.filter((d) => !lockedPrinterByDate.has(d));
  const lockedPtPrinterDays = (ptId) => ptDaysAll.filter((d) => lockedPrinterByDate.get(d) === ptId).length;

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
      // primary 拿 2 天、secondary 拿 1 天；已經被手動鎖定印單的天數先扣掉。
      // 沒有正職第三天的週，PT 要印週二～週五 4 天：前 3 天照 2＋1，多出來的第 4 天給 secondary
      // （變成 2＋2，不讓同一人印 3 天；這一天通常就是 Cynthia 要手動改給正職的那天）
      const queue = [
        ...Array(Math.max(0, 2 - lockedPtPrinterDays(primary.id))).fill(primary.id),
        ...Array(Math.max(0, 1 - lockedPtPrinterDays(secondary.id))).fill(secondary.id),
        ...(thirdDay ? [] : [secondary.id]),
      ];
      ptDays.forEach((d, i) => assignments.set(d, queue[i] || primary.id));
    }
  }

  return { assignments, thirdDay, thirdDayReason, priorityInfoByDate };
}

// computePrinterRotation 是在「一週開始前」一次決定好輪排名單的純函式，不知道排班
// 過程中途誰已經用掉幾天。但實際指派要逐天進行時，輪到的人可能在那天之前，已經因為
// 一般出貨/進貨的指派用完 4 天上限（例如同時又被排了很多撿貨/包裝班）。
// 這個函式在真正要落地指派印訂單那一天，重新確認一次：輪到的人還有名額嗎？
// 沒有的話，從其他印訂單合格的人裡面找一個還沒到上限的頂上，都找不到才留空+警告。
function printerIsUsable(ptId, staffRow, date, ctx) {
  if (!isUnderWeeklyCap(ptId, staffRow, ctx, date)) return false;
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
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");
  const lockedHere = ctx.scheduleRows.some(
    (r) => r.source === "manual" && r.date === date && r.pt_id === candidateId && r.position_id === printerPosition.id
  );
  if (lockedHere) return candidateId; // 手動鎖定的印單人不重新檢查，違規的話 validateLockedRows 已經標出來
  if (printerIsUsable(candidateId, staffRow, date, ctx)) return candidateId;

  // 週六的印單人一定要是能上週六的正職（票2決議第八條＋第三次補充決議）
  const saturdayOk = (s) => !isSaturday(date) || (s.employment_type === "正職" && canWorkSaturday(s));
  // 頂上的人兩個「出訂單前」時段都不能已經有工作（這時只有手動鎖定的格子）。任務每天最後才排，
  // 印單是主要工作：頂印單的人如果剛好是那個時段固定任務的指定人員，任務就跳過；所以沒有固定任務
  // 的人優先，免得為了頂印單又讓固定任務少一個人
  const freeForPrinting = (s) => !isAssignedThisSlot(ctx, date, "上午出訂單前", s.id) && !isAssignedThisSlot(ctx, date, "下午出訂單前", s.id);
  const fullyFree = (s) => !isTemplatePerson(ctx, s.id, date, "上午出訂單前") && !isTemplatePerson(ctx, s.id, date, "下午出訂單前");
  const altCandidates = ctx.activeStaff.filter(
    (s) =>
      s.id !== candidateId &&
      saturdayOk(s) &&
      freeForPrinting(s) &&
      genderOk(s, printerPosition) &&
      getLevel(s.id, printerPosition.id, ctx.abilities) >= 2 &&
      printerIsUsable(s.id, s, date, ctx)
  );
  if (altCandidates.length > 0) {
    const alt = [...altCandidates].sort(
      (a, b) => (fullyFree(a) ? 0 : 1) - (fullyFree(b) ? 0 : 1) || a.name.localeCompare(b.name, "zh-Hant")
    )[0];
    ctx.warnings.push({
      type: "info",
      date,
      message: `${date} 原本輪排到 ${staffRow.name} 印訂單，但當天請假或已達本週 4 天上限，改由 ${alt.name} 頂上`,
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
// 十三、備援（第二順位）指派（票2 決議第九條＋票1 第四次補充決議）
//
// 備援一定在「同一個時段」：先做第一任務，做完才做備援。所以備援崗位必須是這個
// 時段本來就有開的崗位（position_slot_map）；這個時段沒開的崗位不能當備援，直接
// 不產生備援列（例如印訂單在「出訂單前」，包裝只開在「出訂單後」，就不能互為備援）。
// 不納入自動排班的崗位（處理退貨等）不在 positionById 裡，也一律不會被當成備援。
//
// 第五次補充決議：
//   - 備援也要過性別限制
//   - 備援佔 max_headcount：第一任務＋備援合計不能超過上限（包裝 4 人）。第一任務已經
//     4 人就不再排備援；只剩 N 個位子時，從符合資格的人裡挑 N 位：三級優先，同級再照
//     rankCandidates（三級崗位多的優先 → 本週上班天數少的優先 → 姓名）
// ----------------------------------------------------------------------------

function assignBackups(ctx, date, slot) {
  const primariesThisSlot = ctx.scheduleRows.filter(
    (r) => r.date === date && r.slot === slot && r.priority === 1
  );

  // 依「要支援哪個備援崗位」分組，同一個備援崗位的人一起排序、一起分剩下的位子
  const candidatesByBackup = new Map();
  for (const row of primariesThisSlot) {
    const position = ctx.positionById.get(row.position_id);
    if (!position || !position.default_backup_position_id) continue;
    const backupPosition = ctx.positionById.get(position.default_backup_position_id);
    if (!backupPosition) continue;
    if (!(ctx.slotsForPosition.get(backupPosition.id) || []).includes(slot)) continue;
    if (!genderOkById(ctx, row.pt_id, backupPosition)) continue;
    if (getLevel(row.pt_id, backupPosition.id, ctx.abilities) < 2) continue;
    // 平日不自動排的人就算被手動鎖在撿貨，也不自動幫她加備援
    if (!autoScheduleOk(ctx.activeStaff.find((s) => s.id === row.pt_id), date)) continue;
    // 這個時段已經有手動鎖定的備援，就照手動的，不再自動加第二個備援
    if (ctx.scheduleRows.some((r) => r.date === date && r.slot === slot && r.pt_id === row.pt_id && r.priority === 2)) continue;
    if (!candidatesByBackup.has(backupPosition.id)) candidatesByBackup.set(backupPosition.id, []);
    candidatesByBackup.get(backupPosition.id).push(row.pt_id);
  }

  for (const [backupId, ptIds] of candidatesByBackup) {
    const backupPosition = ctx.positionById.get(backupId);
    const groupIds = backupPosition.group === GROUP_SHIPPING ? ctx.shippingPositionIds : ctx.inboundPositionIds;
    const ranked = rankCandidates(ptIds, ctx, groupIds);
    const level3 = ranked.filter((id) => getLevel(id, backupId, ctx.abilities) === 3);
    const level2 = ranked.filter((id) => getLevel(id, backupId, ctx.abilities) === 2);

    for (const ptId of level3) {
      if (!hasCapacity(ctx, date, slot, backupPosition)) break;
      commitAssignment(ctx, date, slot, backupPosition, ptId, 2);
    }
    // 二級要「這個備援崗位、這個時段」已經有一位三級的人（不論是第一或第二任務）才能排；
    // 不符合能力規則、或位子已滿就留空，不產生任何列，也不算警告（票2決議：不符合時留空）
    const hasLevel3InBackup = () =>
      ctx.scheduleRows.some(
        (r) => r.date === date && r.slot === slot && r.position_id === backupId && getLevel(r.pt_id, backupId, ctx.abilities) === 3
      );
    for (const ptId of level2) {
      if (!hasCapacity(ctx, date, slot, backupPosition)) break;
      if (hasLevel3InBackup()) commitAssignment(ctx, date, slot, backupPosition, ptId, 2);
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

// 非出貨時段：出貨崗位只開在出訂單後，其他三個時段只有印訂單（出訂單前）跟處理進貨
const NON_SHIPPING_SLOTS = ["上午出訂單前", "下午出訂單前", "出貨完成後"];

// 第九次補充決議：出貨組正職只自動排「出貨工作」（出訂單後的出貨崗位＋印訂單）；處理進貨、
// 處理退貨等出貨以外的工作，全部由 Cynthia 手動安排。這條看的是「出貨組＋正職」，不是看名字：
// 進貨組的正職（連陳軒）照進貨組規則自動排處理進貨，出貨優先日才支援出貨。
function isShippingOnlyFullTime(staffRow) {
  return !!staffRow && staffRow.employment_type === "正職" && staffRow.primary_group === GROUP_SHIPPING;
}

// 第九次補充決議：同一個時段裡，「能排的人越少的崗位越先排」（取代第六次的「有性別限制的先排」，
// 出箱貨只有男生能做，自然會排在前面）。
// 「能排的人」＝目前候選池裡、這個時段還沒有第一任務、性別符合、能力符合的人：三級直接算；
// 二級要這個崗位這個時段已經有三級的人、或候選池裡有三級的人可以先排進去，才算。
// 候選池本身已經過濾過當天可上班、PT 4 天上限、主要組別。
// 【做法】每補滿（或補到沒人可補）一個崗位就重新算一次剩下崗位的人數，再挑最少的下一個；
// 同樣少時照原本的順序：有性別限制的崗位先（第六次的做法，例如只剩李睿懷一人時，出箱貨、
// 撿貨、包裝都只有他 1 人能排，要先給只有男生能做的出箱貨），再來基準人數多的先，最後照崗位清單順序。
function placeableCount(ctx, date, slot, position, pool) {
  const free = pool.filter((id) => !isAssignedThisSlot(ctx, date, slot, id) && genderOkById(ctx, id, position));
  const level3 = free.filter((id) => getLevel(id, position.id, ctx.abilities) === 3);
  const level3Present = ctx.scheduleRows.some(
    (r) => r.date === date && r.slot === slot && r.position_id === position.id && getLevel(r.pt_id, position.id, ctx.abilities) === 3
  );
  const level2 = level3.length > 0 || level3Present ? free.filter((id) => getLevel(id, position.id, ctx.abilities) === 2) : [];
  return level3.length + level2.length;
}

// 依「能排的人越少越先」把一組崗位補到目標人數；allowance＝這個候選池最多能補幾人（平均分攤用，
// 不限就傳 Infinity）。回傳實際補進去的人數。每個崗位的「能排人數」記到 ctx.fillTrace（驗證用）。
//
// firstPersonPass＝true 時（出貨崗位用）分兩輪：
//   第一輪：每個崗位先只補到 1 人（目標本來就是 0 的不補）——落實既有的硬性規則「每個出貨崗位
//           （平日、在它適用的時段）至少要排到 1 人」：人不夠時，先讓每個出貨崗位各有 1 人，
//           不會讓某個崗位先補滿 3 人、其他崗位 0 人（例如真實基準下的週五只剩 3 位正職）
//   第二輪：再照原本的方式補到目標人數
// 兩輪裡誰先補，都照「能排的人越少越先」；優先人選、整週先規劃、能力／性別／組別／上限規則不變。
//
// 第十二次補充決議：第一輪跟第二輪中間多一輪「優先排滿」（trace 的 round＝1.5）——
// positions.fill_first＝true 的崗位（目前只有無包裝出貨）先補到完整目標人數，剩下的人
// 再照第二輪排撿貨、包裝等。整週先規劃排好的格子（出箱貨）一樣算已經排到的人。
function fillByScarcity(ctx, date, slot, positions, targets, pool, groupPositionIds, allowance, stage, firstPersonPass) {
  if (!firstPersonPass) return fillByScarcityRound(ctx, date, slot, positions, targets, pool, groupPositionIds, allowance, stage, 2);
  const firstTargets = new Map(positions.map((p) => [p.id, Math.min(1, targets.get(p.id) || 0)]));
  let added = fillByScarcityRound(ctx, date, slot, positions, firstTargets, pool, groupPositionIds, allowance, stage, 1);
  const fillFirst = positions.filter((p) => p.fill_first === true);
  if (fillFirst.length > 0) {
    added += fillByScarcityRound(ctx, date, slot, fillFirst, targets, pool, groupPositionIds, allowance - added, stage, 1.5);
  }
  return added + fillByScarcityRound(ctx, date, slot, positions, targets, pool, groupPositionIds, allowance - added, stage, 2);
}

// 「整體會做的人」：在職、這天有納入自動排班、這個崗位三級、性別符合的人數（不看今天有沒有空），
// 用來比較崗位本身有多難找人
function capableCount(ctx, position, date) {
  return ctx.activeStaff.filter(
    (s) => autoScheduleOk(s, date) && genderOk(s, position) && getLevel(s.id, position.id, ctx.abilities) === 3
  ).length;
}

function fillByScarcityRound(ctx, date, slot, positions, targets, pool, groupPositionIds, allowance, stage, round) {
  let remainingAllowance = allowance;
  let totalAdded = 0;
  const remaining = positions.filter((p) => (targets.get(p.id) || 0) > currentPriorityCount(ctx, date, slot, p.id));
  let order = 0;
  while (remaining.length > 0 && remainingAllowance > 0) {
    const scored = remaining.map((p, i) => ({ p, i, n: placeableCount(ctx, date, slot, p, pool), capable: capableCount(ctx, p, date) }));
    scored.sort(
      (a, b) =>
        a.n - b.n ||
        // 第十三次補充決議：第一輪（各崗位先 1 人）同樣少時，整體會做的人越少的崗位先拿到人
        // （例如人只夠 2 個崗位時，無包裝出貨比撿貨、包裝先排）
        (round === 1 ? a.capable - b.capable : 0) ||
        (b.p.gender_restriction ? 1 : 0) - (a.p.gender_restriction ? 1 : 0) ||
        (ctx.headcountByPosition.get(b.p.id) || 0) - (ctx.headcountByPosition.get(a.p.id) || 0) ||
        a.i - b.i
    );
    const { p, n } = scored[0];
    remaining.splice(remaining.indexOf(p), 1);
    const traceEntry = {
      date,
      slot,
      stage,
      round,
      order: order++,
      positionId: p.id,
      candidates: n,
      // 挑這個崗位的當下，其他還沒排的崗位各有幾人能排（驗證「越少越先」用）
      remainingCounts: Object.fromEntries(scored.map((x) => [x.p.id, x.n])),
      assigned: [], // 這一步實際排進去的人
    };
    ctx.fillTrace.push(traceEntry);
    const filled = currentPriorityCount(ctx, date, slot, p.id);
    const want = Math.min((targets.get(p.id) || 0) - filled, remainingAllowance);
    if (want <= 0) continue;
    const before = ctx.scheduleRows.length;
    const added = fillPosition(ctx, date, slot, p, filled + want, pool, groupPositionIds);
    traceEntry.assigned = ctx.scheduleRows.slice(before).filter((r) => r.priority === 1).map((r) => r.pt_id);
    remainingAllowance -= added;
    totalAdded += added;
  }
  return totalAdded;
}

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
  const shippingTargets = new Map(shippingPositions.map((p) => [p.id, baseTarget(p, ctx, isPriority, extraHeadcount, date, slot)]));
  let inboundTargets;
  if (!NON_SHIPPING_SLOTS.includes(slot)) {
    // 第十次補充決議：出訂單後時段的處理進貨不設人數（目標 0、不跳缺人提醒）。出貨崗位排完之後，
    // 進貨組的人跟還有空的 PT 才由 fillIdleInbound 補進處理進貨，出貨崗位永遠優先
    inboundTargets = new Map(inboundPositions.map((p) => [p.id, 0]));
  } else if (isMonTue) {
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
    inboundTargets = new Map(inboundPositions.map((p) => [p.id, baseTarget(p, ctx, isPriority, extraHeadcount, date, slot)]));
  }

  // step1：主要組別相符的人先填
  const shippingPrimaryPool = buildEligiblePool(
    shippingPositions.map((p) => p.id),
    date,
    slot,
    ctx,
    null
  ).filter((id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_SHIPPING);

  fillByScarcity(ctx, date, slot, shippingPositions, shippingTargets, shippingPrimaryPool, ctx.shippingPositionIds, Infinity, "出貨組", true);

  const inboundPrimaryPool = buildEligiblePool(
    inboundPositions.map((p) => p.id),
    date,
    slot,
    ctx,
    null
  ).filter((id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_INBOUND);

  fillByScarcity(ctx, date, slot, inboundPositions, inboundTargets, inboundPrimaryPool, ctx.inboundPositionIds, Infinity, "進貨組");

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

  // step2：出貨仍缺 → 平常不補（出貨缺人就跳警示）；只有出貨優先日，才讓進貨組的
  // 人補出貨缺口。進貨組的人此時已經先在 step1 填過自己的進貨崗位，剩下沒被排到的
  // 才會進到這個候選池，所以等於「出貨組的人用完了，才輪到進貨組支援」。
  const shippingInboundCandidates = isPriority
    ? new Set(
        buildEligiblePool(shippingPositions.map((p) => p.id), date, slot, ctx, null).filter(
          (id) => ctx.activeStaff.find((s) => s.id === id).primary_group === GROUP_INBOUND
        )
      )
    : new Set();
  // step3：進貨仍缺 → 排不進出貨崗位的出貨組 PT（第九次補充決議：出貨組正職不自動排處理進貨）
  const inboundShippingCandidates = new Set(
    buildEligiblePool(inboundPositions.map((p) => p.id), date, slot, ctx, null).filter((id) => {
      const s = ctx.activeStaff.find((x) => x.id === id);
      return s.primary_group === GROUP_SHIPPING && s.employment_type === "PT";
    })
  );

  let shipAllocation = shipGap;
  let inAllocation = inGap;

  if (weekday >= 2 && weekday <= 4) {
    // 週三～週五才套用「平均分攤」；人力足夠時不用砍，直接照 step2/step3 全部補滿
    const combinedFlexSupply = new Set([...shippingInboundCandidates, ...inboundShippingCandidates]).size;
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

  fillByScarcity(ctx, date, slot, shippingPositions, shippingTargets, [...shippingInboundCandidates], ctx.shippingPositionIds, shipAllocation, "出貨優先日進貨組支援", true);
  fillByScarcity(ctx, date, slot, inboundPositions, inboundTargets, [...inboundShippingCandidates], ctx.inboundPositionIds, inAllocation, "出貨組PT補進貨");

  // 填完之後，再檢查一次還有沒有真正排不出來的缺口（非週三～週五的人手不足，或分攤後仍然不夠）
  // 【補充決議】每個出貨崗位在它適用的時段裡至少要排到 1 人是硬性規則（只適用平日，
  // assignSlot 本來就只跑平日；週六走 assignSaturday 自己的 4 人規則）；這裡不用特別
  // 寫一條新判斷——只要該崗位的基準人數（target）設定正確（> 0），0 人自然就會落在
  // filled < target 的條件裡，照樣跳出「需要 X 人只排到 Y 人」的警示。
  for (const p of allActivePositions) {
    const filled = currentPriorityCount(ctx, date, slot, p.id);
    const targetMap = p.group === GROUP_SHIPPING ? shippingTargets : inboundTargets;
    const target = targetMap.get(p.id) || 0;
    ctx.slotTargets.set(`${date}|${slot}|${p.id}`, target);
    if (filled < target) {
      ctx.warnings.push({
        type: "shortage",
        date,
        message: `${date} ${slot} ${p.name}：需要 ${target} 人，只排到 ${filled} 人`,
        // 記下是哪一格：之後「非出貨時段補處理進貨」補滿了，就能把這條過時的提醒拿掉
        slot,
        positionId: p.id,
        target,
      });
    }
  }

  assignBackups(ctx, date, slot);
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

// ----------------------------------------------------------------------------
// 十五之〇、週六輪流（票1 第六次補充決議）
//
// 不要一直讓同一批人上週六：離上次上週六最久（或從來沒上過）的人優先，條件相同時
// 再用既有的挑人順序（rankCandidates：三級崗位多 → 本週天數少 → 姓名）。
// 「上次上週六」讀 input.pastSchedule（過去幾週的班表）＋ input.previousWeekSchedule。
// ----------------------------------------------------------------------------

function buildLastSaturdayMap(input) {
  const map = new Map();
  for (const r of [...(input.pastSchedule || []), ...(input.previousWeekSchedule || [])]) {
    if (!r.date || !isSaturday(r.date) || (r.priority || 1) !== 1) continue;
    if (!map.has(r.pt_id) || map.get(r.pt_id) < r.date) map.set(r.pt_id, r.date);
  }
  return map;
}

function saturdayRotationOrder(ctx, ids) {
  const rankIndex = new Map(rankCandidates(ids, ctx, ctx.shippingPositionIds).map((id, i) => [id, i]));
  return [...ids].sort((a, b) => {
    const la = ctx.lastSaturday.get(a) || "";
    const lb = ctx.lastSaturday.get(b) || "";
    if (la !== lb) return la < lb ? -1 : 1; // 越久以前（"" = 從沒上過）越前面
    return rankIndex.get(a) - rankIndex.get(b);
  });
}

// 「人員組成優先於輪流」：先把 PT 分成三級崗位多／少兩群，再各自在群內輪流。
// 分群用「所有能上週六的 PT」的三級出貨崗位數中位數切開（大於中位數＝多；第七次補充決議
// 確認這個分法：多＝李睿懷、楊鎔慈、葉翠茹，少＝林清瑞、陳語姍、黃依婷、李玄鳳），不看這週
// 有沒有空，分群才不會每週跟著請假狀況變動；萬一大家一樣多切不開，就照既有排序前一半算多。
function splitSaturdayPtGroups(ctx) {
  const pts = ctx.activeStaff.filter((s) => s.employment_type === "PT" && canWorkSaturday(s));
  const level3 = (s) => countLevel3(s.id, ctx.abilities, ctx.shippingPositionIds);
  const counts = pts.map(level3).sort((a, b) => a - b);
  const n = counts.length;
  const median = n === 0 ? 0 : (counts[Math.floor((n - 1) / 2)] + counts[Math.ceil((n - 1) / 2)]) / 2;
  let high = new Set(pts.filter((s) => level3(s) > median).map((s) => s.id));
  if (high.size === 0 || high.size === n) {
    const ranked = rankCandidates(pts.map((s) => s.id), ctx, ctx.shippingPositionIds);
    high = new Set(ranked.slice(0, Math.ceil(n / 2)));
  }
  return { high, median };
}

function assignSaturday(ctx, date, printerId) {
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");
  const pickingPosition = ctx.positions.find((p) => p.name === "撿貨");
  const packingPosition = ctx.positions.find((p) => p.name === "包裝");
  const noPackagePosition = ctx.positions.find((p) => p.name === "無包裝出貨");

  const saturdayPtPositions = [pickingPosition, packingPosition, noPackagePosition];

  // 手動鎖定的格子已經佔掉那個人那個時段，這裡只補他還空著的時段
  function commitIfFree(slot, position, ptId) {
    if (isAssignedThisSlot(ctx, date, slot, ptId)) return;
    // 「包裝」硬性上限 4 人，週六也不能破例——這個時段若包裝已經滿了（或性別不符），改排撿貨保底
    const staffRow = ctx.activeStaff.find((s) => s.id === ptId);
    const pos = [position, pickingPosition].find((p) => genderOk(staffRow, p) && hasCapacity(ctx, date, slot, p));
    if (pos) commitAssignment(ctx, date, slot, pos, ptId, 1);
  }
  const staffById = (id) => ctx.activeStaff.find((s) => s.id === id);
  const crewIds = () =>
    new Set(ctx.scheduleRows.filter((r) => r.date === date && r.priority === 1).map((r) => r.pt_id));

  // 第三次補充決議：週六挑人一律「出貨組先、出貨組不夠才找進貨組」（不管是不是出貨優先日），
  // 固定不能上週六（can_work_saturday=false）的人完全不考慮
  const eligibleToday = (s) =>
    canWorkSaturday(s) &&
    isUnderWeeklyCap(s.id, s, ctx, date) &&
    isAvailableForSlotToday(s.id, date, SATURDAY_SLOTS[0], ctx) &&
    saturdayPtPositions.some((p) => getLevel(s.id, p.id, ctx.abilities) >= 2 && genderOk(s, p));

  // 正職：先印單（第一段），印完支援其他出貨崗位（後三段）——支援哪個崗位等 PT 選好之後，
  // 跟 PT 一起分配，確保週六必排崗位都有人（第八次補充決議）
  if (printerId) commitIfFree(SATURDAY_SLOTS[0], printerPosition, printerId);
  const isFullTime = (id) => {
    const s = staffById(id);
    return !!s && s.employment_type === "正職";
  };
  let fullTimeId = [...crewIds()].find(isFullTime) || null; // 印單的正職，或被手動鎖定在週六的正職
  if (!fullTimeId) {
    // 【修正 2】印訂單輪排那天找不到可用的人，不代表週六就放棄湊正職——票2決議
    // 第八條／補充決議都說週六是「硬性」1 正職 + 3 PT，所以還是要盡量找一位當天
    // 可上班、有出貨能力的正職頂上（他當天不印單，整天支援出貨）
    const ftEligible = ctx.activeStaff.filter((s) => s.employment_type === "正職" && eligibleToday(s));
    const rotate = (list) => saturdayRotationOrder(ctx, list.map((s) => s.id)).map(staffById);
    const fallbackFullTime = [
      ...rotate(ftEligible.filter((s) => s.primary_group === GROUP_SHIPPING)),
      ...rotate(ftEligible.filter((s) => s.primary_group !== GROUP_SHIPPING)),
    ][0];
    if (fallbackFullTime) {
      fullTimeId = fallbackFullTime.id; // 支援哪個崗位，下面跟 PT 一起分配
      ctx.warnings.push({
        type: "info",
        date,
        message: `${date}（週六）印訂單輪排到的人當天不可用，改由 ${fallbackFullTime.name} 擔任當天的正職人力（整天支援出貨，不印訂單）`,
      });
    }
  }

  // PT（第六次補充決議）：先分「三級崗位多／少」兩群，各群內照週六輪流順序挑，
  // 維持 2 位多＋1 位少；已經在週六班底裡的 PT（例如被手動鎖定在週六）先算進各群名額。
  // 某一群出貨組不夠時，先用出貨組另一群補（出貨組優先於進貨組，第三次補充決議），
  // 出貨組全部不夠才找進貨組，而且缺哪一群就先從進貨組的那一群找。
  const { high } = splitSaturdayPtGroups(ctx);
  const crewNow = crewIds();
  const crewPts = [...crewNow].map(staffById).filter((s) => s && s.employment_type === "PT");
  const totalNeed = Math.max(0, 3 - crewPts.length);
  const needHigh = Math.min(totalNeed, Math.max(0, 2 - crewPts.filter((s) => high.has(s.id)).length));
  const needLow = Math.min(totalNeed - needHigh, Math.max(0, 1 - crewPts.filter((s) => !high.has(s.id)).length));
  const pool = ctx.activeStaff.filter((s) => s.employment_type === "PT" && !crewNow.has(s.id) && eligibleToday(s));
  const ordered = (list) => saturdayRotationOrder(ctx, list.map((s) => s.id)).map(staffById);
  const ship = pool.filter((s) => s.primary_group === GROUP_SHIPPING);
  const inbound = pool.filter((s) => s.primary_group !== GROUP_SHIPPING);
  const shipHigh = ordered(ship.filter((s) => high.has(s.id)));
  const shipLow = ordered(ship.filter((s) => !high.has(s.id)));
  const inbHigh = ordered(inbound.filter((s) => high.has(s.id)));
  const inbLow = ordered(inbound.filter((s) => !high.has(s.id)));

  const picked = []; // { s, reason }
  const take = (list, n, reason) => {
    for (const s of list) {
      if (n <= 0) break;
      if (picked.some((p) => p.s.id === s.id)) continue;
      picked.push({ s, reason });
      n--;
    }
    return n;
  };
  const shortHigh = take(shipHigh, needHigh, "三級崗位多・輪到了");
  const shortLow = take(shipLow, needLow, "三級崗位少・輪到了");
  let remaining = shortHigh + shortLow;
  remaining = take(ordered(ship), remaining, shortHigh > 0 ? "三級崗位多的人不夠，由出貨組三級崗位少的補" : "三級崗位少的人不夠，由出貨組三級崗位多的補");
  if (remaining > 0) take(shortHigh > 0 ? [...inbHigh, ...inbLow] : [...inbLow, ...inbHigh], remaining, "出貨組不夠，由進貨組補");
  const chosenPts = picked.map((p) => p.s);

  // 這週六怎麼挑人的說明：每位候選人的分群、上次上週六日期、有沒有被挑到、為什麼
  const ptStatus = (s) => {
    const p = picked.find((x) => x.s.id === s.id);
    if (p) return `排入（${p.reason}）`;
    if (crewNow.has(s.id)) return "已在週六班底（手動鎖定等）";
    if (!canWorkSaturday(s)) return "固定不能上週六";
    const avail = getAvailability(s.id, date, ctx.availability);
    if (avail && !isAvailableForSlot(avail.range, SATURDAY_SLOTS[0])) return `週六登記「${avail.range}」`;
    if (!isUnderWeeklyCap(s.id, s, ctx, date)) return "本週已滿 4 天";
    if (!saturdayPtPositions.some((p) => getLevel(s.id, p.id, ctx.abilities) >= 2 && genderOk(s, p))) return "沒有週六崗位的能力";
    if (s.primary_group !== GROUP_SHIPPING) return "進貨組：出貨組的人夠，不排";
    return "沒輪到（同群有人更久沒上週六，或名額已滿）";
  };
  ctx.saturdayRotation = {
    date,
    fullTime: ctx.saturdayRotation && ctx.saturdayRotation.fullTime ? ctx.saturdayRotation.fullTime : [],
    pt: saturdayRotationOrder(
      ctx,
      ctx.activeStaff.filter((s) => s.employment_type === "PT").map((s) => s.id)
    ).map(staffById).map((s) => ({
      id: s.id,
      name: s.name,
      primaryGroup: s.primary_group,
      abilityGroup: high.has(s.id) ? "三級崗位多" : "三級崗位少",
      level3Count: countLevel3(s.id, ctx.abilities, ctx.shippingPositionIds),
      lastSaturday: ctx.lastSaturday.get(s.id) || null,
      status: ptStatus(s),
      picked: chosenPts.some((c) => c.id === s.id),
    })),
  };

  const ptCrew = [
    ...chosenPts,
    ...[...crewNow].map(staffById).filter((s) => s && s.employment_type === "PT"),
  ];
  // 第八次補充決議：週六撿貨、包裝、無包裝出貨、印訂單都至少要 1 人（各自的時段內）。
  // 印訂單由正職在第一段印；其他三個崗位在正職（印完後）＋3 位 PT 之間分配：
  // 先處理「能做的人最少」的崗位，從能做（三級、性別符合）的人裡挑「會做的必排崗位最少」的人
  // （保留彈性給後面的崗位），同樣時 PT 優先（正職還要印單），再照姓名。
  // 必排崗位都有人之後，其他人照原本做法排自己三級的崗位，沒有就排撿貨保底。
  const crewMembers = [];
  for (const s of [...(fullTimeId ? [staffById(fullTimeId)] : []), ...ptCrew]) {
    if (s && !crewMembers.some((m) => m.id === s.id)) crewMembers.push(s);
  }
  const canDo = (s, p) => genderOk(s, p) && getLevel(s.id, p.id, ctx.abilities) === 3;
  const mustCover = [noPackagePosition, packingPosition, pickingPosition];
  const roleOf = new Map();
  const coverOrder = [...mustCover].sort(
    (a, b) => crewMembers.filter((m) => canDo(m, a)).length - crewMembers.filter((m) => canDo(m, b)).length
  );
  for (const p of coverOrder) {
    const free = crewMembers.filter((m) => !roleOf.has(m.id) && canDo(m, p));
    if (free.length === 0) continue;
    free.sort(
      (a, b) =>
        mustCover.filter((q) => canDo(a, q)).length - mustCover.filter((q) => canDo(b, q)).length ||
        (a.employment_type === "PT" ? 0 : 1) - (b.employment_type === "PT" ? 0 : 1) ||
        a.name.localeCompare(b.name, "zh-Hant")
    );
    roleOf.set(free[0].id, p);
  }
  for (const m of crewMembers) {
    if (!roleOf.has(m.id)) roleOf.set(m.id, saturdayPtPositions.find((p) => canDo(m, p)) || pickingPosition);
    for (const slot of SATURDAY_SLOTS) commitIfFree(slot, roleOf.get(m.id), m.id);
  }

  for (const p of [printerPosition, pickingPosition, packingPosition, noPackagePosition]) {
    const ownSlots = ctx.slotsForPosition.get(p.id) || [];
    const covered = ctx.scheduleRows.some(
      (r) => r.date === date && r.priority === 1 && r.position_id === p.id && ownSlots.includes(r.slot)
    );
    if (!covered) {
      ctx.warnings.push({
        type: "shortage",
        date,
        message: `${date}（週六）必排崗位「${p.name}」沒有排到人（${ownSlots.join("／")}），需要人工調整`,
      });
    }
  }

  const inboundPicked = chosenPts.filter((s) => s.primary_group !== GROUP_SHIPPING);
  if (inboundPicked.length > 0) {
    ctx.warnings.push({
      type: "info",
      date,
      message: `${date}（週六）出貨組可上班的 PT 不夠，改由進貨組的 ${inboundPicked.map((s) => s.name).join("、")} 補上`,
    });
  }

  // 【修正 2】週六一定要湊滿 4 人（1 正職 + 3 PT）是硬性規則，湊不滿不能悄悄放著，
  // 草稿提醒裡要看得到明確的缺口（手動鎖定在週六的人也算進班底）
  const finalCrew = [...crewIds()].map(staffById).filter(Boolean);
  const ftCount = finalCrew.filter((s) => s.employment_type === "正職").length;
  const ptCount = finalCrew.filter((s) => s.employment_type === "PT").length;
  if (ftCount < 1 || ptCount < 3) {
    const parts = [];
    if (ftCount < 1) parts.push("正職 0/1 位");
    if (ptCount < 3) parts.push(`PT ${ptCount}/3 位`);
    ctx.warnings.push({
      type: "shortage",
      date,
      message: `${date}（週六）人數沒有湊滿硬性規定的 4 人（1 正職 + 3 PT），目前只排到 ${Math.min(ftCount, 1) + Math.min(ptCount, 3)} 人（${parts.join("、")}），需要人工調整`,
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

function ensureFullTimeWorked(ctx, date, slots, skipPositionIds, isPriority) {
  const skip = skipPositionIds || new Set();
  // 平日不自動排的正職（內勤）不適用「一定要上工」的保底，平日的工作由 Cynthia 手動指派
  const fullTimers = ctx.activeStaff.filter((s) => s.employment_type === "正職" && autoScheduleOk(s, date));

  for (const s of fullTimers) {
    const avail = getAvailability(s.id, date, ctx.availability);
    if (avail && avail.range === "全天休假") continue; // 請假，不受這條規則約束

    const hasAnyRowToday = ctx.scheduleRows.some((r) => r.date === date && r.pt_id === s.id && r.priority === 1);
    if (hasAnyRowToday) continue; // 正常流程已經排到工作，沒事
    // 固定任務（例如處理退貨）每天最後才排，但一樣算上工：會排到他的固定任務先算進來
    if (hasTemplateWork(ctx, s, date)) continue;

    let assignedAny = false;
    for (const slot of slots) {
      if (!isAvailableForSlotToday(s.id, date, slot, ctx)) continue;
      if (isAssignedThisSlot(ctx, date, slot, s.id)) continue;

      const candidatePositions = ctx.positions.filter(
        (p) =>
          !skip.has(p.id) &&
          (ctx.slotsForPosition.get(p.id) || []).includes(slot) &&
          getLevel(s.id, p.id, ctx.abilities) >= 2 &&
          genderOk(s, p) &&
          hasCapacity(ctx, date, slot, p) &&
          // 第九次補充決議：出貨組正職只用出貨工作（出貨崗位、印訂單）來滿足「一定要上工」
          !(isShippingOnlyFullTime(s) && p.group !== GROUP_SHIPPING) &&
          // 挑人順序 step2：進貨組的人只有出貨優先日才能排出貨崗位，保底檢查也不例外
          !(s.primary_group === GROUP_INBOUND && p.group === GROUP_SHIPPING && !isPriority)
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
      ctx.scheduleRows[ctx.scheduleRows.length - 1].mustWork = true; // 正職保底補進來的（驗證、比對用）
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
// 十五之二、沒事做的人補處理進貨（第八、九、十次補充決議）
//
// 每天正常排完（出貨崗位都排好）之後，每個有開處理進貨的時段（第十次起 5 個時段都開），
// 還沒有第一任務的人補去「處理進貨」，不設上限、不受處理進貨基準人數限制：
//   - PT（出貨組、進貨組都算）：只補「當天本來就有上班」的人（不會為了補處理進貨多排一天，
//     PT 4 天上限不受影響），並照當天可上班範圍（只上午／只下午）
//   - 進貨組正職（連陳軒）：照進貨組規則，當天有上班就補
//   - 出貨組正職不補（第九次補充決議：只自動排出貨工作，其他由 Cynthia 手動安排）
// 出訂單後時段的處理進貨本來就沒有人數目標（見 assignSlot），所以那兩個時段的處理進貨全部
// 是在這裡、出貨崗位排完之後才補的——不會為了湊進貨人數把人從出貨崗位拉走。
// 能力規則照舊：三級直接排，二級要這個時段處理進貨已經有三級的人才能排；真的排不進去的，
// 留一條「這個時段沒有工作（人力過剩）」提醒並寫出原因，由 Cynthia 手動安排。
// ----------------------------------------------------------------------------

function fillIdleInbound(ctx, date) {
  const inbound = ctx.positions.find((p) => p.name === "處理進貨");
  if (!inbound) return;
  const workingToday = new Set(
    ctx.scheduleRows.filter((r) => r.date === date && r.priority === 1).map((r) => r.pt_id)
  );
  const hasLevel3 = (slot) =>
    ctx.scheduleRows.some(
      (r) => r.date === date && r.slot === slot && r.position_id === inbound.id && getLevel(r.pt_id, inbound.id, ctx.abilities) === 3
    );

  for (const slot of SLOTS) {
    if (!(ctx.slotsForPosition.get(inbound.id) || []).includes(slot)) continue;
    const candidates = ctx.activeStaff.filter((s) => {
      if (isShippingOnlyFullTime(s)) return false;
      if (!autoScheduleOk(s, date)) return false;
      if (s.employment_type === "PT" && !workingToday.has(s.id)) return false;
      if (s.employment_type !== "PT") {
        const a = getAvailability(s.id, date, ctx.availability);
        if (a && a.range === "全天休假") return false;
      }
      if (isAssignedThisSlot(ctx, date, slot, s.id)) return false;
      if (!genderOk(s, inbound)) return false;
      const avail = getAvailability(s.id, date, ctx.availability);
      if (avail && !isAvailableForSlot(avail.range, slot)) return false;
      return true;
    });
    const level3 = candidates.filter((s) => getLevel(s.id, inbound.id, ctx.abilities) === 3);
    const level2 = candidates.filter((s) => getLevel(s.id, inbound.id, ctx.abilities) === 2);
    for (const s of level3) commitAssignment(ctx, date, slot, inbound, s.id, 1);
    const unplaced = candidates.filter((s) => getLevel(s.id, inbound.id, ctx.abilities) < 2);
    for (const s of level2) {
      if (hasLevel3(slot)) commitAssignment(ctx, date, slot, inbound, s.id, 1);
      else unplaced.push(s);
    }
    for (const s of unplaced) {
      ctx.warnings.push({
        type: "surplus",
        date,
        slot,
        ptId: s.id,
        message: `${s.name} ${date}（週${WEEKDAY_NAMES[getWeekdayIndex(date)]}）${slot} 沒有工作（人力過剩）：處理進貨能力${getLevel(s.id, inbound.id, ctx.abilities) === 2 ? "是二級、這個時段沒有三級的同事陪同" : "是一級"}，排不進處理進貨，需要人工安排`,
      });
    }
  }

  // 補完之後，原本「處理進貨需要 X 人只排到 Y 人」如果已經補滿，就把那條過時的提醒拿掉
  ctx.warnings = ctx.warnings.filter(
    (w) => !(w.type === "shortage" && w.date === date && w.positionId === inbound.id && currentPriorityCount(ctx, date, w.slot, inbound.id) >= w.target)
  );
}

// ----------------------------------------------------------------------------
// 十六、人力過剩判斷（票2 決議第六條 step4）
// ----------------------------------------------------------------------------

function markSurplus(ctx, date) {
  const assignedToday = new Set(ctx.scheduleRows.filter((r) => r.date === date && r.priority === 1).map((r) => r.pt_id));

  // 時段層級的「人力過剩」（某人某時段沒有工作）只剩真的排不進任何工作的情況，由 fillIdleInbound
  // 產生（第十次補充決議：出訂單後有空的 PT 改排處理進貨，不再一律標人力過剩）。這裡只管整天沒排的人。
  for (const s of ctx.activeStaff) {
    if (assignedToday.has(s.id)) continue;
    // 平日不自動排的人，平日沒排到是當然的，不算人力過剩（第十一次補充決議）
    if (!autoScheduleOk(s, date)) continue;
    // 【修正 1】平日的正職不會落到「人力過剩」這個分類——規則是正職一定要上工，
    // ensureFullTimeWorked 已經處理過：排到了就不會進到這裡；真的排不進去，
    // 那邊也已經留下專屬的「需要人工處理」警示，這裡不用再重複講一次（而且講成
    // 「人力過剩」語意上也不對，那是指「有空的人沒事做」，不是「該上工卻排不進去」）。
    // 週六不適用這條跳過：週六本來就是固定 1 正職＋3 PT 的小隊（票2決議第八條），
    // 其他「這天也登記可上班、但沒被排進這 4 人小隊」的正職維持原本的提醒方式，
    // 不會被 ensureFullTimeWorked 強塞進去（那樣會破壞週六固定小隊的設計）。
    if (s.employment_type !== "PT" && !isSaturday(date)) continue;
    // 固定不能上週六的人，週六沒排到是當然的，不算人力過剩
    if (isSaturday(date) && !canWorkSaturday(s)) continue;
    const avail = getAvailability(s.id, date, ctx.availability);
    const isOff = avail && avail.range === "全天休假";
    if (isOff) continue;
    if (s.employment_type === "PT" && !isUnderWeeklyCap(s.id, s, ctx, date)) {
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
// 十六之一、有優先人選的崗位：整週先規劃（第十次補充決議）
//
// 排完週六、排平日其他崗位之前，先把有設優先人選的崗位（目前只有出箱貨：林清瑞 → 李睿懷）
// 週一到週五每一天的人排好，排好的格子之後就當成固定的，平日每個時段的「越少越先排」
// 不會再動它們，而且那幾天一開始就算進 PT 4 天上限（等於替他預留了天數）。
//
// 做法（適用於任何有優先人選的崗位）：照優先順序一個一個人來——
//   1. 先算這個人本週還能多排幾天（PT＝4 減掉已經用掉的天數，週六、手動鎖定都算；正職不限）
//   2. 找出他能做的日子：那天這個崗位的時段他可以上班、能力三級、性別符合、組別規則允許
//      （進貨組的人只有出貨優先日能排出貨崗位）、那個時段沒被鎖在別的崗位，而且那天還缺人
//   3. 日子不夠他全部做時，先挑「後面的優先人選做不了」的日子，留下後面的人也能做的日子給他們
//      （這就是替後面的人保留天數）；同樣情況照日期先後
//   4. 排進去，再輪到下一個優先人選補剩下沒人的日子
// 優先人選都排不了的日子，留給平日一般流程照一般挑人順序補（崗位內仍是優先人選先挑）。
// ----------------------------------------------------------------------------

function planPreferredPositions(ctx, weekdays) {
  for (const [positionId, prefIds] of ctx.preferredByPosition) {
    const position = ctx.positionById.get(positionId);
    if (!position) continue; // 不納入自動排班的崗位不規劃
    const slots = ctx.slotsForPosition.get(positionId) || [];
    const people = prefIds.map((id) => ctx.activeStaff.find((s) => s.id === id)).filter(Boolean);

    const need = new Map(); // date|slot -> 還缺幾人
    for (const d of weekdays) {
      const info = isPriorityShippingDay(d, ctx.specialDates);
      for (const sl of slots) {
        const target = baseTarget(position, ctx, info.isPriority, info.extraHeadcount, d, sl);
        need.set(`${d}|${sl}`, Math.max(0, target - currentPriorityCount(ctx, d, sl, positionId)));
      }
    }
    const coverableSlots = (s, d) => {
      const isPriority = isPriorityShippingDay(d, ctx.specialDates).isPriority;
      if (position.group === GROUP_SHIPPING && s.primary_group !== GROUP_SHIPPING && !isPriority) return [];
      if (!genderOk(s, position) || getLevel(s.id, positionId, ctx.abilities) !== 3) return [];
      return slots.filter(
        (sl) => need.get(`${d}|${sl}`) > 0 && isAvailableForSlotToday(s.id, d, sl, ctx) && !isAssignedThisSlot(ctx, d, sl, s.id)
      );
    };
    const booked = (s, d) => (ctx.lockedDaysByPt.get(s.id) || new Set()).has(d);

    people.forEach((s, idx) => {
      const lowerRanked = people.slice(idx + 1);
      const days = weekdays
        .filter((d) => coverableSlots(s, d).length > 0)
        .map((d) => ({ d, others: lowerRanked.filter((o) => coverableSlots(o, d).length > 0).length, free: booked(s, d) }))
        .sort((a, b) => (b.free ? 1 : 0) - (a.free ? 1 : 0) || a.others - b.others || (a.d < b.d ? -1 : 1));
      let capacity = s.employment_type === "PT" ? 4 - (ctx.ptDaysUsedThisWeek.get(s.id) || 0) : Infinity;
      for (const { d, free } of days) {
        if (!free && capacity <= 0) continue;
        const toFill = coverableSlots(s, d);
        if (toFill.length === 0) continue;
        for (const sl of toFill) {
          commitAssignment(ctx, d, sl, position, s.id, 1);
          need.set(`${d}|${sl}`, need.get(`${d}|${sl}`) - 1);
        }
        ctx.preferredPlan.push({ positionId, date: d, ptId: s.id, rank: idx + 1 });
        if (!free) {
          if (!ctx.lockedDaysByPt.has(s.id)) ctx.lockedDaysByPt.set(s.id, new Set());
          ctx.lockedDaysByPt.get(s.id).add(d);
          ctx.ptDaysUsedThisWeek.set(s.id, (ctx.ptDaysUsedThisWeek.get(s.id) || 0) + 1);
          capacity--;
        }
      }
    });
  }
}

// ----------------------------------------------------------------------------
// 十六之二、任務型崗位（第十二、十四次補充決議）：處理批發訂單、處理退貨、盤點
//
// 這三個崗位不納入一般自動排班（included_in_auto_schedule＝false），只透過兩種任務登記出現，
// 而且是每天「最後」才排：出貨崗位、處理進貨、備援、正職保底、沒事做的人補處理進貨都排完之後。
//   - input.taskTemplates（固定任務，每週重複）：{ position_id, slot, weekdays, pt_id, substitute_pt_id|null }
//       weekdays 用 0＝週一…4＝週五（跟 getWeekdayIndex 一樣）。每一次：
//       指定人員那個時段已經有別的主要工作（例如印單、手動鎖定）→ 不排他、也不找代班
//       指定人員請假／那個時段沒登記上班 → 有代班就由代班補（一樣要符合資格），沒有就留空＋提醒
//   - input.taskRequests（本週任務，單次）：{ date, slot, position_id, headcount, pt_id|null（或 pt_ids） }
//       系統不再自己挑人（第十四次補充決議）。指定的人：
//         那個時段在處理進貨 → 從處理進貨移到任務（處理進貨少了人，照常跳缺人提醒）
//         那個時段已排出貨崗位或印單（或其他工作）→ 不動，提醒手動調整
//         請假／沒空 → 提醒，那個位子留空
//       沒指定（或指定人數少於需要人數）的位子 → 不排人，跳 task_manual 提醒請 Cynthia 手動指定
// 週六、國定假日不排任務（週六的本週任務只提醒）。「平日不自動排」只限一般自動排班，任務可以排到許庭瑄。
// ----------------------------------------------------------------------------

function registeredForSlot(ctx, ptId, date, slot) {
  const a = getAvailability(ptId, date, ctx.availability);
  return !a || isAvailableForSlot(a.range, slot); // 沒登記照既有規則視為全天可上班
}

function templatesOn(ctx, date) {
  return ctx.taskTemplates.filter((t) => {
    const p = ctx.allPositionById.get(t.position_id);
    return p && p.is_active !== false && (t.weekdays || []).includes(getWeekdayIndex(date));
  });
}

// 這個人這天有沒有「會排到他」的固定任務（他那個時段有登記上班）。任務最後才排，
// 但正職保底檢查在任務之前跑，所以先用這個判斷，結果跟任務已經排進去時一樣
function hasTemplateWork(ctx, staffRow, date) {
  return templatesOn(ctx, date).some((t) => t.pt_id === staffRow.id && registeredForSlot(ctx, staffRow.id, date, t.slot));
}

// 這個人這天這個時段是不是固定任務的指定人員（頂印單時優先找沒有固定任務的人用）
function isTemplatePerson(ctx, ptId, date, slot) {
  return templatesOn(ctx, date).some((t) => t.pt_id === ptId && t.slot === slot && registeredForSlot(ctx, ptId, date, slot));
}

const workingOn = (ctx, ptId, date) => ctx.scheduleRows.some((r) => r.date === date && r.pt_id === ptId && r.priority === 1);

// 能不能多排這一格：那個時段有登記上班；PT 當天本來沒上班的話，還要沒到 4 天上限
function freeToAdd(ctx, staffRow, date, slot) {
  if (!registeredForSlot(ctx, staffRow.id, date, slot)) return false;
  if (staffRow.employment_type !== "PT" || workingOn(ctx, staffRow.id, date)) return true;
  return isUnderWeeklyCap(staffRow.id, staffRow, ctx, date);
}

function taskEligible(ctx, staffRow, position, date, slot) {
  if (!staffRow || isAssignedThisSlot(ctx, date, slot, staffRow.id)) return false;
  if (!freeToAdd(ctx, staffRow, date, slot) || !genderOk(staffRow, position)) return false;
  const level = getLevel(staffRow.id, position.id, ctx.abilities);
  if (level === 3) return true;
  // 二級照既有能力規則：這個任務這個時段已經有三級的人才能排
  return (
    level === 2 &&
    ctx.scheduleRows.some(
      (r) => r.date === date && r.slot === slot && r.position_id === position.id && r.priority === 1 && getLevel(r.pt_id, position.id, ctx.abilities) === 3
    )
  );
}

function commitTask(ctx, date, slot, position, ptId, kind) {
  ctx.scheduleRows.push({
    date,
    slot,
    position_id: position.id,
    position_name: position.name,
    pt_id: ptId,
    pt_name: lookupStaffName(ctx, ptId),
    priority: 1,
    source: "auto",
    task: kind,
  });
  markAssignedThisSlot(ctx, date, slot, ptId);
}

function taskDayLabel(d) {
  return `${d}（週${WEEKDAY_NAMES[getWeekdayIndex(d)]}）`;
}

function processTemplatesForDay(ctx, date) {
  for (const t of templatesOn(ctx, date)) {
    const position = ctx.allPositionById.get(t.position_id);
    const log = { kind: "固定任務", date, slot: t.slot, positionId: position.id, ptId: t.pt_id, assignedId: null, result: "" };
    ctx.taskLog.push(log);
    const person = ctx.activeStaff.find((s) => s.id === t.pt_id);
    if (person && isAssignedThisSlot(ctx, date, t.slot, person.id)) {
      log.result = "跳過（這個時段已經有別的主要工作，不找代班）";
      continue;
    }
    if (person && freeToAdd(ctx, person, date, t.slot)) {
      commitTask(ctx, date, t.slot, position, person.id, "固定任務");
      log.assignedId = person.id;
      log.result = "排入";
      continue;
    }
    const who = person ? person.name : t.pt_id;
    const sub = t.substitute_pt_id ? ctx.activeStaff.find((s) => s.id === t.substitute_pt_id) : null;
    if (sub && taskEligible(ctx, sub, position, date, t.slot)) {
      commitTask(ctx, date, t.slot, position, sub.id, "固定任務");
      ctx.scheduleRows[ctx.scheduleRows.length - 1].substituteFor = t.pt_id;
      log.assignedId = sub.id;
      log.result = "代班";
      ctx.warnings.push({
        type: "task",
        date,
        message: `${taskDayLabel(date)} ${t.slot}「${position.name}」：${who} 請假／沒空，由代班的 ${sub.name} 處理`,
      });
      continue;
    }
    log.result = "留空";
    ctx.warnings.push({
      type: "task",
      date,
      message: `${taskDayLabel(date)} ${t.slot}「${position.name}」：${who} 請假／沒空，${
        sub ? `代班的 ${sub.name} 也不能排（請假、這個時段已有工作或不符合資格）` : "沒有設定代班人員"
      }，這一格留空，請 Cynthia 手動安排`,
    });
  }
}

function requestNamedIds(req) {
  return [...new Set([...(req.pt_ids || []), ...(req.pt_id ? [req.pt_id] : [])])];
}

function processRequestsForDay(ctx, date) {
  const inbound = ctx.positions.find((p) => p.name === "處理進貨");
  for (const req of ctx.taskRequests.filter((r) => r.date === date)) {
    const position = ctx.allPositionById.get(req.position_id);
    if (!position || position.is_active === false) continue;
    const label = `${taskDayLabel(date)} ${req.slot}「${position.name}」`;
    const named = requestNamedIds(req);
    const log = { kind: "本週任務", date, slot: req.slot, positionId: position.id, ptId: named[0] || null, named, placed: [], need: req.headcount || 1, result: "" };
    ctx.taskLog.push(log);
    const notes = [];
    for (const id of named) {
      const person = ctx.activeStaff.find((s) => s.id === id);
      const name = person ? person.name : id;
      const current = ctx.scheduleRows.find((r) => r.date === date && r.slot === req.slot && r.pt_id === id && r.priority === 1);
      if (!person || (!current && !freeToAdd(ctx, person, date, req.slot))) {
        notes.push(`${name}請假／沒空`);
        ctx.warnings.push({ type: "task", date, message: `${label}：指定的 ${name} 請假、那個時段沒登記上班或已達 PT 4 天上限，這個位子留空，請手動調整` });
        continue;
      }
      if (current && inbound && current.position_id === inbound.id && current.source !== "manual") {
        // 從處理進貨移到任務；處理進貨如果因此低於那格的目標，照常跳缺人提醒
        ctx.scheduleRows.splice(ctx.scheduleRows.indexOf(current), 1);
        ctx.assignedTodayBySlot.get(slotKey(date, req.slot)).delete(id);
        commitTask(ctx, date, req.slot, position, id, "本週任務");
        log.placed.push(id);
        const target = ctx.slotTargets.get(`${date}|${req.slot}|${inbound.id}`) || 0;
        const filled = currentPriorityCount(ctx, date, req.slot, inbound.id);
        if (filled < target) {
          ctx.warnings = ctx.warnings.filter((w) => !(w.type === "shortage" && w.date === date && w.slot === req.slot && w.positionId === inbound.id));
          ctx.warnings.push({
            type: "shortage",
            date,
            message: `${date} ${req.slot} ${inbound.name}：需要 ${target} 人，只排到 ${filled} 人（${name} 改去做本週任務）`,
            slot: req.slot,
            positionId: inbound.id,
            target,
          });
        }
        continue;
      }
      if (current) {
        const pos = ctx.allPositionById.get(current.position_id);
        const what = pos && pos.group === GROUP_SHIPPING ? "出貨/印單" : `「${current.position_name}」`;
        notes.push(`${name}已排${what}`);
        ctx.warnings.push({ type: "task", date, message: `${label}：指定的 ${name} 那個時段已排${what}，請手動調整` });
        continue;
      }
      commitTask(ctx, date, req.slot, position, id, "本週任務");
      log.placed.push(id);
    }
    const missing = Math.max(0, (req.headcount || 1) - named.length);
    if (missing > 0) {
      ctx.warnings.push({ type: "task_manual", date, slot: req.slot, positionId: position.id, message: `${label} 需要安排 ${missing} 人，請手動指定` });
    }
    log.result = [log.placed.length ? `排入 ${log.placed.length} 人` : "", ...notes, missing ? `待手動指定 ${missing} 人` : ""].filter(Boolean).join("；");
  }
}

// 週六、國定假日、不在這週的本週任務：只提醒
function warnUnplacedRequests(ctx, weekDates) {
  for (const req of ctx.taskRequests) {
    const position = ctx.allPositionById.get(req.position_id);
    if (!position || position.is_active === false) continue;
    let why = null;
    if (!weekDates.includes(req.date) || isSunday(req.date)) why = "不在這週的上班日";
    else if (isHolidayDate(req.date, ctx.specialDates)) why = "這天是國定假日，不排班";
    else if (isSaturday(req.date)) why = "週六的任務系統不排，請手動安排";
    if (!why) continue;
    ctx.taskLog.push({ kind: "本週任務", date: req.date, slot: req.slot, positionId: position.id, ptId: requestNamedIds(req)[0] || null, named: requestNamedIds(req), placed: [], need: req.headcount || 1, result: `只提醒（${why}）` });
    ctx.warnings.push({ type: "task_manual", date: req.date, slot: req.slot, positionId: position.id, message: `${taskDayLabel(req.date)} ${req.slot}「${position.name}」：${why}` });
  }
}

// ----------------------------------------------------------------------------
// 十七、主流程：generateWeekSchedule
// ----------------------------------------------------------------------------

function generateWeekSchedule(input) {
  const ctx = buildContext(input);
  const weekDates = getWeekDates(input.weekStart);
  const printerPosition = ctx.positions.find((p) => p.name === "印訂單");

  // 先放進手動鎖定的格子，後面所有自動排班都在它們「之外」重新計算
  applyLockedRows(ctx, input);
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

  // 第六次補充決議：先排週六、再排平日。週六能配合的人比較少，先確保週六排得出來；
  // 被排到週六的 PT，週六會先算進每週 4 天上限，平日就少一天可排。
  const processingOrder = [...weekDates.filter(isSaturday), ...weekDates.filter((d) => !isSaturday(d))];
  // 第十四次補充決議：平日的國定假日完全不排（出貨、進貨、任務、印單都沒有，也不跳缺人提醒）
  const workingWeekdays = weekDates.filter((d) => !isSaturday(d) && !isSunday(d) && isWorkingDay(d, ctx.specialDates));
  for (const date of processingOrder) {
    if (isSunday(date)) continue; // 週日店休，不排班
    if (isHolidayDate(date, ctx.specialDates)) {
      ctx.warnings.push({
        type: "info",
        date,
        message: `${date}（週${WEEKDAY_NAMES[getWeekdayIndex(date)]}）是國定假日，不排班${isSaturday(date) ? "（這週沒有週六班，週六輪流也不往前推）" : ""}`,
      });
      if (isSaturday(date)) planPreferredPositions(ctx, workingWeekdays);
      continue;
    }

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
      const printerHandledSlots = new Set();
      for (const slot of ["上午出訂單前", "下午出訂單前"]) {
        // 這個時段的印訂單已經被手動鎖定（不管鎖的是誰）就不重複排
        if (currentPriorityCount(ctx, date, slot, printerPosition.id) > 0) {
          printerHandledSlots.add(slot);
        } else if (printerId && !isAssignedThisSlot(ctx, date, slot, printerId)) {
          commitAssignment(ctx, date, slot, printerPosition, printerId, 1);
          printerHandledSlots.add(slot);
        }
        // 印單人這個時段被手動鎖在別的崗位時，印訂單留給下面的一般流程照基準人數補
      }
      const skip = printerHandledSlots.size > 0 ? new Set([printerPosition.id]) : new Set();
      // assignSlot 內部在每個時段結束時都會呼叫一次 assignBackups()，所以這裡不需要
      // 另外再跑一次備援（跑兩次會重複產生備援列）
      for (const slot of SLOTS) {
        const slotSkip = printerHandledSlots.has(slot) ? new Set([printerPosition.id]) : new Set();
        assignSlot(ctx, date, slot, info.isPriority, info.extraHeadcount, slotSkip);
      }
      // 【修正 1】正常流程跑完後，保底檢查今天所有正職是不是都真的被排到工作了
      ensureFullTimeWorked(ctx, date, SLOTS, skip, info.isPriority);
      // 【第八～十次補充決議】出貨崗位排完後，還沒事做的 PT（跟進貨組正職）補去處理進貨
      fillIdleInbound(ctx, date);
      // 第十四次補充決議：任務最後才排（固定任務 → 本週任務）
      processTemplatesForDay(ctx, date);
      processRequestsForDay(ctx, date);
    }

    // 更新本週已使用天數 + 算人力過剩（手動鎖定的日子一開始就算過了，不重複加）
    for (const s of ctx.activeStaff) {
      const hasAnyRowToday = ctx.scheduleRows.some((r) => r.date === date && r.pt_id === s.id && r.priority === 1);
      const alreadyCounted = ctx.lockedDaysByPt.has(s.id) && ctx.lockedDaysByPt.get(s.id).has(date);
      if (hasAnyRowToday && !alreadyCounted) {
        ctx.ptDaysUsedThisWeek.set(s.id, (ctx.ptDaysUsedThisWeek.get(s.id) || 0) + 1);
      }
    }
    markSurplus(ctx, date);

    // 週六排完、平日開始之前：有優先人選的崗位先把整週排好（第十次補充決議）
    if (isSaturday(date)) planPreferredPositions(ctx, workingWeekdays);
  }
  warnUnplacedRequests(ctx, weekDates);

  validateLockedBackupsAfterFill(ctx);

  // 排班是週六先排，輸出照日期、時段排好，方便閱讀跟比對
  const slotIndex = (s) => SLOTS.indexOf(s);
  const schedule = [...ctx.scheduleRows].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : slotIndex(a.slot) - slotIndex(b.slot)
  );
  return {
    schedule,
    warnings: ctx.warnings,
    saturdayRotation: ctx.saturdayRotation,
    fillTrace: ctx.fillTrace,
    preferredPlan: ctx.preferredPlan,
    targets: Object.fromEntries(ctx.slotTargets), // date|slot|positionId -> 目標人數（驗證、畫面用）
    taskLog: ctx.taskLog,
    printerPlan: {
      thirdDay: rotation.thirdDay,
      thirdDayReason: rotation.thirdDayReason,
      assignments: Object.fromEntries(rotation.assignments),
    },
  };
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
