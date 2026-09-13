import type { Agent, HarajAccount, HarajAd, PublishingSettings, StockGroup } from "./types";

const DAY_NAME_BY_JS_INDEX = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const WEEK_DAY_NAMES = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"] as const;

function pad(value: number) { return String(value).padStart(2, "0"); }
export function dateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
export function getWeekStartKey(value: Date | string = new Date()) {
  const date = typeof value === "string" ? parseDateKey(value) : new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  return dateKey(date);
}
export function addDaysKey(value: string, amount: number) { const d = parseDateKey(value); d.setDate(d.getDate() + amount); return dateKey(d); }
export function getWeekEndKey(weekStart: string) { return addDaysKey(weekStart, 6); }
export function getWeekDays(weekStart: string) { return Array.from({ length: 7 }, (_, index) => { const key = addDaysKey(weekStart, index); const d = parseDateKey(key); return { name: DAY_NAME_BY_JS_INDEX[d.getDay()], key, index }; }); }
export function getPlanDays(planStart: string, planEnd: string) {
  const start = parseDateKey(planStart); const end = parseDateKey(planEnd);
  if (end < start) return [];
  const rows: Array<{ name: string; key: string; index: number }> = [];
  const cursor = new Date(start); let index = 0;
  while (cursor <= end && index < 14) { rows.push({ name: DAY_NAME_BY_JS_INDEX[cursor.getDay()], key: dateKey(cursor), index }); cursor.setDate(cursor.getDate() + 1); index += 1; }
  return rows;
}

/** Friday -> next Saturday-Friday. Any other day -> tomorrow-coming Friday. */
export function getSuggestedPlanWindow(value: Date | string = new Date()) {
  const today = typeof value === "string" ? parseDateKey(value) : new Date(value);
  today.setHours(12, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() + 1);
  const end = new Date(start);
  if (today.getDay() === 5) end.setDate(end.getDate() + 6);
  else end.setDate(end.getDate() + ((5 - end.getDay() + 7) % 7));
  const planStart = dateKey(start); const planEnd = dateKey(end);
  return { planStart, planEnd, weekStart: getWeekStartKey(planStart), isFridayPreparation: today.getDay() === 5 };
}

export function formatDateArabic(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  return parseDateKey(value).toLocaleDateString("ar-SA-u-nu-latn", options || { day: "numeric", month: "short", year: "numeric" });
}
export function formatWeekRange(weekStart: string) { return `${formatDateArabic(weekStart, { day: "numeric", month: "short" })} - ${formatDateArabic(getWeekEndKey(weekStart), { day: "numeric", month: "short", year: "numeric" })}`; }
export function formatPlanRange(planStart: string, planEnd: string) { return `من ${formatDateArabic(planStart, { weekday: "long", day: "numeric", month: "short", year: "numeric" })} إلى ${formatDateArabic(planEnd, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}`; }

function countsForCoverage(ad: HarajAd) { return ad.status !== "closed" || Boolean(String(ad.url || "").trim() || ad.publishedAt); }
export function getCoverageCycle(ad: HarajAd) { return Number(ad.coverageCycle || 1); }
export function currentCoverageCycle(ads: HarajAd[]) { const relevant = ads.filter(countsForCoverage); return Math.max(1, ...relevant.map(getCoverageCycle)); }
export function getCoverageState(stock: StockGroup[], ads: HarajAd[]) {
  const relevant = ads.filter(countsForCoverage);
  const current = currentCoverageCycle(relevant);
  const covered = new Set(relevant.filter((ad) => getCoverageCycle(ad) === current).map((ad) => ad.vehicleKey));
  const eligible = stock.filter((row) => !covered.has(row.key));
  if (stock.length && !eligible.length) return { cycle: current + 1, previousCycle: current, startedNewCycle: true, coveredKeys: new Set<string>(), eligibleRows: [...stock], coveredCount: 0 };
  return { cycle: current, previousCycle: Math.max(1, current - 1), startedNewCycle: false, coveredKeys: covered, eligibleRows: eligible, coveredCount: stock.length - eligible.length };
}

export function isPublished(ad: HarajAd) { return Boolean(String(ad.url || "").trim()) || ad.status === "published" || ad.status === "approved"; }
export function isPending(ad: HarajAd) { return !isPublished(ad) && ad.status !== "closed"; }
export function isOverdue(ad: HarajAd, today = dateKey(new Date())) { return Boolean(ad.scheduledDate && ad.scheduledDate < today && isPending(ad)); }
export function isAgentAvailable(agent: Agent, activeBranchIds?: Set<string>) {
  const branchId = String(agent.accountId || "").trim();
  return Boolean(agent.active && branchId && (!activeBranchIds || activeBranchIds.has(branchId)));
}
export function adBranchId(ad: HarajAd) { return String(ad.branchId || ad.accountId || ""); }

export type PublishingAssignmentDraft = Omit<HarajAd, "id" | "assignedAt" | "updatedAt" | "publishedAt">;
export function getWeekAds(ads: HarajAd[], weekStart: string) { return ads.filter((ad) => ad.weekStart === weekStart && ad.status !== "closed"); }
export function getPlanAds(ads: HarajAd[], planStart: string, planEnd: string) { return ads.filter((ad) => ad.status !== "closed" && Boolean(ad.scheduledDate) && String(ad.scheduledDate) >= planStart && String(ad.scheduledDate) <= planEnd); }
export function getPublishingDailyUsage(ads: HarajAd[], dayKey: string) { return ads.filter((ad) => ad.status !== "closed" && ad.scheduledDate === dayKey).length; }
export function getPublishingPlanUsage(ads: HarajAd[], planStart: string, planEnd: string) { return getPlanAds(ads, planStart, planEnd).length; }
export function getPublishingPlanCapacity(settings: PublishingSettings, planStart: string, planEnd: string) { return Math.max(0, Math.floor(Number(settings.dailyLimit || 0))) * getPlanDays(planStart, planEnd).length; }
export function getPublishingRemainingCapacity(settings: PublishingSettings, ads: HarajAd[], planStart: string, planEnd: string) { return Math.max(0, getPublishingPlanCapacity(settings, planStart, planEnd) - getPublishingPlanUsage(ads, planStart, planEnd)); }
export function getPlanWindowFromAds(weekAds: HarajAd[], weekStart: string) {
  if (!weekAds.length) return { planStart: weekStart, planEnd: getWeekEndKey(weekStart) };
  const starts = weekAds.map((ad) => ad.planStart || ad.scheduledDate || weekStart).filter(Boolean).sort();
  const ends = weekAds.map((ad) => ad.planEnd || ad.scheduledDate || getWeekEndKey(weekStart)).filter(Boolean).sort();
  return { planStart: starts[0] || weekStart, planEnd: ends[ends.length - 1] || getWeekEndKey(weekStart) };
}

type BranchPool = {
  branch: HarajAccount;
  agents: Agent[];
};

type BuildInput = {
  vehicles: StockGroup[];
  planStart: string;
  planEnd: string;
  coverageCycle: number;
  settings: PublishingSettings;
  branches: HarajAccount[];
  agents: Agent[];
  existingAds: HarajAd[];
  requestedCount?: number;
};

function buildBranchPools(branches: HarajAccount[], agents: Agent[]) {
  const activeBranches = branches.filter((branch) => branch.active !== false).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const activeBranchIds = new Set(activeBranches.map((branch) => branch.id));
  const eligibleAgents = agents.filter((agent) => isAgentAvailable(agent, activeBranchIds));
  return activeBranches
    .map((branch): BranchPool => ({
      branch,
      agents: eligibleAgents.filter((agent) => agent.accountId === branch.id).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    }))
    .filter((pool) => pool.agents.length > 0);
}

/**
 * Split a daily total between branches according to the number of active reps
 * in every branch. The remainder rotates by day so the same branch does not
 * always receive the extra slot when fractions are tied.
 */
function weightedBranchTargets(total: number, pools: BranchPool[], daySeed: number) {
  const target = new Map<string, number>();
  pools.forEach((pool) => target.set(pool.branch.id, 0));
  if (total <= 0 || !pools.length) return target;

  const totalWeight = pools.reduce((sum, pool) => sum + pool.agents.length, 0);
  if (!totalWeight) return target;

  const rows = pools.map((pool, index) => {
    const exact = (total * pool.agents.length) / totalWeight;
    const base = Math.floor(exact);
    target.set(pool.branch.id, base);
    return { pool, index, fraction: exact - base };
  });

  let left = total - [...target.values()].reduce((sum, value) => sum + value, 0);
  const rotatedRank = (index: number) => (index - (daySeed % Math.max(1, pools.length)) + pools.length) % pools.length;
  rows.sort((a, b) => b.fraction - a.fraction || rotatedRank(a.index) - rotatedRank(b.index) || a.pool.branch.name.localeCompare(b.pool.branch.name, "ar"));
  let cursor = 0;
  while (left > 0 && rows.length) {
    const row = rows[cursor % rows.length];
    target.set(row.pool.branch.id, (target.get(row.pool.branch.id) || 0) + 1);
    left -= 1;
    cursor += 1;
  }
  return target;
}

function makeBranchSlots(
  dayKey: string,
  dayIndex: number,
  addCount: number,
  pools: BranchPool[],
  existingAds: HarajAd[],
  periodBranchCounts: Map<string, number>,
  historyBranchCounts: Map<string, number>,
) {
  if (addCount <= 0) return [] as string[];
  const currentDayRows = existingAds.filter((ad) => ad.status !== "closed" && ad.scheduledDate === dayKey);
  const existingByBranch = new Map<string, number>();
  currentDayRows.forEach((ad) => {
    const branchId = adBranchId(ad);
    if (branchId) existingByBranch.set(branchId, (existingByBranch.get(branchId) || 0) + 1);
  });

  const activeExistingTotal = pools.reduce((sum, pool) => sum + (existingByBranch.get(pool.branch.id) || 0), 0);
  const finalActiveTotal = activeExistingTotal + addCount;
  const finalTargets = weightedBranchTargets(finalActiveTotal, pools, dayIndex);
  const quotas = new Map<string, number>();
  pools.forEach((pool) => {
    const existing = existingByBranch.get(pool.branch.id) || 0;
    quotas.set(pool.branch.id, Math.max(0, (finalTargets.get(pool.branch.id) || 0) - existing));
  });

  let assigned = [...quotas.values()].reduce((sum, value) => sum + value, 0);
  // Existing rows may already be above their proportional target. Any remaining
  // new slots are given to the least-loaded branch per active rep.
  while (assigned < addCount) {
    const chosen = pools.map((pool) => {
      const id = pool.branch.id;
      const dayUsed = (existingByBranch.get(id) || 0) + (quotas.get(id) || 0);
      const periodUsed = (periodBranchCounts.get(id) || 0) + (quotas.get(id) || 0);
      const historyUsed = historyBranchCounts.get(id) || 0;
      return {
        pool,
        dayLoad: dayUsed / pool.agents.length,
        periodLoad: periodUsed / pool.agents.length,
        historyLoad: historyUsed / pool.agents.length,
      };
    }).sort((a, b) => a.dayLoad - b.dayLoad || a.periodLoad - b.periodLoad || a.historyLoad - b.historyLoad || a.pool.branch.name.localeCompare(b.pool.branch.name, "ar"))[0];
    quotas.set(chosen.pool.branch.id, (quotas.get(chosen.pool.branch.id) || 0) + 1);
    assigned += 1;
  }

  // Interleave branch slots instead of placing one whole branch block first.
  const slots: string[] = [];
  const remaining = new Map(quotas);
  let cursor = dayIndex % Math.max(1, pools.length);
  while (slots.length < addCount) {
    let added = false;
    for (let step = 0; step < pools.length; step += 1) {
      const pool = pools[(cursor + step) % pools.length];
      const left = remaining.get(pool.branch.id) || 0;
      if (left <= 0) continue;
      slots.push(pool.branch.id);
      remaining.set(pool.branch.id, left - 1);
      added = true;
      if (slots.length >= addCount) break;
    }
    if (!added) break;
    cursor = (cursor + 1) % Math.max(1, pools.length);
  }
  return slots;
}

/**
 * Publishing model v1.8:
 * - One Haraj account owns the company daily publishing limit.
 * - Every day is filled up to that limit before moving to the next day.
 * - The day's ads are split between active branches according to the number of
 *   active reps in each branch.
 * - Each branch share is then balanced between reps of that branch only.
 * - A vehicle group is never repeated inside the generated plan.
 */
export function buildPublishingAssignments({ vehicles, planStart, planEnd, coverageCycle, settings, branches, agents, existingAds, requestedCount }: BuildInput) {
  const days = getPlanDays(planStart, planEnd);
  if (!days.length) throw new Error("فترة جدول النشر غير صحيحة.");
  const accountName = String(settings.accountName || "").trim();
  const dailyLimit = Math.max(0, Math.floor(Number(settings.dailyLimit || 0)));
  if (!accountName) throw new Error("اكتب اسم حساب حراج المستخدم حاليًا من صفحة إعداد النشر والمناديب.");
  if (!dailyLimit) throw new Error("حد حساب حراج اليومي يجب أن يكون أكبر من صفر.");

  const branchPools = buildBranchPools(branches, agents);
  if (!branchPools.length) throw new Error("لا يوجد فرع نشط به مناديب نشطون للتوزيع.");
  const activeAgents = branchPools.flatMap((pool) => pool.agents);

  const uniqueVehicleMap = new Map<string, StockGroup>();
  vehicles.forEach((row) => { if (row?.key && !uniqueVehicleMap.has(row.key)) uniqueVehicleMap.set(row.key, row); });
  const uniqueVehicles = [...uniqueVehicleMap.values()].sort((a, b) => a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
  if (!uniqueVehicles.length) throw new Error("لا توجد سيارات جديدة متاحة للتكليف.");

  const remainingByDay = new Map<string, number>();
  days.forEach((day) => remainingByDay.set(day.key, Math.max(0, dailyLimit - getPublishingDailyUsage(existingAds, day.key))));
  const totalRemaining = [...remainingByDay.values()].reduce((sum, value) => sum + value, 0);
  const requested = Math.min(uniqueVehicles.length, totalRemaining, Math.max(0, Math.floor(Number(requestedCount ?? uniqueVehicles.length))));
  if (!requested) throw new Error("لا توجد سعة متبقية أو سيارات جديدة لإنشاء الجدول.");

  const periodAds = getPlanAds(existingAds, planStart, planEnd);
  const periodBranchCounts = new Map<string, number>();
  const historyBranchCounts = new Map<string, number>();
  const periodAgentCounts = new Map<string, number>();
  const historyAgentCounts = new Map<string, number>();
  const dayAgentCounts = new Map<string, number>();

  branchPools.forEach((pool) => {
    periodBranchCounts.set(pool.branch.id, periodAds.filter((ad) => adBranchId(ad) === pool.branch.id).length);
    historyBranchCounts.set(pool.branch.id, existingAds.filter((ad) => adBranchId(ad) === pool.branch.id).length);
  });
  activeAgents.forEach((agent) => {
    periodAgentCounts.set(agent.id, periodAds.filter((ad) => ad.agentId === agent.id).length);
    historyAgentCounts.set(agent.id, existingAds.filter((ad) => ad.agentId === agent.id).length);
  });
  periodAds.forEach((ad) => {
    if (!ad.agentId || !ad.scheduledDate) return;
    const key = `${ad.agentId}:${ad.scheduledDate}`;
    dayAgentCounts.set(key, (dayAgentCounts.get(key) || 0) + 1);
  });

  // Fill the first publishing day to its remaining daily capacity, then move to
  // the next day. This keeps the meaning of "daily limit" literal.
  const slots: Array<{ day: (typeof days)[number]; branchId: string }> = [];
  let stillNeeded = requested;
  for (const day of days) {
    if (stillNeeded <= 0) break;
    const dayRemaining = remainingByDay.get(day.key) || 0;
    if (dayRemaining <= 0) continue;
    const addCount = Math.min(stillNeeded, dayRemaining);
    const branchSlots = makeBranchSlots(day.key, day.index, addCount, branchPools, existingAds, periodBranchCounts, historyBranchCounts);
    if (branchSlots.length !== addCount) throw new Error(`تعذر توزيع إعلانات ${day.name} على الفروع.`);
    branchSlots.forEach((branchId) => slots.push({ day, branchId }));
    branchSlots.forEach((branchId) => periodBranchCounts.set(branchId, (periodBranchCounts.get(branchId) || 0) + 1));
    stillNeeded -= addCount;
  }
  if (slots.length !== requested) throw new Error("تعذر توزيع التكليفات داخل حد حساب حراج اليومي.");

  const poolByBranch = new Map(branchPools.map((pool) => [pool.branch.id, pool]));
  const weekStart = getWeekStartKey(planStart);
  const planId = `plan-${planStart}-${planEnd}-${Date.now()}`;

  return uniqueVehicles.slice(0, requested).map((vehicle, index): PublishingAssignmentDraft => {
    const slot = slots[index];
    const pool = poolByBranch.get(slot.branchId);
    if (!pool) throw new Error("تعذر تحديد فرع التكليف.");

    const chosen = pool.agents.map((agent) => ({
      agent,
      dayUsed: dayAgentCounts.get(`${agent.id}:${slot.day.key}`) || 0,
      planUsed: periodAgentCounts.get(agent.id) || 0,
      historyUsed: historyAgentCounts.get(agent.id) || 0,
    })).sort((a, b) => a.dayUsed - b.dayUsed || a.planUsed - b.planUsed || a.historyUsed - b.historyUsed || a.agent.name.localeCompare(b.agent.name, "ar"))[0];

    const dayAgentKey = `${chosen.agent.id}:${slot.day.key}`;
    dayAgentCounts.set(dayAgentKey, chosen.dayUsed + 1);
    periodAgentCounts.set(chosen.agent.id, chosen.planUsed + 1);
    historyAgentCounts.set(chosen.agent.id, chosen.historyUsed + 1);

    return {
      vehicleKey: vehicle.key,
      carName: vehicle.carName,
      statement: vehicle.statement,
      modelYear: vehicle.modelYear,
      stockQtySnapshot: vehicle.quantity,
      accountId: slot.branchId,
      branchId: slot.branchId,
      agentId: chosen.agent.id,
      harajAccountName: accountName,
      status: "assigned",
      url: "",
      notes: "",
      weekStart,
      planStart,
      planEnd,
      scheduledDate: slot.day.key,
      coverageCycle,
      planId,
      scheduleOrder: index + 1,
    };
  });
}
