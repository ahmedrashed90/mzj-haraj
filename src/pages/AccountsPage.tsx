import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Buildings, FloppyDisk, Plus, Storefront, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { addAccount, addAgent, removeAccount, removeAgent, savePublishingSettings, updateAccount, updateAgent } from "../data";
import { dateKey } from "../schedule";
import { ConfirmButton, EmptyState, PageTitle, StatCard } from "../components/Ui";

export function AccountsPage() {
  const { accounts, agents, ads, publishingSettings } = useAppData();
  const [harajName, setHarajName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchNote, setBranchNote] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBranchId, setAgentBranchId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setHarajName(publishingSettings.accountName || ""); setDailyLimit(String(publishingSettings.dailyLimit || "")); }, [publishingSettings.accountName, publishingSettings.dailyLimit]);

  const today = dateKey(new Date());
  const todayAds = useMemo(() => ads.filter((ad) => ad.scheduledDate === today && ad.status !== "closed"), [ads, today]);
  const activeAgents = agents.filter((agent) => agent.active && agent.accountId);
  const unassignedActiveAgents = agents.filter((agent) => agent.active && !agent.accountId).length;
  const activeBranches = new Set(activeAgents.map((agent) => agent.accountId).filter(Boolean)).size;
  const activeAdCountAgent = (id: string) => ads.filter((ad) => ad.status !== "closed" && ad.agentId === id).length;

  async function saveHarajSettings(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const limit = Number(dailyLimit);
    if (!harajName.trim()) return setError("اكتب اسم حساب / متجر حراج كما يظهر داخل حراج.");
    if (!Number.isInteger(limit) || limit < 1) return setError("الحد اليومي يجب أن يكون رقمًا صحيحًا أكبر من صفر.");
    setSaving(true);
    try { await savePublishingSettings({ accountName: harajName.trim(), dailyLimit: limit }); setNotice(`تم حفظ حساب حراج الحالي وحده اليومي = ${limit} إعلان.`); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ إعدادات النشر"); }
    finally { setSaving(false); }
  }

  async function createBranch(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!branchName.trim()) return setError("اكتب اسم الفرع.");
    setSaving(true);
    try { await addAccount({ name: branchName.trim(), adLimit: 0, note: branchNote.trim(), active: true }); setBranchName(""); setBranchNote(""); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة الفرع"); }
    finally { setSaving(false); }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!agentName.trim() || !agentPhone.trim()) return setError("اكتب اسم المندوب ورقم الجوال.");
    if (!agentBranchId) return setError("اختر فرع المندوب.");
    setSaving(true);
    try { await addAgent({ name: agentName.trim(), phone: agentPhone.trim(), accountId: agentBranchId, active: true }); setAgentName(""); setAgentPhone(""); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة المندوب"); }
    finally { setSaving(false); }
  }

  return <>
    <PageTitle title="إعداد النشر والمناديب" subtitle="حساب حراج واحد للشركة. حد الحساب اليومي يتوزع على كل المناديب النشطين في جميع الفروع؛ الفرع للتنظيم والتقارير فقط." />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}
    {!publishingSettings.accountName || !publishingSettings.dailyLimit ? <div className="alert warning"><WarningCircle size={19} />احفظ اسم حساب حراج والحد اليومي قبل إنشاء جدول نشر جديد.</div> : null}
    {unassignedActiveAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedActiveAgents} مندوب نشط بدون فرع. لن يدخل في التوزيع حتى تربطه بفرع.</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="حد حساب حراج اليومي" value={publishingSettings.dailyLimit || 0} hint="سعة الشركة كلها في اليوم" tone="info" />
      <StatCard label="المجدول اليوم" value={todayAds.length} hint={`متبقي ${Math.max(0, publishingSettings.dailyLimit - todayAds.length)}`} tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint="من جميع الفروع" />
      <StatCard label="الفروع المشاركة" value={activeBranches} hint="للتنظيم فقط" />
    </section>

    <section className="panel single-account-panel">
      <div className="panel-head"><div><h2><Storefront size={21} /> حساب حراج المستخدم حاليًا</h2><p>اسم الحساب هنا هو نفسه الذي سيظهر تلقائيًا داخل جملة «متوفرة الآن لدى ...» في كل صيغة إعلان.</p></div></div>
      <form className="publishing-settings-form" onSubmit={saveHarajSettings}>
        <label>اسم حساب / متجر حراج<input value={harajName} onChange={(e) => setHarajName(e.target.value)} placeholder="اكتب الاسم كما يظهر في حراج" /></label>
        <label>الحد اليومي للحساب<input type="number" min="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="مثال: 14" /></label>
        <button className="primary-button" disabled={saving}><FloppyDisk size={18} />حفظ إعداد النشر</button>
      </form>
      <div className="single-account-rule"><strong>قاعدة التوزيع:</strong> الرقم ده لا يتكرر على كل فرع ولا على كل مندوب. هو إجمالي ما يستطيع الحساب الواحد نشره في اليوم، والسيستم يقسمه بالتساوي قدر الإمكان على كل المناديب النشطين.</div>
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createBranch}>
        <div className="panel-head"><div><h2><Buildings size={20} /> إضافة فرع</h2><p>الفرع لا يملك حد نشر مستقل في الوضع الحالي.</p></div></div>
        <label>اسم الفرع<input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="مثال: الملتقى" /></label>
        <label>ملاحظة (اختياري)<input value={branchNote} onChange={(e) => setBranchNote(e.target.value)} placeholder="ملاحظة داخلية" /></label>
        <button className="primary-button" disabled={saving}><Plus size={18} />إضافة الفرع</button>
      </form>

      <form className="panel form-panel" onSubmit={createAgent}>
        <div className="panel-head"><div><h2><UsersThree size={20} /> إضافة مندوب</h2><p>كل مندوب نشط يدخل في التوزيع العام مهما كان فرعه.</p></div></div>
        <div className="form-grid"><label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} /></label><label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} inputMode="tel" /></label></div>
        <label>الفرع<select value={agentBranchId} onChange={(e) => setAgentBranchId(e.target.value)}><option value="">اختر الفرع</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <button className="primary-button" disabled={saving || !accounts.length}><Plus size={18} />إضافة المندوب</button>
      </form>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>الفروع</h2><p>الفروع تستخدم لمعرفة مدير الفرع وتجميع PDF والتقارير؛ لا تقسم حد حساب حراج.</p></div></div>
      {!accounts.length ? <EmptyState title="لا توجد فروع" text="أضف الفروع التي يعمل بها المناديب." /> : <div className="account-admin-grid">{accounts.map((branch) => {
        const reps = agents.filter((agent) => agent.accountId === branch.id); const active = reps.filter((agent) => agent.active).length;
        return <article className={`account-admin-card ${branch.active ? "" : "disabled"}`} key={branch.id}>
          <div className="account-card-head"><div><strong>{branch.name}</strong><span>{branch.note || "فرع داخلي"}</span></div><label className="switch-label"><input type="checkbox" checked={branch.active} onChange={(e) => void updateAccount(branch.id, { active: e.target.checked })} /><span>{branch.active ? "نشط" : "موقوف"}</span></label></div>
          <div className="inline-editor"><span>إجمالي المناديب: <b>{reps.length}</b></span><span>النشطون: <b>{active}</b></span></div>
          <div className="account-card-actions"><ConfirmButton confirmText="حذف الفرع؟ لن يتم حذف التكليفات القديمة تلقائيًا." onConfirm={() => removeAccount(branch.id)}><Trash size={17} />حذف</ConfirmButton></div>
        </article>;
      })}</div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>المناديب</h2><p>حالة «إجازة / موقوف» تستبعد المندوب من أي توزيع جديد فورًا.</p></div></div>
      {!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف المناديب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>الجوال</th><th>الفرع</th><th>تكليفات مفتوحة</th><th>الحالة</th><th></th></tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}>
        <td><strong>{agent.name}</strong></td><td className="ltr-cell">{agent.phone}</td>
        <td><select className="inline-select" value={agent.accountId || ""} onChange={(e) => void updateAgent(agent.id, { accountId: e.target.value })}><option value="">غير محدد</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></td>
        <td>{activeAdCountAgent(agent.id)}</td><td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "إجازة / موقوف"}</span></label></td>
        <td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td>
      </tr>)}</tbody></table></div>}
    </section>
  </>;
}
