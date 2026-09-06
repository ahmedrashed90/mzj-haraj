import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const currentWeek = getWeekStartKey();
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === currentWeek && ad.status !== "closed"), [ads, currentWeek]);
  const totalCapacity = accounts.filter((account) => account.active).reduce((sum, account) => sum + Number(account.adLimit || 0), 0);
  const adCountAccount = (id: string) => weekAds.filter((ad) => ad.accountId === id).length;
  const adCountAgent = (id: string) => weekAds.filter((ad) => ad.agentId === id).length;

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    const limit = Number(accountLimit);
    if (!accountName.trim()) return setError("اكتب اسم حساب حراج.");
    if (!Number.isInteger(limit) || limit < 0) return setError("عدد الإعلانات يجب أن يكون رقمًا صحيحًا.");
    setSaving(true);
    try {
      await addAccount({ name: accountName.trim(), adLimit: limit, note: accountNote.trim(), active: true });
      setAccountName(""); setAccountLimit(""); setAccountNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إضافة الحساب");
    } finally { setSaving(false); }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!agentName.trim() || !agentPhone.trim()) return setError("اكتب اسم المندوب ورقم الجوال.");
    setSaving(true);
    try {
      await addAgent({ name: agentName.trim(), phone: agentPhone.trim(), active: true });
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
      if (next < scheduled) {
        setNotice(`تم حفظ حد ${account.name} = ${next}. يوجد ${scheduled} تكليفًا بالفعل في الأسبوع الحالي؛ لن يتم حذفها أو منعها.`);
      } else {
        setNotice(`تم تحديث حد ${account.name} إلى ${next}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحديث حد الحساب");
    }
  }

  return <>
    <PageTitle
      title="الحسابات والمناديب"
      subtitle="حدود حسابات حراج مرنة وتتغير حسب وضع الحساب. إجمالي الحدود هو السعة التي يبني عليها النظام الجدول الأسبوعي لكل مناديب الشركة."
    />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="إجمالي سعة الشركة" value={totalCapacity} hint="مجموع حدود الحسابات النشطة" tone="info" />
      <StatCard label="تكليفات الأسبوع الحالي" value={weekAds.length} hint="المجدولة وغير المنتهية" tone="good" />
      <StatCard label="المناديب النشطون" value={agents.filter((agent) => agent.active).length} hint="التوزيع عليهم تلقائي" />
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createAccount}>
        <div className="panel-head"><div><h2>إضافة حساب حراج</h2><p>لا يتم حفظ أي كلمة مرور لحراج.</p></div></div>
        <label>اسم الحساب<input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="اسم حساب حراج" /></label>
        <label>حد الإعلانات الحالي<input type="number" min="0" value={accountLimit} onChange={(e) => setAccountLimit(e.target.value)} placeholder="0" /></label>
        <label>ملاحظة (اختياري)<input value={accountNote} onChange={(e) => setAccountNote(e.target.value)} placeholder="وصف داخلي فقط" /></label>
        <button className="primary-button" disabled={saving}><Plus size={18} />إضافة الحساب</button>
      </form>

      <form className="panel form-panel" onSubmit={createAgent}>
        <div className="panel-head"><div><h2>إضافة مندوب</h2><p>لا يوجد ربط بفرع أو حصة يدوية. جميع المناديب النشطين يدخلون في التوزيع الأسبوعي.</p></div></div>
        <div className="form-grid">
          <label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="اسم المندوب" /></label>
          <label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="05xxxxxxxx" inputMode="tel" /></label>
        </div>
        <button className="primary-button" disabled={saving}><Plus size={18} />إضافة المندوب</button>
      </form>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>حسابات حراج</h2><p>يمكن خفض أو رفع الحد في أي وقت. لو أصبح أقل من تكليفات موجودة بالفعل سيظهر تنبيه فقط.</p></div></div>
      {!accounts.length ? <EmptyState title="لا توجد حسابات حراج" text="أضف أول حساب من النموذج أعلى الصفحة." /> : <div className="account-admin-grid">
        {accounts.map((account) => {
          const used = adCountAccount(account.id);
          const overLimit = used > Number(account.adLimit || 0);
          return <article className={`account-admin-card ${account.active ? "" : "disabled"} ${overLimit ? "over-limit" : ""}`} key={account.id}>
            <div className="account-card-head"><div><strong>{account.name}</strong><span>{account.note || "بدون ملاحظة"}</span></div><label className="switch-label"><input type="checkbox" checked={account.active} onChange={(e) => void updateAccount(account.id, { active: e.target.checked })} /><span>{account.active ? "نشط" : "موقوف"}</span></label></div>
            <Progress value={used} max={Math.max(Number(account.adLimit || 0), used || 1)} />
            <div className="inline-editor account-limit-editor">
              <label>حد الحساب<input type="number" min="0" key={`${account.id}-${account.adLimit}`} defaultValue={account.adLimit} onBlur={(e) => void changeAccountLimit(account, e.target.value)} /></label>
              <span>تكليفات الأسبوع: <b>{used}</b></span>
              <span>المتاح للتخطيط: <b>{Math.max(0, Number(account.adLimit || 0) - used)}</b></span>
            </div>
            {overLimit ? <div className="inline-warning"><WarningCircle size={16} />التكليفات الحالية أعلى من الحد الجديد. هذا تنبيه فقط.</div> : null}
            <div className="account-card-actions"><ConfirmButton confirmText="حذف حساب حراج؟ لن يتم حذف الإعلانات المرتبطة به تلقائيًا." onConfirm={() => removeAccount(account.id)}><Trash size={17} />حذف</ConfirmButton></div>
          </article>;
        })}
      </div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2><UsersThree size={20} /> مناديب الشركة</h2><p>النظام يوازن تكليفات الأسبوع على كل المندوبين النشطين تلقائيًا.</p></div></div>
      {!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف أول مندوب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>رقم الجوال</th><th>تكليفات الأسبوع</th><th>الحالة</th><th></th></tr></thead><tbody>
        {agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}>
          <td><strong>{agent.name}</strong></td>
          <td className="ltr-cell">{agent.phone}</td>
          <td>{adCountAgent(agent.id).toLocaleString("ar-SA-u-nu-latn")}</td>
          <td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "موقوف"}</span></label></td>
          <td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
