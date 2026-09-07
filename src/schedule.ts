import type { Agent, HarajAccount, HarajAd, StockGroup } from "./types";

const DAY_NAME_BY_JS_INDEX = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const WEEK_DAY_NAMES = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function getWeekStartKey(value: Date | string = new Date()) {
  const date = typeof value === "string" ? parseDateKey(value) : new Date(value);
  date.setHours(12, 0, 0, 0);
  const daysSinceSaturday = (date.getDay() + 1) % 7;
  date.setDate(date.getDate() - daysSinceSaturday);
  return dateKey(date);
}

export function addDaysKey(value: string, amount: number) {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function getWeekEndKey(weekStart: string) {
  return addDaysKey(weekStart, 6);
}

export function getWeekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDaysKey(weekStart, index);
    const date = parseDateKey(key);
    return { name: DAY_NAME_BY_JS_INDEX[date.getDay()], key, index };
  });
}

export function getPlanDays(planStart: string, planEnd: string) {
  const start = parseDateKey(planStart);
  const end = parseDateKey(planEnd);
  if (end < start) return [];

  const rows: Array<{ name: string; key: string; index: number }> = [];
  const cursor = new Date(start);
  let index = 0;
  while (cursor <= end && index < 14) {
    rows.push({ name: DAY_NAME_BY_JS_INDEX[cursor.getDay()], key: dateKey(cursor), index });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }
  return rows;
}

/**
 * MZJ publishing-window rule:
 * - Friday: prepare the next full Saturday -> Friday schedule.
 * - Any other day: prepare from tomorrow -> the coming Friday.
 */
export function getSuggestedPlanWindow(value: Date | string = new Date()) {
  const today = typeof value === "string" ? parseDateKey(value) : new Date(value);
  today.setHours(12, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() + 1);

  const end = new Date(start);
  if (today.getDay() === 5) {
    end.setDate(end.getDate() + 6);
  } else {
    const daysToFriday = (5 - end.getDay() + 7) % 7;
    end.setDate(end.getDate() + daysToFriday);
  }

  const planStart = dateKey(start);
  const planEnd = dateKey(end);
  return {
    planStart,
    planEnd,
    weekStart: getWeekStartKey(planStart),
    isFridayPreparation: today.getDay() === 5,
  };
}

export function formatDateArabic(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  return parseDateKey(value).toLocaleDateString(
    "ar-SA-u-nu-latn",
    options || { day: "numeric", month: "short", year: "numeric" },
  );
}

export function formatWeekRange(weekStart: string) {
  const end = getWeekEndKey(weekStart);
  return `${formatDateArabic(weekStart, { day: "numeric", month: "short" })} - ${formatDateArabic(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function formatPlanRange(planStart: string, planEnd: string) {
  return `من ${formatDateArabic(planStart, { weekday: "long", day: "numeric", month: "short", year: "numeric" })} إلى ${formatDateArabic(planEnd, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}`;
}

export function getCoverageCycle(ad: HarajAd) {
  return Number(ad.coverageCycle || 1);
}

function countsForCoverage(ad: HarajAd) {
  if (ad.status !== "closed") return true;
  return Boolean(String(ad.url || "").trim() || ad.publishedAt);
}

export function currentCoverageCycle(ads: HarajAd[]) {
  const relevant = ads.filter(countsForCoverage);
  return Math.max(1, ...relevant.map(getCoverageCycle));
}

export function getCoverageState(stock: StockGroup[], ads: HarajAd[]) {
  const relevantAds = ads.filter(countsForCoverage);
  const currentCycle = currentCoverageCycle(relevantAds);
  const coveredCurrent = new Set(
    relevantAds
      .filter((ad) => getCoverageCycle(ad) === currentCycle)
      .map((ad) => ad.vehicleKey),
  );
  const eligibleCurrent = stock.filter((row) => !coveredCurrent.has(row.key));

  if (stock.length > 0 && eligibleCurrent.length === 0) {
    return {
      cycle: currentCycle + 1,
      previousCycle: currentCycle,
      startedNewCycle: true,
      coveredKeys: new Set<string>(),
      eligibleRows: [...stock],
      coveredCount: 0,
    };
  }

  return {
    cycle: currentCycle,
    previousCycle: Math.max(1, currentCycle - 1),
    startedNewCycle: false,
    coveredKeys: coveredCurrent,
    eligibleRows: eligibleCurrent,
    coveredCount: stock.length - eligibleCurrent.length,
  };
}

export function isPublished(ad: HarajAd) {
  return Boolean(String(ad.url || "").trim()) || ad.status === "published" || ad.status === "approved";
}

export function isPending(ad: HarajAd) {
  return !isPublished(ad) && ad.status !== "closed";
}

export function isOverdue(ad: HarajAd, today = dateKey(new Date())) {
  return Boolean(ad.scheduledDate && ad.scheduledDate < today && isPending(ad));
}

export function isAgentAvailable(agent: Agent) {
  return Boolean(agent.active);
}

export type PublishingAssignmentDraft = Omit<HarajAd, "id" | "assignedAt" | "updatedAt" | "publishedAt">;

export function getWeekAds(ads: HarajAd[], weekStart: string) {
  return ads.filter((ad) => ad.weekStart === weekStart && ad.status !== "closed");
}

export function getPlanAds(ads: HarajAd[], planStart: string, planEnd: string) {
  return ads.filter((ad) => (
    ad.status !== "closed" &&
    Boolean(ad.scheduledDate) &&
    String(ad.scheduledDate) >= planStart &&
    String(ad.scheduledDate) <= planEnd
  ));
}

export function getAccountDailyUsage(ads: HarajAd[], accountId: string, dayKey: string) {
  return ads.filter((ad) => ad.status !== "closed" && ad.accountId === accountId && ad.scheduledDate === dayKey).length;
}

export function getAccountPlanUsage(ads: HarajAd[], accountId: string, planStart: string, planEnd: string) {
  return getPlanAds(ads, planStart, planEnd).filter((ad) => ad.accountId === accountId).length;
}

export function getAccountPlanCapacity(account: HarajAccount, planStart: string, planEnd: string) {
  return Math.max(0, Number(account.adLimit || 0)) * getPlanDays(planStart, planEnd).length;
}

export function getPlanTotalCapacity(accounts: HarajAccount[], planStart: string, planEnd: string) {
  return accounts
    .filter((account) => account.active)
    .reduce((sum, account) => sum + getAccountPlanCapacity(account, planStart, planEnd), 0);
}

export function getPlanRemainingCapacity(accounts: HarajAccount[], ads: HarajAd[], planStart: string, planEnd: string) {
  return accounts
    .filter((account) => account.active)
    .reduce((sum, account) => {
      const capacity = getAccountPlanCapacity(account, planStart, planEnd);
      const used = getAccountPlanUsage(ads, account.id, planStart, planEnd);
      return sum + Math.max(0, capacity - used);
    }, 0);
}

export function getPlanWindowFromAds(weekAds: HarajAd[], weekStart: string) {
  if (!weekAds.length) return { planStart: weekStart, planEnd: getWeekEndKey(weekStart) };
  const starts = weekAds.map((ad) => ad.planStart || ad.scheduledDate || weekStart).filter(Boolean).sort();
  const ends = weekAds.map((ad) => ad.planEnd || ad.scheduledDate || getWeekEndKey(weekStart)).filter(Boolean).sort();
  return {
    planStart: starts[0] || weekStart,
    planEnd: ends[ends.length - 1] || getWeekEndKey(weekStart),
  };
}

type BuildPublishingAssignmentsInput = {
  vehicles: StockGroup[];
  planStart: string;
  planEnd: string;
  coverageCycle: number;
  accounts: HarajAccount[];
  agents: Agent[];
  existingAds: HarajAd[];
};

type BranchDaySlot = {
  account: HarajAccount;
  day: { name: string; key: string; index: number };
  slotIndex: number;
};

function buildBranchDaySlots(
  accounts: HarajAccount[],
  days: Array<{ name: string; key: string; index: number }>,
  existingAds: HarajAd[],
  requested: number,
) {
  const remainingByPair = new Map<string, number>();
  let maxRemaining = 0;

  days.forEach((day) => {
    accounts.forEach((account) => {
      const dailyLimit = Math.max(0, Number(account.adLimit || 0));
      const used = getAccountDailyUsage(existingAds, account.id, day.key);
      const remaining = Math.max(0, dailyLimit - used);
      remainingByPair.set(`${account.id}:${day.key}`, remaining);
      maxRemaining = Math.max(maxRemaining, remaining);
    });
  });

  const slots: BranchDaySlot[] = [];
  for (let round = 0; round < maxRemaining && slots.length < requested; round += 1) {
    for (const day of days) {
      for (const account of accounts) {
        const remaining = remainingByPair.get(`${account.id}:${day.key}`) || 0;
        if (round >= remaining) continue;
        slots.push({ account, day, slotIndex: round });
        if (slots.length >= requested) return slots;
      }
    }
  }
  return slots;
}

/**
 * Creates the publishing draft from DAILY branch limits.
 * Example: a branch limit of 10 for a 4-day plan produces up to 40 tasks.
 * Every branch task stays inside the same branch and only active branch reps are used.
 */
export function buildPublishingAssignments({
  vehicles,
  planStart,
  planEnd,
  coverageCycle,
  accounts,
  agents,
  existingAds,
}: BuildPublishingAssignmentsInput) {
  const weekStart = getWeekStartKey(planStart);
  const days = getPlanDays(planStart, planEnd);
  if (!days.length) throw new Error("فترة جدول النشر غير صحيحة.");

  const activeAccounts = accounts
    .filter((account) => account.active && Number(account.adLimit || 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const activeAgents = agents.filter(isAgentAvailable).sort((a, b) => a.name.localeCompare(b.name, "ar"));

  if (!activeAccounts.length) throw new Error("لا يوجد فرع/حساب حراج نشط بحد يومي أكبر من صفر.");
  if (!activeAgents.length) throw new Error("لا يوجد مندوب نشط.");
  if (!vehicles.length) throw new Error("اختر سيارة واحدة على الأقل.");

  const periodAds = getPlanAds(existingAds, planStart, planEnd);
  const accountAgents = new Map<string, Agent[]>();
  activeAccounts.forEach((account) => {
    accountAgents.set(account.id, activeAgents.filter((agent) => agent.accountId === account.id));
  });

  const branchesWithoutAgents = activeAccounts.filter((account) => {
    const remaining = getAccountPlanCapacity(account, planStart, planEnd) - getAccountPlanUsage(existingAds, account.id, planStart, planEnd);
    return remaining > 0 && !(accountAgents.get(account.id) || []).length;
  });
  if (branchesWithoutAgents.length) {
    throw new Error(`يوجد حد نشر يومي بدون مندوب نشط داخل نفس الفرع: ${branchesWithoutAgents.map((item) => item.name).join("، ")}.`);
  }

  const remainingCapacity = getPlanRemainingCapacity(activeAccounts, existingAds, planStart, planEnd);
  if (vehicles.length > remainingCapacity) {
    throw new Error(`عدد السيارات المختارة (${vehicles.length}) أكبر من السعة المتبقية للفترة (${remainingCapacity}).`);
  }

  const slots = buildBranchDaySlots(activeAccounts, days, existingAds, vehicles.length);
  if (slots.length !== vehicles.length) {
    throw new Error("تعذر توزيع كل السيارات على الحدود اليومية الحالية للفروع.");
  }

  const planAgentCounts = new Map<string, number>();
  const historyAgentCounts = new Map<string, number>();
  const agentDayCounts = new Map<string, number>();

  activeAgents.forEach((agent) => {
    planAgentCounts.set(agent.id, periodAds.filter((ad) => ad.agentId === agent.id).length);
    historyAgentCounts.set(agent.id, existingAds.filter((ad) => ad.agentId === agent.id).length);
  });
  periodAds.forEach((ad) => {
    if (!ad.agentId || !ad.scheduledDate) return;
    const key = `${ad.agentId}:${ad.scheduledDate}`;
    agentDayCounts.set(key, (agentDayCounts.get(key) || 0) + 1);
  });

  const planId = `plan-${planStart}-${planEnd}-${Date.now()}`;
  const drafts: PublishingAssignmentDraft[] = [];

  vehicles.forEach((vehicle, index) => {
    const slot = slots[index];
    const branchAgents = accountAgents.get(slot.account.id) || [];

    const agentChoice = branchAgents
      .map((agent) => ({
        agent,
        dayUsed: agentDayCounts.get(`${agent.id}:${slot.day.key}`) || 0,
        planUsed: planAgentCounts.get(agent.id) || 0,
        historyUsed: historyAgentCounts.get(agent.id) || 0,
      }))
      .sort(
        (a, b) =>
          a.dayUsed - b.dayUsed ||
          a.planUsed - b.planUsed ||
          a.historyUsed - b.historyUsed ||
          a.agent.name.localeCompare(b.agent.name, "ar"),
      )[0];

    if (!agentChoice) throw new Error(`لا يوجد مندوب نشط داخل فرع ${slot.account.name}.`);

    const dayAgentKey = `${agentChoice.agent.id}:${slot.day.key}`;
    agentDayCounts.set(dayAgentKey, agentChoice.dayUsed + 1);
    planAgentCounts.set(agentChoice.agent.id, agentChoice.planUsed + 1);
    historyAgentCounts.set(agentChoice.agent.id, agentChoice.historyUsed + 1);

    drafts.push({
      vehicleKey: vehicle.key,
      carName: vehicle.carName,
      statement: vehicle.statement,
      modelYear: vehicle.modelYear,
      stockQtySnapshot: vehicle.quantity,
      accountId: slot.account.id,
      agentId: agentChoice.agent.id,
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
    });
  });

  return drafts;
}
