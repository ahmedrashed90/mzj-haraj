import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarBlank, CheckCircle, ClipboardText, DownloadSimple, Storefront, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { removeScheduleAds } from "../data";
import { addDaysKey, adBranchId, dateKey, formatDateArabic, formatPlanRange, getPlanDays, getPlanWindowFromAds, getWeekStartKey, isPublished } from "../schedule";
import { ConfirmButton, EmptyState, PageTitle } from "../components/Ui";
import { BranchSchedulePdf } from "../components/BranchSchedulePdf";
import { PublishingDayAccordion } from "../components/PublishingDayAccordion";

export function SchedulePage() {
  const { accounts, agents, ads, publishingSettings } = useAppData();
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const weekStart = getWeekStartKey(params.get("week") || getWeekStartKey());
  const today = dateKey(new Date());

  const branchById = useMemo(() => new Map(accounts.map((branch) => [branch.id, branch])), [accounts]);
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === weekStart).sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || Number(a.publishingPeriodOrder || 0) - Number(b.publishingPeriodOrder || 0) || Number(a.periodAgentSequence || 0) - Number(b.periodAgentSequence || 0) || Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0)), [ads, weekStart]);
  const { planStart, planEnd } = getPlanWindowFromAds(weekAds, weekStart);
  const days = getPlanDays(planStart, planEnd);
  const published = weekAds.filter(isPublished).length;
  const activeAgents = agents.filter((agent) => agent.active).length;
  const activeBranches = accounts.filter((branch) => branch.active).length;
  const firstOpenDay = days.find((day) => day.key === today && weekAds.some((ad) => ad.scheduledDate === day.key))?.key || days.find((day) => weekAds.some((ad) => ad.scheduledDate === day.key))?.key || days[0]?.key || "";
  const byBranch = useMemo(() => accounts.map((branch) => ({ branch, rows: weekAds.filter((ad) => ad.status !== "closed" && adBranchId(ad) === branch.id) })).filter((item) => item.rows.length), [accounts, weekAds]);

  function goWeek(offset: number) {
    setParams({ week: addDaysKey(weekStart, offset * 7) });
    setError("");
    setNotice("");
  }

  function selectWeek(value: string) {
    if (value) setParams({ week: getWeekStartKey(value) });
  }

  async function deleteWholeSchedule() {
    if (!weekAds.length || deleting) return;
    setDeleting(true);
    try {
      await removeScheduleAds(weekAds.map((ad) => ad.id));
      setNotice(`تم حذف جدول النشر بالكامل (${weekAds.length} تكليفًا).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حذف الجدول");
    } finally {
      setDeleting(false);
    }
  }

  function exportBranchPdf(branchId: string) {
    const branch = branchById.get(branchId);
    if (!branch) return;
    const root = document.querySelector(`.pdf-export-sheet[data-branch-id="${branchId}"]`);
    if (!root) return window.alert("تعذر تجهيز ملف PDF");

    setExporting(branchId);
    const popup = window.open("", "_blank", "width=920,height=1100");
    if (!popup) {
      setExporting("");
      return window.alert("اسمح بفتح النافذة المنبثقة لحفظ PDF.");
    }

    popup.document.open();
    popup.document.write(`<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${window.location.origin}/"><title>جدول النشر - ${branch.name}</title></head><body class="pdf-print-body"></body></html>`);
    popup.document.close();

    const pendingStyles: Promise<void>[] = [];
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((source) => {
      const link = popup.document.createElement("link");
      link.rel = "stylesheet";
      link.href = source.href;
      pendingStyles.push(new Promise((resolve) => { link.onload = () => resolve(); link.onerror = () => resolve(); window.setTimeout(resolve, 2000); }));
      popup.document.head.appendChild(link);
    });
    document.querySelectorAll<HTMLStyleElement>("style").forEach((source) => popup.document.head.appendChild(source.cloneNode(true)));

    const printStyle = popup.document.createElement("style");
    printStyle.textContent = `@page{size:A4 portrait;margin:0}html,body{margin:0!important;padding:0!important;width:794px!important;min-width:794px!important;background:#fff!important;overflow:visible!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}*{box-sizing:border-box!important}.pdf-export-sheet{position:static!important;visibility:visible!important;inset:auto!important;width:794px!important;min-width:794px!important;margin:0!important;pointer-events:auto!important;z-index:auto!important}.pdf-page{width:794px!important;min-width:794px!important;max-width:794px!important;height:1123px!important;min-height:1123px!important;max-height:1123px!important;margin:0!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important;page-break-after:always!important;break-after:page!important;transform:none!important;zoom:1!important}.pdf-page:last-child{page-break-after:auto!important;break-after:auto!important}.pdf-page+.pdf-page{page-break-before:always!important;break-before:page!important}img{max-width:100%!important}table{page-break-inside:avoid!important}`;
    popup.document.head.appendChild(printStyle);
    popup.document.body.innerHTML = root.outerHTML;

    const finish = async () => {
      await Promise.all(pendingStyles);
      if (popup.document.fonts?.ready) await popup.document.fonts.ready;
      window.setTimeout(() => {
        setExporting("");
        popup.focus();
        popup.print();
      }, 250);
    };
    void finish();
  }

  return <>
    <PageTitle
      title="جدول النشر"
      subtitle="كل يوم نشر في مجموعة واحدة. اضغط على اليوم لعرض إعلاناته واضغط مرة أخرى لإغلاقه."
      actions={<div className="schedule-title-actions"><div className="week-switcher"><button className="icon-button" onClick={() => goWeek(-1)} title="الأسبوع السابق"><ArrowRight size={19} /></button><label><CalendarBlank size={18} /><input type="date" value={weekStart} onChange={(e) => selectWeek(e.target.value)} /></label><button className="icon-button" onClick={() => goWeek(1)} title="الأسبوع التالي"><ArrowLeft size={19} /></button></div></div>}
    />

    {error ? <div className="alert error"><WarningCircle size={19} />{error}</div> : null}
    {notice ? <div className="alert success"><CheckCircle size={19} />{notice}</div> : null}

    <section className="schedule-overview">
      <article className="schedule-overview-card featured"><div className="overview-icon"><ClipboardText size={24} weight="duotone" /></div><div><span>إجمالي إعلانات الجدول</span><strong>{weekAds.length}</strong><small>{formatPlanRange(planStart, planEnd)}</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><CalendarBlank size={24} weight="duotone" /></div><div><span>الحد اليومي للحساب</span><strong>{publishingSettings.dailyLimit || 0}</strong><small>{days.length} أيام نشر</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><UsersThree size={24} weight="duotone" /></div><div><span>المناديب النشطون</span><strong>{activeAgents}</strong><small>موزعون حسب فترات النشر</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><Storefront size={24} weight="duotone" /></div><div><span>الفروع النشطة</span><strong>{activeBranches}</strong><small>{published} إعلان تم نشره</small></div></article>
    </section>

    <section className="schedule-control-bar panel">
      <div className="schedule-account-summary"><span>حساب حراج المستخدم</span><strong>{publishingSettings.accountName || "غير محدد"}</strong><small>ملف PDF مستقل لكل فرع — بدون معاينة داخل الصفحة</small></div>
      <div className="schedule-pdf-actions">{byBranch.map(({ branch, rows }) => <button key={branch.id} className="secondary-button pdf-branch-button" onClick={() => exportBranchPdf(branch.id)} disabled={exporting === branch.id}><DownloadSimple size={17} />{exporting === branch.id ? "جارٍ التجهيز..." : `PDF ${branch.name}`}<span>{rows.length}</span></button>)}</div>
      {weekAds.length ? <ConfirmButton className="danger-button schedule-delete-button" confirmText={`حذف جدول النشر بالكامل (${weekAds.length} تكليف)؟`} onConfirm={deleteWholeSchedule}><Trash size={17} />{deleting ? "جارٍ الحذف..." : "حذف الجدول"}</ConfirmButton> : null}
    </section>

    {!weekAds.length ? <section className="panel"><EmptyState title="لا يوجد جدول لهذه الفترة" text="جهز جدولًا جديدًا من مخزون السيارات." /></section> : <section className="publishing-days-list">{days.map((day) => {
      const dayAds = weekAds.filter((ad) => ad.scheduledDate === day.key);
      return <PublishingDayAccordion
        key={day.key}
        dayKey={day.key}
        dayLabel={day.name}
        dateLabel={formatDateArabic(day.key, { day: "numeric", month: "long", year: "numeric" })}
        ads={dayAds}
        branches={accounts}
        agents={agents}
        publishingSettings={publishingSettings}
        defaultOpen={day.key === firstOpenDay}
      />;
    })}</section>}

    {byBranch.map(({ branch, rows }) => <BranchSchedulePdf key={`pdf-${branch.id}`} branch={branch} ads={rows} agents={agents} publishingSettings={publishingSettings} planStart={planStart} planEnd={planEnd} />)}
  </>;
}
