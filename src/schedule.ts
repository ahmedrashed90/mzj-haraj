import type { Agent, HarajAccount, HarajAd, PublishingPeriod, PublishingSettings, StockGroup } from "./types";
import { getBranchAdvertiserName } from "./branch-advertiser";

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

/** Automatic schedule: start today and continue through the coming Friday. */
export function getAutomaticPlanWindow(value: Date | string = new Date()) {
  const today = typeof value === "string" ? parseDateKey(value) : new Date(value);
  today.setHours(12, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + ((5 - today.getDay() + 7) % 7));
  const planStart = dateKey(today);
  const planEnd = dateKey(end);
  return { planStart, planEnd, weekStart: getWeekStartKey(planStart), isFridayPreparation: today.getDay() === 5 };
}

export function formatDateArabic(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  return parseDateKey(value).toLocaleDateString("ar-SA-u-nu-latn", options || { day: "numeric", month: "short", year: "numeric" });
}
export function formatWeekRange(weekStart: string) { return `${formatDateArabic(weekStart, { day: "numeric", month: "short" })} - ${formatDateArabic(getWeekEndKey(weekStart), { day: "numeric", month: "short", year: "numeric" })}`; }
export function formatPlanRange(planStart: string, planEnd: string) { return `من ${formatDateArabic(planStart, { weekday: "long", day: "numeric", month: "short", year: "numeric" })} إلى ${formatDateArabic(planEnd, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}`; }
export function formatPublishingPeriod(period: Pick<PublishingPeriod, "name" | "startTime" | "endTime">) {
  const time = [period.startTime, period.endTime].filter(Boolean).join(" - ");
  return time ? `${period.name} · ${time}` : period.name;
}

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

export function activePublishingPeriods(periods: PublishingPeriod[]) {
  return periods
    .filter((period) => period.active !== false)
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name, "ar"));
}

function orderedActiveContactAgents(periods: PublishingPeriod[], agents: Agent[]) {
  const available = agents.filter((agent) => Boolean(agent.active));
  const availableById = new Map(available.map((agent) => [agent.id, agent]));
  const seen = new Set<string>();
  const ordered: Agent[] = [];
  activePublishingPeriods(periods).forEach((period) => {
    period.agentIds.forEach((id) => {
      const agent = availableById.get(id);
      if (!agent || seen.has(agent.id)) return;
      seen.add(agent.id);
      ordered.push(agent);
    });
  });
  available.forEach((agent) => {
    if (seen.has(agent.id)) return;
    seen.add(agent.id);
    ordered.push(agent);
  });
  return ordered;
}

function rotateAgents<T>(rows: T[], offset: number) {
  if (rows.length < 2) return [...rows];
  const normalized = ((offset % rows.length) + rows.length) % rows.length;
  return [...rows.slice(normalized), ...rows.slice(0, normalized)];
}

export function validatePublishingPeriods(periods: PublishingPeriod[], settings: PublishingSettings, agents: Agent[], branches: HarajAccount[]) {
  const dailyLimit = Math.max(0, Math.floor(Number(settings.dailyLimit || 0)));
  const active = activePublishingPeriods(periods);
  if (!active.length) return "أضف فترة نشر نشطة واحدة على الأقل من إعداد النشر والمناديب.";
  if (!dailyLimit) return "حد حساب حراج اليومي يجب أن يكون أكبر من صفر.";
  for (const period of active) {
    if (!String(period.name || "").trim()) return "يوجد فترة نشر بدون اسم.";
    if (!period.startTime || !period.endTime || period.startTime >= period.endTime) return `راجع وقت البداية والنهاية لفترة «${period.name}».`;
  }

  const activeBranchIds = new Set(branches.filter((branch) => branch.active !== false).map((branch) => branch.id));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  for (const period of active) {
    const available = period.agentIds.map((id) => agentById.get(id)).filter((agent): agent is Agent => Boolean(agent && isAgentAvailable(agent, activeBranchIds)));
    if (!available.length) return `فترة «${period.name}» لا تحتوي على مندوب نشط داخل فرع نشط.`;
  }
  const activeContacts = orderedActiveContactAgents(periods, agents);
  if (!activeContacts.length) return "لا يوجد مندوب نشط ببيانات تواصل صالحة لإضافتها داخل الإعلانات.";
  const missingContact = activeContacts.filter((agent) => !String(agent.name || "").trim() || !String(agent.phone || "").trim());
  if (missingContact.length) return `بيانات التواصل ناقصة للمناديب النشطين: ${missingContact.map((agent) => agent.name || agent.id).join("، ")}.`;
  return "";
}

type BuildInput = {
  vehicles: StockGroup[];
  planStart: string;
  planEnd: string;
  coverageCycle: number;
  settings: PublishingSettings;
  periods: PublishingPeriod[];
  branches: HarajAccount[];
  agents: Agent[];
  existingAds: HarajAd[];
  requestedCount?: number;
};

type VehicleTarget = { vehicle: StockGroup; coverageCycle: number };
type PublishingSlot = {
  day: ReturnType<typeof getPlanDays>[number];
  period: PublishingPeriod;
  agent: Agent;
  periodAgentSequence: number;
};

function buildVehicleTargets(vehicles: StockGroup[], existingAds: HarajAd[], startCycle: number, requested: number): VehicleTarget[] {
  const uniqueMap = new Map<string, StockGroup>();
  vehicles.forEach((row) => { if (row?.key && !uniqueMap.has(row.key)) uniqueMap.set(row.key, row); });
  const pool = [...uniqueMap.values()].sort((a, b) => a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
  if (!pool.length || requested <= 0) return [];

  const result: VehicleTarget[] = [];
  let cycle = Math.max(1, Math.floor(Number(startCycle || 1)));
  const usedByCycle = new Map<number, Set<string>>();
  let guard = 0;
  while (result.length < requested && guard < requested * Math.max(2, pool.length + 1)) {
    guard += 1;
    if (!usedByCycle.has(cycle)) {
      const covered = new Set(existingAds.filter((ad) => countsForCoverage(ad) && getCoverageCycle(ad) === cycle).map((ad) => ad.vehicleKey));
      usedByCycle.set(cycle, covered);
    }
    const used = usedByCycle.get(cycle)!;
    const remaining = pool.filter((vehicle) => !used.has(vehicle.key));
    if (!remaining.length) { cycle += 1; continue; }
    for (const vehicle of remaining) {
      if (result.length >= requested) break;
      result.push({ vehicle, coverageCycle: cycle });
      used.add(vehicle.key);
    }
  }
  return result;
}

/**
 * Publishing model v1.14:
 * - One Haraj account owns the company daily publishing limit.
 * - That daily limit is the only source of ad quantity: N ads/day means N ads on every publishing day.
 * - Publishing periods define timing and rep order only; they never add an independent ad quota.
 * - The period cursor is continuous across days, so an extra slot is not always given to the first period.
 * - Every period has its own ordered rep list, and its rep cursor is continuous across days/weeks.
 *   Example: 14 reps + 4 ads/day => day 1 uses reps 1-4, day 2 uses 5-8, then 9-12, then 13-14-1-2.
 * - Existing assignments seed the cursors, so generating the remaining capacity continues from the last used period/rep instead of restarting.
 * - The rep's branch is inherited automatically from the rep record; branches do not receive an automatic quota.
 * - A vehicle is never repeated inside the same coverage cycle. After all eligible cars are used, a new cycle starts so the daily limit can keep being filled.
 */
export function buildPublishingAssignments({ vehicles, planStart, planEnd, coverageCycle, settings, periods, branches, agents, existingAds, requestedCount }: BuildInput) {
  const days = getPlanDays(planStart, planEnd);
  if (!days.length) throw new Error("فترة جدول النشر غير صحيحة.");
  const accountName = String(settings.accountName || "").trim();
  const dailyLimit = Math.max(0, Math.floor(Number(settings.dailyLimit || 0)));
  if (!accountName) throw new Error("اكتب اسم حساب حراج المستخدم حاليًا من صفحة إعداد النشر والمناديب.");
  if (!dailyLimit) throw new Error("حد حساب حراج اليومي يجب أن يكون أكبر من صفر.");

  const periodsIssue = validatePublishingPeriods(periods, settings, agents, branches);
  if (periodsIssue) throw new Error(periodsIssue);
  const orderedPeriods = activePublishingPeriods(periods);
  const periodOrderById = new Map(orderedPeriods.map((period, index) => [period.id, index + 1]));
  const activeBranchIds = new Set(branches.filter((branch) => branch.active !== false).map((branch) => branch.id));
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const periodAgents = new Map<string, Agent[]>();
  orderedPeriods.forEach((period) => {
    periodAgents.set(period.id, period.agentIds
      .map((id) => agentById.get(id))
      .filter((agent): agent is Agent => Boolean(agent && isAgentAvailable(agent, activeBranchIds))));
  });
  const contactAgents = orderedActiveContactAgents(periods, agents);
  if (!contactAgents.length) throw new Error("لا يوجد مندوب نشط لإضافته داخل بيانات التواصل في الإعلان.");

  const uniqueVehicleMap = new Map<string, StockGroup>();
  vehicles.forEach((row) => { if (row?.key && !uniqueVehicleMap.has(row.key)) uniqueVehicleMap.set(row.key, row); });
  const uniqueVehicles = [...uniqueVehicleMap.values()].sort((a, b) => a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
  if (!uniqueVehicles.length) throw new Error("لا توجد سيارات مؤهلة بـ CompareKey للتكليف.");

  const remainingByDay = new Map<string, number>();
  days.forEach((day) => remainingByDay.set(day.key, Math.max(0, dailyLimit - getPublishingDailyUsage(existingAds, day.key))));
  const totalRemaining = [...remainingByDay.values()].reduce((sum, value) => sum + value, 0);
  const requested = Math.min(totalRemaining, Math.max(0, Math.floor(Number(requestedCount ?? totalRemaining))));
  if (!requested) throw new Error("لا توجد سعة متبقية لإنشاء الجدول.");

  const vehicleTargets = buildVehicleTargets(uniqueVehicles, existingAds, coverageCycle, requested);
  if (vehicleTargets.length !== requested) throw new Error("تعذر تجهيز دورة تغطية السيارات.");

  const slots: PublishingSlot[] = [];
  let stillNeeded = requested;

  // Keep both the period cursor and every period's rep cursor continuous.
  // This prevents every new day from restarting at period #1 / rep #1.
  const assignmentHistory = existingAds.filter((ad) => Boolean(ad.publishingPeriodId));
  let periodCursor = assignmentHistory.length;
  const periodSequence = new Map<string, number>();
  orderedPeriods.forEach((period) => {
    periodSequence.set(period.id, assignmentHistory.filter((ad) => ad.publishingPeriodId === period.id).length);
  });

  for (const day of days) {
    if (stillNeeded <= 0) break;
    const dayRemaining = remainingByDay.get(day.key) || 0;
    if (dayRemaining <= 0) continue;
    const dayToAdd = Math.min(stillNeeded, dayRemaining);

    for (let offset = 0; offset < dayToAdd; offset += 1) {
      // Quantity comes only from dailyLimit. Periods only provide the publishing time.
      // The cursor keeps moving across days so the next ad continues from where the
      // previous ad stopped instead of starting from the first period every morning.
      const period = orderedPeriods[periodCursor % orderedPeriods.length];
      const agentsInPeriod = periodAgents.get(period.id) || [];
      if (!agentsInPeriod.length) throw new Error(`فترة «${period.name}» لا يوجد بها مندوب متاح.`);
      const sequence = periodSequence.get(period.id) || 0;
      slots.push({
        day,
        period,
        agent: agentsInPeriod[sequence % agentsInPeriod.length],
        periodAgentSequence: sequence + 1,
      });
      periodSequence.set(period.id, sequence + 1);
      periodCursor += 1;
      stillNeeded -= 1;
    }
  }
  if (slots.length !== requested) throw new Error("تعذر توزيع التكليفات على فترات النشر داخل الحد اليومي.");

  const weekStart = getWeekStartKey(planStart);
  const planId = `plan-${planStart}-${planEnd}-${Date.now()}`;
  const existingRotationOffset = getPlanAds(existingAds, planStart, planEnd).length;

  return vehicleTargets.map((target, index): PublishingAssignmentDraft => {
    const vehicle = target.vehicle;
    const slot = slots[index];
    const branchId = String(slot.agent.accountId || "");
    const branch = branchById.get(branchId);
    if (!branch) throw new Error(`المندوب ${slot.agent.name} غير مرتبط بفرع نشط.`);

    return {
      vehicleKey: vehicle.key,
      carName: vehicle.carName,
      statement: vehicle.statement,
      modelYear: vehicle.modelYear,
      stockQtySnapshot: vehicle.quantity,
      accountId: branchId,
      branchId,
      agentId: slot.agent.id,
      agentNameSnapshot: String(slot.agent.name || "").trim(),
      agentPhoneSnapshot: String(slot.agent.phone || "").trim(),
      agentTypeSnapshot: slot.agent.agentType === "installment" ? "installment" : "cash",
      contactAgentsSnapshot: rotateAgents(contactAgents, existingRotationOffset + index).map((agent) => ({
        agentId: agent.id,
        name: String(agent.name || "").trim(),
        phone: String(agent.phone || "").trim(),
      })),
      publishingPeriodId: slot.period.id,
      publishingPeriodName: slot.period.name,
      publishingPeriodStart: slot.period.startTime,
      publishingPeriodEnd: slot.period.endTime,
      publishingPeriodOrder: periodOrderById.get(slot.period.id) || 0,
      periodAgentSequence: slot.periodAgentSequence,
      harajAccountName: accountName,
      advertiserName: getBranchAdvertiserName(branch, accountName),
      status: "assigned",
      url: "",
      notes: "",
      weekStart,
      planStart,
      planEnd,
      scheduledDate: slot.day.key,
      coverageCycle: target.coverageCycle,
      planId,
      scheduleOrder: index + 1,
    };
  });
}
