import { useEffect, useMemo, useState } from "react";
import { CalendarBlank, CheckCircle, DownloadSimple, FloppyDisk, Phone, Storefront, WarningCircle } from "@phosphor-icons/react";
import { useAuth } from "../AuthContext";
import { DailySchedule, dateText, downloadOpenSooqXlsx, formatLabel, numberText } from "../components/OpenSooqSchedule";
import { EmptyState, PageTitle, StatCard } from "../components/Ui";
import { changeOpenSooqRow, subscribeOpenSooqBranchRows } from "../opensooq-data";
import { findOpenSooqDuplicateModelDays, openSooqBranchName, openSooqMonthKey } from "../opensooq";
import type { OpenSooqAssignment } from "../types";

export function OpenSooqManagerPage() {
  const { branchId, managerName } = useAuth();
  const [monthKey, setMonthKey] = useState(() => openSooqMonthKey(new Date()));
  const [rows, setRows] = useState<OpenSooqAssignment[] | null>(null);
  const [savingRow, setSavingRow] = useState("");
  const [editingPrice, setEditingPrice] = useState<{ row: OpenSooqAssignment; value: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setRows(null); setError("");
    if (!branchId) return;
    return subscribeOpenSooqBranchRows(branchId, monthKey, setRows,
      (e) => setError(`تعذر تحميل جدول الفرع: ${e.message}`));
  }, [branchId, monthKey]);

  const weeks = useMemo(() => {
    const groups = new Map<string, OpenSooqAssignment[]>();
    for (const row of rows || []) {
      const list = groups.get(row.planId) || [];
      list.push(row); groups.set(row.planId, list);
    }
    return [...groups.entries()].map(([id, list]) => ({ id, rows: list.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.order - b.order) }))
      .sort((a, b) => a.rows[0].weekStart.localeCompare(b.rows[0].weekStart));
  }, [rows]);
  const published = rows?.filter((row) => row.status === "published").length || 0;
  const pending = (rows?.length || 0) - published;
  const branchName = branchId ? openSooqBranchName(branchId) : "";
  const duplicateDays = useMemo(() => findOpenSooqDuplicateModelDays(rows || []), [rows]);

  async function toggleStatus(row: OpenSooqAssignment) {
    if (!branchId || savingRow) return;
    if (row.status === "published" && !window.confirm(`إعادة إعلان ${formatLabel(row)} إلى حالة غير منشور؟`)) return;
    setSavingRow(row.id); setError(""); setNotice("");
    try {
      await changeOpenSooqRow(branchId, row.planId, row.id, { status: row.status === "published" ? "scheduled" : "published" });
      setNotice(row.status === "published" ? "تمت إعادة الإعلان إلى غير منشور." : "تم تأكيد نشر الإعلان بنجاح.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ حالة الإعلان"); }
    finally { setSavingRow(""); }
  }
  async function savePrice() {
    if (!branchId || !editingPrice || savingRow) return;
    const price = Number(editingPrice.value);
    if (!Number.isSafeInteger(price) || price <= 0) { setError("اكتب سعر سيارة صحيحًا أكبر من صفر."); return; }
    setSavingRow(editingPrice.row.id); setError(""); setNotice("");
    try {
      await changeOpenSooqRow(branchId, editingPrice.row.planId, editingPrice.row.id, { price });
      setEditingPrice(null); setNotice("تم حفظ السعر بنجاح، دون خصم أي إعلان جديد.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تعديل السعر"); }
    finally { setSavingRow(""); }
  }
  if (!branchId) return <EmptyState title="لا يوجد فرع مخصص" text="اطلب من مسؤول النظام تعيينك لفرع السوق المفتوح." />;

  return <>
    <PageTitle title={`السوق المفتوح – فرع ${branchName}`} subtitle={`مرحبًا ${managerName}. هذه إعلانات فرعك فقط؛ الجدولة والحصة الشهرية يحددها مسؤول النظام.`}
      actions={<label className="opensooq-month-picker">شهر النشر <input type="month" value={monthKey}
        onChange={(e) => /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && setMonthKey(e.target.value)} /></label>} />
    {error ? <div className="alert error"><WarningCircle size={18} />{error}</div> : null}
    {notice ? <div className="alert success"><CheckCircle size={18} />{notice}</div> : null}
    {duplicateDays.length ? <div className="alert warning"><WarningCircle size={18} />يوجد تكرار في إعلانات فرعك في أيام {duplicateDays.join("، ")}. لا تنشر الإعلانات المكررة؛ اطلب من مسؤول النظام تنظيف الجدول. وقد توجد تكرارات مع الفرع الآخر لا تظهر لك بسبب الصلاحيات.</div> : null}
    <section className="stats-grid opensooq-manager-stats">
      <StatCard label="إعلانات فرعي" value={rows ? numberText(rows.length) : "—"} hint={monthKey} />
      <StatCard label="تم نشرها" value={rows ? numberText(published) : "—"} hint="تم التأكيد من حسابك" tone="good" />
      <StatCard label="بانتظار النشر" value={rows ? numberText(pending) : "—"} hint="الإعلانات المطلوبة من فرعك" tone="warn" />
    </section>
    <section className="panel opensooq-saved">
      <header className="panel-head"><div><h2><Storefront size={20} />جدول نشر فرع {branchName}</h2>
        <p>تابع السيارة والسعر والرقم الموحد، وأكد النشر بعد نشر الإعلان يدويًا في السوق المفتوح.</p></div>
        <span className="opensooq-small-count">{weeks.length} جدول أسبوعي</span></header>
      {rows === null ? <EmptyState title="جارٍ تحميل إعلانات الفرع" text="انتظر لحظة حتى تظهر مهام النشر." />
        : !weeks.length ? <EmptyState title="لا توجد إعلانات مخصصة لهذا الشهر" text="إذا كان هناك جدول سابق، اطلب من مسؤول النظام فتح السوق المفتوح ومزامنة الجداول القديمة." />
        : <div className="opensooq-week-list">{weeks.map((week) => {
          const publishedInWeek = week.rows.filter((row) => row.status === "published").length;
          const from = week.rows[0].scheduledDate;
          const to = week.rows[week.rows.length - 1].scheduledDate;
          return <details key={week.id} className="opensooq-saved-week" open>
            <summary><span><CalendarBlank size={20} />أسبوع {dateText(from)} – {dateText(to)}</span>
              <span>{week.rows.length} إعلان · {publishedInWeek} منشور · {week.rows.length - publishedInWeek} متبقي</span></summary>
            <div className="opensooq-week-body"><div className="opensooq-saved-actions"><span>مسؤول النشر: <strong>{managerName}</strong></span>
              <button className="secondary-button compact" onClick={() => downloadOpenSooqXlsx(week.rows, from, to, branchId)}>
                <DownloadSimple size={17} />تصدير جدول فرعي Excel</button></div>
              <DailySchedule rows={week.rows} savingRow={savingRow}
                onPrice={(row) => setEditingPrice({ row: row as OpenSooqAssignment, value: String(row.price || "") })}
                onStatus={(row) => void toggleStatus(row as OpenSooqAssignment)} />
            </div>
          </details>;
        })}</div>}
    </section>
    <div className="opensooq-footer-note"><Phone size={17} />كل الإعلانات تستخدم الرقم الموحد. لا يمكنك رؤية إعلانات الفرع الآخر أو تعديل رصيد الباقة أو إعدادات حراج.</div>
    {editingPrice ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRow) setEditingPrice(null); }}>
      <div className="modal-card opensooq-price-modal"><div className="modal-head"><div><h2>تعديل سعر الإعلان</h2><p>{formatLabel(editingPrice.row)}</p></div>
        <button className="icon-button" disabled={Boolean(savingRow)} onClick={() => setEditingPrice(null)}>×</button></div>
        <label>السعر بالريال السعودي<input type="number" min="1" step="1" value={editingPrice.value}
          onChange={(e) => setEditingPrice((current) => current ? { ...current, value: e.target.value } : null)} autoFocus /></label>
        <div className="modal-actions"><button className="ghost-button" disabled={Boolean(savingRow)} onClick={() => setEditingPrice(null)}>إلغاء</button>
          <button className="primary-button" disabled={Boolean(savingRow)} onClick={() => void savePrice()}><FloppyDisk size={17} />حفظ السعر</button></div>
      </div>
    </div> : null}
  </>;
}
