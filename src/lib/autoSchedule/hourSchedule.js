// 新版排班（時數制）：規則見根目錄「新版排班規則（時數制）.md」。還沒接到網頁，切換前只用來試排比對。
//
// 一天切成 30 分鐘的格子（8:30-12:30、13:30-17:30，午休不排），每個崗位每天有「最高可以安排的時數」，
// 系統依序把人排進格子，排到上限為止：
//   1. 本週任務（處理批發訂單）指定的人先放
//   2. 印訂單：內勤（主要崗位是內勤窗口的正職）先印，不行再找會印的正職
//   3. 正職：主要崗位可以做的時間全部排他，其他時間排到他會做、還沒排滿的崗位
//   4. PT 照排班順序（優先 → 一般 → 最後才排）一個一個排班：一天一段、3～6 小時、整段都要有工作，
//      先排主要崗位，不夠再支援其他會做的崗位（三級優先）；班跨過午休時午休前後各至少 2 小時
//   5. 車趟的人週一到週五每天上班（不受每週時數上限）。他的另一個主要崗位（箱出貨）是三級時平日最先排他，
//      箱出貨先給他（2026-11-27 Cynthia 決議）；是二級時要有三級的人在才能做，排在最後。
//      其他崗位都滿了時，只排車趟那一小時也照樣上班
//   一天裡換到下一個崗位後不再回到前面做過的崗位（不會跳去別的工作半小時又跳回來），一天最多兩個崗位
//   6. 還有剩的零頭時數：已經上班、還沒到 6 小時的 PT 照排班順序把班往前或往後延長來補
// 週六：1 位正職輪流（離上次上週六最久的先，只在會做週六工作的正職裡輪），那週另外休一個平日
// （主要崗位沒有別的正職能代的人先不補休）；PT 照 B組、A組交錯、離上次上週六最久的先。
import { getWeekDates, getWeekdayIndex, isPriorityShippingDay, isHolidayDate } from "./scheduleLogic.js";

const toMin = (t) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const BLOCK = 30;
const MORNING_BLOCKS = Array.from({ length: 8 }, (_, i) => toMin("08:30") + i * BLOCK);
const AFTERNOON_BLOCKS = Array.from({ length: 8 }, (_, i) => toMin("13:30") + i * BLOCK);
const ALL_BLOCKS = [...MORNING_BLOCKS, ...AFTERNOON_BLOCKS];
const RANGE_BLOCKS = { 全天: ALL_BLOCKS, 只上午: MORNING_BLOCKS, 只下午: AFTERNOON_BLOCKS, 全天休假: [] };
const PT_MIN_BLOCKS = 6; // 3 小時
const PT_MAX_BLOCKS = 12; // 6 小時
// 班跨過午休時，午休前、午休後各至少 2 小時（不要早上來半小時就午休，2026-11-27 Cynthia）
const LUNCH_SIDE_MIN_BLOCKS = 4;
const LUNCH_START = toMin("12:30");
const lunchOk = (blocks) => {
  const morning = blocks.filter((b) => b < LUNCH_START).length;
  const afternoon = blocks.length - morning;
  return morning === 0 || afternoon === 0 || (morning >= LUNCH_SIDE_MIN_BLOCKS && afternoon >= LUNCH_SIDE_MIN_BLOCKS);
};
const ORDER_RANK = { 優先: 0, 一般: 1, 最後: 2 };
const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];
// 舊版時段對到新版時間（本週任務還是用舊時段登記）
const OLD_SLOT_TIMES = {
  上午出訂單前: ["08:30", "09:00"],
  上午出訂單後: ["09:00", "12:30"],
  下午出訂單前: ["13:30", "14:30"],
  下午出訂單後: ["14:30", "17:30"],
  出貨完成後: null,
};

function hoursKey(date, specialDates) {
  const wd = getWeekdayIndex(date);
  if (wd === 5) return "hours_saturday";
  if (isPriorityShippingDay(date, specialDates).isPriority) return "hours_event";
  if (wd <= 1) return "hours_mon_tue";
  if (wd === 2) return "hours_wednesday";
  return "hours_thu_fri";
}

// 週六有另外設可以做的時間就用週六的（2026-11-28：無包裝出貨週六從早上開始）
function windowBlocks(position, saturday) {
  const windows = (saturday && position.saturday_windows) || position.work_windows || [];
  return ALL_BLOCKS.filter((b) => windows.some(([s, e]) => b >= toMin(s) && b + BLOCK <= toMin(e)));
}

function scheduleOnce(input) {
  const extraOff = input.extraDaysOff || new Set(); // 整週調整時，試著讓某人某天不排；`${ptId}|shorten`＝讓他每天少排一點
  const weekDates = getWeekDates(input.weekStart).slice(0, 6);
  const openDates = weekDates.filter((d) => !isHolidayDate(d, input.specialDates));
  const positions = input.positions.filter((p) => p.is_active !== false);
  const posById = new Map(positions.map((p) => [p.id, p]));
  const weekdayWindow = new Map(positions.map((p) => [p.id, new Set(windowBlocks(p, false))]));
  const saturdayWindow = new Map(positions.map((p) => [p.id, new Set(windowBlocks(p, true))]));
  // 每格都會查，先算好哪天是週六，不然光算星期幾就佔掉三成時間
  const saturdayDates = new Set(weekDates.filter((d) => getWeekdayIndex(d) === 5));
  const win = (posId, date) => (saturdayDates.has(date) ? saturdayWindow : weekdayWindow).get(posId);
  const staff = input.staff.filter((s) => s.is_active);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const levelMap = new Map();
  for (const a of input.abilities) {
    if (!levelMap.has(a.pt_id)) levelMap.set(a.pt_id, new Map());
    levelMap.get(a.pt_id).set(a.position_id, a.level);
  }
  const level = (ptId, posId) => levelMap.get(ptId)?.get(posId) ?? 1;
  const availMap = new Map(input.availability.map((a) => [`${a.pt_id}|${a.date}`, a.range]));
  const isFullTime = (s) => s.employment_type === "正職";
  // PT 每週不設上限（2026-11-28 Cynthia：時數由崗位上限決定，不限每人每週幾小時）
  const weeklyMaxBlocks = () => Infinity;
  const mains = (s) => (s.main_position_ids || []).filter((id) => posById.has(id));
  const printer = positions.find((p) => p.name === "印訂單");
  const driverPos = positions.find((p) => p.name === "車趟");
  const officePos = positions.find((p) => p.name === "內勤窗口");
  const shippingPos = positions.find((p) => p.name === "出貨");
  // 主要崗位全部是正職的崗位（出貨除外），正職請假時只能由別的正職代（Cynthia 2026-11-26）
  const fullTimeOnly = new Set(
    positions
      .filter((p) => p.id !== shippingPos?.id)
      .filter((p) => {
        const holders = staff.filter((s) => mains(s).includes(p.id));
        return holders.length > 0 && holders.every(isFullTime);
      })
      .map((p) => p.id),
  );
  const warnings = [];
  const dayLabel = (d) => `${d.slice(5).replace("-", "/")}（${WEEKDAY_NAMES[getWeekdayIndex(d)]}）`;

  // 狀態：每人每天每格排了什麼崗位、每個崗位每天還剩幾格可以排、每人本週排了幾格
  const grid = new Map(); // `${date}|${ptId}` -> Map(block -> posId)
  const remaining = new Map(); // `${date}|${posId}` -> 格數
  const cap = new Map();
  const weekBlocks = new Map(staff.map((s) => [s.id, 0]));
  const cell = (date, ptId) => {
    const k = `${date}|${ptId}`;
    if (!grid.has(k)) grid.set(k, new Map());
    return grid.get(k);
  };
  for (const d of openDates) {
    for (const p of positions) {
      const blocks = Math.floor(Number(p[hoursKey(d, input.specialDates)] ?? 0) * 2);
      remaining.set(`${d}|${p.id}`, blocks);
      cap.set(`${d}|${p.id}`, blocks);
    }
  }

  // 重排時正職補空檔不留下 PT 湊不成 3 小時的零頭（例如正職多半小時去做無包裝，剩 2.5 小時沒人能排，2026-11-28）
  let spareFragments = false;
  let boosted = new Set(); // 重排時調成最優先的崗位
  const missingAvail = new Set();
  const availCache = new Map();
  const availableBlocks = (s, date) => {
    const k = `${s.id}|${date}`;
    if (availCache.has(k)) return availCache.get(k);
    let blocks;
    if (extraOff.has(k)) blocks = [];
    else {
      const range = availMap.get(k);
      if (!range) missingAvail.add(`${s.name}|${date}`);
      blocks = RANGE_BLOCKS[range ?? "全天"] ?? [];
    }
    availCache.set(k, blocks);
    return blocks;
  };
  const onLeave = (s, date) => availableBlocks(s, date).length === 0;

  // 每天每格每個崗位排了幾個人（另外記三級的人數），邊排邊記，不用每次重算
  const occ = new Map(); // date -> Map(`${block}|${posId}` -> 人數)
  const occ3 = new Map();
  const dayMap = (m, date) => {
    if (!m.has(date)) m.set(date, new Map());
    return m.get(date);
  };
  const occAdd = (s, date, block, posId, delta) => {
    const k = `${block}|${posId}`;
    const a = dayMap(occ, date);
    a.set(k, (a.get(k) || 0) + delta);
    if (level(s.id, posId) === 3) {
      const b = dayMap(occ3, date);
      b.set(k, (b.get(k) || 0) + delta);
    }
  };
  // 「上午、下午都要有人」的崗位：不用平分，但某一邊還沒人時，要留至少半小時給那一邊（2026-11-28 箱出貨）
  const isMorning = (b) => b < LUNCH_START;
  const splitsHalves = (p, date) => {
    const w = [...win(p.id, date)];
    return !!p.split_halves && w.some(isMorning) && w.some((b) => !isMorning(b));
  };
  const halfUsed = (p, date, morning) =>
    [...win(p.id, date)].filter((b) => isMorning(b) === morning).reduce((sum, b) => sum + (occ.get(date)?.get(`${b}|${p.id}`) || 0), 0);
  const needsBothHalves = (p, date) => splitsHalves(p, date) && (cap.get(`${date}|${p.id}`) || 0) >= 2;
  const halfHasRoom = (p, date, block) => {
    if (!needsBothHalves(p, date)) return true;
    const other = halfUsed(p, date, !isMorning(block));
    return halfUsed(p, date, isMorning(block)) + other < cap.get(`${date}|${p.id}`) - (other === 0 ? 1 : 0);
  };
  const someoneLevel3At = (date, posId, block) => (occ3.get(date)?.get(`${block}|${posId}`) || 0) > 0;
  const canDo = (s, posId, date, block, { ignoreRemaining = false } = {}) => {
    const p = posById.get(posId);
    if (!p || !win(posId, date).has(block)) return false;
    if (!ignoreRemaining && (remaining.get(`${date}|${posId}`) || 0) <= 0) return false;
    if (!ignoreRemaining && !halfHasRoom(p, date, block)) return false;
    if (p.gender_restriction && p.gender_restriction !== s.gender) return false;
    if (!isFullTime(s) && fullTimeOnly.has(posId)) return false;
    // 內勤的人只做內勤（和印訂單），不排別的工作（2026-11-28 Cynthia）
    if (officePos && mains(s).includes(officePos.id) && posId !== officePos.id && posId !== printer?.id) return false;
    const lv = level(s.id, posId);
    if (lv < 2) return false;
    if (lv === 2 && !someoneLevel3At(date, posId, block)) return false;
    return true;
  };
  const assign = (s, date, block, posId) => {
    cell(date, s.id).set(block, posId);
    occAdd(s, date, block, posId, 1);
    remaining.set(`${date}|${posId}`, (remaining.get(`${date}|${posId}`) || 0) - 1);
    weekBlocks.set(s.id, weekBlocks.get(s.id) + 1);
  };
  // 這格還能排的崗位裡，最「缺人」的：剩下的格數除以這格還有空、會做的人數（無包裝出貨、箱出貨這種會做的人少的崗位先補）
  const urgency = (posId, date, block) => {
    const left = remaining.get(`${date}|${posId}`) || 0;
    const p = posById.get(posId);
    const supply = staff.filter(
      (x) =>
        level(x.id, posId) >= 2 &&
        (!p.gender_restriction || p.gender_restriction === x.gender) &&
        (isFullTime(x) || !fullTimeOnly.has(posId)) &&
        !grid.get(`${date}|${x.id}`)?.has(block) &&
        availableBlocks(x, date).includes(block),
    ).length;
    return (left / Math.max(1, supply)) * (boosted.has(posId) ? 100 : 1);
  };
  // 一天裡換到下一個崗位後，不再回到前面做過的崗位（不能出貨 → 箱出貨半小時 → 又回出貨，2026-11-27 Cynthia）；
  // 午休前後做同一個崗位不算。一個人一天最多兩個崗位（印訂單、任務也算，2026-11-27 Cynthia）
  const MAX_POSITIONS_PER_DAY = 2;
  const keepsSequence = (s, date, block, posId) => {
    const mine = new Map(cell(date, s.id));
    mine.set(block, posId);
    const order = [...mine.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
    const runs = order.filter((id, i) => i === 0 || order[i - 1] !== id);
    return new Set(runs).size === runs.length && runs.length <= MAX_POSITIONS_PER_DAY;
  };
  // 這格可以排的崗位，照優先順序：主要崗位（最缺人的先）→ 其他會做的崗位（三級先）
  const positionOptions = (s, date, block, preferred) => {
    const options = (list) => list.filter((id) => canDo(s, id, date, block) && keepsSequence(s, date, block, id)).sort((a, b) => urgency(b, date, block) - urgency(a, date, block));
    const others = options(positions.filter((p) => p.included_in_auto_schedule !== false && !preferred.includes(p.id)).map((p) => p.id));
    return [...options(preferred), ...others.filter((id) => level(s.id, id) === 3), ...others.filter((id) => level(s.id, id) !== 3)];
  };
  const pickPosition = (s, date, block, preferred) => positionOptions(s, date, block, preferred)[0] ?? null;

  // ── 週六輪流：離上次上週六最久的先（從來沒上過的最先）
  const lastSaturday = new Map();
  for (const r of input.pastSchedule || []) {
    if (getWeekdayIndex(r.date) !== 5) continue;
    if ((lastSaturday.get(r.pt_id) || "") < r.date) lastSaturday.set(r.pt_id, r.date);
  }
  const bySaturdayRotation = (a, b) =>
    (lastSaturday.get(a.id) || "").localeCompare(lastSaturday.get(b.id) || "") || a.name.localeCompare(b.name, "zh-Hant");
  const saturday = openDates.find((d) => getWeekdayIndex(d) === 5);
  const fullTimeDayOff = new Map(); // ptId -> date
  let saturdayFullTime = null;
  if (saturday) {
    // 只在會做週六工作的正職裡輪流：週六有時數的崗位（印訂單除外）至少二級，不然整天沒事做（例如只會內勤窗口的人）
    const saturdayWork = positions.filter((p) => p.id !== printer?.id && (cap.get(`${saturday}|${p.id}`) || 0) > 0);
    saturdayFullTime =
      staff
        .filter((s) => isFullTime(s) && s.can_work_saturday && !onLeave(s, saturday))
        .filter((s) => saturdayWork.some((p) => level(s.id, p.id) >= 2))
        .sort(bySaturdayRotation)[0] ?? null;
    // 主要崗位沒有別的正職能代的人（例如只有許庭瑄會內勤窗口），週六上班先不補休，免得那個平日整天沒人（2026-11-27 Cynthia）
    const irreplaceable = (s) =>
      mains(s).some((id) => fullTimeOnly.has(id) && !staff.some((x) => x.id !== s.id && isFullTime(x) && level(x.id, id) >= 2));
    if (saturdayFullTime && irreplaceable(saturdayFullTime)) {
      warnings.push({ type: "day_off", date: saturday, ptId: saturdayFullTime.id, message: `正職 ${saturdayFullTime.name} 輪到週六，主要崗位沒有別的正職能代，這週先不補休` });
    } else if (saturdayFullTime) {
      // 週六上班的正職另外休一個平日：挑時數上限加總最少的平日（一樣少挑比較晚的），出貨優先日不休
      const weekdays = openDates.filter((d) => d !== saturday && !isPriorityShippingDay(d, input.specialDates).isPriority && !onLeave(saturdayFullTime, d));
      const total = (d) => positions.reduce((sum, p) => sum + (cap.get(`${d}|${p.id}`) || 0), 0);
      const off = [...weekdays].sort((a, b) => total(a) - total(b) || (a < b ? 1 : -1))[0];
      if (off) {
        fullTimeDayOff.set(saturdayFullTime.id, off);
        warnings.push({ type: "day_off", date: off, ptId: saturdayFullTime.id, message: `正職 ${saturdayFullTime.name} 輪到週六，系統安排 ${dayLabel(off)} 休假` });
      }
    }
  }

  const driver = driverPos ? staff.find((s) => mains(s).includes(driverPos.id) && !isFullTime(s)) : null;
  const driverFirst = !!driver && mains(driver).some((id) => id !== driverPos.id && level(driver.id, id) === 3);
  const fullTimeWorks = (s, date) => {
    if (onLeave(s, date) || fullTimeDayOff.get(s.id) === date) return false;
    if (date === saturday) return s.id === saturdayFullTime?.id;
    return true;
  };

  // ── 1. 本週任務：指定的人照登記的時段先放進任務崗位（新版還是用舊時段登記，對到新版時間）
  const taskPosByOldName = new Map(positions.filter((p) => p.included_in_auto_schedule === false).map((p) => [p.name, p]));
  for (const req of input.taskRequests || []) {
    const pos = taskPosByOldName.get(req.position_name);
    const times = OLD_SLOT_TIMES[req.slot];
    if (!pos || !times || !openDates.includes(req.date)) {
      warnings.push({ type: "task", date: req.date, message: `${dayLabel(req.date)} ${req.slot}「${req.position_name}」新版還不會排，請手動安排` });
      continue;
    }
    for (const id of req.pt_ids || []) {
      const s = staffById.get(id);
      if (!s) continue;
      const avail = new Set(availableBlocks(s, req.date));
      for (const b of ALL_BLOCKS.filter((b) => b >= toMin(times[0]) && b + BLOCK <= toMin(times[1]))) {
        if (!avail.has(b) || cell(req.date, s.id).has(b) || !win(pos.id, req.date).has(b)) continue;
        assign(s, req.date, b, pos.id);
      }
    }
  }

  // 本週任務放完，PT 一天超過 6 小時的提醒（任務登記是照舊時段登記的，上午、下午都登記就會超過）
  for (const d of openDates) {
    for (const s of staff.filter((x) => !isFullTime(x))) {
      const n = grid.get(`${d}|${s.id}`)?.size || 0;
      if (n > PT_MAX_BLOCKS) {
        warnings.push({ type: "task", date: d, ptId: s.id, message: `${dayLabel(d)} ${s.name} 本週任務排了 ${n / 2} 小時，超過 PT 一天最多 6 小時，請到任務登記調整` });
      }
    }
  }

  // 週六先排，之後週一到週五。每天排完如果有崗位排不滿，把那些崗位調成最優先整天重排一次，
  // 排得比較滿才用（例如優先的人先被排去出貨，無包裝出貨剩 2.5 小時湊不成 3 小時的班）
  const dayOrder = [...openDates].sort((a, b) => (a === saturday ? -1 : b === saturday ? 1 : a < b ? -1 : 1));
  const snapshotDay = (date) => ({
    grid: [...grid].filter(([k]) => k.startsWith(`${date}|`)).map(([k, m]) => [k, new Map(m)]),
    remaining: [...remaining].filter(([k]) => k.startsWith(`${date}|`)),
    weekBlocks: new Map(weekBlocks),
    occ: new Map(occ.get(date) || []),
    occ3: new Map(occ3.get(date) || []),
  });
  const restoreDay = (date, snap) => {
    for (const k of [...grid.keys()]) if (k.startsWith(`${date}|`)) grid.delete(k);
    for (const [k, m] of snap.grid) grid.set(k, new Map(m));
    for (const [k, v] of snap.remaining) remaining.set(k, v);
    for (const [k, v] of snap.weekBlocks) weekBlocks.set(k, v);
    occ.set(date, new Map(snap.occ));
    occ3.set(date, new Map(snap.occ3));
  };
  const shortOf = (date) =>
    positions.filter((p) => p.included_in_auto_schedule !== false && (remaining.get(`${date}|${p.id}`) || 0) > 0);
  // 「上午、下午都要有人」的崗位某一邊沒人，比缺幾小時嚴重：一邊沒人算 100 格
  const uncoveredHalves = (date) =>
    positions
      .filter((p) => p.included_in_auto_schedule !== false && needsBothHalves(p, date))
      .reduce((n, p) => n + [true, false].filter((m) => halfUsed(p, date, m) === 0).length, 0);
  const shortBlocks = (date) => shortOf(date).reduce((sum, p) => sum + remaining.get(`${date}|${p.id}`), 0) + 100 * uncoveredHalves(date);
  // 一次只調一個崗位分別試（兩個都調等於沒分輕重），再試全部一起調，選缺最少的
  for (const date of dayOrder) {
    const start = snapshotDay(date);
    const run = (boost, spare = false) => {
      restoreDay(date, start);
      boosted = boost;
      spareFragments = spare;
      const dayWarnings = [];
      runDay(date, dayWarnings);
      return { snap: snapshotDay(date), dayWarnings, short: shortBlocks(date), boost };
    };
    let best = run(new Set());
    const short = shortOf(date).map((p) => p.id);
    for (const boost of [...short.map((id) => new Set([id])), ...(short.length > 1 ? [new Set(short)] : [])]) {
      if (best.short === 0) break;
      const attempt = run(boost);
      if (attempt.short < best.short) best = attempt;
    }
    if (best.short > 0) {
      const attempt = run(best.boost, true);
      if (attempt.short < best.short) best = attempt;
    }
    boosted = new Set();
    spareFragments = false;
    restoreDay(date, best.snap);
    warnings.push(...best.dayWarnings);
  }

  function runDay(date, warnings) {
    const fullTimers = staff.filter((s) => isFullTime(s) && fullTimeWorks(s, date));

    // ── 2. 印訂單：內勤先，不行再找會印的正職
    if (printer) {
      const printers = [...fullTimers].sort((a, b) => Number(!mains(b).includes(officePos?.id)) - Number(!mains(a).includes(officePos?.id)) || a.name.localeCompare(b.name, "zh-Hant"));
      for (const b of win(printer.id, date)) {
        const who = printers.find((s) => availableBlocks(s, date).includes(b) && !cell(date, s.id).has(b) && canDo(s, printer.id, date, b));
        if (who) assign(who, date, b, printer.id);
      }
    }

    // ── 3. 正職：主要崗位的時間全部排他，其他時間補還沒滿的崗位
    for (const s of fullTimers) {
      const avail = availableBlocks(s, date);
      for (const posId of mains(s)) {
        for (const b of avail) if (!cell(date, s.id).has(b) && canDo(s, posId, date, b)) assign(s, date, b, posId);
      }
    }
    for (const s of fullTimers) {
      const idle = [];
      for (const b of availableBlocks(s, date)) {
        if (cell(date, s.id).has(b)) continue;
        const posId = positionOptions(s, date, b, mains(s)).find((id) => {
          const left = remaining.get(`${date}|${id}`) - 1;
          return !spareFragments || left === 0 || left >= PT_MIN_BLOCKS;
        });
        if (posId) assign(s, date, b, posId);
        else idle.push(b);
      }
      if (idle.length) {
        warnings.push({ type: "surplus", date, ptId: s.id, message: `${dayLabel(date)} 正職 ${s.name} 有 ${idle.length / 2} 小時沒有工作（${idle.map(fmt).join("、")} 起）` });
      }
    }

    // ── 4、5. PT 照排班順序，車趟的人（平日）最後
    const pts = staff
      .filter((s) => !isFullTime(s) && !onLeave(s, date))
      .filter((s) => (date === saturday ? s.can_work_saturday : s.auto_schedule_weekdays !== false))
      .sort((a, b) => {
        if (date !== saturday && (a.id === driver?.id || b.id === driver?.id)) return (a.id === driver?.id) === driverFirst ? -1 : 1;
        if (date === saturday) return saturdayRank(a) - saturdayRank(b);
        return (
          (ORDER_RANK[a.schedule_order] ?? 1) - (ORDER_RANK[b.schedule_order] ?? 1) ||
          coversOpenHalves(b, date) - coversOpenHalves(a, date) ||
          weekBlocks.get(a.id) - weekBlocks.get(b.id) ||
          a.name.localeCompare(b.name, "zh-Hant")
        );
      });
    // 二級的人要有三級的人在才能排，輪到他時三級的人可能還沒排；排不進去的人等大家排完再試一次（2026-11-28 沈素菁）
    const placeShift = (s, lastTry) => {
      const isDriver = s.id === driver?.id && date !== saturday;
      const weeklyLeft = isDriver ? Infinity : weeklyMaxBlocks(s) - weekBlocks.get(s.id);
      const shift = bestShift(s, date, Math.min(dayMaxBlocks(s), weeklyLeft), isDriver);
      if (!shift) {
        if (isDriver && lastTry) warnings.push({ type: "shortage", date, ptId: s.id, message: `${dayLabel(date)} 車趟的 ${s.name} 排不進去（車趟時間他沒空、車趟沒有設時數，或本週任務加車趟超過 6 小時）` });
        return false;
      }
      if (isDriver && shift.length < PT_MIN_BLOCKS) {
        warnings.push({ type: "surplus", date, ptId: s.id, message: `${dayLabel(date)} 車趟的 ${s.name} 只有 ${shift.length / 2} 小時工作（其他他會做的崗位都排滿了）` });
      }
      for (const [b, posId] of shift) if (!cell(date, s.id).has(b)) assign(s, date, b, posId);
      return true;
    };
    const skipped = pts.filter((s) => !placeShift(s, false));
    for (const s of skipped) placeShift(s, true);

    // ── 6. 零頭時數：已經上班的 PT 延長班來補（新排一個人最少 3 小時，零頭只能這樣補）。
    // 先延長一次再做下面的修補（零頭能用延長補就不用動正職），修補完再延長一次
    function extendPts() {
      for (const s of pts) {
        const isDriver = s.id === driver?.id && date !== saturday;
        const avail = availableBlocks(s, date);
        const mine = cell(date, s.id);
        if (mine.size === 0) continue;
        const weeklyLeft = () => (isDriver ? Infinity : weeklyMaxBlocks(s) - weekBlocks.get(s.id));
        let extended = true;
        while (extended && mine.size < dayMaxBlocks(s) && weeklyLeft() > 0) {
          extended = false;
          const worked = avail.filter((b) => mine.has(b));
          const before = avail[avail.indexOf(worked[0]) - 1];
          const after = avail[avail.indexOf(worked[worked.length - 1]) + 1];
          for (const b of [after, before]) {
            if (b === undefined || !lunchOk([...mine.keys(), b])) continue;
            // 延長後還是半天班的話，只能延長原本的崗位
            const halfDay = [...mine.keys(), b].every((x) => isMorning(x) === isMorning(b));
            const only = !isDriver && halfDay ? new Set(mine.values()) : null;
            const posId = positionOptions(s, date, b, mains(s)).find((id) => !only || (only.size === 1 && only.has(id))) ?? null;
            if (!posId) continue;
            assign(s, date, b, posId);
            extended = true;
            break;
          }
          // 半天班往午休另一邊延長時，一格一格加會違反「午休前後各至少 2 小時」，要一次加 2 小時
          // （例如李玄鳳只排下午 4 小時，早上 10:30-12:30 的出貨還缺人，2026-11-28）
          const side = worked.every((b) => isMorning(b) === isMorning(worked[0])) ? isMorning(worked[0]) : null;
          if (extended || side === null || mine.size + LUNCH_SIDE_MIN_BLOCKS > dayMaxBlocks(s) || weeklyLeft() < LUNCH_SIDE_MIN_BLOCKS) continue;
          const other = avail.filter((b) => isMorning(b) !== side);
          const jump = side ? other.slice(0, LUNCH_SIDE_MIN_BLOCKS) : other.slice(-LUNCH_SIDE_MIN_BLOCKS);
          if (jump.length < LUNCH_SIDE_MIN_BLOCKS || jump.some((b, i) => i > 0 && b - jump[i - 1] !== 30)) continue;
          const added = [];
          for (const b of side ? jump : [...jump].reverse()) {
            const posId = pickPosition(s, date, b, mains(s));
            if (!posId) break;
            assign(s, date, b, posId);
            added.push(b);
          }
          if (added.length === LUNCH_SIDE_MIN_BLOCKS) extended = true;
          else for (const b of added) unassign(s, date, b);
        }
      }
    }
    extendPts();

    // ── 5b. 崗位剩不到 3 小時、PT 排不進去，是因為正職補空檔做掉一點：讓正職讓出來，找還沒上班的 PT 排一個完整的班，
    // 缺的有變少才用（例如正職多半小時去做無包裝，剩 2.5 小時沒人能排，2026-11-28）
    for (const p of positions) {
      const left = remaining.get(`${date}|${p.id}`) || 0;
      // 正職讓出來的時間不能比補到的還多（不要為了補半小時讓正職空 2.5 小時）
      if (p.included_in_auto_schedule === false || left === 0 || left >= PT_MIN_BLOCKS || PT_MIN_BLOCKS - left > left) continue;
      // 正職只讓出湊滿 3 小時需要的格數（從一天最後面讓），不要讓正職整個下午沒事做
      const freed = fullTimers
        .flatMap((s) => (mains(s).includes(p.id) ? [] : [...cell(date, s.id)].filter(([, id]) => id === p.id).map(([b]) => [s, b])))
        .sort((a, b) => b[1] - a[1])
        .slice(0, PT_MIN_BLOCKS - left);
      if (left + freed.length < PT_MIN_BLOCKS) continue;
      const before = shortBlocks(date);
      const snap = snapshotDay(date);
      for (const [s, b] of freed) unassign(s, date, b);
      let placed = false;
      for (const s of pts.filter((x) => x.id !== driver?.id && cell(date, x.id).size === 0)) {
        const weeklyLeft = weeklyMaxBlocks(s) - weekBlocks.get(s.id);
        const shift = bestShift(s, date, Math.min(dayMaxBlocks(s), weeklyLeft), false);
        if (!shift || !shift.some(([, id]) => id === p.id)) continue;
        for (const [b, posId] of shift) assign(s, date, b, posId);
        placed = true;
        break;
      }
      if (!placed || shortBlocks(date) >= before) {
        restoreDay(date, snap);
        continue;
      }
      for (const s of new Set(freed.map(([s]) => s))) {
        const idle = freed.filter(([x]) => x === s).map(([, b]) => b);
        warnings.push({ type: "surplus", date, ptId: s.id, message: `${dayLabel(date)} 正職 ${s.name} 有 ${idle.length / 2} 小時沒有工作（${idle.map(fmt).join("、")} 起，讓給 PT 排完整的班）` });
      }
    }

    // ── 5c. 崗位還差一點、PT 湊不成班時，請會做的正職把一天最後幾格換過來做，之後 PT 延長班補正職讓出來的崗位
    // （例如無包裝出貨要兩個人重疊，正職 16:00 後換去做無包裝，2026-11-28）
    for (const p of positions) {
      let left = remaining.get(`${date}|${p.id}`) || 0;
      if (p.included_in_auto_schedule === false || left === 0) continue;
      for (const s of fullTimers) {
        if (left === 0) break;
        const mine = [...cell(date, s.id)].sort((a, b) => b[0] - a[0]);
        for (const [b, posId] of mine) {
          if (left === 0 || posId === p.id || mains(s).includes(posId) || !win(p.id, date).has(b)) break;
          unassign(s, date, b);
          if (canDo(s, p.id, date, b) && keepsSequence(s, date, b, p.id)) {
            assign(s, date, b, p.id);
            left--;
          } else {
            assign(s, date, b, posId);
            break;
          }
        }
      }
    }

    // ── 5d. 還是差一點：從已經上班的 PT 讓出一些時數，讓還沒上班、會做這個崗位的 PT 排一個 3 小時的班
    // （例如無包裝出貨要兩個人重疊，出貨已經被別人排滿，陳語姍湊不成 3 小時，2026-11-28 Cynthia：PT 把無包裝排滿）
    for (const p of positions) {
      const left = remaining.get(`${date}|${p.id}`) || 0;
      if (p.included_in_auto_schedule === false || left === 0 || left >= PT_MIN_BLOCKS) continue;
      const before = shortBlocks(date);
      // 還沒上班、或只上半天的人（例如陳語姍只排到下午 3 小時無包裝，早上的出貨已經被別人排滿）
      const halfDay = (x) => {
        const bs = [...cell(date, x.id).keys()];
        return bs.length === 0 || bs.every((b) => isMorning(b) === isMorning(bs[0]));
      };
      const idle = pts.filter((x) => x.id !== driver?.id && halfDay(x) && [...win(p.id, date)].some((b) => cell(date, x.id).get(b) === p.id || canDo(x, p.id, date, b)));
      const donors = pts
        .filter((y) => y.id !== driver?.id && cell(date, y.id).size > 0 && !halfDay(y) && [...cell(date, y.id).values()].every((id) => posById.get(id)?.included_in_auto_schedule !== false))
        .sort((a, b) => (ORDER_RANK[b.schedule_order] ?? 1) - (ORDER_RANK[a.schedule_order] ?? 1) || weekBlocks.get(b.id) - weekBlocks.get(a.id));
      let done = false;
      for (const x of idle) {
        for (const y of donors) {
          const snap = snapshotDay(date);
          const saved = boosted;
          boosted = new Set([p.id]);
          const wasWorking = cell(date, x.id).size > 0;
          for (const b of [...cell(date, y.id).keys()]) unassign(y, date, b);
          for (const b of [...cell(date, x.id).keys()]) unassign(x, date, b);
          const xLeft = weeklyMaxBlocks(x) - weekBlocks.get(x.id);
          // 原本沒上班的人只排 3 小時（少拿別人的時數）；原本只上半天的人改排整天
          const xShift = bestShift(x, date, Math.min(wasWorking ? dayMaxBlocks(x) : PT_MIN_BLOCKS, xLeft), false);
          if (xShift?.some(([, id]) => id === p.id)) {
            for (const [b, posId] of xShift) assign(x, date, b, posId);
            const yLeft = weeklyMaxBlocks(y) - weekBlocks.get(y.id);
            const yShift = bestShift(y, date, Math.min(dayMaxBlocks(y), yLeft), false);
            if (yShift) for (const [b, posId] of yShift) assign(y, date, b, posId);
            done = !!yShift && shortBlocks(date) < before;
          }
          boosted = saved;
          if (done) break;
          restoreDay(date, snap);
        }
        if (done) break;
      }
    }

    extendPts();

    // ── 5e. 還是差一點、又沒有空的人：請已經上班、會做的 PT 把班的最後幾格換過來做，讓出來的崗位再由別的 PT 延長補；
    // 缺的有變少才用（例如無包裝要兩個人重疊，黃依婷最後 1.5 小時改做無包裝，李玄鳳延長補出貨，2026-11-28）
    for (const p of positions) {
      if (p.included_in_auto_schedule === false || (remaining.get(`${date}|${p.id}`) || 0) === 0) continue;
      for (const y of pts) {
        let left = remaining.get(`${date}|${p.id}`) || 0;
        const mine = [...cell(date, y.id)].sort((a, b) => b[0] - a[0]);
        if (left === 0 || y.id === driver?.id || mine.length === 0 || mine.every(([b]) => isMorning(b) === isMorning(mine[0][0]))) continue;
        const before = shortBlocks(date);
        const snap = snapshotDay(date);
        for (const [b, posId] of mine) {
          if (left === 0 || posId === p.id || posById.get(posId)?.included_in_auto_schedule === false || !win(p.id, date).has(b)) break;
          unassign(y, date, b);
          if (!canDo(y, p.id, date, b) || !keepsSequence(y, date, b, p.id)) {
            assign(y, date, b, posId);
            break;
          }
          assign(y, date, b, p.id);
          left--;
        }
        extendPts();
        if (shortBlocks(date) >= before) restoreDay(date, snap);
      }
    }

    smoothHandoffs(date);
  }

  // 同一個崗位換人接手時，時間要接在一起，不要中間空半小時又有人來（2026-11-29 Cynthia：無包裝）。
  // 例如兩人重疊做無包裝，一人 15:30 下班、另一人 16:00 才換過來：讓兩個人換崗位的時間各移半小時，每個人時數不變
  function handoffGaps(date, posId) {
    let n = 0;
    for (const half of [true, false]) {
      const c = [...win(posId, date)].filter((b) => isMorning(b) === half).sort((a, b) => a - b).map((b) => occ.get(date)?.get(`${b}|${posId}`) || 0);
      for (let k = 1; k <= Math.max(0, ...c); k++) n += c.filter((v, i) => v >= k && (i === 0 || c[i - 1] < k)).length - 1;
    }
    return n;
  }
  function smoothHandoffs(date) {
    const movable = (s, posId) =>
      posId !== printer?.id && posId !== driverPos?.id && posById.get(posId)?.included_in_auto_schedule !== false && !(isFullTime(s) && mains(s).includes(posId));
    const edges = () =>
      staff.flatMap((s) => {
        const bs = [...cell(date, s.id)].sort((a, b) => a[0] - b[0]);
        const out = [];
        for (let i = 1; i < bs.length; i++) {
          const [b0, a] = bs[i - 1];
          const [b1, c] = bs[i];
          if (a === c || !movable(s, a) || !movable(s, c)) continue;
          out.push({ s, b: b0, from: a, to: c }, { s, b: b1, from: c, to: a });
        }
        return out;
      });
    const stillOk = (date, b, posId) =>
      staff.every((x) => cell(date, x.id).get(b) !== posId || level(x.id, posId) !== 2 || someoneLevel3At(date, posId, b));
    const halvesOk = (p) => !needsBothHalves(p, date) || (halfUsed(p, date, true) > 0 && halfUsed(p, date, false) > 0);
    for (let round = 0; round < 50; round++) {
      let improved = false;
      const es = edges();
      for (const e1 of es) {
        for (const e2 of es) {
          if (e1.s === e2.s || e1.from !== e2.to || e1.to !== e2.from) continue;
          const ids = [e1.from, e1.to];
          const before = ids.reduce((n, id) => n + handoffGaps(date, id), 0);
          if (before === 0) continue;
          const halvesBefore = ids.map((id) => halvesOk(posById.get(id)));
          for (const e of [e1, e2]) {
            unassign(e.s, date, e.b);
            assign(e.s, date, e.b, e.to);
          }
          const ok =
            [e1, e2].every((e) => canDo(e.s, e.to, date, e.b, { ignoreRemaining: true }) && keepsSequence(e.s, date, e.b, e.to) && stillOk(date, e.b, e.from)) &&
            ids.every((id, i) => !halvesBefore[i] || halvesOk(posById.get(id))) &&
            ids.reduce((n, id) => n + handoffGaps(date, id), 0) < before;
          if (ok) {
            improved = true;
            break;
          }
          for (const e of [e1, e2]) {
            unassign(e.s, date, e.b);
            assign(e.s, date, e.b, e.from);
          }
        }
        if (improved) break;
      }
      if (!improved) return;
    }
  }

  // 週六 PT：B組、A組交錯，各組裡離上次上週六最久的先，同樣再照排班順序
  function saturdayRank(s) {
    const group = (g) =>
      staff
        .filter((x) => !isFullTime(x) && x.can_work_saturday && x.saturday_group === g)
        .sort((a, b) => bySaturdayRotation(a, b) || (ORDER_RANK[a.schedule_order] ?? 1) - (ORDER_RANK[b.schedule_order] ?? 1));
    const b = group("多");
    const a = group("少");
    const order = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (b[i]) order.push(b[i].id);
      if (a[i]) order.push(a[i].id);
    }
    const i = order.indexOf(s.id);
    return i === -1 ? 999 : i;
  }

  // 找一段班：在可上班範圍裡、3～6 小時（不含午休）、每一格都排得到工作、包含已經先放好的任務格子；
  // 能排到的時數越多越好，一樣多時主要崗位的格子多的優先，再來挑那段時間同崗位人比較少的（大家上班時間錯開，
  // 有人 9 點、有人 10 點、有人下午，2026-11-27 Cynthia 決議），最後越早開始越好
  // 每週時數不夠排滿每一天的人（例如只有李睿懷會箱出貨），整週調整時可以讓他每天少排一點、多上幾天，
  // 每天不一定一樣長（2026-11-28 Cynthia）
  function dayMaxBlocks(s) {
    if (!extraOff.has(`${s.id}|shorten`)) return PT_MAX_BLOCKS;
    const days = openDates.filter((d) => !onLeave(s, d) && availableBlocks(s, d).length > 0).length;
    return Math.min(PT_MAX_BLOCKS, Math.max(PT_MIN_BLOCKS, Math.floor(weeklyMaxBlocks(s) / Math.max(1, days))));
  }

  // 同一個排班順序裡，會做「上午或下午還沒人」崗位的人先排，不然別人先把出貨排滿，他就沒有工作可以搭配（2026-11-28 箱出貨）
  function coversOpenHalves(s, date) {
    return positions.filter((p) => needsBothHalves(p, date) && level(s.id, p.id) >= 2 && [true, false].some((m) => halfUsed(p, date, m) === 0)).length;
  }

  function bestShift(s, date, maxBlocks, isDriver) {
    const avail = availableBlocks(s, date);
    const minBlocks = isDriver ? 1 : PT_MIN_BLOCKS;
    if (avail.length === 0 || maxBlocks < minBlocks) return null;
    const fixed = cell(date, s.id);
    const fixedBlocks = [...fixed.keys()];
    const driverBlocks = isDriver ? [...win(driverPos.id, date)].filter((b) => avail.includes(b)) : [];
    // 箱出貨上午或下午還沒人時，能補到那一邊的班優先（不然先排的人挑了最長的班，會箱出貨的人反而湊不成班）
    const openHalves = new Set(
      positions
        .filter((p) => needsBothHalves(p, date))
        .flatMap((p) => [true, false].filter((m) => halfUsed(p, date, m) === 0).map((m) => `${p.id}|${m}`)),
    );
    const windows = [];
    for (let i = 0; i < avail.length; i++) {
      for (let j = i + minBlocks - 1; j < avail.length && j - i + 1 <= maxBlocks; j++) windows.push(avail.slice(i, j + 1));
    }
    windows.sort((a, b) => b.length - a.length);
    let best = null;
    for (const blocks of windows) {
      // 每格都要有工作，班的長度就是格數：補到的邊已經最多、又比較短的班不可能贏，不用試
      if (best && best.score[0] >= openHalves.size && blocks.length < best.score[1]) break;
      if (fixedBlocks.some((b) => !blocks.includes(b)) || driverBlocks.some((b) => !blocks.includes(b))) continue;
      if (!lunchOk(blocks)) continue;
      const plan = simulate(s, date, blocks, isDriver);
      if (!plan) continue;
      const halves = new Set(plan.map(([b, id]) => `${id}|${isMorning(b)}`).filter((k) => openHalves.has(k))).size;
      const mainCount = plan.filter(([, id]) => mains(s).includes(id)).length;
      const crowd = plan.reduce((sum, [b, id]) => sum + (occ.get(date)?.get(`${b}|${id}`) || 0), 0);
      const score = [halves, plan.length, mainCount, -crowd, -blocks[0]];
      const k = best ? score.findIndex((v, n) => v !== best.score[n]) : -1;
      if (!best || (k !== -1 && score[k] > best.score[k])) best = { plan, score };
    }
    return best?.plan ?? null;
  }

  function unassign(s, date, b) {
    const posId = cell(date, s.id).get(b);
    cell(date, s.id).delete(b);
    occAdd(s, date, b, posId, -1);
    remaining.set(`${date}|${posId}`, remaining.get(`${date}|${posId}`) + 1);
    weekBlocks.set(s.id, weekBlocks.get(s.id) - 1);
  }

  // 試排一段班：每格挑一個崗位，有任何一格沒工作就不行。挑到後面排不下去時回頭換前面的崗位再試
  // （一天最多兩個崗位、不能跳回，所以只有換崗位的那幾格會分岔）；試完把狀態還原
  function simulate(s, date, blocks, isDriver) {
    const plan = [];
    const fixed = new Set(cell(date, s.id).keys());
    // 只上半天（沒跨午休）的班只做一個崗位（2026-11-28 Cynthia：半天班又分兩個崗位不合理）
    const onePosition = !isDriver && fixed.size === 0 && blocks.every((b) => isMorning(b) === isMorning(blocks[0]));
    let steps = 0;
    const dfs = (i) => {
      if (i === blocks.length) return true;
      if (++steps > 400) return false;
      const b = blocks[i];
      if (cell(date, s.id).has(b)) {
        plan.push([b, cell(date, s.id).get(b)]);
        if (dfs(i + 1)) return true;
        plan.pop();
        return false;
      }
      const options = positionOptions(s, date, b, mains(s));
      if (isDriver && canDo(s, driverPos.id, date, b) && keepsSequence(s, date, b, driverPos.id)) options.unshift(driverPos.id);
      for (const posId of [...new Set(options)]) {
        if (onePosition && plan.length && posId !== plan[0][1]) continue;
        assign(s, date, b, posId);
        plan.push([b, posId]);
        if (dfs(i + 1)) return true;
        plan.pop();
        unassign(s, date, b);
      }
      return false;
    };
    const ok = dfs(0);
    if (ok) for (const [b] of plan) if (!fixed.has(b)) unassign(s, date, b);
    return ok ? plan : null;
  }

  // ── 提醒
  for (const d of openDates) {
    for (const p of positions) {
      const total = cap.get(`${d}|${p.id}`) || 0;
      const left = remaining.get(`${d}|${p.id}`) || 0;
      // 任務崗位只照本週任務排，沒登記任務的日子不算缺
      if (p.included_in_auto_schedule === false) continue;
      if (needsBothHalves(p, d)) {
        for (const morning of [true, false]) {
          if (halfUsed(p, d, morning) === 0) {
            warnings.push({ type: "shortage", date: d, positionId: p.id, message: `${dayLabel(d)} ${p.name} ${morning ? "上午" : "下午"}沒有人（要上午、下午都有人）` });
          }
        }
      }
      if (total > 0 && left > 0) {
        warnings.push({
          type: "shortage",
          date: d,
          positionId: p.id,
          message: `${dayLabel(d)} ${p.name} 還差 ${left / 2} 小時（上限 ${total / 2} 小時，排了 ${(total - left) / 2} 小時）`,
        });
      }
    }
  }
  // 車趟的人天天上班，不跟其他 PT 比
  const ptHours = staff.filter((s) => !isFullTime(s) && s.id !== driver?.id).map((s) => ({ s, h: weekBlocks.get(s.id) / 2 }));
  for (const lo of ptHours) {
    const ahead = ptHours.filter((hi) => (ORDER_RANK[hi.s.schedule_order] ?? 1) < (ORDER_RANK[lo.s.schedule_order] ?? 1) && hi.h < lo.h);
    if (ahead.length === 0) continue;
    const label = (s) => (s.schedule_order === "最後" ? "最後才排" : s.schedule_order || "一般");
    warnings.push({
      type: "order",
      ptId: lo.s.id,
      message: `排班順序：${lo.s.name}（${label(lo.s)}）本週 ${lo.h} 小時，比 ${ahead.map((x) => `${x.s.name}（${label(x.s)}）${x.h} 小時`).join("、")}多`,
    });
  }
  const missingByName = new Map();
  for (const k of missingAvail) {
    const [name, date] = k.split("|");
    missingByName.set(name, [...(missingByName.get(name) || []), date]);
  }
  for (const [name, dates] of missingByName) {
    warnings.push({ type: "missing_availability", message: `${name} 有 ${dates.length} 天沒有登記可上班時間，先當全天可上班：${dates.map(dayLabel).join("、")}` });
  }

  // 輸出：每人每天的工作段落（連續同崗位的格子合併）
  const segments = [];
  for (const [k, blocks] of grid) {
    const [date, ptId] = k.split("|");
    const sorted = [...blocks.entries()].sort((a, b) => a[0] - b[0]);
    for (const [b, posId] of sorted) {
      const last = segments[segments.length - 1];
      if (last && last.date === date && last.pt_id === ptId && last.position_id === posId && toMin(last.end) === b) last.end = fmt(b + BLOCK);
      else segments.push({ date, pt_id: ptId, position_id: posId, start: fmt(b), end: fmt(b + BLOCK) });
    }
  }
  return {
    segments,
    warnings,
    hoursByStaff: Object.fromEntries([...weekBlocks].map(([id, n]) => [id, n / 2])),
    capByDayPosition: Object.fromEntries([...cap].map(([k, n]) => [k, n / 2])),
    filledByDayPosition: Object.fromEntries([...cap].map(([k, n]) => [k, (n - (remaining.get(k) || 0)) / 2])),
    shortBlocks: openDates.reduce((sum, d) => sum + shortBlocks(d), 0),
    // 排班順序差距：排序後面的人比前面的人多出來的時數加總
    orderGap: ptHours.reduce(
      (sum, lo) => sum + ptHours.filter((hi) => (ORDER_RANK[hi.s.schedule_order] ?? 1) < (ORDER_RANK[lo.s.schedule_order] ?? 1)).reduce((a, hi) => a + Math.max(0, lo.h - hi.h), 0),
      0,
    ),
    // 整週調整用：哪天哪個崗位缺、誰那天有空沒排、誰哪天有上班
    shortCells: openDates.flatMap((d) => shortOf(d).map((p) => ({ date: d, positionId: p.id }))),
    idleCapable: (date, posId) =>
      staff.filter((x) => !isFullTime(x) && x.id !== driver?.id && level(x.id, posId) === 3 && !onLeave(x, date) && !grid.get(`${date}|${x.id}`)?.size),
    workDates: (ptId) => openDates.filter((d) => grid.get(`${d}|${ptId}`)?.size),
    // 每週時數快用完、會做這個崗位的人（每天少排一點才可能多上幾天）
    capable: (posId) =>
      staff.filter(
        (x) => !isFullTime(x) && x.id !== driver?.id && level(x.id, posId) === 3 && weekBlocks.get(x.id) > weeklyMaxBlocks(x) - PT_MIN_BLOCKS,
      ),
    saturday,
  };
}

// 整週調整（2026-11-27）：一天一天排時，每週時數有限的人可能在不缺他的日子就把時數用完（例如林清瑞請假那幾天，
// 只剩李睿懷會箱出貨，他卻在週一就排了班）。某天有崗位缺、會做的三級 PT 那天有空卻沒排時，試著讓他每天少排一點，或別天不排、
// 整週重排；缺的時數有變少就用（不缺人優先，排班順序變差會提醒，2026-11-21 Cynthia 決議），
// 缺的一樣多時排班順序有變好才用。最多試 MAX_WEEK_TRIALS 次
const MAX_WEEK_TRIALS = 20;

export function generateHourSchedule(input) {
  let extraDaysOff = new Set();
  let best = scheduleOnce({ ...input, extraDaysOff });
  const tried = new Set();
  for (let trials = 0; trials < MAX_WEEK_TRIALS; trials++) {
    const candidates = best.shortCells.flatMap(({ date, positionId }) =>
      [...best.idleCapable(date, positionId), ...best.capable(positionId)].flatMap((s) => [
        `${s.id}|shorten`,
        ...best.workDates(s.id).filter((d) => d !== date && d !== best.saturday).map((d) => `${s.id}|${d}`),
      ]),
    );
    const key = candidates.find((k) => !tried.has(k) && !extraDaysOff.has(k));
    if (!key) break;
    tried.add(key);
    const attemptOff = new Set([...extraDaysOff, key]);
    const attempt = scheduleOnce({ ...input, extraDaysOff: attemptOff });
    if (attempt.shortBlocks < best.shortBlocks || (attempt.shortBlocks === best.shortBlocks && attempt.orderGap < best.orderGap)) {
      best = attempt;
      extraDaysOff = attemptOff;
    }
  }
  const { segments, warnings, hoursByStaff, capByDayPosition, filledByDayPosition } = best;
  return { segments, warnings, hoursByStaff, capByDayPosition, filledByDayPosition };
}
