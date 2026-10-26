import type { OpenSooqAssignment, OpenSooqBranchId, OpenSooqMonth, OpenSooqScheduleRow, StockGroup, WebsiteCarData } from "./types";

const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

function pad(number: number) { return String(number).padStart(2, "0"); }
export function openSooqDateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
export function openSooqMonthKey(date: Date) { return openSooqDateKey(date).slice(0, 7); }
function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
export function openSooqShiftDate(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return openSooqDateKey(date);
}
export function openSooqSaturday(key: string) {
  const day = dateFromKey(key).getDay();
  return openSooqShiftDate(key, -((day + 1) % 7));
}
export function openSooqMonthEnd(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return openSooqDateKey(new Date(year, month, 0, 12));
}
export function openSooqWeekId(monthKey: string, saturday: string) { return `${monthKey}_${saturday}`; }
export function getOpenSooqRemaining(month: Pick<OpenSooqMonth, "monthlyLimit" | "activeCount" | "reservedCount">) {
  return Math.max(0, month.monthlyLimit - month.activeCount - month.reservedCount);
}

/** A week runs Saturday through Thursday, excludes Fridays, and cannot cross a billing month. */
export function getOpenSooqPlanDays(monthKey: string, saturday: string, todayKey: string) {
  const start = [saturday, `${monthKey}-01`, todayKey].sort().at(-1)!;
  const end = [openSooqShiftDate(saturday, 5), openSooqMonthEnd(monthKey)].sort()[0];
  if (end < start) return [];
  const result: Array<{ key: string; name: string }> = [];
  for (let cursor = start; cursor <= end; cursor = openSooqShiftDate(cursor, 1)) {
    const day = dateFromKey(cursor).getDay();
    if (day !== 5) result.push({ key: cursor, name: DAY_NAMES[day] });
  }
  return result;
}

export const OPEN_SOOQ_BRANCHES = [
  { id: "showroom", name: "الصالة" },
  { id: "qadisiyah", name: "القادسية" },
] as const;
export function openSooqBranchName(branchId: OpenSooqBranchId) {
  return OPEN_SOOQ_BRANCHES.find((branch) => branch.id === branchId)?.name || "غير محدد";
}

/** Stable, day-by-day 50/50 allocation. For odd days the showroom receives the extra row. */
export function assignOpenSooqBranches(rows: OpenSooqScheduleRow[]): OpenSooqScheduleRow[] {
  const byDay = new Map<string, Array<{ row: OpenSooqScheduleRow; index: number }>>();
  rows.forEach((row, index) => {
    const day = byDay.get(row.scheduledDate) || [];
    day.push({ row, index });
    byDay.set(row.scheduledDate, day);
  });
  const assigned = [...rows];
  for (const entries of byDay.values()) {
    entries.sort((a, b) => a.row.order - b.row.order || a.index - b.index);
    entries.forEach(({ row, index }, position) => {
      assigned[index] = { ...row, branchId: row.branchId === "showroom" || row.branchId === "qadisiyah"
        ? row.branchId : position % 2 === 0 ? "showroom" : "qadisiyah" };
    });
  }
  return assigned;
}

export function mergeOpenSooqAssignments(rows: OpenSooqScheduleRow[], assignments: OpenSooqAssignment[]): OpenSooqScheduleRow[] {
  const byId = new Map(assignments.map((row) => [row.id, row]));
  return assignOpenSooqBranches(rows).map((row) => {
    const assigned = byId.get(row.id);
    return assigned && assigned.branchId === row.branchId
      ? { ...row, price: assigned.price, status: assigned.status, publishedAt: assigned.publishedAt }
      : row;
  });
}

export type PricedOpenSooqVehicle = StockGroup & { price: number };
export type OpenSooqCandidate = {
  unitKey: string;
  stockKey: string;
  unitIndex: number;
  carName: string;
  statement: string;
  modelYear: string;
  price: number;
  stockSource?: "next_erp";
};

/** Every quantity unit receives its own scheduling row; different trims are never merged. */
export function selectOpenSooqVehicles(
  vehicles: PricedOpenSooqVehicle[], usedUnitKeys: string[], wanted: number,
): OpenSooqCandidate[] {
  const used = new Set(usedUnitKeys);
  const usedCountByVehicle = new Map<string, number>();
  for (const key of usedUnitKeys) {
    const stockKey = key.slice(0, key.lastIndexOf(":"));
    usedCountByVehicle.set(stockKey, (usedCountByVehicle.get(stockKey) || 0) + 1);
  }
  const rows = vehicles
    .filter((v) => v.key && v.carName && Number.isFinite(v.quantity) && v.quantity >= 1)
    .map((vehicle) => {
      const quantity = Math.floor(vehicle.quantity);
      const unitKeys = vehicle.stockSource === "next_erp"
        ? (vehicle.unitKeys || []).filter((key) => key.startsWith(`${vehicle.key}:`)).slice(0, quantity)
        : Array.from({ length: quantity }, (_, i) => `${vehicle.key}:${i + 1}`);
      return { ...vehicle, unitKeys };
    });
  // Spread different type/class/model variants fairly before consuming another VIN.
  rows.sort((a, b) => {
    const usedA = usedCountByVehicle.get(a.key) || 0;
    const usedB = usedCountByVehicle.get(b.key) || 0;
    return usedA - usedB || a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar");
  });
  const requested = Math.max(0, Math.floor(wanted));
  const selections: OpenSooqCandidate[] = [];
  const indexes = rows.map(() => 0);
  while (selections.length < requested) {
    let progressed = false;
    for (let i = 0; i < rows.length && selections.length < requested; i++) {
      const vehicle = rows[i];
      let index = indexes[i];
      while (index < vehicle.unitKeys.length && used.has(vehicle.unitKeys[index])) index++;
      indexes[i] = index + 1;
      if (index >= vehicle.unitKeys.length) continue;
      const unitKey = vehicle.unitKeys[index];
      selections.push({ unitKey, stockKey: vehicle.key, unitIndex: index + 1, carName: vehicle.carName,
        statement: vehicle.statement, modelYear: vehicle.modelYear, price: Number(vehicle.price) > 0 ? Number(vehicle.price) : 0,
        ...(vehicle.stockSource ? { stockSource: vehicle.stockSource } : {}) });
      used.add(unitKey);
      progressed = true;
    }
    if (!progressed) break;
  }
  return selections;
}

export function openSooqVariantIdentity(value: Pick<OpenSooqScheduleRow, "carName" | "statement" | "modelYear">) {
  return [value.carName, value.statement, value.modelYear]
    .map((field) => String(field || "").normalize("NFKC").toLocaleLowerCase("ar-SA")
      .replace(/[\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/\s+/g, " ").trim()).join("|");
}

/**
 * Assign at most ONE listing for each car + class + model per publishing day.
 * Additional available VINs of the same variant are spread across later days.
 * If there are too few distinct variants, leave slots empty instead of duplicates.
 */
export function buildOpenSooqSchedule(
  days: Array<{ key: string; name: string }>, dailyTarget: number, available: number,
  vehicles: PricedOpenSooqVehicle[], usedUnitKeys: string[], phone: string,
  blockedRows: Pick<OpenSooqScheduleRow, "scheduledDate" | "carName" | "statement" | "modelYear">[] = [],
): OpenSooqScheduleRow[] {
  const target = Math.max(0, Math.floor(dailyTarget));
  const quota = Math.min(Math.max(0, Math.floor(available)), days.length * target);
  if (!target || !quota || !days.length) return [];
  const allUnits = selectOpenSooqVehicles(vehicles, usedUnitKeys, vehicles.reduce((sum, row) => sum + Math.max(0, Math.floor(row.quantity || 0)), 0));
  const queues = new Map<string, OpenSooqCandidate[]>();
  const usage = new Map<string, number>();
  const lastDay = new Map<string, number>();
  for (const key of usedUnitKeys) {
    const stockKey = key.slice(0, key.lastIndexOf(":"));
    usage.set(stockKey, (usage.get(stockKey) || 0) + 1);
  }
  for (const unit of allUnits) {
    const queue = queues.get(unit.stockKey) || [];
    queue.push(unit);
    queues.set(unit.stockKey, queue);
  }
  const scheduled: OpenSooqScheduleRow[] = [];
  for (let dayIndex = 0; dayIndex < days.length && scheduled.length < quota; dayIndex++) {
    const day = days[dayIndex];
    const blockedVariants = new Set(blockedRows.filter((row) => row.scheduledDate === day.key).map(openSooqVariantIdentity));
    const candidates = [...queues.entries()].filter(([, queue]) => queue.length > 0
      && !blockedVariants.has(openSooqVariantIdentity(queue[0])));
    candidates.sort(([keyA, rowsA], [keyB, rowsB]) =>
      (usage.get(keyA) || 0) - (usage.get(keyB) || 0)
      || (lastDay.get(keyA) ?? -1) - (lastDay.get(keyB) ?? -1)
      || rowsA[0].carName.localeCompare(rowsB[0].carName, "ar")
      || rowsA[0].statement.localeCompare(rowsB[0].statement, "ar")
      || rowsA[0].modelYear.localeCompare(rowsB[0].modelYear, "ar")
      || keyA.localeCompare(keyB));
    const count = Math.min(target, quota - scheduled.length, candidates.length);
    for (let position = 0; position < count; position++) {
      const [stockKey, queue] = candidates[position];
      const selected = queue.shift()!;
      scheduled.push({ id: selected.unitKey, stockKey, unitIndex: selected.unitIndex,
        ...(selected.stockSource ? { stockSource: selected.stockSource } : {}), carName: selected.carName, statement: selected.statement, modelYear: selected.modelYear,
        scheduledDate: day.key, order: position + 1, price: selected.price, phone, status: "scheduled" });
      usage.set(stockKey, (usage.get(stockKey) || 0) + 1);
      lastDay.set(stockKey, dayIndex);
    }
  }
  return assignOpenSooqBranches(scheduled);
}

/**
 * Prepare replacements for UNPUBLISHED rows in an existing plan.
 * Preserve each row's date, branch, order and unified phone; keep published rows intact.
 * The caller must commit these replacements atomically without reserving quota again.
 */
export function rebuildOpenSooqUnpublishedRows(
  existingRows: OpenSooqScheduleRow[], vehicles: PricedOpenSooqVehicle[], usedUnitKeys: string[],
): OpenSooqScheduleRow[] {
  if (existingRows.some((row) => !row.branchId)) throw new Error("حدد الفرع المسؤول عن كل إعلان قبل تحديث السيارات.");
  const unpublished = existingRows.filter((row) => row.status !== "published");
  if (!unpublished.length) return [...existingRows];
  const replacing = new Set(unpublished.map((row) => row.id));
  const blocked = existingRows.filter((row) => row.status === "published");
  const used = usedUnitKeys.filter((key) => !replacing.has(key));
  const replacements = new Map<string, OpenSooqScheduleRow>();
  const dates = [...new Set(unpublished.map((row) => row.scheduledDate))].sort();
  for (const date of dates) {
    const oldRows = unpublished.filter((row) => row.scheduledDate === date).sort((a, b) => a.order - b.order);
    const picked = buildOpenSooqSchedule([{ key: date, name: date }], oldRows.length, oldRows.length,
      vehicles, used, oldRows[0].phone, blocked);
    if (picked.length !== oldRows.length) {
      throw new Error(`لا توجد ${oldRows.length} سيارات متنوعة متاحة من NEXT ERP ليوم ${date}. لم يتغير الجدول أو الرصيد.`);
    }
    oldRows.forEach((row, index) => {
      const next = picked[index];
      replacements.set(row.id, { ...next, scheduledDate: row.scheduledDate,
        branchId: row.branchId, order: row.order, phone: row.phone, status: "scheduled" });
      used.push(next.id);
    });
  }
  return existingRows.map((row) => replacements.get(row.id) || row);
}

export function getOpenSooqPriceForStock(stock: StockGroup, siteCars: WebsiteCarData[], matcher: (stock: StockGroup, cars: WebsiteCarData[]) => WebsiteCarData | null) {
  const match = matcher(stock, siteCars);
  return match && Number.isFinite(match.price) && match.price > 0 ? match.price : 0;
}
