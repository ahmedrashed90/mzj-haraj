import { useMemo, useState, type FormEvent } from "react";
import { Buildings, Plus, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { addAccount, addAgent, removeAccount, removeAgent, updateAccount, updateAgent } from "../data";
import { getWeekStartKey } from "../schedule";
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

  const currentWeek = getWeekStartKey();
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === currentWeek && ad.status !== "closed"), [ads, currentWeek]);
  const activeAccounts = accounts.filter((account) => account.active);
  const totalCapacity = activeAccounts.reduce((sum, account) => sum + Number(account.adLimit || 0), 0);
  const adCountAccount = (id: string) => weekAds.filter((ad) => ad.accountId === id).length;
  const adCountAgent = (id: string) => weekAds.filter((ad) => ad.agentId === id).length;
  const activeAgentCount = agents.filter((agent) => agent.active).length;
  const unassignedAgents = agents.filter((agent) => !agent.accountId).length;

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    const limit = Number(accountLimit);
    if (!accountName.trim()) return setError("اكتب اسم الفرع / حساب حراج.");
    if (!Number.isInteger(limit) || limit < 0) return setError("عدد الإعلانات يجب أن يكون رقمًا صحيحًا.");
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
    if (!Number.isInteger(next) || next < 0) return setError("حد الحساب يجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.");
    try {
      await updateAccount(account.id, { adLimit: next });
      const scheduled = adCountAccount(account.id);
      if (next < scheduled) setNotice(`تم حفظ حد ${account.name} = ${next}. يوجد ${scheduled} تكليفًا بالفعل؛ هذا تنبيه فقط.`);
      else setNotice(`تم تحديث حد ${account.name} إلى ${next}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحديث حد الحساب");
    }
  }

  return <>
    <PageTitle
      title="الفروع وحسابات حراج"
      subtitle="كل فرع له حد إعلانات حالي متغير، والتوزيع يتم فقط على المناديب النشطين داخل نفس الفرع."
    />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}
    {unassignedAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedAgents} مندوب بدون فرع. لن يدخلوا في التوزيع حتى يتم ربطهم بفرع.</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="إجمالي السعة الحالية" value={totalCapacity} hint="مجموع حدود الفروع النشطة" tone="info" />
      <StatCard label="تكليفات الأسبوع" value={weekAds.length} hint="المجدولة وغير المنتهية" tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgentCount} hint="يدخلون في توزيع فروعهم" />
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createAccount}>
        <div className="panel-head"><div><h2><Buildings size={20} /> إضافة فرع / حساب حراج</h2><p>الحد مرن ويمكن تغييره كل أسبوع حسب وضع الحساب في حراج.</p></div></div>
        <label>اسم الفرع / الحساب<input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="مثال: فرع الرياض" /></label>
        <label>حد الإعلانات الحالي<input type="number" min="0" value={accountLimit} onChange={(e) => setAccountLimit(e.target.value)} placeholder="0" /></label>
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
      <div className="panel-head"><div><h2>الفروع وحدود النشر</h2><p>رفع أو خفض الحد لا يغيّر عدد المناديب، ويستخدم الحد الجديد عند إنشاء الجدول القادم.</p></div></div>
      {!accounts.length ? <EmptyState title="لا توجد فروع" text="أضف أول فرع من النموذج أعلى الصفحة." /> : <div className="account-admin-grid">
        {accounts.map((account) => {
          const used = adCountAccount(account.id);
          const reps = agents.filter((agent) => agent.accountId === account.id);
          const activeReps = reps.filter((agent) => agent.active).length;
          const overLimit = used > Number(account.adLimit || 0);
          return <article className={`account-admin-card ${account.active ? "" : "disabled"} ${overLimit ? "over-limit" : ""}`} key={account.id}>
            <div className="account-card-head"><div><strong>{account.name}</strong><span>{account.note || "حساب حراج الفرع"}</span></div><label className="switch-label"><input type="checkbox" checked={account.active} onChange={(e) => void updateAccount(account.id, { active: e.target.checked })} /><span>{account.active ? "نشط" : "موقوف"}</span></label></div>
            <Progress value={used} max={Math.max(Number(account.adLimit || 0), used || 1)} />
            <div className="inline-editor account-limit-editor">
              <label>حد الإعلانات<input type="number" min="0" key={`${account.id}-${account.adLimit}`} defaultValue={account.adLimit} onBlur={(e) => void changeAccountLimit(account, e.target.value)} /></label>
              <span>مناديب الفرع: <b>{reps.length}</b></span>
              <span>النشطون: <b>{activeReps}</b></span>
              <span>تكليفات الأسبوع: <b>{used}</b></span>
            </div>
            {overLimit ? <div className="inline-warning"><WarningCircle size={16} />التكليفات الحالية أعلى من الحد الجديد. هذا تنبيه فقط.</div> : null}
            <div className="account-card-actions"><ConfirmButton confirmText="حذف الفرع؟ لن يتم حذف الإعلانات المرتبطة به تلقائيًا." onConfirm={() => removeAccount(account.id)}><Trash size={17} />حذف</ConfirmButton></div>
          </article>;
        })}
      </div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>مناديب الفروع</h2><p>حدد الفرع والحالة لكل مندوب. المندوب غير النشط أو في إجازة لا يدخل في الجدول.</p></div></div>
      {!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف أول مندوب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>رقم الجوال</th><th>الفرع</th><th>تكليفات الأسبوع</th><th>الحالة</th><th></th></tr></thead><tbody>
        {agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}>
          <td><strong>{agent.name}</strong></td>
          <td className="ltr-cell">{agent.phone}</td>
          <td><select className="inline-select" value={agent.accountId || ""} onChange={(e) => void updateAgent(agent.id, { accountId: e.target.value })}><option value="">غير محدد</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></td>
          <td>{adCountAgent(agent.id).toLocaleString("ar-SA-u-nu-latn")}</td>
          <td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "إجازة / موقوف"}</span></label></td>
          <td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
