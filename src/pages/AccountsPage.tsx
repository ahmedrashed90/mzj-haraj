import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Buildings, Clock, FloppyDisk, Plus, Storefront, Trash, UsersThree, WarningCircle, X } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import {
  addAccount,
  addAgent,
  addPublishingPeriod,
  removeAccount,
  removeAgent,
  removePublishingPeriod,
  savePublishingSettings,
  updateAccount,
  updateAgent,
  updatePublishingPeriod,
} from "../data";
import { dateKey, publishingPeriodsDailyTotal } from "../schedule";
import { defaultBranchAdvertiserName } from "../branch-advertiser";
import type { Agent, AgentType, HarajAccount, PublishingPeriod } from "../types";
import { ConfirmButton, EmptyState, PageTitle, StatCard } from "../components/Ui";

function agentTypeLabel(value?: AgentType) { return value === "installment" ? "تقسيط" : "كاش"; }
function moveItem(values: string[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= values.length) return values;
  const next = [...values];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function AgentOrderPicker({ agentIds, onChange, agents, accounts }: { agentIds: string[]; onChange: (ids: string[]) => void; agents: Agent[]; accounts: HarajAccount[] }) {
  const [pick, setPick] = useState("");
  const branchById = useMemo(() => new Map(accounts.map((branch) => [branch.id, branch])), [accounts]);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const availableToAdd = agents.filter((agent) => !agentIds.includes(agent.id));
  function add() {
    if (!pick || agentIds.includes(pick)) return;
    onChange([...agentIds, pick]); setPick("");
  }
  return <div className="period-agent-picker">
    <div className="period-agent-add"><select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">اختر مندوب لإضافته للفترة</option>{availableToAdd.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {branchById.get(agent.accountId || "")?.name || "بدون فرع"} · {agentTypeLabel(agent.agentType)}</option>)}</select><button type="button" className="secondary-button compact" onClick={add} disabled={!pick}><Plus size={16} />إضافة</button></div>
    {!agentIds.length ? <div className="period-agent-empty">لم يتم اختيار مناديب لهذه الفترة.</div> : <div className="period-agent-order">{agentIds.map((id, index) => {
      const agent = agentById.get(id);
      return <div className="period-agent-row" key={id}><span className="order-number">{index + 1}</span><div><b>{agent?.name || "مندوب محذوف"}</b><small>{branchById.get(agent?.accountId || "")?.name || "بدون فرع"} · {agentTypeLabel(agent?.agentType)}{agent && !agent.active ? " · موقوف" : ""}</small></div><div className="period-agent-actions"><button type="button" className="icon-button" title="رفع الترتيب" disabled={index === 0} onClick={() => onChange(moveItem(agentIds, index, -1))}><ArrowUp size={15} /></button><button type="button" className="icon-button" title="خفض الترتيب" disabled={index === agentIds.length - 1} onClick={() => onChange(moveItem(agentIds, index, 1))}><ArrowDown size={15} /></button><button type="button" className="icon-danger" title="إزالة من الفترة" onClick={() => onChange(agentIds.filter((item) => item !== id))}><X size={15} /></button></div></div>;
    })}</div>}
  </div>;
}

function PeriodEditor({ period, agents, accounts, onError, onNotice }: { period: PublishingPeriod; agents: Agent[]; accounts: HarajAccount[]; onError: (value: string) => void; onNotice: (value: string) => void }) {
  const [name, setName] = useState(period.name);
  const [startTime, setStartTime] = useState(period.startTime);
  const [endTime, setEndTime] = useState(period.endTime);
  const [adCount, setAdCount] = useState(String(period.adCount));
  const [agentIds, setAgentIds] = useState<string[]>(period.agentIds || []);
  const [active, setActive] = useState(period.active !== false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setName(period.name); setStartTime(period.startTime); setEndTime(period.endTime); setAdCount(String(period.adCount)); setAgentIds(period.agentIds || []); setActive(period.active !== false); }, [period]);
  async function save() {
    onError(""); onNotice("");
    const count = Number(adCount);
    if (!name.trim()) return onError("اكتب اسم فترة النشر.");
    if (!startTime || !endTime || startTime >= endTime) return onError(`راجع وقت البداية والنهاية لفترة ${name || period.name}.`);
    if (!Number.isInteger(count) || count < 1) return onError("عدد الإعلانات في الفترة يجب أن يكون رقمًا صحيحًا أكبر من صفر.");
    if (!agentIds.length) return onError(`اختر مندوبًا واحدًا على الأقل لفترة ${name}.`);
    setSaving(true);
    try {
      await updatePublishingPeriod(period.id, { name: name.trim(), startTime, endTime, adCount: count, agentIds, active });
      onNotice(`تم حفظ فترة ${name.trim()} وترتيب المناديب بداخلها.`);
    } catch (e) { onError(e instanceof Error ? e.message : "تعذر حفظ فترة النشر"); }
    finally { setSaving(false); }
  }
  return <article className={`publishing-period-card ${active ? "" : "disabled"}`}>
    <div className="period-card-head"><div><Clock size={20} /><div><strong>{period.name}</strong><span>{period.startTime} - {period.endTime}</span></div></div><label className="switch-label tiny"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>{active ? "نشطة" : "موقوفة"}</span></label></div>
    <div className="period-fields"><label>اسم الفترة<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>من<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label><label>إلى<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label><label>إعلانات / يوم<input type="number" min="1" value={adCount} onChange={(e) => setAdCount(e.target.value)} /></label></div>
    <div className="period-order-head"><div><b>المناديب بالترتيب داخل الفترة</b><span>الإعلان الأول للرقم 1، ثم 2، ثم 3… وبعد آخر اسم يبدأ الترتيب من الأول عند الحاجة.</span></div></div>
    <AgentOrderPicker agentIds={agentIds} onChange={setAgentIds} agents={agents} accounts={accounts} />
    <div className="period-card-actions"><button type="button" className="secondary-button" onClick={() => void save()} disabled={saving}><FloppyDisk size={17} />{saving ? "جارٍ الحفظ" : "حفظ الفترة"}</button><ConfirmButton className="danger-button" confirmText={`حذف فترة ${period.name}؟`} onConfirm={() => removePublishingPeriod(period.id)}><Trash size={16} />حذف الفترة</ConfirmButton></div>
  </article>;
}

export function AccountsPage() {
  const { accounts, agents, ads, publishingSettings, publishingPeriods } = useAppData();
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
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodCount, setPeriodCount] = useState("");
  const [periodAgentIds, setPeriodAgentIds] = useState<string[]>([]);
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
  const periodsTotal = publishingPeriodsDailyTotal(publishingPeriods);
  const periodConfigReady = Number(publishingSettings.dailyLimit || 0) > 0 && periodsTotal === Number(publishingSettings.dailyLimit || 0) && publishingPeriods.some((period) => period.active !== false && period.adCount > 0);

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

  async function createPeriod(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const count = Number(periodCount);
    if (!periodName.trim()) return setError("اكتب اسم فترة النشر.");
    if (!periodStart || !periodEnd || periodStart >= periodEnd) return setError("حدد وقت بداية ونهاية صحيح لفترة النشر.");
    if (!Number.isInteger(count) || count < 1) return setError("عدد الإعلانات في الفترة يجب أن يكون رقمًا صحيحًا أكبر من صفر.");
    if (!periodAgentIds.length) return setError("اختر مناديب الفترة وحدد ترتيبهم.");
    setSaving(true);
    try {
      const maxOrder = publishingPeriods.reduce((max, item) => Math.max(max, Number(item.sortOrder || 0)), 0);
      await addPublishingPeriod({ name: periodName.trim(), startTime: periodStart, endTime: periodEnd, adCount: count, agentIds: periodAgentIds, active: true, sortOrder: maxOrder + 10 });
      setPeriodName(""); setPeriodStart(""); setPeriodEnd(""); setPeriodCount(""); setPeriodAgentIds([]);
      setNotice("تمت إضافة فترة النشر وترتيب المناديب.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة فترة النشر"); }
    finally { setSaving(false); }
  }

  return <>
    <PageTitle title="إعداد النشر والمناديب" subtitle="حدد حساب حراج والحد اليومي، نوع كل مندوب، ثم قسم اليوم إلى فترات نشر وحدد مناديب كل فترة بالترتيب." />
    {error ? <div className="alert error">{error}</div> : null}
    {notice ? <div className="alert success">{notice}</div> : null}
    {!publishingSettings.accountName || !publishingSettings.dailyLimit ? <div className="alert warning"><WarningCircle size={19} />احفظ اسم حساب حراج والحد اليومي قبل إنشاء جدول نشر جديد.</div> : null}
    {unassignedActiveAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedActiveAgents} مندوب نشط بدون فرع نشط. لن يدخل في أي فترة نشر.</div> : null}
    {publishingSettings.dailyLimit && !periodConfigReady ? <div className="alert warning"><WarningCircle size={19} />مجموع إعلانات الفترات النشطة حاليًا = {periodsTotal}. يجب أن يساوي الحد اليومي = {publishingSettings.dailyLimit} قبل إنشاء جدول جديد.</div> : null}

    <section className="stats-grid compact-stats">
      <StatCard label="حد حساب حراج اليومي" value={publishingSettings.dailyLimit || 0} hint="إجمالي الشركة في اليوم" tone="info" />
      <StatCard label="إعلانات الفترات" value={periodsTotal} hint={periodConfigReady ? "مطابق للحد اليومي" : "يحتاج ضبط"} tone={periodConfigReady ? "good" : "warn"} />
      <StatCard label="المجدول اليوم" value={todayAds.length} hint={`متبقي ${Math.max(0, publishingSettings.dailyLimit - todayAds.length)}`} tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint={`${activeBranches.length} فروع نشطة`} />
    </section>

    <section className="panel single-account-panel">
      <div className="panel-head"><div><h2><Storefront size={21} /> حساب حراج المستخدم حاليًا</h2><p>الحد اليومي للحساب كله. توزيعه الفعلي يتم من خلال فترات النشر بالأسفل، وليس بحصة تلقائية لكل فرع.</p></div></div>
      <form className="publishing-settings-form" onSubmit={saveHarajSettings}><label>اسم حساب / متجر حراج<input value={harajName} onChange={(e) => setHarajName(e.target.value)} placeholder="اكتب الاسم كما يظهر في حراج" /></label><label>الحد اليومي للحساب<input type="number" min="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="مثال: 15" /></label><button className="primary-button" disabled={saving}><FloppyDisk size={18} />حفظ إعداد النشر</button></form>
      <div className="single-account-rule"><strong>قاعدة التوزيع الجديدة:</strong> مجموع إعلانات الفترات النشطة يجب أن يساوي الحد اليومي. داخل كل فترة يتم التكليف على المناديب بالترتيب الذي تحدده أنت.</div>
    </section>

    <section className="two-form-columns setup-grid">
      <form className="panel form-panel" onSubmit={createBranch}><div className="panel-head"><div><h2><Buildings size={20} /> إضافة فرع</h2><p>الفرع يحدد اسم المعرض المستخدم وارتباط المندوب التنظيمي.</p></div></div><label>اسم الفرع<input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="مثال: الملتقى" /></label><label>اسم المعرض داخل صيغة الإعلان<input value={branchAdvertiserName} onChange={(e) => setBranchAdvertiserName(e.target.value)} placeholder={branchName ? defaultBranchAdvertiserName(branchName) : "مثال: شركة الملتقى للسيارات"} /></label><label>ملاحظة (اختياري)<input value={branchNote} onChange={(e) => setBranchNote(e.target.value)} placeholder="ملاحظة داخلية" /></label><button className="primary-button" disabled={saving}><Plus size={18} />إضافة الفرع</button></form>
      <form className="panel form-panel" onSubmit={createAgent}><div className="panel-head"><div><h2><UsersThree size={20} /> إضافة مندوب</h2><p>حدد الفرع ونوع المندوب. نوع «تقسيط» يجهز عنوان حراج تمويلي تلقائيًا.</p></div></div><div className="form-grid"><label>اسم المندوب<input value={agentName} onChange={(e) => setAgentName(e.target.value)} /></label><label>رقم الجوال<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} inputMode="tel" /></label></div><div className="form-grid"><label>الفرع<select value={agentBranchId} onChange={(e) => setAgentBranchId(e.target.value)}><option value="">اختر الفرع</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>نوع المندوب<select value={agentType} onChange={(e) => setAgentType(e.target.value as AgentType)}><option value="cash">كاش</option><option value="installment">تقسيط</option></select></label></div><button className="primary-button" disabled={saving || !accounts.length}><Plus size={18} />إضافة المندوب</button></form>
    </section>

    <section className="panel publishing-periods-panel">
      <div className="panel-head"><div><h2><Clock size={21} /> فترات النشر</h2><p>حدد عدد الإعلانات في كل فترة والمناديب المشاركين وترتيبهم. مجموع الفترات النشطة يجب أن يساوي {publishingSettings.dailyLimit || 0} إعلان يوميًا.</p></div><span className={`period-total-badge ${periodConfigReady ? "ready" : "warn"}`}>{periodsTotal} / {publishingSettings.dailyLimit || 0}</span></div>
      <form className="new-period-form" onSubmit={createPeriod}><div className="period-fields"><label>اسم الفترة<input value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder="مثال: الفترة الصباحية" /></label><label>من<input type="time" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label><label>إلى<input type="time" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label><label>إعلانات / يوم<input type="number" min="1" value={periodCount} onChange={(e) => setPeriodCount(e.target.value)} placeholder="5" /></label></div><div className="period-order-head"><div><b>مناديب الفترة وترتيب النشر</b><span>أضف المناديب ثم استخدم الأسهم لترتيبهم.</span></div></div><AgentOrderPicker agentIds={periodAgentIds} onChange={setPeriodAgentIds} agents={agents} accounts={accounts} /><button className="primary-button" disabled={saving || !agents.length}><Plus size={18} />إضافة فترة النشر</button></form>
      {!publishingPeriods.length ? <EmptyState title="لا توجد فترات نشر" text="أضف أول فترة وحدد عدد الإعلانات والمناديب وترتيبهم." /> : <div className="publishing-period-list">{publishingPeriods.map((period) => <PeriodEditor key={period.id} period={period} agents={agents} accounts={accounts} onError={setError} onNotice={setNotice} />)}</div>}
    </section>

    <section className="panel"><div className="panel-head"><div><h2>الفروع</h2><p>لكل فرع اسم معرض مستقل يظهر داخل بياناته ويمكن تعديله في أي وقت.</p></div></div>{!accounts.length ? <EmptyState title="لا توجد فروع" text="أضف الفروع التي يعمل بها المناديب." /> : <div className="account-admin-grid">{accounts.map((branch) => { const reps = agents.filter((agent) => agent.accountId === branch.id); const active = reps.filter((agent) => agent.active && branch.active !== false).length; return <article className={`account-admin-card ${branch.active ? "" : "disabled"}`} key={branch.id}><div className="account-card-head"><div><strong>{branch.name}</strong><span>{branch.note || "فرع داخلي"}</span></div><label className="switch-label"><input type="checkbox" checked={branch.active} onChange={(e) => void updateAccount(branch.id, { active: e.target.checked })} /><span>{branch.active ? "نشط" : "موقوف"}</span></label></div><div className="inline-editor"><span>إجمالي المناديب: <b>{reps.length}</b></span><span>النشطون: <b>{active}</b></span></div><div className="branch-advertiser-editor"><label>اسم المعرض داخل صيغة الإعلان<input value={branchAdvertiserDrafts[branch.id] ?? branch.advertiserName ?? defaultBranchAdvertiserName(branch.name)} onChange={(e) => setBranchAdvertiserDrafts((current) => ({ ...current, [branch.id]: e.target.value }))} /></label><button className="secondary-button compact" onClick={() => void saveBranchAdvertiser(branch.id)} disabled={savingBranchId === branch.id}><FloppyDisk size={16} />{savingBranchId === branch.id ? "جارٍ الحفظ" : "حفظ المسمى"}</button></div><div className="account-card-actions"><ConfirmButton confirmText="حذف الفرع؟ لن يتم حذف التكليفات القديمة تلقائيًا." onConfirm={() => removeAccount(branch.id)}><Trash size={17} />حذف</ConfirmButton></div></article>; })}</div>}
    </section>

    <section className="panel"><div className="panel-head"><div><h2>المناديب</h2><p>يمكن تعديل الفرع ونوع المندوب في أي وقت. المندوب الموقوف لا يدخل في تكليفات جديدة حتى لو كان موجودًا داخل فترة نشر.</p></div></div>{!agents.length ? <EmptyState title="لا يوجد مناديب" text="أضف المناديب من النموذج أعلى الصفحة." /> : <div className="table-scroll"><table><thead><tr><th>المندوب</th><th>الجوال</th><th>الفرع</th><th>النوع</th><th>تكليفات مفتوحة</th><th>الحالة</th><th></th></tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className={agent.active ? "" : "disabled-row"}><td><strong>{agent.name}</strong></td><td className="ltr-cell">{agent.phone}</td><td><select className="inline-select" value={agent.accountId || ""} onChange={(e) => void updateAgent(agent.id, { accountId: e.target.value })}><option value="">غير محدد</option>{accounts.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></td><td><select className="inline-select agent-type-select" value={agent.agentType || "cash"} onChange={(e) => void updateAgent(agent.id, { agentType: e.target.value as AgentType })}><option value="cash">كاش</option><option value="installment">تقسيط</option></select></td><td>{activeAdCountAgent(agent.id)}</td><td><label className="switch-label tiny"><input type="checkbox" checked={agent.active} onChange={(e) => void updateAgent(agent.id, { active: e.target.checked })} /><span>{agent.active ? "نشط" : "إجازة / موقوف"}</span></label></td><td><ConfirmButton className="icon-danger" confirmText="حذف المندوب؟" onConfirm={() => removeAgent(agent.id)}><Trash size={16} /></ConfirmButton></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
