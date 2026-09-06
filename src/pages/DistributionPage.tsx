import { useMemo } from "react";
import { ArrowLeft, ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { addDaysKey, formatDateArabic, formatWeekRange, getWeekStartKey, isPublished } from "../schedule";
import { EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function DistributionPage() {
  const { accounts, agents, ads } = useAppData();
  const [params, setParams] = useSearchParams();
  const weekStart = getWeekStartKey(params.get("week") || getWeekStartKey());

  const activeAgents = useMemo(() => agents.filter((agent) => agent.active).sort((a, b) => a.name.localeCompare(b.name, "ar")), [agents]);
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === weekStart && ad.status !== "closed"), [ads, weekStart]);
  const totalCapacity = useMemo(() => accounts.filter((account) => account.active).reduce((sum, account) => sum + Number(account.adLimit || 0), 0), [accounts]);

  const targetByAgent = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeAgents.length) return map;
    const base = Math.floor(weekAds.length / activeAgents.length);
    const extra = weekAds.length % activeAgents.length;
    activeAgents.forEach((agent, index) => map.set(agent.id, base + (index < extra ? 1 : 0)));
    return map;
  }, [activeAgents, weekAds.length]);

  const rows = useMemo(() => agents.map((agent) => {
    const assigned = weekAds.filter((ad) => ad.agentId === agent.id);
    const published = assigned.filter(isPublished).length;
    const target = agent.active ? (targetByAgent.get(agent.id) || 0) : 0;
    return {
      agent,
      target,
      assigned: assigned.length,
      published,
      pending: Math.max(0, assigned.length - published),
    };
  }).sort((a, b) => Number(b.agent.active) - Number(a.agent.active) || b.assigned - a.assigned || a.agent.name.localeCompare(b.agent.name, "ar")), [agents, weekAds, targetByAgent]);

  const accountRows = useMemo(() => accounts.map((account) => {
    const assigned = weekAds.filter((ad) => ad.accountId === account.id).length;
    return { account, assigned, remaining: Math.max(0, Number(account.adLimit || 0) - assigned) };
  }).sort((a, b) => b.assigned - a.assigned || a.account.name.localeCompare(b.account.name, "ar")), [accounts, weekAds]);

  function goWeek(offset: number) {
    setParams({ week: addDaysKey(weekStart, offset * 7) });
  }

  function selectWeek(value: string) {
    if (value) setParams({ week: getWeekStartKey(value) });
  }

  return <>
    <PageTitle
      title="توزيع الأسبوع"
      subtitle={`متابعة توزيع خطة ${formatWeekRange(weekStart)} على كل مناديب الشركة وحسابات حراج.`}
      actions={<div className="week-switcher"><button className="icon-button" onClick={() => goWeek(-1)}><ArrowRight size={19} /></button><label><CalendarBlank size={18} /><input type="date" value={weekStart} onChange={(e) => selectWeek(e.target.value)} /></label><button className="icon-button" onClick={() => goWeek(1)}><ArrowLeft size={19} /></button></div>}
    />

    <section className="stats-grid compact-stats">
      <StatCard label="سعة الشركة الحالية" value={totalCapacity} hint="مجموع حدود الحسابات" tone="info" />
      <StatCard label="تكليفات الأسبوع" value={weekAds.length} hint="تم توزيعها تلقائيًا" tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint="يشتركون في التوزيع" />
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>توزيع المناديب</h2><p>لا توجد حصص يدوية. الجدول الأسبوعي يوازن السيارات تلقائيًا على كل المندوبين النشطين.</p></div></div>
      {!rows.length ? <EmptyState title="لا يوجد مناديب" text="أضف المناديب أولًا." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>رقم الجوال</th><th>المستهدف من خطة الأسبوع</th><th>المسند</th><th>تم النشر</th><th>متبقي</th><th>التنفيذ</th></tr></thead><tbody>
        {rows.map(({ agent, target, assigned, published, pending }) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}>
          <td><strong>{agent.name}</strong></td>
          <td className="ltr-cell">{agent.phone}</td>
          <td>{target}</td>
          <td>{assigned}</td>
          <td>{published}</td>
          <td><b>{pending}</b></td>
          <td style={{ minWidth: 180 }}><Progress value={published} max={Math.max(assigned, 1)} /></td>
        </tr>)}
      </tbody></table></div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>مهام كل مندوب هذا الأسبوع</h2><p>تقدر من هنا تعرف كل مندوب مطلوب منه ينشر أي سيارة وفي أي يوم وعلى أي حساب.</p></div></div>
      {!weekAds.length ? <EmptyState title="لا توجد مهام" text="أنشئ جدول نشر أسبوعي من صفحة مخزون السيارات." /> : <div className="agent-task-grid">
        {activeAgents.map((agent) => {
          const tasks = weekAds.filter((ad) => ad.agentId === agent.id).sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")));
          if (!tasks.length) return null;
          return <article className="agent-task-card" key={agent.id}>
            <header><div><strong>{agent.name}</strong><span className="ltr-cell">{agent.phone}</span></div><b>{tasks.length} إعلان</b></header>
            <div className="agent-task-list">{tasks.map((ad) => <div key={ad.id}>
              <span>{ad.scheduledDate ? formatDateArabic(ad.scheduledDate, { weekday: "long", day: "numeric", month: "short" }) : "غير محدد"}</span>
              <strong>{ad.carName} — {ad.statement} — {ad.modelYear}</strong>
              <small>{accounts.find((account) => account.id === ad.accountId)?.name || "حساب محذوف"}</small>
            </div>)}</div>
          </article>;
        })}
      </div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>توزيع حسابات حراج</h2><p>حد الحساب يستخدم وقت إنشاء الجدول فقط. تغييره لاحقًا لا يحذف أو يمنع التكليفات السابقة.</p></div></div>
      {!accountRows.length ? <EmptyState title="لا توجد حسابات" text="أضف حسابات حراج أولًا." /> : <div className="account-distribution-grid">
        {accountRows.map(({ account, assigned, remaining }) => <article className={`distribution-account-card ${assigned > Number(account.adLimit || 0) ? "over-limit" : ""}`} key={account.id}>
          <div><strong>{account.name}</strong><span>{account.active ? "نشط" : "موقوف"}</span></div>
          <div className="distribution-numbers"><span>حد حالي <b>{account.adLimit}</b></span><span>مجدول <b>{assigned}</b></span><span>متبقي <b>{remaining}</b></span></div>
          <Progress value={assigned} max={Math.max(Number(account.adLimit || 0), assigned || 1)} />
        </article>)}
      </div>}
    </section>
  </>;
}
