import { ArrowClockwise, ArrowSquareOut, CalendarBlank } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useAppData } from "../AppDataContext";
import {
  dateKey,
  formatDateArabic,
  formatPlanRange,
  getPlanWindowFromAds,
  getCoverageState,
  getWeekStartKey,
  isOverdue,
  isPublished,
} from "../schedule";
import { AD_STATUS_LABELS } from "../types";
import { EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function DashboardPage() {
  const { accounts, agents, ads, stock, stockTotalVehicles, stockError, stockLoading, stockFetchedAt, refreshStock, dataError } = useAppData();
  const currentWeek = getWeekStartKey();
  const today = dateKey(new Date());
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === currentWeek && ad.status !== "closed"), [ads, currentWeek]);
  const currentPlan = getPlanWindowFromAds(weekAds, currentWeek);
  const totalCapacity = accounts.filter((account) => account.active).reduce((sum, account) => sum + Number(account.adLimit || 0), 0);
  const remaining = Math.max(0, totalCapacity - weekAds.length);
  const coverage = useMemo(() => getCoverageState(stock, ads), [stock, ads]);
  const published = weekAds.filter(isPublished).length;
  const pending = weekAds.filter((ad) => !isPublished(ad)).length;
  const overdue = weekAds.filter((ad) => isOverdue(ad, today)).length;
  const withoutUrl = weekAds.filter((ad) => !String(ad.url || "").trim()).length;
  const todayAds = weekAds.filter((ad) => ad.scheduledDate === today);

  const accountUsage = useMemo(() => accounts.map((account) => ({
    account,
    used: weekAds.filter((ad) => ad.accountId === account.id).length,
  })), [accounts, weekAds]);

  const recentAds = useMemo(() => [...ads].sort((a, b) => String(b.updatedAt || b.assignedAt || "").localeCompare(String(a.updatedAt || a.assignedAt || ""))).slice(0, 8), [ads]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  return <>
    <PageTitle
      title="لوحة التحكم"
      subtitle={`متابعة خطة النشر الحالية ${formatPlanRange(currentPlan.planStart, currentPlan.planEnd)} وتغطية الاستوك الحقيقي.`}
      actions={<button className="secondary-button" onClick={() => void refreshStock()} disabled={stockLoading}><ArrowClockwise size={18} />{stockLoading ? "جارٍ التحديث" : "تحديث الاستوك"}</button>}
    />
    {dataError ? <div className="alert error">{dataError}</div> : null}
    {stockError ? <div className="alert warning"><strong>الاستوك غير متصل:</strong> {stockError}</div> : null}

    <section className="stats-grid dashboard-stats">
      <StatCard label="سعة الفروع الحالية" value={totalCapacity} hint="مجموع حدود حسابات حراج" tone="info" />
      <StatCard label="المجدول هذا الأسبوع" value={weekAds.length} hint={`متبقي ${remaining} من السعة`} tone="good" />
      <StatCard label="تم النشر" value={published} hint="تكليفات لها رابط/حالة نشر" tone="good" />
      <StatCard label="بانتظار النشر" value={pending} hint="لم يتم تنفيذها بعد" tone={pending ? "warn" : "good"} />
      <StatCard label="متأخر" value={overdue} hint="موعد النشر عدى" tone={overdue ? "danger" : "good"} />
      <StatCard label="المناديب" value={agents.filter((agent) => agent.active).length} hint="النشطون داخل فروعهم" />
      <StatCard label="سيارات متاح للبيع" value={stockTotalVehicles} hint={`${stock.length} سيارة/فئة`} tone="info" />
      <StatCard label="متاح للتكليف" value={coverage.eligibleRows.length} hint={`دورة التغطية ${coverage.cycle}`} tone={coverage.eligibleRows.length ? "warn" : "good"} />
      <StatCard label="بدون رابط" value={withoutUrl} hint="من تكليفات الأسبوع" tone={withoutUrl ? "danger" : "good"} />
    </section>

    <section className="dashboard-columns">
      <div className="panel">
        <div className="panel-head"><div><h2>الفروع وحسابات حراج — الفترة الحالية</h2><p>الحدود مرنة وتستخدم لبناء التوزيع الأسبوعي.</p></div></div>
        {!accountUsage.length ? <EmptyState title="لا توجد حسابات" text="أضف حسابات حراج أولًا." /> : <div className="account-usage-list">
          {accountUsage.map(({ account, used }) => <div className={`usage-card ${used > Number(account.adLimit || 0) ? "over-limit" : ""}`} key={account.id}>
            <div className="usage-top"><div><strong>{account.name}</strong><span>الحد الحالي: {account.adLimit}</span></div><b>{Math.max(0, Number(account.adLimit || 0) - used)} متبقي</b></div>
            <Progress value={used} max={Math.max(Number(account.adLimit || 0), used || 1)} />
          </div>)}
        </div>}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h2>تغطية الاستوك</h2><p>{stockFetchedAt ? `آخر قراءة: ${new Date(stockFetchedAt).toLocaleString("ar-SA-u-nu-latn")}` : "لم تتم القراءة بعد"}</p></div></div>
        {!stock.length ? <EmptyState title="لا توجد بيانات استوك" text={stockError ? "راجع إعدادات ربط المنصة." : "جارٍ انتظار قراءة الاستوك الحقيقي."} /> : <>
          <div className="coverage-big"><strong>{coverage.coveredCount}</strong><span>من {stock.length} سيارة/فئة في دورة التغطية {coverage.cycle}</span></div>
          <Progress value={coverage.coveredCount} max={stock.length} />
          <div className="coverage-caption"><span>تمت تغطيته: {coverage.coveredCount}</span><span>متبقي: {coverage.eligibleRows.length}</span></div>
        </>}
      </div>
    </section>

    <section className="dashboard-columns dashboard-secondary">
      <div className="panel">
        <div className="panel-head"><div><h2><CalendarBlank size={20} /> مهام اليوم</h2><p>{formatDateArabic(today, { weekday: "long", day: "numeric", month: "long" })}</p></div></div>
        {!todayAds.length ? <EmptyState title="لا توجد إعلانات اليوم" text="راجع جدول النشر الأسبوعي أو أنشئ خطة جديدة." /> : <div className="today-task-list">
          {todayAds.map((ad) => <div className={`today-task ${isPublished(ad) ? "done" : ""}`} key={ad.id}>
            <div><strong>{ad.carName}</strong><span>{ad.statement} · {ad.modelYear}</span></div>
            <div><span>{agentById.get(ad.agentId)?.name || "مندوب محذوف"}</span><small>{accountById.get(ad.accountId)?.name || "حساب محذوف"}</small></div>
            {ad.url ? <a className="link-button" href={ad.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={16} />فتح</a> : <span className="status-pill assigned">بانتظار الرابط</span>}
          </div>)}
        </div>}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h2>آخر الإعلانات المسجلة</h2><p>آخر تحديثات التكليفات والروابط.</p></div></div>
        {!recentAds.length ? <EmptyState title="لا توجد إعلانات" text="ابدأ من مخزون السيارات وأنشئ أول جدول أسبوعي." /> : <div className="compact-list">
          {recentAds.map((ad) => <div className="compact-ad" key={ad.id}>
            <div><strong>{ad.carName}</strong><span>{ad.statement} · {ad.modelYear}</span></div>
            <span className={`status-pill ${ad.status}`}>{AD_STATUS_LABELS[ad.status]}</span>
            {ad.url ? <a className="icon-button open-link" href={ad.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={16} /></a> : <span className="muted">بدون رابط</span>}
          </div>)}
        </div>}
      </div>
    </section>
  </>;
}
