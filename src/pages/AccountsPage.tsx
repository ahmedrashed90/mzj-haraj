import { useMemo, useState, type FormEvent } from "react";
import { Plus, Scales, Trash, UsersThree } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { addAccount, addAgent, distributeAgentLimits, removeAccount, removeAgent, updateAccount, updateAgent } from "../data";
import type { Agent, HarajAccount } from "../types";
import { ConfirmButton, EmptyState, PageTitle, Progress } from "../components/Ui";

export function AccountsPage() {
  const { accounts, agents, ads } = useAppData();
  const [accountName, setAccountName] = useState("");
  const [accountLimit, setAccountLimit] = useState("");
  const [accountNote, setAccountNote] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentAccountId, setAgentAccountId] = useState("");
  const [agentLimit, setAgentLimit] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const activeAds = useMemo(() => ads.filter((ad) => ad.status !== "closed"), [ads]);
  const adCountAccount = (id: string) => activeAds.filter((ad) => ad.accountId === id).length;
  const adCountAgent = (id: string) => activeAds.filter((ad) => ad.agentId === id).length;

  async function createAccount(event: FormEvent) {
    event.preventDefault(); setError("");
    const limit = Number(accountLimit);
    if (!accountName.trim()) return setError("اكتب اسم حساب حراج.");
    if (!Number.isInteger(limit) || limit < 0) return setError("عدد الإعلانات يجب أن يكون رقمًا صحيحًا.");
    setSaving(true);
    try {
      await addAccount({ name: accountName.trim(), adLimit: limit, note: accountNote.trim(), active: true });
      setAccountName(""); setAccountLimit(""); setAccountNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة الحساب"); }
    finally { setSaving(false); }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault(); setError("");
    const limit = Number(agentLimit);
    if (!agentName.trim() || !agentPhone.trim() || !agentAccountId) return setError("أكمل اسم المندوب ورقمه وحساب حراج.");
    if (!Number.isInteger(limit) || limit < 0) return setError("عدد الإعلانات للمندوب يجب أن يكون رقمًا صحيحًا.");
    const account = accounts.find((a) => a.id === agentAccountId);
    if (!account) return setError("حساب حراج غير موجود.");
    const currentLimits = agents.filter((a) => a.accountId === account.id && a.active).reduce((sum, a) => sum + Number(a.adLimit || 0), 0);
    if (currentLimits + limit > account.adLimit) return setError(`مجموع حصص المناديب سيتجاوز حد الحساب (${account.adLimit}).`);
    setSaving(true);
    try {
      await addAgent({ name: agentName.trim(), phone: agentPhone.trim(), accountId: agentAccountId, adLimit: limit, active: true });
      setAgentName(""); setAgentPhone(""); setAgentLimit("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة المندوب"); }
    finally { setSaving(false); }
  }

  async function changeAccountLimit(account: HarajAccount, value: string) {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) return;
    const assigned = adCountAccount(account.id);
    const agentsLimit = agents.filter((a) => a.accountId === account.id && a.active).reduce((sum, a) => sum + Number(a.adLimit || 0), 0);
    if (next < assigned || next < agentsLimit) {
      setError("لا يمكن خفض حد الحساب عن الإعلانات الحالية أو مجموع حصص المناديب.");
      return;
    }
    await updateAccount(account.id, { adLimit: next });
  }

  async function changeAgentLimit(agent: Agent, value: string) {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) return;
    const assigned = adCountAgent(agent.id);
    if (next < assigned) return setError("لا يمكن خفض حصة المندوب عن عدد إعلاناته الحالية.");
    const account = accounts.find((a) => a.id === agent.accountId);
    if (!account) return;
    const other = agents.filter((a) => a.accountId === account.id && a.active && a.id !== agent.id).reduce((sum, a) => sum + Number(a.adLimit || 0), 0);
    if (other + next > account.adLimit) return setError("مجموع حصص المناديب سيتجاوز حد حساب حراج.");
    await updateAgent(agent.id, { adLimit: next });
  }

  return <>
    <PageTitle title="الحسابات والمناديب" subtitle="حدد عدد الإعلانات لكل حساب، ثم اربط المناديب بالحساب وحدد حصة كل مندوب." />
    {error ? <div className="alert error">{error}</div> : null}

    <section className="two-form-columns">
      <form className="panel form-panel" onSubmit={createAccount}>
        <div className="panel-head"><div><h2>إضافة حساب حراج</h2><p>لا يتم حفظ كلمة مرور حراج.</p></div></div>
        <label>اسم الحساب<input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="اسم حساب حراج" /></label>
        <label>عدد الإعلانات المسموح بها<input type="number" min="0" value={accountLimit} onChange={(e) => setAccountLimit(e.target.value)} placeholder="0" /></label>
        <label>ملاحظة (اختياري)<input value={accountNote} onChange={(e) => setAccountNote(e.target.value)} placeholder="وصف داخلي فقط" /></label>
        <button className="primary-button" disabled={saving}><Plus size={18} />إضافة الحساب</button>
      </form>

      <form className="panel form-panel" onSubmit={createAgent}>
        <div className="panel-head"><div><h2>إضافة مندوب</h2><p>الاسم والرقم وحساب حراج والحصة.</p></div></div>
        <div className="form-grid">
          <label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="اسم المندوب" /></label>
          <label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="05xxxxxxxx" inputMode="tel" /></label>
          <label>حساب حراج<select value={agentAccountId} onChange={(e) => setAgentAccountId(e.target.value)}><option value="">اختر الحساب</option>{accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>عدد الإعلانات<input type="number" min="0" value={agentLimit} onChange={(e) => setAgentLimit(e.target.value)} placeholder="0" /></label>
        </div>
        <button className="primary-button" disabled={saving || !accounts.length}><Plus size={18} />إضافة المندوب</button>
      </form>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>حسابات حراج</h2><p>الاستخدام والحصة موزعة على المناديب.</p></div></div>
      {!accounts.length ? <EmptyState title="لا توجد حسابات حراج" text="أضف أول حساب من النموذج أعلى الصفحة." /> : <div className="account-admin-grid">
        {accounts.map((account) => {
          const accountAgents = agents.filter((a) => a.accountId === account.id);
          const used = adCountAccount(account.id);
          const limits = accountAgents.filter((a) => a.active).reduce((sum, a) => sum + Number(a.adLimit || 0), 0);
          return <article className={`account-admin-card ${account.active ? "" : "disabled"}`} key={account.id}>
            <div className="account-card-head"><div><strong>{account.name}</strong><span>{account.note || "بدون ملاحظة"}</span></div><label className="switch-label"><input type="checkbox" checked={account.active} onChange={(e) => void updateAccount(account.id, { active: e.target.checked })} /><span>نشط</span></label></div>
            <Progress value={used} max={account.adLimit} />
            <div className="inline-editor"><label>حد الحساب<input type="number" min={used} defaultValue={account.adLimit} onBlur={(e) => void changeAccountLimit(account, e.target.value)} /></label><span>مجموع حصص المناديب: <b>{limits}</b></span></div>
            <div className="account-card-actions"><button className="secondary-button compact" disabled={!accountAgents.filter((a) => a.active).length || account.adLimit < used} onClick={() => void distributeAgentLimits(account, agents, ads).catch((e) => setError(e instanceof Error ? e.message : "تعذر التوزيع"))}><Scales size={17} />توزيع بالتساوي</button><ConfirmButton confirmText="حذف حساب حراج؟ لن يتم حذف الإعلانات المرتبطة به تلقائيًا." onConfirm={() => removeAccount(account.id)}><Trash size={17} />حذف</ConfirmButton></div>
            <div className="agents-inside">
              <h3><UsersThree size={18} />المناديب</h3>
              {!accountAgents.length ? <span className="muted">لا يوجد مناديب</span> : accountAgents.map((agent) => <div className={`agent-row ${agent.active ? "" : "disabled"}`} key={agent.id}>
                <div><strong>{agent.name}</strong><span>{agent.phone}</span></div>
                <div className="agent-quota"><small>مسند {adCountAgent(agent.id)}</small><input type="number" min={adCountAgent(agent.id)} defaultValue={agent.adLimit} onBlur={(e) => void changeAgentLimit(agent, e.target.value)} /></div>
                <label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>نشط</span></label>
                <ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton>
              </div>)}
            </div>
          </article>;
        })}
      </div>}
    </section>
  </>;
}
