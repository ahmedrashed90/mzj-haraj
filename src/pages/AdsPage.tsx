import { useMemo, useState } from "react";
import { CalendarBlank, CheckCircle, ClipboardText, LinkSimple, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { adBranchId, formatDateArabic, getWeekStartKey, isPublished } from "../schedule";
import { AD_STATUS_LABELS, type AdStatus } from "../types";
import { EmptyState, PageTitle } from "../components/Ui";
import { PublishingDayAccordion } from "../components/PublishingDayAccordion";

const statuses: AdStatus[] = ["assigned", "published", "approved", "needs_fix", "closed"];

export function AdsPage() {
  const { accounts, agents, ads, publishingSettings } = useAppData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | AdStatus>("all");
  const [branchId, setBranchId] = useState("all");
  const [agentId, setAgentId] = useState("all");
  const [urlFilter, setUrlFilter] = useState<"all" | "with" | "without">("all");
  const [specs, setSpecs] = useState<"all" | "matched" | "partial" | "missing">("all");
  const [weekFilter, setWeekFilter] = useState<"all" | "current">("all");
  const currentWeek = getWeekStartKey();
  const branchById = useMemo(() => new Map(accounts.map((branch) => [branch.id, branch])), [accounts]);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ads.filter((ad) => {
      if (status !== "all" && ad.status !== status) return false;
      if (branchId !== "all" && adBranchId(ad) !== branchId) return false;
      if (agentId !== "all" && ad.agentId !== agentId) return false;
      if (urlFilter === "with" && !ad.url) return false;
      if (urlFilter === "without" && ad.url) return false;
      if (specs !== "all" && ad.specsStatus !== specs) return false;
      if (weekFilter === "current" && ad.weekStart !== currentWeek) return false;
      if (!needle) return true;
      const bag = `${ad.carName} ${ad.statement} ${ad.modelYear} ${ad.adTitle || ""} ${ad.adText || ""} ${branchById.get(adBranchId(ad))?.name || ""} ${agentById.get(ad.agentId)?.name || ""}`.toLowerCase();
      return bag.includes(needle);
    }).sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || Number(a.publishingPeriodOrder || 0) - Number(b.publishingPeriodOrder || 0) || Number(a.periodAgentSequence || 0) - Number(b.periodAgentSequence || 0));
  }, [ads, status, branchId, agentId, urlFilter, specs, weekFilter, search, currentWeek, branchById, agentById]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    rows.forEach((ad) => {
      const key = ad.scheduledDate || "unscheduled";
      const bucket = map.get(key) || [];
      bucket.push(ad);
      map.set(key, bucket);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a === "unscheduled" ? 1 : b === "unscheduled" ? -1 : a.localeCompare(b));
  }, [rows]);

  const published = rows.filter(isPublished).length;
  const pending = rows.filter((ad) => ad.status === "assigned").length;
  const withoutUrl = rows.filter((ad) => !ad.url && ad.status !== "closed").length;

  return <>
    <PageTitle title="الإعلانات" subtitle="نفس تنظيم جدول النشر: كل يوم في مجموعة مستقلة قابلة للفتح والإغلاق، مع النسخ والحالة والرابط في صف واحد." />

    <section className="schedule-overview ads-overview">
      <article className="schedule-overview-card featured"><div className="overview-icon"><ClipboardText size={24} weight="duotone" /></div><div><span>الإعلانات المعروضة</span><strong>{rows.length}</strong><small>حسب الفلاتر الحالية</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><CheckCircle size={24} weight="duotone" /></div><div><span>تم النشر / معتمد</span><strong>{published}</strong><small>تم استلام رابط النشر أو الاعتماد</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><CalendarBlank size={24} weight="duotone" /></div><div><span>بانتظار النشر</span><strong>{pending}</strong><small>تكليفات مجدولة لم تنشر بعد</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><WarningCircle size={24} weight="duotone" /></div><div><span>بدون رابط حراج</span><strong>{withoutUrl}</strong><small>تحتاج متابعة بعد النشر</small></div></article>
    </section>

    <section className="ads-filter-panel panel">
      <label className="search-box ads-search"><MagnifyingGlass size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالسيارة أو الاسم أو عنوان الإعلان" /></label>
      <div className="ads-filter-selects">
        <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value as typeof weekFilter)}><option value="all">كل الفترات</option><option value="current">الفترة الحالية</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">كل الحالات</option>{statuses.map((item) => <option key={item} value={item}>{AD_STATUS_LABELS[item]}</option>)}</select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="all">كل الفروع</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="all">كل المناديب</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
        <select value={specs} onChange={(e) => setSpecs(e.target.value as typeof specs)}><option value="all">كل حالات CompareKey</option><option value="matched">CompareKey كامل</option><option value="partial">CompareKey جزئي</option><option value="missing">CompareKey غير جاهز</option></select>
        <select value={urlFilter} onChange={(e) => setUrlFilter(e.target.value as typeof urlFilter)}><option value="all">كل الروابط</option><option value="with">برابط حراج</option><option value="without">بدون رابط</option></select>
      </div>
      <div className="ads-account-hint"><LinkSimple size={16} /><span>حساب حراج الحالي:</span><strong>{publishingSettings.accountName || "غير محدد"}</strong></div>
    </section>

    {!rows.length ? <section className="panel"><EmptyState title="لا توجد إعلانات" text="غيّر الفلاتر أو أنشئ جدول نشر من مخزون السيارات." /></section> : <section className="publishing-days-list">{groups.map(([dayKey, dayAds], index) => {
      const unscheduled = dayKey === "unscheduled";
      const dayLabel = unscheduled ? "بدون موعد" : formatDateArabic(dayKey, { weekday: "long" });
      const dateLabel = unscheduled ? "إعلانات لم يحدد لها تاريخ نشر" : formatDateArabic(dayKey, { day: "numeric", month: "long", year: "numeric" });
      return <PublishingDayAccordion
        key={dayKey}
        dayKey={dayKey}
        dayLabel={dayLabel}
        dateLabel={dateLabel}
        ads={dayAds}
        branches={accounts}
        agents={agents}
        publishingSettings={publishingSettings}
        defaultOpen={index === 0}
        allowDelete
        showNotes
      />;
    })}</section>}
  </>;
}
