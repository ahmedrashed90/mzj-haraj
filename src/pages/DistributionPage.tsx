import { useMemo } from "react";
import { ArrowLeft, ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { addDaysKey, adBranchId, formatPlanRange, getPlanWindowFromAds, getPublishingPlanCapacity, getWeekStartKey, isPublished } from "../schedule";
import { EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function DistributionPage() {
  const { accounts, agents, ads, publishingSettings } = useAppData();
  const [params, setParams] = useSearchParams();
  const weekStart = getWeekStartKey(params.get("week") || getWeekStartKey());
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === weekStart && ad.status !== "closed"), [ads, weekStart]);
  const { planStart, planEnd } = getPlanWindowFromAds(weekAds, weekStart);
  const capacity = getPublishingPlanCapacity(publishingSettings, planStart, planEnd);
  const activeAgents = agents.filter((agent) => agent.active && agent.accountId);
  const agentRows = useMemo(() => agents.map((agent) => {
    const assigned = weekAds.filter((ad) => ad.agentId === agent.id);
    const published = assigned.filter(isPublished).length;
    return { agent, assigned: assigned.length, published, pending: assigned.length - published, branch: accounts.find((b) => b.id === agent.accountId)?.name || "غير محدد" };
  }).sort((a, b) => Number(b.agent.active) - Number(a.agent.active) || b.assigned - a.assigned || a.agent.name.localeCompare(b.agent.name, "ar")), [agents, accounts, weekAds]);
  const branchRows = useMemo(() => accounts.map((branch) => ({ branch, count: weekAds.filter((ad) => adBranchId(ad) === branch.id).length, reps: activeAgents.filter((a) => a.accountId === branch.id).length })).filter((r) => r.count || r.reps), [accounts, weekAds, activeAgents]);
  function goWeek(offset: number) { setParams({ week: addDaysKey(weekStart, offset * 7) }); }
  function selectWeek(value: string) { if (value) setParams({ week: getWeekStartKey(value) }); }

  return <>
    <PageTitle title="توزيع المناديب" subtitle={`حساب حراج واحد (${publishingSettings.accountName || "غير محدد"}) يتوزع على كل المناديب النشطين من جميع الفروع — ${formatPlanRange(planStart, planEnd)}.`} actions={<div className="week-switcher"><button className="icon-button" onClick={() => goWeek(-1)}><ArrowRight size={19} /></button><label><CalendarBlank size={18} /><input type="date" value={weekStart} onChange={(e) => selectWeek(e.target.value)} /></label><button className="icon-button" onClick={() => goWeek(1)}><ArrowLeft size={19} /></button></div>} />
    <section className="stats-grid compact-stats">
      <StatCard label="حد الحساب اليومي" value={publishingSettings.dailyLimit || 0} hint="للشركة بالكامل" tone="info" />
      <StatCard label="سعة الفترة" value={capacity} hint="الحد اليومي × أيام الفترة" />
      <StatCard label="تكليفات الفترة" value={weekAds.length} hint="سيارات بدون تكرار" tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint="من جميع الفروع" />
    </section>

    {branchRows.length ? <section className="panel"><div className="panel-head"><div><h2>توزيع التكليفات حسب فرع المندوب</h2><p>هذا تجميع للمتابعة فقط، وليس حصة أو حد نشر للفرع.</p></div></div><div className="branch-summary-grid">{branchRows.map(({ branch, count, reps }) => <div className="branch-summary-card" key={branch.id}><strong>{branch.name}</strong><span>{reps} مندوب نشط</span><b>{count} تكليف في الفترة</b></div>)}</div></section> : null}

    <section className="panel">
      <div className="panel-head"><div><h2>توزيع المناديب</h2><p>النظام يوازن الحمل حسب اليوم ثم إجمالي الفترة ثم التاريخ السابق للمندوب.</p></div></div>
      {!agentRows.length ? <EmptyState title="لا يوجد مناديب" text="أضف المناديب أولًا." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>الفرع</th><th>الحالة</th><th>المسند</th><th>تم النشر</th><th>متبقي</th><th>التنفيذ</th></tr></thead><tbody>{agentRows.map(({ agent, branch, assigned, published, pending }) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}><td><strong>{agent.name}</strong><small className="cell-sub">{agent.phone}</small></td><td>{branch}</td><td>{agent.active ? "نشط" : "إجازة / موقوف"}</td><td>{assigned}</td><td>{published}</td><td><b>{pending}</b></td><td style={{ minWidth: 180 }}><Progress value={published} max={Math.max(assigned, 1)} /></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
