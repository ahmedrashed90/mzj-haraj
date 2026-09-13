import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Buildings, FloppyDisk, Plus, Storefront, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { addAccount, addAgent, removeAccount, removeAgent, savePublishingSettings, updateAccount, updateAgent } from "../data";
import { dateKey } from "../schedule";
import { defaultBranchAdvertiserName } from "../branch-advertiser";
import { ConfirmButton, EmptyState, PageTitle, StatCard } from "../components/Ui";

export function AccountsPage() {
  const { accounts, agents, ads, publishingSettings } = useAppData();
  const [harajName, setHarajName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchNote, setBranchNote] = useState("");
  const [branchAdvertiserName, setBranchAdvertiserName] = useState("");
  const [branchAdvertiserDrafts, setBranchAdvertiserDrafts] = useState<Record<string, string>>({});
  const [savingBranchId, setSavingBranchId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBranchId, setAgentBranchId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHarajName(publishingSettings.accountName || "");
    setDailyLimit(String(publishingSettings.dailyLimit || ""));
  }, [publishingSettings.accountName, publishingSettings.dailyLimit]);

  useEffect(() => {
    setBranchAdvertiserDrafts(Object.fromEntries(accounts.map((branch) => [branch.id, branch.advertiserName || defaultBranchAdvertiserName(branch.name)])));
  }, [accounts]);

  const today = dateKey(new Date());
  const todayAds = useMemo(() => ads.filter((ad) => ad.scheduledDate === today && ad.status !== "closed"), [ads, today]);
  const activeBranchIds = useMemo(() => new Set(accounts.filter((branch) => branch.active !== false).map((branch) => branch.id)), [accounts]);
  const activeAgents = agents.filter((agent) => agent.active && agent.accountId && activeBranchIds.has(agent.accountId));
  const unassignedActiveAgents = agents.filter((agent) => agent.active && (!agent.accountId || !activeBranchIds.has(agent.accountId))).length;
  const activeBranches = accounts.filter((branch) => branch.active !== false && activeAgents.some((agent) => agent.accountId === branch.id));
  const activeAdCountAgent = (id: string) => ads.filter((ad) => ad.status !== "closed" && ad.agentId === id).length;
  const totalActiveReps = activeAgents.length;

  function approximateBranchShare(branchId: string) {
    if (!totalActiveReps || !publishingSettings.dailyLimit) return 0;
    const reps = activeAgents.filter((agent) => agent.accountId === branchId).length;
    return Math.round((Number(publishingSettings.dailyLimit) * reps) / totalActiveReps);
  }

  async function saveHarajSettings(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const limit = Number(dailyLimit);
    if (!harajName.trim()) return setError("اكتب اسم حساب / متجر حراج كما يظهر داخل حراج.");
    if (!Number.isInteger(limit) || limit < 1) return setError("الحد اليومي يجب أن يكون رقمًا صحيحًا أكبر من صفر.");
    setSaving(true);
    try {
      await savePublishingSettings({ accountName: harajName.trim(), dailyLimit: limit });
      setNotice(`تم حفظ حساب حراج الحالي وحده اليومي = ${limit} إعلان.`);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ إعدادات النشر"); }
    finally { setSaving(false); }
  }

  async function createBranch(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!branchName.trim()) return setError("اكتب اسم الفرع.");
    setSaving(true);
    try {
      await addAccount({ name: branchName.trim(), advertiserName: branchAdvertiserName.trim() || defaultBranchAdvertiserName(branchName.trim()), adLimit: 0, note: branchNote.trim(), active: true });
      setBranchName(""); setBranchNote(""); setBranchAdvertiserName("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة الفرع"); }
    finally { setSaving(false); }
  }

  async function saveBranchAdvertiser(branchId: string) {
    const branch = accounts.find((item) => item.id === branchId);
    if (!branch) return;
    const value = String(branchAdvertiserDrafts[branchId] || "").trim();
    if (!value) return setError("اكتب اسم المعرض الذي سيظهر داخل صيغة إعلان الفرع.");
    setSavingBranchId(branchId); setError(""); setNotice("");
    try {
      await updateAccount(branchId, { advertiserName: value });
      setNotice(`تم حفظ اسم المعرض داخل إعلانات فرع ${branch.name}: ${value}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ اسم المعرض للفرع");
    } finally {
      setSavingBranchId("");
    }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!agentName.trim() || !agentPhone.trim()) return setError("اكتب اسم المندوب ورقم الجوال.");
    if (!agentBranchId) return setError("اختر فرع المندوب.");
    setSaving(true);
    try {
      await addAgent({ name: agentName.trim(), phone: agentPhone.trim(), accountId: agentBranchId, active: true });
      setAgentName(""); setAgentPhone("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة المندوب"); }
    finally { setSaving(false); }
  }

  return <>
    <PageTitle title="إعداد النشر والمناديب" subtitle="حساب حراج واحد للشركة. الحد اليومي يتقسم على الفروع حسب عدد المناديب النشطين، ثم تتوزع حصة كل فرع على مناديبه." />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}
    {!publishingSettings.accountName || !publishingSettings.dailyLimit ? <div className="alert warning"><WarningCircle size={19} />احفظ اسم حساب حراج والحد اليومي قبل إنشاء جدول نشر جديد.</div> : null}
    {unassignedActiveAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedActiveAgents} مندوب نشط بدون فرع نشط. لن يدخل في أي توزيع جديد.</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="حد حساب حراج اليومي" value={publishingSettings.dailyLimit || 0} hint="إجمالي الشركة في اليوم" tone="info" />
      <StatCard label="المجدول اليوم" value={todayAds.length} hint={`متبقي ${Math.max(0, publishingSettings.dailyLimit - todayAds.length)}`} tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint="داخل الفروع النشطة" />
      <StatCard label="الفروع المشاركة" value={activeBranches.length} hint="يتم تقسيم العدد بينها" />
    </section>

    <section className="panel single-account-panel">
      <div className="panel-head"><div><h2><Storefront size={21} /> حساب حراج المستخدم حاليًا</h2><p>هذا هو حساب حراج الفعلي المستخدم للنشر والحد اليومي. اسم المعرض المكتوب داخل صيغة الإعلان يتحدد لكل فرع من إعدادات الفروع بالأسفل.</p></div></div>
      <form className="publishing-settings-form" onSubmit={saveHarajSettings}>
        <label>اسم حساب / متجر حراج<input value={harajName} onChange={(e) => setHarajName(e.target.value)} placeholder="اكتب الاسم كما يظهر في حراج" /></label>
        <label>الحد اليومي للحساب<input type="number" min="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="مثال: 25" /></label>
        <button className="primary-button" disabled={saving}><FloppyDisk size={18} />حفظ إعداد النشر</button>
      </form>
      <div className="single-account-rule"><strong>قاعدة التوزيع:</strong> الحد اليومي هو إجمالي الحساب الواحد. السيستم يقسمه أولًا على الفروع حسب عدد المناديب النشطين في كل فرع، وبعدها يوازن حصة الفرع بين مناديبه. الفرع لا يملك حد حراج مستقل.</div>
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createBranch}>
        <div className="panel-head"><div><h2><Buildings size={20} /> إضافة فرع</h2><p>الفرع يدخل في توزيع الحد اليومي طالما نشط وفيه مناديب نشطون.</p></div></div>
        <label>اسم الفرع<input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="مثال: الملتقى" /></label>
        <label>اسم المعرض داخل صيغة الإعلان<input value={branchAdvertiserName} onChange={(e) => setBranchAdvertiserName(e.target.value)} placeholder={branchName ? defaultBranchAdvertiserName(branchName) : "مثال: شركة الملتقى للسيارات"} /></label>
        <label>ملاحظة (اختياري)<input value={branchNote} onChange={(e) => setBranchNote(e.target.value)} placeholder="ملاحظة داخلية" /></label>
        <button className="primary-button" disabled={saving}><Plus size={18} />إضافة الفرع</button>
      </form>

      <form className="panel form-panel" onSubmit={createAgent}>
        <div className="panel-head"><div><h2><UsersThree size={20} /> إضافة مندوب</h2><p>المندوب يأخذ تكليفاته من حصة الفرع المرتبط به فقط.</p></div></div>
        <div className="form-grid"><label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} /></label><label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} inputMode="tel" /></label></div>
        <label>الفرع<select value={agentBranchId} onChange={(e) => setAgentBranchId(e.target.value)}><option value="">اختر الفرع</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <button className="primary-button" disabled={saving || !accounts.length}><Plus size={18} />إضافة المندوب</button>
      </form>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>الفروع</h2><p>لكل فرع اسم معرض مستقل يظهر داخل صيغة الإعلان. يمكنك تعديله في أي وقت بدون تغيير اسم الفرع أو حساب حراج الفعلي.</p></div></div>
      {!accounts.length ? <EmptyState title="لا توجد فروع" text="أضف الفروع التي يعمل بها المناديب." /> : <div className="account-admin-grid">{accounts.map((branch) => {
        const reps = agents.filter((agent) => agent.accountId === branch.id);
        const active = reps.filter((agent) => agent.active && branch.active !== false).length;
        const approximate = approximateBranchShare(branch.id);
        return <article className={`account-admin-card ${branch.active ? "" : "disabled"}`} key={branch.id}>
          <div className="account-card-head"><div><strong>{branch.name}</strong><span>{branch.note || "فرع داخلي"}</span></div><label className="switch-label"><input type="checkbox" checked={branch.active} onChange={(e) => void updateAccount(branch.id, { active: e.target.checked })} /><span>{branch.active ? "نشط" : "موقوف"}</span></label></div>
          <div className="inline-editor"><span>إجمالي المناديب: <b>{reps.length}</b></span><span>النشطون: <b>{active}</b></span><span>حصة تقريبية/يوم: <b>≈ {branch.active && active ? approximate : 0}</b></span></div>
          <div className="branch-advertiser-editor"><label>اسم المعرض داخل صيغة الإعلان<input value={branchAdvertiserDrafts[branch.id] ?? branch.advertiserName ?? defaultBranchAdvertiserName(branch.name)} onChange={(e) => setBranchAdvertiserDrafts((current) => ({ ...current, [branch.id]: e.target.value }))} /></label><button className="secondary-button compact" onClick={() => void saveBranchAdvertiser(branch.id)} disabled={savingBranchId === branch.id}><FloppyDisk size={16} />{savingBranchId === branch.id ? "جارٍ الحفظ" : "حفظ المسمى"}</button></div>
          <div className="account-card-actions"><ConfirmButton confirmText="حذف الفرع؟ لن يتم حذف التكليفات القديمة تلقائيًا." onConfirm={() => removeAccount(branch.id)}><Trash size={17} />حذف</ConfirmButton></div>
        </article>;
      })}</div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>المناديب</h2><p>حالة «إجازة / موقوف» تستبعد المندوب من حصة فرعه في أي جدول جديد فورًا.</p></div></div>
      {!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف المناديب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>الجوال</th><th>الفرع</th><th>تكليفات مفتوحة</th><th>الحالة</th><th></th></tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}>
        <td><strong>{agent.name}</strong></td><td className="ltr-cell">{agent.phone}</td>
        <td><select className="inline-select" value={agent.accountId || ""} onChange={(e) => void updateAgent(agent.id, { accountId: e.target.value })}><option value="">غير محدد</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></td>
        <td>{activeAdCountAgent(agent.id)}</td><td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "إجازة / موقوف"}</span></label></td>
        <td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td>
      </tr>)}</tbody></table></div>}
    </section>
  </>;
}
