import { useMemo } from "react";
import { useAppData } from "../AppDataContext";
import { EmptyState, PageTitle, Progress } from "../components/Ui";

export function DistributionPage() {
  const { accounts, agents, ads } = useAppData();
  const activeAds = ads.filter((ad) => ad.status !== "closed");
  const rows = useMemo(() => agents.map((agent) => {
    const account = accounts.find((a) => a.id === agent.accountId);
    const used = activeAds.filter((ad) => ad.agentId === agent.id).length;
    return { agent, account, used, remaining: Math.max(0, agent.adLimit - used) };
  }).sort((a, b) => (a.account?.name || "").localeCompare(b.account?.name || "", "ar") || a.agent.name.localeCompare(b.agent.name, "ar")), [agents, accounts, activeAds]);

  return <>
    <PageTitle title="توزيع الإعلانات" subtitle="متابعة حصة كل مندوب وما تم إسناده والمتبقي؛ التوزيع نفسه يتم عند اختيار السيارة من الاستوك." />
    <section className="panel">
      {!rows.length ? <EmptyState title="لا يوجد توزيع" text="أضف الحسابات والمناديب وحدد حصصهم أولًا." /> : <div className="table-scroll"><table><thead><tr><th>حساب حراج</th><th>المندوب</th><th>رقم الجوال</th><th>الحصة</th><th>المسند</th><th>المتبقي</th><th>الاستخدام</th></tr></thead><tbody>
        {rows.map(({ agent, account, used, remaining }) => <tr key={agent.id}><td>{account?.name || "حساب محذوف"}</td><td><strong>{agent.name}</strong></td><td>{agent.phone}</td><td>{agent.adLimit}</td><td>{used}</td><td><b>{remaining}</b></td><td style={{ minWidth: 180 }}><Progress value={used} max={agent.adLimit} /></td></tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
