import type { Agent, HarajAccount, HarajAd, StockGroup } from "./types";

export const WEEK_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

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
  date.setDate(date.getDate() - date.getDay());
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
  return WEEK_DAY_NAMES.map((name, index) => ({
    name,
    key: addDaysKey(weekStart, index),
    index,
  }));
}

export function formatDateArabic(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  return parseDateKey(value).toLocaleDateString("ar-SA-u-nu-latn", options || { day: "numeric", month: "short", year: "numeric" });
}

export function formatWeekRange(weekStart: string) {
  const end = getWeekEndKey(weekStart);
  return `${formatDateArabic(weekStart, { day: "numeric", month: "short" })} — ${formatDateArabic(end, { day: "numeric", month: "short", year: "numeric" })}`;
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

export type WeeklyAssignmentDraft = Omit<HarajAd, "id" | "assignedAt" | "updatedAt" | "publishedAt">;

type BuildWeeklyAssignmentsInput = {
  vehicles: StockGroup[];
  weekStart: string;
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

export function buildWeeklyAssignments({ vehicles, weekStart, coverageCycle, accounts, agents, existingAds }: BuildWeeklyAssignmentsInput) {
  const activeAccounts = accounts.filter((account) => account.active && Number(account.adLimit || 0) > 0);
  const activeAgents = agents.filter((agent) => agent.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));

  if (!activeAccounts.length) throw new Error("لا يوجد حساب حراج نشط بحد إعلانات أكبر من صفر.");
  if (!activeAgents.length) throw new Error("لا يوجد مندوب نشط.");
  if (!vehicles.length) throw new Error("اختر سيارة واحدة على الأقل.");

  const weekAds = getWeekAds(existingAds, weekStart);
  const accountCounts = new Map<string, number>();
  activeAccounts.forEach((account) => accountCounts.set(account.id, weekAds.filter((ad) => ad.accountId === account.id).length));

  const agentCounts = new Map<string, number>();
  const agentDayCounts = new Map<string, number>();
  activeAgents.forEach((agent) => agentCounts.set(agent.id, weekAds.filter((ad) => ad.agentId === agent.id).length));

  const days = getWeekDays(weekStart);
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
    throw new Error(`عدد السيارات المختارة (${vehicles.length}) أكبر من السعة المتبقية لهذا الأسبوع (${remainingCapacity}).`);
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

    if (!accountChoice) throw new Error("انتهت السعة المتاحة في حسابات حراج أثناء إنشاء الجدول.");

    const agentChoice = activeAgents
      .map((agent) => ({ agent, used: agentCounts.get(agent.id) || 0 }))
      .sort((a, b) => a.used - b.used || a.agent.name.localeCompare(b.agent.name, "ar"))[0];

    if (!agentChoice) throw new Error("لا يوجد مندوب متاح للتوزيع.");

    const dayChoice = days
      .map((day) => ({
        day,
        agentDay: agentDayCounts.get(`${agentChoice.agent.id}:${day.key}`) || 0,
        total: dayCounts.get(day.key) || 0,
      }))
      .sort((a, b) => a.agentDay - b.agentDay || a.total - b.total || a.day.index - b.day.index)[0];

    if (!dayChoice) throw new Error("تعذر تحديد يوم النشر.");

    accountCounts.set(accountChoice.account.id, accountChoice.used + 1);
    agentCounts.set(agentChoice.agent.id, agentChoice.used + 1);
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
      scheduledDate: dayChoice.day.key,
      coverageCycle,
      planId,
      scheduleOrder: index + 1,
    });
  });

  return drafts;
}
