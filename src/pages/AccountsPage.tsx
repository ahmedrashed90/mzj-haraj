import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Buildings, FloppyDisk, Plus, Storefront, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import {
  addAccount,
  addAgent,
  removeAccount,
  removeAgent,
  savePublishingSettings,
  updateAccount,
  updateAgent,
} from "../data";
import { dateKey } from "../schedule";
import { defaultBranchAdvertiserName } from "../branch-advertiser";
import type { AgentType } from "../types";
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
  const [agentType, setAgentType] = useState<AgentType>("cash");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setHarajName(publishingSettings.accountName || ""); setDailyLimit(String(publishingSettings.dailyLimit || "")); }, [publishingSettings.accountName, publishingSettings.dailyLimit]);
  useEffect(() => { setBranchAdvertiserDrafts(Object.fromEntries(accounts.map((branch) => [branch.id, branch.advertiserName || defaultBranchAdvertiserName(branch.name)]))); }, [accounts]);

  const today = dateKey(new Date());
  const todayAds = useMemo(() => ads.filter((ad) => ad.scheduledDate === today && ad.status !== "closed"), [ads, today]);
  const activeBranchIds = useMemo(() => new Set(accounts.filter((branch) => branch.active !== false).map((branch) => branch.id)), [accounts]);
  const activeAgents = agents.filter((agent) => agent.active && agent.accountId && activeBranchIds.has(agent.accountId));
  const unassignedActiveAgents = agents.filter((agent) => agent.active && (!agent.accountId || !activeBranchIds.has(agent.accountId))).length;
  const activeBranches = accounts.filter((branch) => branch.active !== false && activeAgents.some((agent) => agent.accountId === branch.id));
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
    try { await addAccount({ name: branchName.trim(), advertiserName: branchAdvertiserName.trim() || defaultBranchAdvertiserName(branchName.trim()), adLimit: 0, note: branchNote.trim(), active: true }); setBranchName(""); setBranchNote(""); setBranchAdvertiserName(""); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة الفرع"); }
    finally { setSaving(false); }
  }

  async function saveBranchAdvertiser(branchId: string) {
    const branch = accounts.find((item) => item.id === branchId); if (!branch) return;
    const value = String(branchAdvertiserDrafts[branchId] || "").trim();
    if (!value) return setError("اكتب اسم المعرض الذي سيظهر داخل صيغة إعلان الفرع.");
    setSavingBranchId(branchId); setError(""); setNotice("");
    try { await updateAccount(branchId, { advertiserName: value }); setNotice(`تم حفظ اسم المعرض داخل إعلانات فرع ${branch.name}: ${value}`); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ اسم المعرض للفرع"); }
    finally { setSavingBranchId(""); }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!agentName.trim() || !agentPhone.trim()) return setError("اكتب اسم المندوب ورقم الجوال.");
    if (!agentBranchId) return setError("اختر فرع المندوب.");
    setSaving(true);
    try { await addAgent({ name: agentName.trim(), phone: agentPhone.trim(), accountId: agentBranchId, agentType, active: true }); setAgentName(""); setAgentPhone(""); setAgentType("cash"); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة المندوب"); }
    finally { setSaving(false); }
  }



  return <>
    <PageTitle title="إعداد النشر والمناديب" subtitle="حدد حساب حراج والحد اليومي، وأضف المناديب النشطين. التوزيع يتم تلقائيًا على جميع المناديب بالتتابع بدون فترات نشر." />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}
    {!publishingSettings.accountName || !publishingSettings.dailyLimit ? <div className="alert warning"><WarningCircle size={19} />احفظ اسم حساب حراج والحد اليومي قبل إنشاء جدول نشر جديد.</div> : null}
    {unassignedActiveAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedActiveAgents} مندوب نشط بدون فرع نشط. لن يدخل في التوزيع حتى يتم ربطه بفرع نشط.</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="حد حساب حراج اليومي" value={publishingSettings.dailyLimit || 0} hint="إجمالي الشركة في اليوم" tone="info" />
      <StatCard label="المناديب داخل التوزيع" value={activeAgents.length} hint="دور واحد مستمر على جميع النشطين" tone="good" />
      <StatCard label="المجدول اليوم" value={todayAds.length} hint={`متبقي ${Math.max(0, publishingSettings.dailyLimit - todayAds.length)}`} tone="good" />
      <StatCard label="الفروع النشطة" value={activeBranches.length} hint="الفرع يتبع المندوب المكلف" />
    </section>

    <section className="panel single-account-panel">
      <div className="panel-head"><div><h2><Storefront size={21} /> حساب حراج المستخدم حاليًا</h2><p>الحد اليومي هو عدد الإعلانات الثابت لكل يوم نشر، والنظام يوزع هذه الإعلانات تلقائيًا على جميع المناديب النشطين بالتتابع.</p></div></div>
      <form className="publishing-settings-form" onSubmit={saveHarajSettings}><label>اسم حساب / متجر حراج<input value={harajName} onChange={(e) => setHarajName(e.target.value)} placeholder="اكتب الاسم كما يظهر في حراج" /></label><label>الحد اليومي للحساب<input type="number" min="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="مثال: 15" /></label><button className="primary-button" disabled={saving}><FloppyDisk size={18} />حفظ إعداد النشر</button></form>
      <div className="single-account-rule"><strong>قاعدة العدد والتوزيع:</strong> الرقم المكتوب في «الحد اليومي للحساب» هو العدد النهائي لكل يوم. مثال: 3 إعلانات يوميًا = 21 إعلانًا في أسبوع كامل من السبت إلى الجمعة. كل إعلان ينتقل تلقائيًا للمندوب التالي من جميع المناديب النشطين، ويستمر الدور بين الأيام بدون إعادة البداية.</div>
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createBranch}><div className="panel-head"><div><h2><Buildings size={20} /> إضافة فرع</h2><p>الفرع يحدد اسم المعرض المستخدم وارتباط المندوب التنظيمي.</p></div></div><label>اسم الفرع<input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="مثال: الملتقى" /></label><label>اسم المعرض داخل صيغة الإعلان<input value={branchAdvertiserName} onChange={(e) => setBranchAdvertiserName(e.target.value)} placeholder={branchName ? defaultBranchAdvertiserName(branchName) : "مثال: شركة الملتقى للسيارات"} /></label><label>ملاحظة (اختياري)<input value={branchNote} onChange={(e) => setBranchNote(e.target.value)} placeholder="ملاحظة داخلية" /></label><button className="primary-button" disabled={saving}><Plus size={18} />إضافة الفرع</button></form>
      <form className="panel form-panel" onSubmit={createAgent}><div className="panel-head"><div><h2><UsersThree size={20} /> إضافة مندوب</h2><p>حدد الفرع ونوع المندوب. نوع «تقسيط» يجهز عنوان حراج تمويلي تلقائيًا.</p></div></div><div className="form-grid"><label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} /></label><label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} inputMode="tel" /></label></div><div className="form-grid"><label>الفرع<select value={agentBranchId} onChange={(e) => setAgentBranchId(e.target.value)}><option value="">اختر الفرع</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>نوع المندوب<select value={agentType} onChange={(e) => setAgentType(e.target.value as AgentType)}><option value="cash">كاش</option><option value="installment">تقسيط</option></select></label></div><button className="primary-button" disabled={saving || !accounts.length}><Plus size={18} />إضافة المندوب</button></form>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2><UsersThree size={20} /> دور التوزيع التلقائي</h2><p>هذا هو ترتيب المناديب الذي يستخدمه الجدول. بعد آخر اسم يكمل من الأول، والدور لا يبدأ من جديد مع بداية كل يوم.</p></div></div>
      {!activeAgents.length ? <EmptyState title="لا يوجد مناديب داخل الدور" text="فعّل المندوب واربطه بفرع نشط ليدخل تلقائيًا في التوزيع." /> : <div className="branch-summary-grid">{activeAgents.map((agent, index) => <div className="branch-summary-card" key={agent.id}><strong>{index + 1}. {agent.name}</strong><span>{accounts.find((branch) => branch.id === agent.accountId)?.name || "بدون فرع"}</span><b>{agent.agentType === "installment" ? "تقسيط" : "كاش"}</b><small>{agent.phone}</small></div>)}</div>}
    </section>



    <section className="panel"><div className="panel-head"><div><h2>الفروع</h2><p>لكل فرع اسم معرض مستقل يظهر داخل بياناته ويمكن تعديله في أي وقت.</p></div></div>{!accounts.length ? <EmptyState title="لا توجد فروع" text="أضف الفروع التي يعمل بها المناديب." /> : <div className="account-admin-grid">{accounts.map((branch) => { const reps = agents.filter((agent) => agent.accountId === branch.id); const active = reps.filter((agent) => agent.active && branch.active !== false).length; return <article className={`account-admin-card ${branch.active ? "" : "disabled"}`} key={branch.id}><div className="account-card-head"><div><strong>{branch.name}</strong><span>{branch.note || "فرع داخلي"}</span></div><label className="switch-label"><input type="checkbox" checked={branch.active} onChange={(e) => void updateAccount(branch.id, { active: e.target.checked })} /><span>{branch.active ? "نشط" : "موقوف"}</span></label></div><div className="inline-editor"><span>إجمالي المناديب: <b>{reps.length}</b></span><span>النشطون: <b>{active}</b></span></div><div className="branch-advertiser-editor"><label>اسم المعرض داخل صيغة الإعلان<input value={branchAdvertiserDrafts[branch.id] ?? branch.advertiserName ?? defaultBranchAdvertiserName(branch.name)} onChange={(e) => setBranchAdvertiserDrafts((current) => ({ ...current, [branch.id]: e.target.value }))} /></label><button className="secondary-button compact" onClick={() => void saveBranchAdvertiser(branch.id)} disabled={savingBranchId === branch.id}><FloppyDisk size={16} />{savingBranchId === branch.id ? "جارٍ الحفظ" : "حفظ المسمى"}</button></div><div className="account-card-actions"><ConfirmButton confirmText="حذف الفرع؟ لن يتم حذف التكليفات القديمة تلقائيًا." onConfirm={() => removeAccount(branch.id)}><Trash size={17} />حذف</ConfirmButton></div></article>; })}</div>}
    </section>

    <section className="panel"><div className="panel-head"><div><h2>المناديب</h2><p>يمكن تعديل الفرع ونوع المندوب في أي وقت. المندوب الموقوف لا يدخل في تكليفات جديدة. كل المندوبين النشطين المرتبطين بفروع نشطة يدخلون تلقائيًا في الدور.</p></div></div>{!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف المناديب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>الجوال</th><th>الفرع</th><th>النوع</th><th>تكليفات مفتوحة</th><th>الحالة</th><th></th></tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}><td><strong>{agent.name}</strong></td><td className="ltr-cell">{agent.phone}</td><td><select className="inline-select" value={agent.accountId || ""} onChange={(e) => void updateAgent(agent.id, { accountId: e.target.value })}><option value="">غير محدد</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></td><td><select className="inline-select agent-type-select" value={agent.agentType || "cash"} onChange={(e) => void updateAgent(agent.id, { agentType: e.target.value as AgentType })}><option value="cash">كاش</option><option value="installment">تقسيط</option></select></td><td>{activeAdCountAgent(agent.id)}</td><td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "إجازة / موقوف"}</span></label></td><td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
