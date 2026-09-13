import { ArrowClockwise, ArrowSquareOut, CalendarBlank, WarningCircle } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useAppData } from "../AppDataContext";
import { adBranchId, dateKey, formatDateArabic, formatPlanRange, getCoverageState, getPlanWindowFromAds, getPublishingPlanCapacity, getSuggestedPlanWindow, getWeekEndKey, getWeekStartKey, isOverdue, isPublished } from "../schedule";
import { AD_STATUS_LABELS } from "../types";
import { EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function DashboardPage() {
  const { accounts, agents, ads, publishingSettings, stock, stockTotalVehicles, stockError, stockLoading, stockFetchedAt, refreshStock, websiteCars, websiteCarsError, refreshWebsiteCars, dataError } = useAppData();
  const currentWeek = getWeekStartKey(); const today = dateKey(new Date());
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === currentWeek && ad.status !== "closed"), [ads, currentWeek]);
  const suggested = getSuggestedPlanWindow();
  const fallback = suggested.weekStart === currentWeek ? { planStart: suggested.planStart, planEnd: suggested.planEnd } : { planStart: currentWeek, planEnd: getWeekEndKey(currentWeek) };
  const plan = weekAds.length ? getPlanWindowFromAds(weekAds, currentWeek) : fallback;
  const capacity = getPublishingPlanCapacity(publishingSettings, plan.planStart, plan.planEnd);
  const coverage = useMemo(() => getCoverageState(stock, ads), [stock, ads]);
  const published = weekAds.filter(isPublished).length; const pending = weekAds.length - published; const overdue = weekAds.filter((ad) => isOverdue(ad, today)).length;
  const todayAds = weekAds.filter((ad) => ad.scheduledDate === today);
  const branchById = new Map(accounts.map((b) => [b.id, b])); const agentById = new Map(agents.map((a) => [a.id, a]));
  const activeBranchIds = new Set(accounts.filter((branch) => branch.active !== false).map((branch) => branch.id));
  const activeAgentCount = agents.filter((a) => a.active && a.accountId && activeBranchIds.has(a.accountId)).length;
  const recent = useMemo(() => [...ads].sort((a, b) => String(b.updatedAt || b.assignedAt || "").localeCompare(String(a.updatedAt || a.assignedAt || ""))).slice(0, 8), [ads]);
  async function refreshAll() { await Promise.allSettled([refreshStock(), refreshWebsiteCars()]); }

  return <>
    <PageTitle title="لوحة التحكم" subtitle={`متابعة حساب حراج الواحد وخطة ${formatPlanRange(plan.planStart, plan.planEnd)}.`} actions={<button className="secondary-button" onClick={() => void refreshAll()} disabled={stockLoading}><ArrowClockwise size={18} />تحديث البيانات</button>} />
    {dataError ? <div className="alert error">{dataError}</div> : null}
    {stockError ? <div className="alert warning"><WarningCircle size={18} />{stockError}</div> : null}
    {websiteCarsError ? <div className="alert warning"><WarningCircle size={18} />ربط المواصفات: {websiteCarsError}</div> : null}

    <section className="stats-grid dashboard-stats">
      <StatCard label="حد حساب حراج اليومي" value={publishingSettings.dailyLimit || 0} hint={publishingSettings.accountName || "اسم الحساب غير محدد"} tone="info" />
      <StatCard label="سعة الفترة" value={capacity} hint={`${weekAds.length} مجدول · ${Math.max(0, capacity - weekAds.length)} متبقي`} />
      <StatCard label="تم النشر" value={published} hint="استلمنا الرابط" tone="good" />
      <StatCard label="بانتظار النشر" value={pending} hint="بدون رابط حتى الآن" tone={pending ? "warn" : "good"} />
      <StatCard label="متأخر" value={overdue} hint="موعده عدى" tone={overdue ? "danger" : "good"} />
      <StatCard label="المناديب النشطون" value={activeAgentCount} hint="داخل الفروع النشطة" />
      <StatCard label="متاح للبيع" value={stockTotalVehicles} hint={`${stock.length} سيارة/فئة خارج الوكالة`} tone="info" />
      <StatCard label="متاح بدون تكرار" value={coverage.eligibleRows.length} hint={`دورة ${coverage.cycle}`} tone="warn" />
      <StatCard label="مواصفات الموقع" value={websiteCars.length} hint={websiteCarsError ? "الربط غير مكتمل" : "جاهزة لصيغ الإعلانات"} tone={websiteCarsError ? "danger" : "good"} />
    </section>

    <section className="dashboard-columns">
      <div className="panel"><div className="panel-head"><div><h2>حساب النشر الحالي</h2><p>حساب حراج واحد، والحد اليومي يتقسم على الفروع ثم على مناديب كل فرع.</p></div></div><div className="single-account-dashboard"><span>حساب حراج</span><strong>{publishingSettings.accountName || "غير محدد"}</strong><div><span>الحد اليومي <b>{publishingSettings.dailyLimit || 0}</b></span><span>سعة الفترة <b>{capacity}</b></span><span>المجدول <b>{weekAds.length}</b></span></div><Progress value={weekAds.length} max={Math.max(capacity, weekAds.length || 1)} /></div></div>
      <div className="panel"><div className="panel-head"><div><h2>تغطية الاستوك</h2><p>{stockFetchedAt ? `آخر قراءة: ${new Date(stockFetchedAt).toLocaleString("ar-SA-u-nu-latn")}` : "لم تتم القراءة بعد"}</p></div></div>{!stock.length ? <EmptyState title="لا توجد بيانات" text="بانتظار قراءة الاستوك." /> : <><div className="coverage-big"><strong>{coverage.coveredCount}</strong><span>من {stock.length} سيارة/فئة في الدورة {coverage.cycle}</span></div><Progress value={coverage.coveredCount} max={stock.length} /><div className="coverage-caption"><span>تمت تغطيته: {coverage.coveredCount}</span><span>متبقي: {coverage.eligibleRows.length}</span></div></>}</div>
    </section>

    <section className="dashboard-columns dashboard-secondary">
      <div className="panel"><div className="panel-head"><div><h2><CalendarBlank size={20} /> مهام اليوم</h2><p>{formatDateArabic(today, { weekday: "long", day: "numeric", month: "long" })}</p></div></div>{!todayAds.length ? <EmptyState title="لا توجد إعلانات اليوم" text="راجع جدول النشر." /> : <div className="today-task-list">{todayAds.map((ad) => { const agent = agentById.get(ad.agentId); return <div className={`today-task ${isPublished(ad) ? "done" : ""}`} key={ad.id}><div><strong>{ad.carName}</strong><span>{ad.statement} · {ad.modelYear}</span></div><div><span>{agent?.name || "مندوب محذوف"}</span><small>{branchById.get(adBranchId(ad))?.name || "بدون فرع"}</small></div>{ad.url ? <a className="link-button" href={ad.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={16} />فتح</a> : <span className="status-pill assigned">بانتظار الرابط</span>}</div>; })}</div>}</div>
      <div className="panel"><div className="panel-head"><div><h2>آخر الإعلانات</h2><p>آخر تحديثات التكليف والروابط.</p></div></div>{!recent.length ? <EmptyState title="لا توجد إعلانات" text="أنشئ أول جدول نشر." /> : <div className="compact-list">{recent.map((ad) => <div className="compact-ad" key={ad.id}><div><strong>{ad.carName}</strong><span>{ad.statement} · {ad.modelYear}</span></div><span className={`status-pill ${ad.status}`}>{AD_STATUS_LABELS[ad.status]}</span>{ad.url ? <a className="icon-button open-link" href={ad.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={16} /></a> : <span className="muted">بدون رابط</span>}</div>)}</div>}</div>
    </section>
  </>;
}
