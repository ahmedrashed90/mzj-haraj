import { useMemo } from "react";
import { ArrowLeft, ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { addDaysKey, formatPlanRange, getPlanWindowFromAds, getWeekStartKey, isPublished } from "../schedule";
import { EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function DistributionPage() {
  const { accounts, agents, ads } = useAppData();
  const [params, setParams] = useSearchParams();
  const weekStart = getWeekStartKey(params.get("week") || getWeekStartKey());
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === weekStart && ad.status !== "closed"), [ads, weekStart]);
  const { planStart, planEnd } = getPlanWindowFromAds(weekAds, weekStart);
  const totalCapacity = useMemo(() => accounts.filter((account) => account.active).reduce((sum, account) => sum + Number(account.adLimit || 0), 0), [accounts]);
  const activeAgents = agents.filter((agent) => agent.active);

  const branches = useMemo(() => accounts.map((account) => {
    const branchAgents = agents.filter((agent) => agent.accountId === account.id);
    const activeBranchAgents = branchAgents.filter((agent) => agent.active);
    const branchAds = weekAds.filter((ad) => ad.accountId === account.id);
    const agentRows = branchAgents.map((agent) => {
      const assigned = branchAds.filter((ad) => ad.agentId === agent.id);
      const published = assigned.filter(isPublished).length;
      return { agent, assigned: assigned.length, published, pending: assigned.length - published };
    }).sort((a, b) => Number(b.agent.active) - Number(a.agent.active) || b.assigned - a.assigned || a.agent.name.localeCompare(b.agent.name, "ar"));
    return { account, branchAgents, activeBranchAgents, branchAds, agentRows };
  }), [accounts, agents, weekAds]);

  function goWeek(offset: number) { setParams({ week: addDaysKey(weekStart, offset * 7) }); }
  function selectWeek(value: string) { if (value) setParams({ week: getWeekStartKey(value) }); }

  return <>
    <PageTitle
      title="توزيع الفروع"
      subtitle={`متابعة توزيع خطة ${formatPlanRange(planStart, planEnd)}. كل فرع مستقل بعدد إعلاناته ومناديبه.`}
      actions={<div className="week-switcher"><button className="icon-button" onClick={() => goWeek(-1)}><ArrowRight size={19} /></button><label><CalendarBlank size={18} /><input type="date" value={weekStart} onChange={(e) => selectWeek(e.target.value)} /></label><button className="icon-button" onClick={() => goWeek(1)}><ArrowLeft size={19} /></button></div>}
    />

    <section className="stats-grid compact-stats">
      <StatCard label="سعة الفروع الحالية" value={totalCapacity} hint="مجموع حدود حسابات حراج" tone="info" />
      <StatCard label="تكليفات الفترة" value={weekAds.length} hint="حسب حدود الفروع" tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint="داخل فروعهم فقط" />
    </section>

    {!branches.length ? <section className="panel"><EmptyState title="لا توجد فروع" text="أضف الفروع والمناديب أولًا." /></section> : <div className="branch-distribution-stack">
      {branches.map(({ account, activeBranchAgents, branchAds, agentRows }) => <section className="panel branch-distribution-panel" key={account.id}>
        <div className="branch-panel-head"><div><span>الفرع</span><h2>{account.name}</h2><p>{activeBranchAgents.length} مندوب نشط</p></div><div className="branch-panel-metrics"><span>حد حراج <b>{account.adLimit}</b></span><span>مجدول <b>{branchAds.length}</b></span><span>تم النشر <b>{branchAds.filter(isPublished).length}</b></span></div></div>
        <Progress value={branchAds.length} max={Math.max(Number(account.adLimit || 0), branchAds.length || 1)} />
        {!agentRows.length ? <EmptyState title="لا يوجد مناديب في هذا الفرع" text="اربط المناديب بالفرع من صفحة الفروع والمناديب." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>الجوال</th><th>الحالة</th><th>المسند</th><th>تم النشر</th><th>متبقي</th><th>التنفيذ</th></tr></thead><tbody>{agentRows.map(({ agent, assigned, published, pending }) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}><td><strong>{agent.name}</strong></td><td className="ltr-cell">{agent.phone}</td><td>{agent.active ? "نشط" : "إجازة / موقوف"}</td><td>{assigned}</td><td>{published}</td><td><b>{pending}</b></td><td style={{ minWidth: 180 }}><Progress value={published} max={Math.max(assigned, 1)} /></td></tr>)}</tbody></table></div>}
      </section>)}
    </div>}
  </>;
}
