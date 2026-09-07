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

/**
 * MZJ publishing week is Saturday -> Friday.
 * The returned key is always the Saturday that owns the supplied date.
 */
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

export function getSuggestedPlanWindow(value: Date | string = new Date()) {
  const today = typeof value === "string" ? parseDateKey(value) : new Date(value);
  today.setHours(12, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() + 1);

  const end = new Date(start);
  if (today.getDay() === 5) {
    // Every Friday: prepare the new full week, Saturday -> Friday.
    end.setDate(end.getDate() + 6);
  } else {
    // Initial/current short plan: tomorrow -> the coming Friday.
    const daysToFriday = (5 - end.getDay() + 7) % 7;
    end.setDate(end.getDate() + daysToFriday);
  }

  const planStart = dateKey(start);
  const planEnd = dateKey(end);
  return { planStart, planEnd, weekStart: getWeekStartKey(planStart) };
}

export function formatDateArabic(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  return parseDateKey(value).toLocaleDateString("ar-SA-u-nu-latn", options || { day: "numeric", month: "short", year: "numeric" });
}

export function formatWeekRange(weekStart: string) {
  const end = getWeekEndKey(weekStart);
  return `${formatDateArabic(weekStart, { day: "numeric", month: "short" })} - ${formatDateArabic(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function formatPlanRange(planStart: string, planEnd: string) {
  return `${formatDateArabic(planStart, { weekday: "long", day: "numeric", month: "short" })} - ${formatDateArabic(planEnd, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}`;
}

export function getCoverageCycle(ad: HarajAd) {
  return Number(ad.coverageCycle || 1);
}

export function currentCoverageCycle(ads: HarajAd[]) {
  return Math.max(1, ...ads.map(getCoverageCycle));
}

export function getCoverageState(stock: StockGroup[], ads: HarajAd[]) {
  const currentCycle = currentCoverageCycle(ads);
  const coveredCurrent = new Set(ads.filter((ad) => getCoverageCycle(ad) === currentCycle).map((ad) => ad.vehicleKey));
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

export type WeeklyAssignmentDraft = Omit<HarajAd, "id" | "assignedAt" | "updatedAt" | "publishedAt">;

type BuildWeeklyAssignmentsInput = {
  vehicles: StockGroup[];
  planStart: string;
  planEnd: string;
  coverageCycle: number;
  accounts: HarajAccount[];
  agents: Agent[];
  existingAds: HarajAd[];
};

export function getWeekAds(ads: HarajAd[], weekStart: string) {
  return ads.filter((ad) => ad.weekStart === weekStart && ad.status !== "closed");
}

export function getAccountWeeklyUsage(ads: HarajAd[], accountId: string, weekStart: string) {
  return getWeekAds(ads, weekStart).filter((ad) => ad.accountId === accountId).length;
}

export function getAgentWeeklyUsage(ads: HarajAd[], agentId: string, weekStart: string) {
  return getWeekAds(ads, weekStart).filter((ad) => ad.agentId === agentId).length;
}

export function getWeekRemainingCapacity(accounts: HarajAccount[], ads: HarajAd[], weekStart: string) {
  return accounts.filter((account) => account.active).reduce((sum, account) => {
    const used = getAccountWeeklyUsage(ads, account.id, weekStart);
    return sum + Math.max(0, Number(account.adLimit || 0) - used);
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

export function buildWeeklyAssignments({ vehicles, planStart, planEnd, coverageCycle, accounts, agents, existingAds }: BuildWeeklyAssignmentsInput) {
  const weekStart = getWeekStartKey(planStart);
  const days = getPlanDays(planStart, planEnd);
  if (!days.length) throw new Error("فترة جدول النشر غير صحيحة.");

  const activeAccounts = accounts.filter((account) => account.active && Number(account.adLimit || 0) > 0);
  const activeAgents = agents.filter(isAgentAvailable).sort((a, b) => a.name.localeCompare(b.name, "ar"));

  if (!activeAccounts.length) throw new Error("لا يوجد فرع/حساب حراج نشط بحد إعلانات أكبر من صفر.");
  if (!activeAgents.length) throw new Error("لا يوجد مندوب نشط.");
  if (!vehicles.length) throw new Error("اختر سيارة واحدة على الأقل.");

  const weekAds = getWeekAds(existingAds, weekStart);
  const accountCounts = new Map<string, number>();
  activeAccounts.forEach((account) => accountCounts.set(account.id, weekAds.filter((ad) => ad.accountId === account.id).length));

  const accountAgents = new Map<string, Agent[]>();
  activeAccounts.forEach((account) => {
    accountAgents.set(account.id, activeAgents.filter((agent) => agent.accountId === account.id));
  });

  const branchesWithoutAgents = activeAccounts.filter((account) => {
    const remaining = Number(account.adLimit || 0) - (accountCounts.get(account.id) || 0);
    return remaining > 0 && !(accountAgents.get(account.id) || []).length;
  });
  if (branchesWithoutAgents.length) {
    throw new Error(`اربط مندوبًا نشطًا على الأقل بالفروع التالية قبل إنشاء الجدول: ${branchesWithoutAgents.map((item) => item.name).join("، ")}.`);
  }

  const weekAgentCounts = new Map<string, number>();
  const historyAgentCounts = new Map<string, number>();
  const agentDayCounts = new Map<string, number>();
  activeAgents.forEach((agent) => {
    weekAgentCounts.set(agent.id, weekAds.filter((ad) => ad.agentId === agent.id).length);
    historyAgentCounts.set(agent.id, existingAds.filter((ad) => ad.agentId === agent.id && ad.status !== "closed").length);
  });

  const dayCounts = new Map<string, number>();
  days.forEach((day) => dayCounts.set(day.key, weekAds.filter((ad) => ad.scheduledDate === day.key).length));
  weekAds.forEach((ad) => {
    if (ad.agentId && ad.scheduledDate) {
      const key = `${ad.agentId}:${ad.scheduledDate}`;
      agentDayCounts.set(key, (agentDayCounts.get(key) || 0) + 1);
    }
  });

  const remainingCapacity = activeAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.adLimit || 0) - (accountCounts.get(account.id) || 0)), 0);
  if (vehicles.length > remainingCapacity) {
    throw new Error(`عدد السيارات المختارة (${vehicles.length}) أكبر من السعة المتبقية للفروع في هذا الأسبوع (${remainingCapacity}).`);
  }

  const planId = `week-${weekStart}-${Date.now()}`;
  const drafts: WeeklyAssignmentDraft[] = [];

  vehicles.forEach((vehicle, index) => {
    const accountChoice = activeAccounts
      .map((account) => {
        const used = accountCounts.get(account.id) || 0;
        const limit = Number(account.adLimit || 0);
        return { account, used, limit, ratio: limit > 0 ? used / limit : 1 };
      })
      .filter((item) => item.used < item.limit)
      .sort((a, b) => a.ratio - b.ratio || a.used - b.used || a.account.name.localeCompare(b.account.name, "ar"))[0];

    if (!accountChoice) throw new Error("انتهت السعة المتاحة في الفروع أثناء إنشاء الجدول.");

    const branchAgents = accountAgents.get(accountChoice.account.id) || [];
    const agentChoice = branchAgents
      .map((agent) => ({
        agent,
        weekUsed: weekAgentCounts.get(agent.id) || 0,
        historyUsed: historyAgentCounts.get(agent.id) || 0,
      }))
      .sort((a, b) => a.weekUsed - b.weekUsed || a.historyUsed - b.historyUsed || a.agent.name.localeCompare(b.agent.name, "ar"))[0];

    if (!agentChoice) throw new Error(`لا يوجد مندوب نشط داخل فرع ${accountChoice.account.name}.`);

    const dayChoice = days
      .map((day) => ({
        day,
        agentDay: agentDayCounts.get(`${agentChoice.agent.id}:${day.key}`) || 0,
        total: dayCounts.get(day.key) || 0,
      }))
      .sort((a, b) => a.agentDay - b.agentDay || a.total - b.total || a.day.index - b.day.index)[0];

    if (!dayChoice) throw new Error("تعذر تحديد يوم النشر.");

    accountCounts.set(accountChoice.account.id, accountChoice.used + 1);
    weekAgentCounts.set(agentChoice.agent.id, agentChoice.weekUsed + 1);
    historyAgentCounts.set(agentChoice.agent.id, agentChoice.historyUsed + 1);
    dayCounts.set(dayChoice.day.key, dayChoice.total + 1);
    const pairKey = `${agentChoice.agent.id}:${dayChoice.day.key}`;
    agentDayCounts.set(pairKey, dayChoice.agentDay + 1);

    drafts.push({
      vehicleKey: vehicle.key,
      carName: vehicle.carName,
      statement: vehicle.statement,
      modelYear: vehicle.modelYear,
      stockQtySnapshot: vehicle.quantity,
      accountId: accountChoice.account.id,
      agentId: agentChoice.agent.id,
      status: "assigned",
      url: "",
      notes: "",
      weekStart,
      planStart,
      planEnd,
      scheduledDate: dayChoice.day.key,
      coverageCycle,
      planId,
      scheduleOrder: index + 1,
    });
  });

  return drafts;
}
