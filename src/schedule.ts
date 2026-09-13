import type { Agent, HarajAd, PublishingSettings, StockGroup } from "./types";

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
export function isAgentAvailable(agent: Agent) { return Boolean(agent.active && String(agent.accountId || "").trim()); }
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

type BuildInput = {
  vehicles: StockGroup[];
  planStart: string;
  planEnd: string;
  coverageCycle: number;
  settings: PublishingSettings;
  agents: Agent[];
  existingAds: HarajAd[];
  requestedCount?: number;
};

/**
 * One Haraj account for the whole company. The account daily limit is shared by
 * all active reps across every branch. Branch is organization/reporting only.
 * Each unique vehicle group appears at most once in one generated plan.
 */
export function buildPublishingAssignments({ vehicles, planStart, planEnd, coverageCycle, settings, agents, existingAds, requestedCount }: BuildInput) {
  const days = getPlanDays(planStart, planEnd);
  if (!days.length) throw new Error("فترة جدول النشر غير صحيحة.");
  const accountName = String(settings.accountName || "").trim();
  const dailyLimit = Math.max(0, Math.floor(Number(settings.dailyLimit || 0)));
  if (!accountName) throw new Error("اكتب اسم حساب حراج المستخدم حاليًا من صفحة إعداد النشر والمناديب.");
  if (!dailyLimit) throw new Error("حد حساب حراج اليومي يجب أن يكون أكبر من صفر.");

  const activeAgents = agents.filter(isAgentAvailable).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  if (!activeAgents.length) throw new Error("لا يوجد مندوب نشط.");

  const uniqueVehicleMap = new Map<string, StockGroup>();
  vehicles.forEach((row) => { if (row?.key && !uniqueVehicleMap.has(row.key)) uniqueVehicleMap.set(row.key, row); });
  const uniqueVehicles = [...uniqueVehicleMap.values()].sort((a, b) => a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
  if (!uniqueVehicles.length) throw new Error("لا توجد سيارات جديدة متاحة للتكليف.");

  const remainingByDay = new Map<string, number>();
  days.forEach((day) => remainingByDay.set(day.key, Math.max(0, dailyLimit - getPublishingDailyUsage(existingAds, day.key))));
  const totalRemaining = [...remainingByDay.values()].reduce((sum, value) => sum + value, 0);
  const requested = Math.min(
    uniqueVehicles.length,
    totalRemaining,
    Math.max(0, Math.floor(Number(requestedCount ?? uniqueVehicles.length))),
  );
  if (!requested) throw new Error("لا توجد سعة متبقية أو سيارات جديدة لإنشاء الجدول.");

  // Round-robin over days so a partial plan is spread across the period, while
  // never exceeding the single account's daily limit.
  const daySlots: Array<{ key: string; name: string }> = [];
  let round = 0;
  while (daySlots.length < requested) {
    let added = false;
    for (const day of days) {
      const remaining = remainingByDay.get(day.key) || 0;
      if (round < remaining) { daySlots.push(day); added = true; if (daySlots.length >= requested) break; }
    }
    if (!added) break;
    round += 1;
  }
  if (daySlots.length !== requested) throw new Error("تعذر توزيع التكليفات داخل حد حساب حراج اليومي.");

  const periodAds = getPlanAds(existingAds, planStart, planEnd);
  const dayAgentCounts = new Map<string, number>();
  const periodAgentCounts = new Map<string, number>();
  const historyAgentCounts = new Map<string, number>();
  activeAgents.forEach((agent) => {
    periodAgentCounts.set(agent.id, periodAds.filter((ad) => ad.agentId === agent.id).length);
    historyAgentCounts.set(agent.id, existingAds.filter((ad) => ad.agentId === agent.id).length);
  });
  periodAds.forEach((ad) => {
    if (!ad.agentId || !ad.scheduledDate) return;
    const key = `${ad.agentId}:${ad.scheduledDate}`;
    dayAgentCounts.set(key, (dayAgentCounts.get(key) || 0) + 1);
  });

  const weekStart = getWeekStartKey(planStart);
  const planId = `plan-${planStart}-${planEnd}-${Date.now()}`;
  return uniqueVehicles.slice(0, requested).map((vehicle, index): PublishingAssignmentDraft => {
    const day = daySlots[index];
    const chosen = activeAgents.map((agent) => ({
      agent,
      dayUsed: dayAgentCounts.get(`${agent.id}:${day.key}`) || 0,
      planUsed: periodAgentCounts.get(agent.id) || 0,
      historyUsed: historyAgentCounts.get(agent.id) || 0,
    })).sort((a, b) => a.dayUsed - b.dayUsed || a.planUsed - b.planUsed || a.historyUsed - b.historyUsed || a.agent.name.localeCompare(b.agent.name, "ar"))[0];

    const dayAgentKey = `${chosen.agent.id}:${day.key}`;
    dayAgentCounts.set(dayAgentKey, chosen.dayUsed + 1);
    periodAgentCounts.set(chosen.agent.id, chosen.planUsed + 1);
    historyAgentCounts.set(chosen.agent.id, chosen.historyUsed + 1);
    const branchId = String(chosen.agent.accountId || "");

    return {
      vehicleKey: vehicle.key,
      carName: vehicle.carName,
      statement: vehicle.statement,
      modelYear: vehicle.modelYear,
      stockQtySnapshot: vehicle.quantity,
      accountId: branchId, // legacy compatibility: this is branch id, not Haraj account.
      branchId,
      agentId: chosen.agent.id,
      harajAccountName: accountName,
      status: "assigned",
      url: "",
      notes: "",
      weekStart,
      planStart,
      planEnd,
      scheduledDate: day.key,
      coverageCycle,
      planId,
      scheduleOrder: index + 1,
    };
  });
}
