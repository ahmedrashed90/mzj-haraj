import { ArrowSquareOut, ArrowClockwise } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useAppData } from "../AppDataContext";
import { AD_STATUS_LABELS } from "../types";
import { EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function DashboardPage() {
  const { accounts, agents, ads, stock, stockTotalVehicles, stockError, stockLoading, stockFetchedAt, refreshStock, dataError } = useAppData();
  const activeAds = ads.filter((ad) => ad.status !== "closed");
  const totalCapacity = accounts.filter((a) => a.active).reduce((sum, a) => sum + Number(a.adLimit || 0), 0);
  const remaining = Math.max(0, totalCapacity - activeAds.length);
  const coveredKeys = new Set(activeAds.map((ad) => ad.vehicleKey));
  const coveredGroups = stock.filter((row) => coveredKeys.has(row.key)).length;
  const uncoveredGroups = Math.max(0, stock.length - coveredGroups);
  const withoutUrl = activeAds.filter((ad) => !String(ad.url || "").trim()).length;

  const accountUsage = useMemo(() => accounts.map((account) => ({
    account,
    used: activeAds.filter((ad) => ad.accountId === account.id).length,
    agents: agents.filter((agent) => agent.accountId === account.id && agent.active).length,
  })), [accounts, agents, activeAds]);

  const recentAds = activeAds.slice(0, 8);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  return <>
    <PageTitle title="لوحة التحكم" subtitle="الأرقام هنا من Firebase والاستوك الحقيقي فقط؛ لا توجد بيانات تجريبية." actions={<button className="secondary-button" onClick={() => void refreshStock()} disabled={stockLoading}><ArrowClockwise size={18} />{stockLoading ? "جارٍ التحديث" : "تحديث الاستوك"}</button>} />
    {dataError ? <div className="alert error">{dataError}</div> : null}
    {stockError ? <div className="alert warning"><strong>الاستوك غير متصل:</strong> {stockError}</div> : null}

    <section className="stats-grid">
      <StatCard label="حسابات حراج" value={accounts.length} hint="المضافة في النظام" tone="info" />
      <StatCard label="سعة الإعلانات" value={totalCapacity} hint="مجموع حدود الحسابات" />
      <StatCard label="الإعلانات المسندة" value={activeAds.length} hint="غير المنتهية" tone="good" />
      <StatCard label="السعة المتبقية" value={remaining} hint="حسب الحدود المسجلة" tone={remaining > 0 ? "warn" : "default"} />
      <StatCard label="المناديب" value={agents.filter((a) => a.active).length} hint="النشطون" />
      <StatCard label="سيارات متاح للبيع" value={stockTotalVehicles} hint={`${stock.length} نوع/فئة`} tone="info" />
      <StatCard label="تم تغطيتها بإعلان" value={coveredGroups} hint="نوع/فئة لها إعلان" tone="good" />
      <StatCard label="لم يُعلن عنها" value={uncoveredGroups} hint="نوع/فئة بلا إعلان" tone={uncoveredGroups ? "warn" : "good"} />
      <StatCard label="إعلانات بدون رابط" value={withoutUrl} hint="تحتاج إضافة رابط حراج" tone={withoutUrl ? "danger" : "good"} />
    </section>

    <section className="dashboard-columns">
      <div className="panel">
        <div className="panel-head"><div><h2>توزيع حسابات حراج</h2><p>الاستخدام الفعلي مقابل الحد الذي حددته.</p></div></div>
        {!accountUsage.length ? <EmptyState title="لا توجد حسابات" text="أضف حسابات حراج من صفحة الحسابات والمناديب." /> : <div className="account-usage-list">
          {accountUsage.map(({ account, used, agents: count }) => <div className="usage-card" key={account.id}>
            <div className="usage-top"><div><strong>{account.name}</strong><span>{count} مندوب</span></div><b>{Math.max(0, account.adLimit - used)} متبقي</b></div>
            <Progress value={used} max={account.adLimit} />
          </div>)}
        </div>}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h2>تغطية الاستوك</h2><p>{stockFetchedAt ? `آخر قراءة: ${new Date(stockFetchedAt).toLocaleString("ar-SA-u-nu-latn")}` : "لم تتم القراءة بعد"}</p></div></div>
        {!stock.length ? <EmptyState title="لا توجد بيانات استوك" text={stockError ? "راجع إعدادات ربط المنصة." : "جارٍ انتظار قراءة الاستوك الحقيقي."} /> : <>
          <div className="coverage-big"><strong>{coveredGroups}</strong><span>من {stock.length} نوع/فئة</span></div>
          <Progress value={coveredGroups} max={stock.length} />
          <div className="coverage-caption"><span>معلن عنها: {coveredGroups}</span><span>لسه: {uncoveredGroups}</span></div>
        </>}
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>آخر الإعلانات المسجلة</h2><p>اضغط فتح للوصول مباشرة إلى الإعلان الحقيقي على حراج.</p></div></div>
      {!recentAds.length ? <EmptyState title="لا توجد إعلانات" text="اختَر سيارة من الاستوك وأنشئ لها تكليفًا أولًا." /> : <div className="table-scroll"><table><thead><tr><th>السيارة</th><th>البيان</th><th>موديل</th><th>الحساب</th><th>المندوب</th><th>الحالة</th><th>الرابط</th></tr></thead><tbody>
        {recentAds.map((ad) => <tr key={ad.id}><td><strong>{ad.carName || "—"}</strong></td><td>{ad.statement || "—"}</td><td>{ad.modelYear || "—"}</td><td>{accountById.get(ad.accountId)?.name || "—"}</td><td>{agentById.get(ad.agentId)?.name || "—"}</td><td><span className={`status-pill ${ad.status}`}>{AD_STATUS_LABELS[ad.status]}</span></td><td>{ad.url ? <a className="link-button" href={ad.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={17} />فتح</a> : <span className="muted">بدون رابط</span>}</td></tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
