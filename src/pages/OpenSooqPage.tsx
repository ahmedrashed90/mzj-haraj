import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, ArrowLeft, ArrowRight, CalendarBlank, CheckCircle, ClipboardText,
  DownloadSimple, FloppyDisk, GearSix, Phone, Plus, Storefront, Trash, WarningCircle,
} from "@phosphor-icons/react";
import { matchWebsiteCar } from "../ad-copy";
import { useAppData } from "../AppDataContext";
import { fetchOpenSooqErpStock } from "../data";
import { ConfirmButton, EmptyState, PageTitle, StatCard } from "../components/Ui";
import { DailySchedule, dateText, downloadOpenSooqXlsx, formatLabel, numberText } from "../components/OpenSooqSchedule";
import { createOpenSooqManagerAuthUser } from "../firebase";
import {
  changeOpenSooqRow, createOpenSooqPlan, deleteOpenSooqPlan, ensureOpenSooqAssignments, replaceOpenSooqUnpublishedPlan, saveOpenSooqConfiguration,
  subscribeOpenSooqAdminAssignments, subscribeOpenSooqMonth, subscribeOpenSooqPlans, subscribeOpenSooqSettings,
} from "../opensooq-data";
import {
  buildOpenSooqSchedule, getOpenSooqPlanDays, getOpenSooqRemaining, getOpenSooqPriceForStock, rebuildOpenSooqUnpublishedRows,
  openSooqDateKey, openSooqMonthKey, openSooqSaturday, openSooqShiftDate,
  openSooqWeekId, OPEN_SOOQ_BRANCHES, mergeOpenSooqAssignments,
} from "../opensooq";
import type {
  OpenSooqAssignment, OpenSooqBranchId, OpenSooqMonth, OpenSooqPlan, OpenSooqScheduleRow, OpenSooqSettings, StockGroup,
} from "../types";

const defaultSettings: OpenSooqSettings = { accountName: "", phone: "", dailyTarget: 14,
  branchManagers: { showroom: { name: "", email: "" }, qadisiyah: { name: "", email: "" } } };
export function OpenSooqPage() {
  // NEXT ERP is the sole car source for OpenSooq. Haraj continues using MZJ Operations stock.
  const { websiteCars, websiteCarsLoading, websiteCarsError, refreshWebsiteCars } = useAppData();
  const [stock, setStock] = useState<StockGroup[]>([]);
  const [stockTotalVehicles, setStockTotalVehicles] = useState(0);
  const [stockExcludedUnmapped, setStockExcludedUnmapped] = useState(0);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState("");
  const refreshStock = useCallback(async () => {
    setStockLoading(true);
    setStockError("");
    try {
      const payload = await fetchOpenSooqErpStock();
      setStock(payload.rows || []);
      setStockTotalVehicles(payload.totalVehicles || 0);
      setStockExcludedUnmapped(payload.excludedUnmapped || 0);
    } catch (cause) {
      // Never fall back to Operations or keep stale inventory when NEXT ERP fails.
      setStock([]);
      setStockTotalVehicles(0);
      setStockExcludedUnmapped(0);
      setStockError(cause instanceof Error ? cause.message : "تعذر قراءة سيارات NEXT ERP");
    } finally { setStockLoading(false); }
  }, []);
  useEffect(() => { void refreshStock(); }, [refreshStock]);
  const todayKey = useMemo(() => openSooqDateKey(new Date()), []);
  const [monthKey, setMonthKey] = useState(() => openSooqMonthKey(new Date()));
  const [saturday, setSaturday] = useState(() => openSooqSaturday(todayKey));
  const [settings, setSettings] = useState<OpenSooqSettings | null>(null);
  const [month, setMonth] = useState<OpenSooqMonth | null>(null);
  const [plans, setPlans] = useState<OpenSooqPlan[] | null>(null);
  const [assignments, setAssignments] = useState<OpenSooqAssignment[] | null>(null);
  const [branchFilter, setBranchFilter] = useState<"all" | OpenSooqBranchId>("all");
  const [managerPasswords, setManagerPasswords] = useState<Record<OpenSooqBranchId, string>>({ showroom: "", qadisiyah: "" });
  const [managerBusy, setManagerBusy] = useState<OpenSooqBranchId | null>(null);
  const migrationsInFlight = useRef(new Set<string>());
  const [settingsForm, setSettingsForm] = useState<OpenSooqSettings>(defaultSettings);
  const [monthForm, setMonthForm] = useState({ monthlyLimit: 0, activeCount: 0 });
  const [busy, setBusy] = useState("");
  const [savingRow, setSavingRow] = useState("");
  const [editingPrice, setEditingPrice] = useState<{ planId: string; row: OpenSooqScheduleRow; value: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    return subscribeOpenSooqSettings((value) => setSettings(value), (e) => setError(`تعذر قراءة إعدادات السوق المفتوح: ${e.message}`));
  }, []);
  useEffect(() => {
    setMonth(null); setPlans(null); setAssignments(null); setShowPreview(false);
    const unsubscribeMonth = subscribeOpenSooqMonth(monthKey, (value) => setMonth(value), (e) => setError(`تعذر قراءة باقة الشهر: ${e.message}`));
    const unsubscribePlans = subscribeOpenSooqPlans(monthKey, (value) => setPlans(value), (e) => setError(`تعذر قراءة الجداول: ${e.message}`));
    const unsubscribeAssignments = subscribeOpenSooqAdminAssignments(monthKey, (value) => setAssignments(value),
      (e) => setError(`تعذر قراءة إعلانات الفروع: ${e.message}`));
    return () => { unsubscribeMonth(); unsubscribePlans(); unsubscribeAssignments(); };
  }, [monthKey]);
  useEffect(() => { if (settings) setSettingsForm(settings); }, [settings]);
  useEffect(() => { if (month) setMonthForm({ monthlyLimit: month.monthlyLimit, activeCount: month.activeCount }); }, [month]);
  // Old weekly plans are divided in place. This creates branch-readable copies only;
  // it does not recreate the schedule, reserve stock again, or deduct the quota again.
  useEffect(() => {
    if (!plans || !assignments) return;
    const assigned = new Set(assignments.map((row) => `${row.planId}__${row.id}`));
    for (const plan of plans) {
      const missing = plan.rows.some((row) => !row.branchId || !assigned.has(`${plan.id}__${row.id}`));
      if (!missing || migrationsInFlight.current.has(plan.id)) continue;
      migrationsInFlight.current.add(plan.id);
      void ensureOpenSooqAssignments(plan.id)
        .catch((e) => setError(`تعذر توزيع الجدول القديم ${plan.planStart}: ${e instanceof Error ? e.message : "خطأ غير متوقع"}`))
        .finally(() => { migrationsInFlight.current.delete(plan.id); });
    }
  }, [plans, assignments]);
  const displayPlans = useMemo(() => plans?.map((plan) => ({ ...plan,
    rows: mergeOpenSooqAssignments(plan.rows, (assignments || []).filter((row) => row.planId === plan.id)),
  })) || null, [plans, assignments]);

  const remaining = month ? getOpenSooqRemaining(month) : 0;
  const draftRemaining = Math.max(0, monthForm.monthlyLimit - monthForm.activeCount - (month?.reservedCount || 0));
  const publishedInPlans = displayPlans?.reduce((count, plan) => count + plan.rows.filter((ad) => ad.status === "published").length, 0) || 0;
  const activeTotal = monthForm.activeCount + publishedInPlans;
  const scheduledPending = Math.max(0, (month?.reservedCount || 0) - publishedInPlans);
  const configurationDirty = !settings || !month
    || settingsForm.accountName.trim() !== settings.accountName
    || settingsForm.phone.trim() !== settings.phone
    || settingsForm.dailyTarget !== settings.dailyTarget
    || OPEN_SOOQ_BRANCHES.some(({ id }) => settingsForm.branchManagers[id].name.trim() !== settings.branchManagers[id].name.trim()
      || settingsForm.branchManagers[id].email.trim().toLowerCase() !== settings.branchManagers[id].email.trim().toLowerCase())
    || monthForm.monthlyLimit !== month.monthlyLimit
    || monthForm.activeCount !== month.activeCount;

  const stockWithPrices = useMemo(() => stock.map((row: StockGroup) => ({
    ...row, price: getOpenSooqPriceForStock(row, websiteCars, matchWebsiteCar),
  })), [stock, websiteCars]);
  const monthWeekKey = openSooqWeekId(monthKey, saturday);
  const savedThisWeek = plans?.find((plan) => plan.id === monthWeekKey);
  const planDays = useMemo(() => getOpenSooqPlanDays(monthKey, saturday, todayKey), [monthKey, saturday, todayKey]);
  const previewRows = useMemo(() => !month || !settings || savedThisWeek || !planDays.length ? []
    : buildOpenSooqSchedule(planDays, settings.dailyTarget, remaining,
      stockWithPrices, month.usedUnitKeys, settings.phone),
  [month, settings, savedThisWeek, planDays, remaining, stockWithPrices]);
  const candidateLimit = planDays.length * (settings?.dailyTarget || 0);
  const availableSlots = useMemo(() => !month ? 0 : stock.reduce((total, row) => {
    const quantity = Math.max(0, Math.floor(row.quantity || 0));
    const used = month.usedUnitKeys.filter((unit) => unit.startsWith(`${row.key}:`)).length;
    return total + Math.max(0, quantity - used);
  }, 0), [month, stock]);
  const pricedCount = previewRows.filter((row) => row.price > 0).length;
  const previewByBranch = {
    showroom: previewRows.filter((row) => row.branchId === "showroom").length,
    qadisiyah: previewRows.filter((row) => row.branchId === "qadisiyah").length,
  };
  const monthConfigured = Boolean(month && settings && month.monthlyLimit > 0 && settings.accountName && settings.phone && settings.dailyTarget > 0);
  const canCreate = monthConfigured && !configurationDirty && !stockLoading && !stockError && !websiteCarsLoading
    && plans !== null && !savedThisWeek && remaining > 0 && previewRows.length > 0;

  function changeMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonthKey(value);
    setSaturday(openSooqSaturday(value === todayKey.slice(0, 7) ? todayKey : `${value}-01`));
    setError(""); setNotice("");
  }
  function changeWeek(offset: number) {
    setSaturday((current) => openSooqShiftDate(current, 7 * offset));
    setShowPreview(false); setError(""); setNotice("");
  }
  async function saveConfig() {
    if (busy) return;
    setBusy("settings"); setError(""); setNotice("");
    try {
      await saveOpenSooqConfiguration(monthKey, settingsForm, monthForm.monthlyLimit, monthForm.activeCount);
      setNotice("تم حفظ إعدادات حساب السوق المفتوح وباقة الشهر بنجاح.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ إعدادات الحساب"); }
    finally { setBusy(""); }
  }
  async function savePlan() {
    if (!canCreate || !previewRows.length || busy) return;
    setBusy("plan"); setError(""); setNotice("");
    try {
      await createOpenSooqPlan(monthKey, saturday, previewRows);
      setShowPreview(false);
      setNotice(`تم اعتماد ${previewRows.length} إعلانًا وحجزها من رصيد شهر ${monthKey}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ الجدول الأسبوعي"); }
    finally { setBusy(""); }
  }
  async function removePlan(plan: OpenSooqPlan) {
    if (busy) return;
    setBusy(`delete:${plan.id}`); setError(""); setNotice("");
    try { await deleteOpenSooqPlan(plan.id); setNotice(`تم حذف الجدول وإرجاع ${plan.rows.length} إعلانًا للرصيد المتبقي.`); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر حذف الجدول"); }
    finally { setBusy(""); }
  }
  async function rebuildSavedPlan(plan: OpenSooqPlan) {
    if (busy || !month) return;
    const pending = plan.rows.filter((row) => row.status !== "published").length;
    if (!pending) return setError("لا توجد إعلانات غير منشورة في هذا الجدول.");
    if (!window.confirm(`استبدال سيارات ${pending} إعلان غير منشور من NEXT ERP؟ سيتم الاحتفاظ بالمواعيد والفروع والأرقام والإعلانات المنشورة دون خصم جديد.`)) return;
    setBusy(`rebuild:${plan.id}`); setError(""); setNotice("");
    try {
      // Fresh ERP read at the moment of replacement, not an old UI snapshot.
      const payload = await fetchOpenSooqErpStock().catch((cause: unknown) => {
        setStock([]); setStockTotalVehicles(0);
        setStockError(cause instanceof Error ? cause.message : "تعذر قراءة سيارات NEXT ERP");
        throw cause;
      });
      const currentStock = payload.rows || [];
      const priced = currentStock.map((row) => ({ ...row,
        price: getOpenSooqPriceForStock(row, websiteCars, matchWebsiteCar) }));
      const proposed = rebuildOpenSooqUnpublishedRows(plan.rows, priced, month.usedUnitKeys);
      await replaceOpenSooqUnpublishedPlan(plan.id, plan.rows, proposed);
      setStock(currentStock); setStockTotalVehicles(payload.totalVehicles || 0);
      setStockExcludedUnmapped(payload.excludedUnmapped || 0); setStockError("");
      setNotice(`تم تحديث ${pending} إعلان غير منشور من NEXT ERP مع الحفاظ على توزيع الفروع والرصيد.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث سيارات الجدول من NEXT ERP");
    } finally { setBusy(""); }
  }
  async function toggleStatus(plan: OpenSooqPlan, row: OpenSooqScheduleRow) {
    if (savingRow) return;
    if (row.status === "published" && !window.confirm(`إعادة إعلان ${formatLabel(row)} إلى حالة غير منشور؟`)) return;
    setSavingRow(row.id); setError("");
    try {
      if (!assignments?.some((item) => item.planId === plan.id && item.id === row.id)) await ensureOpenSooqAssignments(plan.id);
      await changeOpenSooqRow(row.branchId!, plan.id, row.id, { status: row.status === "published" ? "scheduled" : "published" });
    }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تغيير حالة الإعلان"); }
    finally { setSavingRow(""); }
  }
  async function savePrice() {
    if (!editingPrice || busy) return;
    const value = Number(editingPrice.value);
    if (!Number.isSafeInteger(value) || value <= 0) return setError("اكتب سعر سيارة صحيحًا أكبر من صفر.");
    setBusy("price"); setError("");
    try {
      if (!assignments?.some((item) => item.planId === editingPrice.planId && item.id === editingPrice.row.id))
        await ensureOpenSooqAssignments(editingPrice.planId);
      await changeOpenSooqRow(editingPrice.row.branchId!, editingPrice.planId, editingPrice.row.id, { price: value });
      setEditingPrice(null); setNotice("تم تعديل سعر الإعلان دون تغيير الرصيد.");
    }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ السعر"); }
    finally { setBusy(""); }
  }
  function editBranchManager(branchId: OpenSooqBranchId, field: "name" | "email", value: string) {
    setSettingsForm((current) => ({ ...current, branchManagers: {
      ...current.branchManagers, [branchId]: { ...current.branchManagers[branchId], [field]: value },
    } }));
  }
  async function createManagerLogin(branchId: OpenSooqBranchId) {
    const manager = settingsForm.branchManagers[branchId];
    const savedEmail = settings?.branchManagers[branchId]?.email;
    if (!manager.email || manager.email.trim().toLowerCase() !== savedEmail || configurationDirty) {
      setError("احفظ بيانات المدير والبريد الإلكتروني أولًا قبل إنشاء حساب الدخول."); return;
    }
    if (managerPasswords[branchId].length < 6) { setError("كلمة مرور المدير يجب أن تكون 6 أحرف على الأقل."); return; }
    setManagerBusy(branchId); setError(""); setNotice("");
    try {
      await createOpenSooqManagerAuthUser(manager.email, managerPasswords[branchId]);
      setManagerPasswords((current) => ({ ...current, [branchId]: "" }));
      setNotice(`تم إنشاء حساب دخول ${manager.name} بنجاح. يمكنه الدخول ببريده وكلمة المرور التي حددتها.`);
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      setError(code === "auth/email-already-in-use" ? "هذا البريد لديه حساب Firebase بالفعل؛ لا تحتاج إلى إنشاء حساب جديد، يكفي تعيينه في الإعدادات."
        : code === "auth/weak-password" ? "كلمة المرور ضعيفة، اكتب 6 أحرف أو أكثر."
        : `تعذر إنشاء حساب المدير: ${e instanceof Error ? e.message : "خطأ غير متوقع"}`);
    } finally { setManagerBusy(null); }
  }
  async function syncOldPlans() {
    if (!plans?.length || busy) return;
    setBusy("sync"); setError(""); setNotice("");
    try {
      for (const plan of plans) await ensureOpenSooqAssignments(plan.id);
      setNotice("تم تقسيم الجداول القديمة على الفرعين دون إعادة حجز أي إعلان أو تغيير الرصيد.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر مزامنة الجداول القديمة"); }
    finally { setBusy(""); }
  }
  async function refreshData() { await Promise.allSettled([refreshStock(), refreshWebsiteCars()]); }

  return <>
    <PageTitle title="السوق المفتوح" subtitle="إدارة رصيد الباقة وتجهيز جداول نشر يدوية أسبوعية. لا يحتاج ربطًا بالموقع أو نظام مناديب."
      actions={<button className="secondary-button" disabled={stockLoading || websiteCarsLoading} onClick={() => void refreshData()}><ArrowClockwise size={18} />تحديث NEXT ERP والأسعار</button>} />
    {error ? <div className="alert error"><WarningCircle size={18} />{error}</div> : null}
    {notice ? <div className="alert success"><CheckCircle size={18} />{notice}</div> : null}
    {stockError ? <div className="alert warning"><WarningCircle size={18} />تعذر قراءة سيارات NEXT ERP: {stockError}</div> : null}
    {websiteCarsError ? <div className="alert warning"><WarningCircle size={18} />مصدر أسعار الموقع غير متاح: {websiteCarsError}. سيظهر السعر فارغًا للسيارات التي لا يمكن مطابقتها.</div> : null}

    <section className="panel opensooq-config">
      <header className="panel-head"><div><h2><GearSix size={20} />إعدادات حساب السوق المفتوح</h2>
        <p>يتم حفظ الحساب والباقة في Firebase بشكل مستقل تمامًا عن إعدادات حراج.</p></div>
        <label className="opensooq-month-picker">شهر الباقة <input type="month" value={monthKey} onChange={(e) => changeMonth(e.target.value)} /></label>
      </header>
      <div className="opensooq-form-grid">
        <label>اسم حساب السوق المفتوح<input type="text" value={settingsForm.accountName} onChange={(e) => setSettingsForm((p) => ({ ...p, accountName: e.target.value }))} placeholder="MZJ" /></label>
        <label>رقم التواصل الموحد<input type="tel" dir="ltr" value={settingsForm.phone} onChange={(e) => setSettingsForm((p) => ({ ...p, phone: e.target.value }))} placeholder="05xxxxxxxx" /></label>
        <label>عدد الإعلانات الشهرية<input type="number" min="0" step="1" value={monthForm.monthlyLimit} onChange={(e) => setMonthForm((p) => ({ ...p, monthlyLimit: Number(e.target.value) }))} /></label>
        <label>الإعلانات النشطة الحالية قبل جداول النظام<input type="number" min="0" step="1" value={monthForm.activeCount} onChange={(e) => setMonthForm((p) => ({ ...p, activeCount: Number(e.target.value) }))} /></label>
        <label>عدد الإعلانات لكل يوم نشر<input type="number" min="1" max="160" step="1" value={settingsForm.dailyTarget} onChange={(e) => setSettingsForm((p) => ({ ...p, dailyTarget: Number(e.target.value) }))} /></label>
        <div className="opensooq-form-submit"><button className="primary-button" disabled={Boolean(busy) || !month || !settings} onClick={() => void saveConfig()}><FloppyDisk size={18} />{busy === "settings" ? "جارٍ الحفظ..." : "حفظ إعدادات الحساب والباقة"}</button></div>
      </div>
      <p className="opensooq-note">أدخل عدد الإعلانات النشطة الموجودة بالفعل على السوق المفتوح <strong>قبل جداول النظام</strong>. عند تأكيد نشر إعلان من الجداول يُضاف تلقائيًا إلى إجمالي النشط، وتنتقل حالته من «مجدول» إلى «منشور» دون خصم الرصيد للمرة الثانية. لا تضف تلك الإعلانات مرة ثانية في خانة العدد اليدوي حتى لا يحدث خصم مزدوج. عدّل الأرقام عند بداية كل شهر جديد. سيارات السوق المفتوح تُقرأ مباشرة من NEXT ERP (Item + Serial No)، ويتم التأكد من حالة «متاحة للحجز» وActive، وتُحفظ هوية الوحدة بمعرّف غير كاشف لرقم الهيكل. لا يتم تكرار نفس النوع والفئة والموديل في يوم نشر واحد.</p>
    </section>

    <section className="panel opensooq-managers">
      <header className="panel-head"><div><h2><GearSix size={20} />تحديد مديري فروع السوق المفتوح</h2>
        <p>كل مدير يدخل ببريده وكلمة مروره، ويرى إعلانات فرعه فقط. لا تظهر له بيانات حراج أو الفرع الآخر.</p></div></header>
      <div className="opensooq-manager-grid">{OPEN_SOOQ_BRANCHES.map((branch) => {
        const manager = settingsForm.branchManagers[branch.id];
        return <div className="opensooq-manager-card" key={branch.id}>
          <h3>مدير فرع {branch.name}</h3>
          <label>اسم المدير<input type="text" value={manager.name} placeholder={`اسم مدير ${branch.name}`}
            onChange={(e) => editBranchManager(branch.id, "name", e.target.value)} /></label>
          <label>البريد الإلكتروني للدخول<input type="email" dir="ltr" value={manager.email} placeholder="manager@example.com"
            onChange={(e) => editBranchManager(branch.id, "email", e.target.value)} /></label>
          <label>كلمة مرور لحساب جديد فقط<input type="password" autoComplete="new-password" minLength={6}
            value={managerPasswords[branch.id]} placeholder="6 أحرف على الأقل"
            onChange={(e) => setManagerPasswords((current) => ({ ...current, [branch.id]: e.target.value }))} /></label>
          <button type="button" className="secondary-button compact" disabled={Boolean(busy) || Boolean(managerBusy) || !manager.email || configurationDirty}
            onClick={() => void createManagerLogin(branch.id)}>
            <Plus size={16} />{managerBusy === branch.id ? "جارٍ إنشاء الحساب..." : "إنشاء حساب دخول للمدير"}
          </button>
          <small>لو المدير عنده حساب Firebase بنفس البريد، يكفي ربطه من هنا وحفظ الإعدادات؛ لا تنشئ حسابًا مكررًا.</small>
        </div>;
      })}</div>
      <p className="opensooq-note">اكتب الاسم والبريد للفرعين ثم اضغط «حفظ إعدادات الحساب والباقة» بالأعلى. لو المدير ليس لديه حساب دخول، أنشئه من الزر بعد الحفظ. لا يتم تخزين كلمات المرور في قاعدة البيانات. يتطلب دخول المديرين نشر قواعد Firestore الجديدة المرفقة.</p>
    </section>

    <section className="stats-grid opensooq-stats">
      <StatCard label="سعة الإعلانات الشهرية" value={month ? numberText(monthForm.monthlyLimit) : "—"} hint={monthKey} />
      <StatCard label="الإعلانات النشطة" value={month ? numberText(activeTotal) : "—"} hint={`منها ${publishedInPlans} نُشرت من الجداول`} tone="info" />
      <StatCard label="إعلانات مجدولة لم تُنشر" value={month ? numberText(scheduledPending) : "—"} hint="تم حجزها من الرصيد" tone="warn" />
      <StatCard label="الإعلانات المتبقية" value={month ? numberText(draftRemaining) : "—"} hint={configurationDirty ? "حساب مبدئي · احفظ الإعدادات" : "الشهرية − النشطة − المجدولة"} tone="good" />
    </section>

    <section className="panel opensooq-plan-card">
      <div className="panel-head"><div><h2><CalendarBlank size={20} />تجهيز جدول نشر أسبوعي</h2>
        <p>من السبت إلى الخميس، الجمعة مستبعدة. السيارات من NEXT ERP، وبحد أقصى إعلان واحد لكل نوع وفئة وموديل في اليوم.</p></div>
        <div className="week-switcher"><button className="icon-button" title="الأسبوع السابق" onClick={() => changeWeek(-1)}><ArrowRight size={19} /></button>
          <label><CalendarBlank size={18} /><input type="date" value={saturday} onChange={(e) => e.target.value && (setSaturday(openSooqSaturday(e.target.value)), setShowPreview(false))} /></label>
          <button className="icon-button" title="الأسبوع التالي" onClick={() => changeWeek(1)}><ArrowLeft size={19} /></button></div>
      </div>
      <div className="opensooq-week-overview">
        <div><span>الأسبوع المحدد</span><strong>{dateText(saturday)} – {dateText(openSooqShiftDate(saturday, 5))}</strong><small>الجدولة تبدأ من اليوم أو من بداية الأسبوع، أيهما أحدث</small></div>
        <div><span>أيام النشر المتاحة</span><strong>{planDays.length}</strong><small>بدون الجمعة أو الأيام الماضية</small></div>
        <div><span>المطلوب حسب الحد اليومي</span><strong>{candidateLimit}</strong><small>{settings?.dailyTarget || 14} إعلانًا يوميًا</small></div>
        <div><span>يمكن جدولته الآن</span><strong>{previewRows.length}</strong><small>حسب الرصيد وتنوع سيارات NEXT ERP</small></div>
      </div>
      <div className="opensooq-branch-summary"><span>توزيع معاينة الأسبوع:</span><strong>الصالة {previewByBranch.showroom} إعلان</strong><strong>القادسية {previewByBranch.qadisiyah} إعلان</strong></div>
      {configurationDirty ? <div className="alert warning"><WarningCircle size={17} />احفظ إعدادات حساب السوق المفتوح وباقة الشهر قبل تجهيز الجدول.</div> : null}
      {savedThisWeek ? <div className="alert success"><CheckCircle size={17} />جدول هذا الأسبوع محفوظ بالفعل، ويمكن فتحه من الجداول أسفل الصفحة. إنشاء معاينة أخرى لا يخصم شيئًا.</div> : null}
      {!planDays.length && !savedThisWeek ? <div className="alert info"><CalendarBlank size={17} />لا توجد أيام نشر متبقية في هذا الأسبوع ضمن الشهر المحدد. اختر الأسبوع التالي.</div> : null}
      {monthConfigured && !savedThisWeek && planDays.length > 0 && previewRows.length < Math.min(candidateLimit, remaining) && !stockLoading && !stockError ?
        <div className="alert warning"><WarningCircle size={17} />يمكن تجهيز {previewRows.length} إعلان فقط بدلًا من {Math.min(candidateLimit, remaining)}؛ عدد سيارات NEXT ERP المتاحة أو تنوع النوع/الفئة/الموديل غير كافٍ لملء كل الأيام دون تكرار في نفس اليوم. لن نضيف إعلانات مكررة أو وهمية.</div> : null}
      {stockExcludedUnmapped > 0 ? <div className="alert warning"><WarningCircle size={17} />تم استبعاد {stockExcludedUnmapped} وحدة من NEXT ERP لأن بيانات النوع أو الفئة أو الموديل غير مكتملة في Item؛ لا تُستخدم بيانات تخمينية.</div> : null}
      <div className="opensooq-plan-actions"><div className="opensooq-stock-hint"><Storefront size={18} />NEXT ERP: {numberText(stockTotalVehicles)} سيارة متاحة للحجز في {numberText(stock.length)} نوع/فئة/موديل، منها {numberText(availableSlots)} وحدة غير مجدولة في هذا الشهر.</div>
        <button className="primary-button" disabled={!canCreate || Boolean(busy)} onClick={() => setShowPreview(true)}><ClipboardText size={18} />معاينة الجدول الأسبوعي <b>{previewRows.length || ""}</b></button></div>
    </section>

    <section className="panel opensooq-saved">
      <header className="panel-head"><div><h2><ClipboardText size={20} />جداول السوق المفتوح المحفوظة</h2>
        <p>الجداول القديمة محفوظة. يمكن تحديث سيارات الإعلانات غير المنشورة من NEXT ERP دون تغيير رصيد الباقة أو الإعلانات المنشورة، مع تصدير جدول كل فرع.</p></div>
        <div className="opensooq-saved-buttons"><select className="inline-select" value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value as "all" | OpenSooqBranchId)}>
          <option value="all">جميع الفروع</option>{OPEN_SOOQ_BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select><button className="secondary-button compact" onClick={() => void syncOldPlans()} disabled={Boolean(busy) || !plans?.length}>
          <ArrowClockwise size={16} />{busy === "sync" ? "جارٍ المزامنة..." : "مزامنة الجداول القديمة"}
        </button><span className="opensooq-small-count">{plans?.length ?? "—"} جدول</span></div>
      </header>
      {!displayPlans ? <EmptyState title="جارٍ تحميل الجداول" text="انتظر قراءة جداول هذا الشهر من قاعدة البيانات." />
        : displayPlans.length === 0 ? <EmptyState title="لا توجد جداول لهذا الشهر" text="احفظ إعدادات الباقة ثم جهز أول جدول أسبوعي." />
        : <div className="opensooq-week-list">{displayPlans.map((plan) => {
          const published = plan.rows.filter((row) => row.status === "published").length;
          const shownRows = branchFilter === "all" ? plan.rows : plan.rows.filter((row) => row.branchId === branchFilter);
          const branchCounts = OPEN_SOOQ_BRANCHES.map((branch) => `${branch.name}: ${plan.rows.filter((row) => row.branchId === branch.id).length}`).join(" · ");
          return <details className="opensooq-saved-week" key={plan.id} open={plan.id === monthWeekKey}>
            <summary><span><CalendarBlank size={20} />أسبوع {dateText(plan.planStart)} – {dateText(plan.planEnd)}</span>
              <span>{plan.rows.length} إعلان · {branchCounts} · {published} منشور</span></summary>
            <div className="opensooq-week-body"><div className="opensooq-saved-actions"><span>إعلانات الفرع المعروضة: <strong>{shownRows.length}</strong> من {plan.rows.length}</span>
              <div className="opensooq-saved-buttons">{plan.rows.some((row) => row.status !== "published") ?
                <button className="secondary-button compact" disabled={Boolean(busy) || !month}
                  onClick={() => void rebuildSavedPlan(plan)}><ArrowClockwise size={16} />
                  {busy === `rebuild:${plan.id}` ? "جارٍ تحديث السيارات..." : "تحديث غير المنشور من NEXT ERP"}</button> : null}
                <button className="secondary-button compact" disabled={!shownRows.length}
                onClick={() => downloadOpenSooqXlsx(shownRows, plan.planStart, plan.planEnd, branchFilter === "all" ? undefined : branchFilter)}>
                <DownloadSimple size={17} />تصدير Excel</button>
                {published === 0 ? <ConfirmButton className="danger-button compact" confirmText={`حذف جدول هذا الأسبوع وإرجاع ${plan.rows.length} إعلانًا إلى رصيد الشهر؟`} onConfirm={() => removePlan(plan)}><Trash size={16} />حذف وإرجاع الرصيد</ConfirmButton> : null}</div>
            </div>{shownRows.length ? <DailySchedule rows={shownRows} showBranch={branchFilter === "all"} savingRow={savingRow}
              onPrice={(row) => setEditingPrice({ planId: plan.id, row, value: String(row.price || "") })}
              onStatus={(row) => void toggleStatus(plan, row)} /> : <EmptyState title="لا توجد إعلانات لهذا الفرع" text="اختر جميع الفروع أو جدولًا آخر." />}</div>
          </details>;
        })}</div>}
    </section>

    {showPreview && canCreate ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setShowPreview(false); }}>
      <div className="modal-card opensooq-preview-modal"><header className="modal-head"><div><h2>مراجعة جدول السوق المفتوح</h2><p>لن يتم خصم الإعلانات إلا بعد الضغط على «اعتماد الجدول وحجز الإعلانات».</p></div><button className="icon-button" onClick={() => setShowPreview(false)} disabled={Boolean(busy)}>×</button></header>
        <div className="opensooq-preview-summary"><div><span>الإعلانات الجديدة</span><strong>{previewRows.length}</strong></div><div><span>الرصيد قبل الاعتماد</span><strong>{remaining}</strong></div><div><span>الرصيد بعد الاعتماد</span><strong>{remaining - previewRows.length}</strong></div><div><span>متوفر له سعر</span><strong>{pricedCount} / {previewRows.length}</strong></div></div>
        {pricedCount < previewRows.length ? <div className="alert warning"><WarningCircle size={17} />هناك {previewRows.length - pricedCount} سيارة بدون سعر مطابق من موقع MZJ؛ يمكنك ضبط سعر كل واحدة من الجدول بعد حفظه وقبل النشر الفعلي.</div> : null}
        <div className="opensooq-branch-summary"><strong>الصالة: {previewByBranch.showroom}</strong><strong>القادسية: {previewByBranch.qadisiyah}</strong></div>
        <DailySchedule rows={previewRows} preview showBranch />
        <div className="modal-actions"><button className="ghost-button" disabled={Boolean(busy)} onClick={() => setShowPreview(false)}>إلغاء</button>
          <button className="primary-button" disabled={!canCreate || Boolean(busy)} onClick={() => void savePlan()}><Plus size={18} />{busy === "plan" ? "جارٍ الحفظ..." : `اعتماد وحجز ${previewRows.length} إعلان`}</button></div>
      </div></div> : null}

    {editingPrice ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setEditingPrice(null); }}>
      <div className="modal-card opensooq-price-modal"><div className="modal-head"><div><h2>تعديل سعر السيارة</h2><p>{formatLabel(editingPrice.row)}</p></div><button className="icon-button" onClick={() => setEditingPrice(null)} disabled={Boolean(busy)}>×</button></div>
        {error ? <div className="alert error"><WarningCircle size={17} />{error}</div> : null}
        <label>سعر الإعلان بالريال السعودي<input type="number" min="1" step="1" value={editingPrice.value} onChange={(e) => setEditingPrice((current) => current ? { ...current, value: e.target.value } : null)} autoFocus /></label>
        <div className="modal-actions"><button className="ghost-button" onClick={() => setEditingPrice(null)} disabled={Boolean(busy)}>إلغاء</button><button className="primary-button" onClick={() => void savePrice()} disabled={Boolean(busy)}><FloppyDisk size={17} />حفظ السعر</button></div>
      </div></div> : null}
    <div className="opensooq-footer-note"><Phone size={17} />جميع الإعلانات تستخدم رقم التواصل الموحد. جدول السوق المفتوح منفصل عن إعلانات حراج ومناديبه ولا ينشر تلقائيًا في الموقع.</div>
  </>;
}
