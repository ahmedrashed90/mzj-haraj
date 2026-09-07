import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CalendarBlank,
  CheckCircle,
  ClockCountdown,
  DownloadSimple,
  FloppyDisk,
  LinkSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { normalizeHarajUrl, updateAd } from "../data";
import {
  addDaysKey,
  dateKey,
  formatDateArabic,
  formatPlanRange,
  getPlanDays,
  getPlanWindowFromAds,
  getWeekStartKey,
  isOverdue,
  isPublished,
} from "../schedule";
import { AD_STATUS_LABELS, type AdStatus, type HarajAd } from "../types";
import { EmptyState, PageTitle, StatCard } from "../components/Ui";
import { BranchSchedulePdf } from "../components/BranchSchedulePdf";

const statuses: AdStatus[] = ["assigned", "published", "approved", "needs_fix", "closed"];

function LinkEditor({ ad }: { ad: HarajAd }) {
  const [url, setUrl] = useState(ad.url || "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const clean = normalizeHarajUrl(url);
      const patch: Partial<HarajAd> = { url: clean };
      if (clean && ad.status === "assigned") patch.status = "published";
      await updateAd(ad.id, patch);
    } finally { setSaving(false); }
  }
  return <div className="schedule-link-editor">
    <div className="schedule-url-box"><LinkSimple size={16} /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="رابط إعلان حراج" /></div>
    <button className="icon-button save-link" onClick={() => void save()} disabled={saving} title="حفظ الرابط"><FloppyDisk size={17} /></button>
    {ad.url ? <a className="icon-button open-link" href={ad.url} target="_blank" rel="noreferrer" title="فتح الإعلان"><ArrowSquareOut size={17} /></a> : null}
  </div>;
}

export function SchedulePage() {
  const { accounts, agents, ads } = useAppData();
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState("");
  const requestedWeek = params.get("week") || getWeekStartKey();
  const weekStart = getWeekStartKey(requestedWeek);
  const today = dateKey(new Date());

  const accountById = useMemo(() => new Map(accounts.map((item) => [item.id, item])), [accounts]);
  const agentById = useMemo(() => new Map(agents.map((item) => [item.id, item])), [agents]);
  const weekAds = useMemo(() => ads.filter((ad) => ad.weekStart === weekStart).sort((a, b) =>
    String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0)
  ), [ads, weekStart]);
  const { planStart, planEnd } = getPlanWindowFromAds(weekAds, weekStart);
  const days = getPlanDays(planStart, planEnd);

  const published = weekAds.filter(isPublished).length;
  const pending = weekAds.filter((ad) => !isPublished(ad) && ad.status !== "closed").length;
  const overdue = weekAds.filter((ad) => isOverdue(ad, today)).length;
  const closed = weekAds.filter((ad) => ad.status === "closed").length;

  const byAccount = useMemo(() => accounts.map((account) => ({
    account,
    rows: weekAds.filter((ad) => ad.accountId === account.id && ad.status !== "closed"),
    activeAgents: agents.filter((agent) => agent.accountId === account.id && agent.active).length,
  })).filter((row) => row.rows.length > 0), [accounts, agents, weekAds]);

  function goWeek(offset: number) {
    setParams({ week: addDaysKey(weekStart, offset * 7) });
  }

  function selectWeek(value: string) {
    if (!value) return;
    setParams({ week: getWeekStartKey(value) });
  }

  function exportBranchPdf(accountId: string) {
    const account = accountById.get(accountId);
    if (!account) return;
    const root = document.querySelector(`.pdf-export-sheet[data-branch-id="${accountId}"]`);
    if (!root) return window.alert("تعذر تجهيز ملف PDF");

    setExporting(accountId);
    const popup = window.open("", "_blank", "width=920,height=1100");
    if (!popup) {
      setExporting("");
      return window.alert("اسمح بفتح النافذة المنبثقة لحفظ جدول الفرع PDF.");
    }

    popup.document.open();
    popup.document.write(`<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>جدول النشر - ${account.name}</title></head><body></body></html>`);
    popup.document.close();

    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      popup.document.head.appendChild(node.cloneNode(true));
    });
    const printStyle = popup.document.createElement("style");
    printStyle.textContent = `
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .pdf-export-sheet { position: static !important; left: auto !important; top: auto !important; width: 794px !important; pointer-events: auto !important; z-index: auto !important; }
      .pdf-page { page-break-after: always; break-after: page; }
      .pdf-page:last-child { page-break-after: auto; break-after: auto; }
    `;
    popup.document.head.appendChild(printStyle);
    popup.document.body.innerHTML = root.innerHTML;

    const finish = () => {
      setExporting("");
      popup.focus();
      popup.print();
    };
    if (popup.document.fonts?.ready) popup.document.fonts.ready.then(() => setTimeout(finish, 350));
    else setTimeout(finish, 700);
  }

  return <>
    <PageTitle
      title="جدول النشر"
      subtitle="الجدول موزع حسب حد كل فرع وعلى مناديب نفس الفرع. بعد النشر أضف رابط إعلان حراج."
      actions={<div className="week-switcher"><button className="icon-button" onClick={() => goWeek(-1)} title="الأسبوع السابق"><ArrowRight size={19} /></button><label><CalendarBlank size={18} /><input type="date" value={weekStart} onChange={(e) => selectWeek(e.target.value)} /></label><button className="icon-button" onClick={() => goWeek(1)} title="الأسبوع التالي"><ArrowLeft size={19} /></button></div>}
    />

    <section className="week-hero panel">
      <div><span>فترة النشر</span><h2>{formatPlanRange(planStart, planEnd)}</h2><p>{planStart === weekStart ? "الجدول الأسبوعي: السبت إلى الجمعة" : "جدول الفترة الحالية حتى الجمعة"}</p></div>
      <div className="week-hero-stats"><div><span>المجدول</span><b>{weekAds.length}</b></div><div><span>تم النشر</span><b>{published}</b></div><div><span>متبقي</span><b>{pending}</b></div><div className={overdue ? "danger" : ""}><span>متأخر</span><b>{overdue}</b></div></div>
    </section>

    <section className="stats-grid schedule-stats">
      <StatCard label="إجمالي التكليفات" value={weekAds.length} hint="داخل فترة الجدول" tone="info" />
      <StatCard label="تم النشر" value={published} hint="تم استلام الرابط/اعتماد النشر" tone="good" />
      <StatCard label="بانتظار النشر" value={pending} hint="لم يُسجل رابط بعد" tone={pending ? "warn" : "good"} />
      <StatCard label="متأخر" value={overdue} hint="موعده عدى بدون نشر" tone={overdue ? "danger" : "good"} />
      <StatCard label="منتهي" value={closed} hint="تكليفات مغلقة" />
    </section>

    {byAccount.length ? <section className="panel branch-share-panel">
      <div className="panel-head"><div><h2>إرسال جدول كل فرع</h2><p>حمّل PDF خاص بالفرع وأرسله لمدير الفرع. الملف يحتوي الجدول وسياسات النشر ومتابعة الرسائل والتنبيهات.</p></div></div>
      <div className="branch-export-grid">{byAccount.map(({ account, rows, activeAgents }) => <article className="branch-export-card" key={account.id}>
        <div><span>الفرع</span><strong>{account.name}</strong><small>{activeAgents} مندوب نشط</small></div>
        <div className="branch-export-numbers"><span>حد حراج <b>{account.adLimit}</b></span><span>في الجدول <b>{rows.length}</b></span></div>
        <button className="primary-button" onClick={() => void exportBranchPdf(account.id)} disabled={exporting === account.id}><DownloadSimple size={18} />{exporting === account.id ? "جارٍ تجهيز PDF..." : "حفظ PDF للفرع"}</button>
      </article>)}</div>
    </section> : null}

    {byAccount.some((row) => row.rows.length > row.account.adLimit) ? <div className="alert warning"><WarningCircle size={19} />يوجد فرع حدّه الحالي أقل من عدد التكليفات الموجودة. هذا تنبيه فقط ولا يتم حذف أي تكليف سابق.</div> : null}

    {!weekAds.length ? <section className="panel"><EmptyState title="لا يوجد جدول لهذه الفترة" text="من صفحة مخزون السيارات اختر السيارات ثم اضغط تجهيز جدول النشر." /></section> : <section className="weekly-board">
      {days.map((day) => {
        const dayAds = weekAds.filter((ad) => ad.scheduledDate === day.key);
        const isToday = day.key === today;
        return <article className={`day-card ${isToday ? "today" : ""}`} key={day.key}>
          <header><div><span>{day.name}</span><strong>{formatDateArabic(day.key, { day: "numeric", month: "short" })}</strong></div><b>{dayAds.length}</b></header>
          <div className="day-tasks">
            {!dayAds.length ? <div className="day-empty">لا توجد إعلانات مجدولة</div> : dayAds.map((ad) => {
              const late = isOverdue(ad, today);
              const done = isPublished(ad);
              const account = accountById.get(ad.accountId);
              const agent = agentById.get(ad.agentId);
              return <div className={`schedule-task ${late ? "late" : ""} ${done ? "done" : ""}`} key={ad.id}>
                <div className="task-top"><div><strong>{ad.carName}</strong><span>{ad.statement || "—"} · {ad.modelYear || "—"}</span></div>{late ? <span className="task-flag late"><ClockCountdown size={15} />متأخر</span> : done ? <span className="task-flag done"><CheckCircle size={15} />تم</span> : <span className="task-flag">مجدول</span>}</div>
                <div className="task-meta"><span>المندوب <b>{agent?.name || "مندوب محذوف"}</b></span><span>الفرع <b>{account?.name || "فرع محذوف"}</b></span></div>
                <div className="task-controls"><select className={`status-select ${ad.status}`} value={ad.status} onChange={(e) => void updateAd(ad.id, { status: e.target.value as AdStatus })}>{statuses.map((status) => <option key={status} value={status}>{AD_STATUS_LABELS[status]}</option>)}</select><LinkEditor ad={ad} /></div>
              </div>;
            })}
          </div>
        </article>;
      })}
    </section>}

    {byAccount.map(({ account, rows }) => <BranchSchedulePdf key={`pdf-${account.id}`} account={account} ads={rows} agents={agents} planStart={planStart} planEnd={planEnd} />)}
  </>;
}
