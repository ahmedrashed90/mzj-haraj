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
    .map((vehicle) => ({ ...vehicle, quantity: Math.floor(vehicle.quantity) }));
  // Spread different vehicle/trim/year combinations across each day before taking another unit.
  rows.sort((a, b) => {
    const usedA = usedCountByVehicle.get(a.key) || 0;
    const usedB = usedCountByVehicle.get(b.key) || 0;
    return usedA - usedB || a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar");
  });
  const requested = Math.max(0, Math.floor(wanted));
  const selections: OpenSooqCandidate[] = [];
  const indexes = rows.map(() => 1);
  while (selections.length < requested) {
    let progressed = false;
    for (let i = 0; i < rows.length && selections.length < requested; i++) {
      const vehicle = rows[i];
      let index = indexes[i];
      while (index <= vehicle.quantity && used.has(`${vehicle.key}:${index}`)) index++;
      indexes[i] = index + 1;
      if (index > vehicle.quantity) continue;
      const unitKey = `${vehicle.key}:${index}`;
      selections.push({ unitKey, stockKey: vehicle.key, unitIndex: index, carName: vehicle.carName,
        statement: vehicle.statement, modelYear: vehicle.modelYear, price: Number(vehicle.price) > 0 ? Number(vehicle.price) : 0 });
      used.add(unitKey);
      progressed = true;
    }
    if (!progressed) break;
  }
  return selections;
}

export function buildOpenSooqSchedule(
  days: Array<{ key: string; name: string }>, dailyTarget: number, available: number,
  vehicles: PricedOpenSooqVehicle[], usedUnitKeys: string[], phone: string,
): OpenSooqScheduleRow[] {
  const maxCount = Math.min(Math.max(0, Math.floor(available)), days.length * Math.max(0, Math.floor(dailyTarget)));
  const candidates = selectOpenSooqVehicles(vehicles, usedUnitKeys, maxCount);
  let cursor = 0;
  const scheduled: OpenSooqScheduleRow[] = [];
  for (const day of days) {
    for (let sequence = 1; sequence <= dailyTarget && cursor < candidates.length; sequence++) {
      const selected = candidates[cursor++];
      scheduled.push({ id: selected.unitKey, stockKey: selected.stockKey, unitIndex: selected.unitIndex,
        carName: selected.carName, statement: selected.statement, modelYear: selected.modelYear,
        scheduledDate: day.key, order: sequence, price: selected.price, phone, status: "scheduled" });
    }
  }
  return assignOpenSooqBranches(scheduled);
}

export function getOpenSooqPriceForStock(stock: StockGroup, siteCars: WebsiteCarData[], matcher: (stock: StockGroup, cars: WebsiteCarData[]) => WebsiteCarData | null) {
  const match = matcher(stock, siteCars);
  return match && Number.isFinite(match.price) && match.price > 0 ? match.price : 0;
}
