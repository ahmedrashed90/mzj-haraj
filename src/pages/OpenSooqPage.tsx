import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowLeft, ArrowRight, CalendarBlank, CheckCircle, ClipboardText,
  DownloadSimple, FloppyDisk, GearSix, Phone, Plus, Storefront, Trash, WarningCircle,
} from "@phosphor-icons/react";
import { matchWebsiteCar } from "../ad-copy";
import { useAppData } from "../AppDataContext";
import { ConfirmButton, EmptyState, PageTitle, StatCard } from "../components/Ui";
import {
  changeOpenSooqRow, createOpenSooqPlan, deleteOpenSooqPlan, saveOpenSooqConfiguration,
  subscribeOpenSooqMonth, subscribeOpenSooqPlans, subscribeOpenSooqSettings,
} from "../opensooq-data";
import {
  buildOpenSooqSchedule, getOpenSooqPlanDays, getOpenSooqRemaining, getOpenSooqPriceForStock,
  openSooqDateKey, openSooqMonthEnd, openSooqMonthKey, openSooqSaturday, openSooqShiftDate,
  openSooqWeekId,
} from "../opensooq";
import type {
  OpenSooqMonth, OpenSooqPlan, OpenSooqScheduleRow, OpenSooqSettings, StockGroup,
} from "../types";

const defaultSettings: OpenSooqSettings = { accountName: "", phone: "", dailyTarget: 14 };
const numberText = (value: number) => Number(value).toLocaleString("ar-SA-u-nu-latn");
const dateText = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("ar-SA-u-nu-latn", { day: "numeric", month: "long" });
};
const priceText = (value: number) => value > 0 ? `${numberText(value)} ر.س` : "يحتاج تحديد سعر";
const formatLabel = (value: OpenSooqScheduleRow) => `${value.carName} — ${value.statement} — ${value.modelYear}`;
function csvEscape(value: string | number) {
  const plain = String(value ?? "");
  const safe = /^[=+@-]/.test(plain) ? `'${plain}` : plain;
  return `"${safe.replace(/"/g, '""')}"`;
}
function downloadScheduleCsv(plan: OpenSooqPlan) {
  const titles = ["تاريخ النشر", "السيارة", "البيان", "الموديل", "سعر السيارة (ر.س)", "رقم التواصل", "حالة الإعلان"];
  const data = plan.rows.map((ad) => [ad.scheduledDate, ad.carName, ad.statement, ad.modelYear,
    ad.price || "", ad.phone, ad.status === "published" ? "تم النشر" : "لم ينشر"]);
  const content = `\ufeff${[titles, ...data].map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const element = document.createElement("a");
  element.href = url;
  element.download = `MZJ-OpenSooq-${plan.planStart}-to-${plan.planEnd}.csv`;
  document.body.appendChild(element);
  element.click();
  element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ScheduleRowsTable({
  rows, readOnly = false, savingRow, onPrice, onStatus,
}: {
  rows: OpenSooqScheduleRow[];
  readOnly?: boolean;
  savingRow?: string;
  onPrice?: (row: OpenSooqScheduleRow) => void;
  onStatus?: (row: OpenSooqScheduleRow) => void;
}) {
  return <div className="table-scroll"><table className="opensooq-table">
    <thead><tr><th>#</th><th>السيارة</th><th>البيان</th><th>الموديل</th><th>السعر</th><th>رقم التواصل الموحد</th>{readOnly ? null : <th>حالة الإعلان</th>}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.id}>
      <td>{index + 1}</td>
      <td><strong>{row.carName}</strong>{row.unitIndex > 1 ? <small className="opensooq-variant-note">وحدة مخزون {row.unitIndex}</small> : null}</td>
      <td>{row.statement}</td>
      <td>{row.modelYear}</td>
      <td><span className={row.price > 0 ? "opensooq-price" : "opensooq-missing-price"}>{priceText(row.price)}</span>
        {!readOnly ? <button className="opensooq-mini-link" onClick={() => onPrice?.(row)} disabled={Boolean(savingRow)} title="تعديل السعر لهذا الإعلان">تعديل</button> : null}</td>
      <td className="opensooq-phone">{row.phone}</td>
      {!readOnly ? <td><button type="button" disabled={Boolean(savingRow)} onClick={() => onStatus?.(row)} className={`opensooq-status ${row.status === "published" ? "is-published" : ""}`}>
        {savingRow === row.id ? "جارٍ الحفظ..." : row.status === "published" ? "تم النشر ✓" : "تأكيد النشر"}
      </button></td> : null}
    </tr>)}</tbody>
  </table></div>;
}

function DailySchedule({ rows, preview = false, savingRow, onPrice, onStatus }: {
  rows: OpenSooqScheduleRow[];
  preview?: boolean;
  savingRow?: string;
  onPrice?: (row: OpenSooqScheduleRow) => void;
  onStatus?: (row: OpenSooqScheduleRow) => void;
}) {
  const days = [...new Set(rows.map((r) => r.scheduledDate))];
  return <div className="opensooq-day-list">{days.map((day, index) => {
    const dayRows = rows.filter((row) => row.scheduledDate === day);
    const published = dayRows.filter((row) => row.status === "published").length;
    return <details className="opensooq-day" key={day} open={index === 0}>
      <summary><span><CalendarBlank size={19} weight="duotone" />{dateText(day)} <small>{day}</small></span>
        <span>{dayRows.length} إعلان{!preview ? ` · ${published} منشور` : ""}</span></summary>
      <ScheduleRowsTable rows={dayRows} readOnly={preview} savingRow={savingRow} onPrice={onPrice} onStatus={onStatus} />
    </details>;
  })}</div>;
}

export function OpenSooqPage() {
  const { stock, stockTotalVehicles, stockLoading, stockError, refreshStock,
    websiteCars, websiteCarsLoading, websiteCarsError, refreshWebsiteCars } = useAppData();
  const todayKey = useMemo(() => openSooqDateKey(new Date()), []);
  const [monthKey, setMonthKey] = useState(() => openSooqMonthKey(new Date()));
  const [saturday, setSaturday] = useState(() => openSooqSaturday(todayKey));
  const [settings, setSettings] = useState<OpenSooqSettings | null>(null);
  const [month, setMonth] = useState<OpenSooqMonth | null>(null);
  const [plans, setPlans] = useState<OpenSooqPlan[] | null>(null);
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
    setMonth(null); setPlans(null); setShowPreview(false);
    const unsubscribeMonth = subscribeOpenSooqMonth(monthKey, (value) => setMonth(value), (e) => setError(`تعذر قراءة باقة الشهر: ${e.message}`));
    const unsubscribePlans = subscribeOpenSooqPlans(monthKey, (value) => setPlans(value), (e) => setError(`تعذر قراءة الجداول: ${e.message}`));
    return () => { unsubscribeMonth(); unsubscribePlans(); };
  }, [monthKey]);
  useEffect(() => { if (settings) setSettingsForm(settings); }, [settings]);
  useEffect(() => { if (month) setMonthForm({ monthlyLimit: month.monthlyLimit, activeCount: month.activeCount }); }, [month]);

  const remaining = month ? getOpenSooqRemaining(month) : 0;
  const draftRemaining = Math.max(0, monthForm.monthlyLimit - monthForm.activeCount - (month?.reservedCount || 0));
  const publishedInPlans = plans?.flatMap((p) => p.rows).filter((ad) => ad.status === "published").length || 0;
  const configurationDirty = !settings || !month
    || settingsForm.accountName.trim() !== settings.accountName
    || settingsForm.phone.trim() !== settings.phone
    || settingsForm.dailyTarget !== settings.dailyTarget
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
  const monthConfigured = Boolean(month && settings && month.monthlyLimit > 0 && settings.accountName && settings.phone && settings.dailyTarget > 0);
  const canCreate = monthConfigured && !configurationDirty && !stockLoading && !websiteCarsLoading
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
  async function toggleStatus(plan: OpenSooqPlan, row: OpenSooqScheduleRow) {
    if (savingRow) return;
    if (row.status === "published" && !window.confirm(`إعادة إعلان ${formatLabel(row)} إلى حالة غير منشور؟`)) return;
    setSavingRow(row.id); setError("");
    try { await changeOpenSooqRow(plan.id, row.id, { status: row.status === "published" ? "scheduled" : "published" }); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تغيير حالة الإعلان"); }
    finally { setSavingRow(""); }
  }
  async function savePrice() {
    if (!editingPrice || busy) return;
    const value = Number(editingPrice.value);
    if (!Number.isSafeInteger(value) || value <= 0) return setError("اكتب سعر سيارة صحيحًا أكبر من صفر.");
    setBusy("price"); setError("");
    try { await changeOpenSooqRow(editingPrice.planId, editingPrice.row.id, { price: value }); setEditingPrice(null); setNotice("تم تعديل سعر الإعلان دون تغيير الرصيد."); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ السعر"); }
    finally { setBusy(""); }
  }
  async function refreshData() { await Promise.allSettled([refreshStock(), refreshWebsiteCars()]); }

  return <>
    <PageTitle title="السوق المفتوح" subtitle="إدارة رصيد الباقة وتجهيز جداول نشر يدوية أسبوعية. لا يحتاج ربطًا بالموقع أو نظام مناديب."
      actions={<button className="secondary-button" disabled={stockLoading || websiteCarsLoading} onClick={() => void refreshData()}><ArrowClockwise size={18} />تحديث الاستوك والأسعار</button>} />
    {error ? <div className="alert error"><WarningCircle size={18} />{error}</div> : null}
    {notice ? <div className="alert success"><CheckCircle size={18} />{notice}</div> : null}
    {stockError ? <div className="alert warning"><WarningCircle size={18} />تعذر قراءة الاستوك: {stockError}</div> : null}
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
        <label>الإعلانات النشطة (رصيد البداية)<input type="number" min="0" step="1" value={monthForm.activeCount} onChange={(e) => setMonthForm((p) => ({ ...p, activeCount: Number(e.target.value) }))} /></label>
        <label>عدد الإعلانات لكل يوم نشر<input type="number" min="1" max="160" step="1" value={settingsForm.dailyTarget} onChange={(e) => setSettingsForm((p) => ({ ...p, dailyTarget: Number(e.target.value) }))} /></label>
        <div className="opensooq-form-submit"><button className="primary-button" disabled={Boolean(busy) || !month || !settings} onClick={() => void saveConfig()}><FloppyDisk size={18} />{busy === "settings" ? "جارٍ الحفظ..." : "حفظ إعدادات الحساب والباقة"}</button></div>
      </div>
      <p className="opensooq-note">الإعلانات النشطة هنا هي التي تدخلها من حساب السوق المفتوح <strong>قبل جدولة إعلانات جديدة بهذا النظام</strong>، ولا تعِد إضافتها ضمن الرقم النشط بعد نشرها؛ لأن الجداول تظل محسوبة في الرصيد لتجنب الخصم المزدوج. عدّل الأرقام عند بداية كل شهر جديد. الاستوك يعيد عدد الوحدات لكل اسم/بيان/موديل بدون أرقام شاصي، ولذلك رقم «وحدة المخزون» في الجدول يميز عدد الوحدات فقط وليس هوية السيارة الفعلية.</p>
    </section>

    <section className="stats-grid opensooq-stats">
      <StatCard label="سعة الإعلانات الشهرية" value={month ? numberText(monthForm.monthlyLimit) : "—"} hint={monthKey} />
      <StatCard label="الإعلانات النشطة المُدخلة" value={month ? numberText(monthForm.activeCount) : "—"} hint="رصيد البداية من الموقع" tone="info" />
      <StatCard label="محجوزة في الجداول" value={month ? numberText(month.reservedCount) : "—"} hint={`${publishedInPlans} منها تم تأكيد نشره`} tone="warn" />
      <StatCard label="الإعلانات المتبقية" value={month ? numberText(draftRemaining) : "—"} hint={configurationDirty ? "حساب مبدئي · احفظ الإعدادات" : "الشهرية − النشطة − المجدولة"} tone="good" />
    </section>

    <section className="panel opensooq-plan-card">
      <div className="panel-head"><div><h2><CalendarBlank size={20} />تجهيز جدول نشر أسبوعي</h2>
        <p>من السبت إلى الخميس، الجمعة مستبعدة، ولن يتجاوز الجدول رصيد الشهر أو كمية الاستوك المتاحة.</p></div>
        <div className="week-switcher"><button className="icon-button" title="الأسبوع السابق" onClick={() => changeWeek(-1)}><ArrowRight size={19} /></button>
          <label><CalendarBlank size={18} /><input type="date" value={saturday} onChange={(e) => e.target.value && (setSaturday(openSooqSaturday(e.target.value)), setShowPreview(false))} /></label>
          <button className="icon-button" title="الأسبوع التالي" onClick={() => changeWeek(1)}><ArrowLeft size={19} /></button></div>
      </div>
      <div className="opensooq-week-overview">
        <div><span>الأسبوع المحدد</span><strong>{dateText(saturday)} – {dateText(openSooqShiftDate(saturday, 5))}</strong><small>الجدولة تبدأ من اليوم أو من بداية الأسبوع، أيهما أحدث</small></div>
        <div><span>أيام النشر المتاحة</span><strong>{planDays.length}</strong><small>بدون الجمعة أو الأيام الماضية</small></div>
        <div><span>المطلوب حسب الحد اليومي</span><strong>{candidateLimit}</strong><small>{settings?.dailyTarget || 14} إعلانًا يوميًا</small></div>
        <div><span>يمكن جدولته الآن</span><strong>{previewRows.length}</strong><small>حسب الرصيد وكمية الاستوك</small></div>
      </div>
      {configurationDirty ? <div className="alert warning"><WarningCircle size={17} />احفظ إعدادات حساب السوق المفتوح وباقة الشهر قبل تجهيز الجدول.</div> : null}
      {savedThisWeek ? <div className="alert success"><CheckCircle size={17} />جدول هذا الأسبوع محفوظ بالفعل، ويمكن فتحه من الجداول أسفل الصفحة. إنشاء معاينة أخرى لا يخصم شيئًا.</div> : null}
      {!planDays.length && !savedThisWeek ? <div className="alert info"><CalendarBlank size={17} />لا توجد أيام نشر متبقية في هذا الأسبوع ضمن الشهر المحدد. اختر الأسبوع التالي.</div> : null}
      {monthConfigured && !savedThisWeek && planDays.length > 0 && availableSlots < Math.min(candidateLimit, remaining) && !stockLoading ?
        <div className="alert warning"><WarningCircle size={17} />الكمية المتبقية من الاستوك ({availableSlots} سيارة) أقل من العدد المطلوب. الجدول لن ينشئ سيارات وهمية.</div> : null}
      <div className="opensooq-plan-actions"><div className="opensooq-stock-hint"><Storefront size={18} />الاستوك: {numberText(stockTotalVehicles)} سيارة في {numberText(stock.length)} فئة، منها {numberText(availableSlots)} وحدة غير مجدولة في هذا الشهر.</div>
        <button className="primary-button" disabled={!canCreate || Boolean(busy)} onClick={() => setShowPreview(true)}><ClipboardText size={18} />معاينة الجدول الأسبوعي <b>{previewRows.length || ""}</b></button></div>
    </section>

    <section className="panel opensooq-saved">
      <header className="panel-head"><div><h2><ClipboardText size={20} />جداول السوق المفتوح المحفوظة</h2><p>كل جدول محفوظ يحتفظ بالسعر ورقم التواصل وقت إنشائه، ويمكن تحديث سعر الإعلان أو متابعة حالة نشره.</p></div>
        <span className="opensooq-small-count">{plans?.length ?? "—"} جدول</span></header>
      {!plans ? <EmptyState title="جارٍ تحميل الجداول" text="انتظر قراءة جداول هذا الشهر من قاعدة البيانات." />
        : plans.length === 0 ? <EmptyState title="لا توجد جداول لهذا الشهر" text="احفظ إعدادات الباقة ثم جهز أول جدول أسبوعي." />
        : <div className="opensooq-week-list">{plans.map((plan) => {
          const published = plan.rows.filter((row) => row.status === "published").length;
          return <details className="opensooq-saved-week" key={plan.id} open={plan.id === monthWeekKey}>
            <summary><span><CalendarBlank size={20} />أسبوع {dateText(plan.planStart)} – {dateText(plan.planEnd)}</span>
              <span>{plan.rows.length} إعلان · {published} منشور</span></summary>
            <div className="opensooq-week-body"><div className="opensooq-saved-actions"><span>عدد الإعلانات المحجوزة في هذا الجدول: <strong>{plan.rows.length}</strong></span>
              <div className="opensooq-saved-buttons"><button className="secondary-button compact" onClick={() => downloadScheduleCsv(plan)}><DownloadSimple size={17} />تصدير CSV</button>
                {published === 0 ? <ConfirmButton className="danger-button compact" confirmText={`حذف جدول هذا الأسبوع وإرجاع ${plan.rows.length} إعلانًا إلى رصيد الشهر؟`} onConfirm={() => removePlan(plan)}><Trash size={16} />حذف وإرجاع الرصيد</ConfirmButton> : null}</div>
            </div><DailySchedule rows={plan.rows} savingRow={savingRow} onPrice={(row) => setEditingPrice({ planId: plan.id, row, value: String(row.price || "") })} onStatus={(row) => void toggleStatus(plan, row)} /></div>
          </details>;
        })}</div>}
    </section>

    {showPreview && canCreate ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setShowPreview(false); }}>
      <div className="modal-card opensooq-preview-modal"><header className="modal-head"><div><h2>مراجعة جدول السوق المفتوح</h2><p>لن يتم خصم الإعلانات إلا بعد الضغط على «اعتماد الجدول وحجز الإعلانات».</p></div><button className="icon-button" onClick={() => setShowPreview(false)} disabled={Boolean(busy)}>×</button></header>
        <div className="opensooq-preview-summary"><div><span>الإعلانات الجديدة</span><strong>{previewRows.length}</strong></div><div><span>الرصيد قبل الاعتماد</span><strong>{remaining}</strong></div><div><span>الرصيد بعد الاعتماد</span><strong>{remaining - previewRows.length}</strong></div><div><span>متوفر له سعر</span><strong>{pricedCount} / {previewRows.length}</strong></div></div>
        {pricedCount < previewRows.length ? <div className="alert warning"><WarningCircle size={17} />هناك {previewRows.length - pricedCount} سيارة بدون سعر مطابق من موقع MZJ؛ يمكنك ضبط سعر كل واحدة من الجدول بعد حفظه وقبل النشر الفعلي.</div> : null}
        <DailySchedule rows={previewRows} preview />
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
