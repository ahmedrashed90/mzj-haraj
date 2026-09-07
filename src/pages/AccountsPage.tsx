import { useMemo, useState, type FormEvent } from "react";
import { Buildings, Plus, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { addAccount, addAgent, removeAccount, removeAgent, updateAccount, updateAgent } from "../data";
import { dateKey } from "../schedule";
import type { HarajAccount } from "../types";
import { ConfirmButton, EmptyState, PageTitle, Progress, StatCard } from "../components/Ui";

export function AccountsPage() {
  const { accounts, agents, ads } = useAppData();
  const [accountName, setAccountName] = useState("");
  const [accountLimit, setAccountLimit] = useState("");
  const [accountNote, setAccountNote] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentAccountId, setAgentAccountId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const today = dateKey(new Date());
  const todayAds = useMemo(() => ads.filter((ad) => ad.scheduledDate === today && ad.status !== "closed"), [ads, today]);
  const activeAccounts = accounts.filter((account) => account.active);
  const totalDailyCapacity = activeAccounts.reduce((sum, account) => sum + Number(account.adLimit || 0), 0);
  const todayAccountCount = (id: string) => todayAds.filter((ad) => ad.accountId === id).length;
  const activeAdCountAgent = (id: string) => ads.filter((ad) => ad.status !== "closed" && ad.agentId === id).length;
  const activeAgentCount = agents.filter((agent) => agent.active).length;
  const unassignedAgents = agents.filter((agent) => agent.active && !agent.accountId).length;

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    const limit = Number(accountLimit);
    if (!accountName.trim()) return setError("اكتب اسم الفرع / حساب حراج.");
    if (!Number.isInteger(limit) || limit < 0) return setError("الحد اليومي يجب أن يكون رقمًا صحيحًا.");
    setSaving(true);
    try {
      await addAccount({ name: accountName.trim(), adLimit: limit, note: accountNote.trim(), active: true });
      setAccountName(""); setAccountLimit(""); setAccountNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إضافة الفرع");
    } finally { setSaving(false); }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!agentName.trim() || !agentPhone.trim()) return setError("اكتب اسم المندوب ورقم الجوال.");
    if (!agentAccountId) return setError("اختر فرع المندوب.");
    setSaving(true);
    try {
      await addAgent({ name: agentName.trim(), phone: agentPhone.trim(), accountId: agentAccountId, active: true });
      setAgentName(""); setAgentPhone("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إضافة المندوب");
    } finally { setSaving(false); }
  }

  async function changeAccountLimit(account: HarajAccount, value: string) {
    setError(""); setNotice("");
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) return setError("الحد اليومي يجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.");
    try {
      await updateAccount(account.id, { adLimit: next });
      const scheduledToday = todayAccountCount(account.id);
      if (next < scheduledToday) {
        setNotice(`تم حفظ الحد اليومي لفرع ${account.name} = ${next}. يوجد ${scheduledToday} تكليفًا مجدولًا اليوم؛ هذا تنبيه فقط.`);
      } else {
        setNotice(`تم تحديث الحد اليومي لفرع ${account.name} إلى ${next}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحديث الحد اليومي");
    }
  }

  return <>
    <PageTitle
      title="الفروع وحسابات حراج"
      subtitle="الرقم المسجل لكل فرع هو حد النشر اليومي الحالي في حراج، ويمكن تغييره في أي وقت حسب القيود وجودة الحساب."
    />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}
    {unassignedAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedAgents} مندوب نشط بدون فرع. لن يدخلوا في التوزيع حتى يتم ربطهم بفرع.</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="إجمالي الحد اليومي" value={totalDailyCapacity} hint="مجموع حدود الفروع النشطة في اليوم" tone="info" />
      <StatCard label="المجدول اليوم" value={todayAds.length} hint="تكليفات اليوم على كل الفروع" tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgentCount} hint="يدخل كل مندوب في توزيع فرعه فقط" />
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createAccount}>
        <div className="panel-head"><div><h2><Buildings size={20} /> إضافة فرع / حساب حراج</h2><p>حد النشر اليومي مرن ويتغير حسب وضع الحساب في حراج.</p></div></div>
        <label>اسم الفرع / الحساب<input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="مثال: فرع الملتقى" /></label>
        <label>حد الإعلانات اليومي<input type="number" min="0" value={accountLimit} onChange={(e) => setAccountLimit(e.target.value)} placeholder="0" /></label>
        <label>ملاحظة (اختياري)<input value={accountNote} onChange={(e) => setAccountNote(e.target.value)} placeholder="اسم حساب حراج أو ملاحظة داخلية" /></label>
        <button className="primary-button" disabled={saving}><Plus size={18} />إضافة الفرع</button>
      </form>

      <form className="panel form-panel" onSubmit={createAgent}>
        <div className="panel-head"><div><h2><UsersThree size={20} /> إضافة مندوب</h2><p>المندوب يدخل فقط في توزيع الفرع المرتبط به.</p></div></div>
        <div className="form-grid">
          <label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="اسم المندوب" /></label>
          <label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="05xxxxxxxx" inputMode="tel" /></label>
        </div>
        <label>الفرع<select value={agentAccountId} onChange={(e) => setAgentAccountId(e.target.value)}><option value="">اختر الفرع</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <button className="primary-button" disabled={saving || !accounts.length}><Plus size={18} />إضافة المندوب</button>
      </form>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>الفروع وحدود النشر اليومية</h2><p>الحد اليومي لا يحدد عدد المناديب. الجدول يضرب هذا الرقم في عدد أيام فترة النشر.</p></div></div>
      {!accounts.length ? <EmptyState title="لا توجد فروع" text="أضف أول فرع من النموذج أعلى الصفحة." /> : <div className="account-admin-grid">
        {accounts.map((account) => {
          const usedToday = todayAccountCount(account.id);
          const reps = agents.filter((agent) => agent.accountId === account.id);
          const activeReps = reps.filter((agent) => agent.active).length;
          const overLimit = usedToday > Number(account.adLimit || 0);
          return <article className={`account-admin-card ${account.active ? "" : "disabled"} ${overLimit ? "over-limit" : ""}`} key={account.id}>
            <div className="account-card-head"><div><strong>{account.name}</strong><span>{account.note || "حساب حراج الفرع"}</span></div><label className="switch-label"><input type="checkbox" checked={account.active} onChange={(e) => void updateAccount(account.id, { active: e.target.checked })} /><span>{account.active ? "نشط" : "موقوف"}</span></label></div>
            <Progress value={usedToday} max={Math.max(Number(account.adLimit || 0), usedToday || 1)} />
            <div className="inline-editor account-limit-editor">
              <label>الحد اليومي<input type="number" min="0" key={`${account.id}-${account.adLimit}`} defaultValue={account.adLimit} onBlur={(e) => void changeAccountLimit(account, e.target.value)} /></label>
              <span>مناديب الفرع: <b>{reps.length}</b></span>
              <span>النشطون: <b>{activeReps}</b></span>
              <span>مجدول اليوم: <b>{usedToday}</b></span>
            </div>
            {overLimit ? <div className="inline-warning"><WarningCircle size={16} />تكليفات اليوم أعلى من الحد اليومي الجديد. هذا تنبيه فقط.</div> : null}
            <div className="account-card-actions"><ConfirmButton confirmText="حذف الفرع؟ لن يتم حذف الإعلانات المرتبطة به تلقائيًا." onConfirm={() => removeAccount(account.id)}><Trash size={17} />حذف</ConfirmButton></div>
          </article>;
        })}
      </div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>مناديب الفروع</h2><p>المندوب غير النشط أو في إجازة لا يدخل في أي جدول جديد.</p></div></div>
      {!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف أول مندوب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>رقم الجوال</th><th>الفرع</th><th>تكليفات مفتوحة</th><th>الحالة</th><th></th></tr></thead><tbody>
        {agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}>
          <td><strong>{agent.name}</strong></td>
          <td className="ltr-cell">{agent.phone}</td>
          <td><select className="inline-select" value={agent.accountId || ""} onChange={(e) => void updateAgent(agent.id, { accountId: e.target.value })}><option value="">غير محدد</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></td>
          <td>{activeAdCountAgent(agent.id).toLocaleString("ar-SA-u-nu-latn")}</td>
          <td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "إجازة / موقوف"}</span></label></td>
          <td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
