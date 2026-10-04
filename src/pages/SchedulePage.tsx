import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarBlank, CheckCircle, ClipboardText, DownloadSimple, Storefront, Trash, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { removeScheduleAds } from "../data";
import { addDaysKey, dateKey, formatDateArabic, formatPlanRange, getPlanDays, getPlanWindowFromAds, getWeekStartKey, isPublished } from "../schedule";
import { ConfirmButton, EmptyState, PageTitle } from "../components/Ui";
import { PublishingDayAccordion } from "../components/PublishingDayAccordion";
import { exportWeeklyScheduleWord } from "../word-export";

export function SchedulePage() {
  const { accounts, agents, ads, publishingSettings } = useAppData();
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const weekStart = getWeekStartKey(params.get("week") || getWeekStartKey());
  const today = dateKey(new Date());

  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === weekStart).sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0) || Number(a.agentSequence || a.periodAgentSequence || 0) - Number(b.agentSequence || b.periodAgentSequence || 0)), [ads, weekStart]);
  const { planStart, planEnd } = getPlanWindowFromAds(weekAds, weekStart);
  const days = getPlanDays(planStart, planEnd);
  const published = weekAds.filter(isPublished).length;
  const activeAgents = agents.filter((agent) => agent.active).length;
  const activeBranches = accounts.filter((branch) => branch.active).length;
  const firstOpenDay = days.find((day) => day.key === today && weekAds.some((ad) => ad.scheduledDate === day.key))?.key || days.find((day) => weekAds.some((ad) => ad.scheduledDate === day.key))?.key || days[0]?.key || "";
  const exportRows = useMemo(() => weekAds.filter((ad) => ad.status !== "closed"), [weekAds]);

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

  async function exportWeekWord() {
    if (exporting) return;
    if (!exportRows.length) return window.alert("لا توجد إعلانات في هذا الأسبوع لتصديرها.");
    setExporting("week");
    try {
      await exportWeeklyScheduleWord({
        accounts,
        ads: exportRows,
        agents,
        publishingSettings,
        planStart,
        planEnd,
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "تعذر تجهيز ملف Word");
    } finally {
      setExporting("");
    }
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
      <article className="schedule-overview-card"><div className="overview-icon"><UsersThree size={24} weight="duotone" /></div><div><span>المناديب النشطون</span><strong>{activeAgents}</strong><small>موزعون تلقائيًا بالتتابع</small></div></article>
      <article className="schedule-overview-card"><div className="overview-icon"><Storefront size={24} weight="duotone" /></div><div><span>الفروع النشطة</span><strong>{activeBranches}</strong><small>{published} إعلان تم نشره</small></div></article>
    </section>

    <section className="schedule-control-bar panel">
      <div className="schedule-account-summary"><span>حساب حراج المستخدم</span><strong>{publishingSettings.accountName || "غير محدد"}</strong><small>ملف Word واحد لجميع إعلانات الأسبوع بصيغة DOCX</small></div>
      <div className="schedule-word-actions"><button className="secondary-button word-branch-button" onClick={() => void exportWeekWord()} disabled={exporting === "week" || !exportRows.length}><DownloadSimple size={17} />{exporting === "week" ? "جارٍ التجهيز..." : "Word إعلانات الأسبوع"}<span>{exportRows.length}</span></button></div>
      {weekAds.length ? <ConfirmButton className="danger-button schedule-delete-button" confirmText={`حذف جدول النشر بالكامل (${weekAds.length} تكليف)؟`} onConfirm={deleteWholeSchedule}><Trash size={17} />{deleting ? "جارٍ الحذف..." : "حذف الجدول"}</ConfirmButton> : null}
    </section>

    {!weekAds.length ? <section className="panel"><EmptyState title="لا يوجد جدول لهذا النطاق" text="جهز جدولًا جديدًا من مخزون السيارات." /></section> : <section className="publishing-days-list">{days.map((day) => {
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

  </>;
}
