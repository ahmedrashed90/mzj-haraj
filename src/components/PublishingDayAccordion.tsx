import { useMemo, useState } from "react";
import { ArrowSquareOut, CaretDown, CaretUp, Check, Copy, Eye, FloppyDisk, LinkSimple, Trash } from "@phosphor-icons/react";
import { normalizeHarajUrl, removeAd, updateAd } from "../data";
import { adBranchId, isOverdue, isPublished } from "../schedule";
import { AD_STATUS_LABELS, type AdStatus, type Agent, type HarajAccount, type HarajAd, type PublishingSettings } from "../types";
import { ConfirmButton } from "./Ui";
import { getPublishingAdText, getPublishingPrice } from "./AdCopyCard";

const statuses: AdStatus[] = ["assigned", "published", "approved", "needs_fix", "closed"];

function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

function clean(value: unknown) { return String(value ?? "").trim(); }

function PublishLinkEditor({ ad, showNotes = false }: { ad: HarajAd; showNotes?: boolean }) {
  const [url, setUrl] = useState(ad.url || "");
  const [notes, setNotes] = useState(ad.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const cleanUrl = normalizeHarajUrl(url);
      const patch: Partial<HarajAd> = { url: cleanUrl };
      if (showNotes) patch.notes = notes.trim();
      if (cleanUrl && ad.status === "assigned") patch.status = "published";
      await updateAd(ad.id, patch);
    } finally {
      setSaving(false);
    }
  }

  return <div className={`day-row-link-editor ${showNotes ? "with-notes" : ""}`}>
    <div className="day-row-url"><LinkSimple size={15} /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="رابط إعلان حراج" /></div>
    {showNotes ? <input className="day-row-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة داخلية" /> : null}
    <button type="button" className="day-row-icon-button" onClick={() => void save()} disabled={saving} title="حفظ الرابط"><FloppyDisk size={16} /></button>
    {ad.url ? <a className="day-row-icon-button" href={ad.url} target="_blank" rel="noreferrer" title="فتح الإعلان"><ArrowSquareOut size={16} /></a> : null}
  </div>;
}

function CopyButtons({ ad, onPreview }: { ad: HarajAd; onPreview: () => void }) {
  const [copied, setCopied] = useState("");
  const title = clean(ad.adTitle);
  const text = getPublishingAdText(ad);
  const price = getPublishingPrice(ad);
  const ready = ad.specsStatus === "matched" && Boolean(title && text && clean(ad.agentNameSnapshot) && clean(ad.agentPhoneSnapshot) && price);

  async function copy(key: string, value: string) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else if (!fallbackCopy(value)) throw new Error("COPY_FAILED");
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1400);
    } catch {
      window.alert("تعذر النسخ التلقائي. حدد النص يدويًا.");
    }
  }

  return <div className="day-row-actions">
    <button type="button" className="table-action-button" disabled={!title} onClick={() => void copy("title", title)} title="نسخ عنوان إعلان حراج">{copied === "title" ? <Check size={15} /> : <Copy size={15} />}<span>{copied === "title" ? "تم" : "العنوان"}</span></button>
    <button type="button" className="table-action-button primary" disabled={!ready} onClick={() => void copy("text", text)} title={ready ? "نسخ صيغة الإعلان" : "بيانات الإعلان غير مكتملة"}>{copied === "text" ? <Check size={15} /> : <Copy size={15} />}<span>{copied === "text" ? "تم" : "الصيغة"}</span></button>
    <button type="button" className="table-action-button ghost" onClick={onPreview} title="معاينة صيغة الإعلان"><Eye size={15} /><span>معاينة</span></button>
  </div>;
}

function ReadinessBadge({ ad }: { ad: HarajAd }) {
  const ready = ad.specsStatus === "matched" && Boolean(ad.adTitle && ad.adText && ad.agentNameSnapshot && ad.agentPhoneSnapshot && Number(ad.websitePrice || 0) > 0);
  if (ready) return <span className="row-ready-badge ready">جاهز</span>;
  if (ad.specsStatus === "partial") return <span className="row-ready-badge warn">CompareKey جزئي</span>;
  return <span className="row-ready-badge danger">غير جاهز</span>;
}

export function PublishingDayAccordion({
  dayKey,
  dayLabel,
  dateLabel,
  ads,
  branches,
  agents,
  publishingSettings,
  defaultOpen = false,
  allowDelete = false,
  showNotes = false,
}: {
  dayKey: string;
  dayLabel: string;
  dateLabel: string;
  ads: HarajAd[];
  branches: HarajAccount[];
  agents: Agent[];
  publishingSettings: PublishingSettings;
  defaultOpen?: boolean;
  allowDelete?: boolean;
  showNotes?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [previewId, setPreviewId] = useState("");
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const sortedAds = useMemo(() => [...ads].sort((a, b) => Number(a.publishingPeriodOrder || 0) - Number(b.publishingPeriodOrder || 0) || Number(a.periodAgentSequence || 0) - Number(b.periodAgentSequence || 0) || Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0)), [ads]);
  const publishedCount = sortedAds.filter(isPublished).length;
  const lateCount = sortedAds.filter((ad) => isOverdue(ad)).length;

  return <article className={`publishing-day ${open ? "open" : ""}`} data-day={dayKey}>
    <button type="button" className="publishing-day-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <div className="publishing-day-date"><span>{dayLabel}</span><strong>{dateLabel}</strong></div>
      <div className="publishing-day-summary">
        <span className="day-count-chip"><b>{sortedAds.length}</b> إعلان</span>
        <span>تم النشر <b>{publishedCount}</b></span>
        {lateCount ? <span className="late-summary">متأخر <b>{lateCount}</b></span> : null}
      </div>
      <span className="publishing-day-chevron">{open ? <CaretUp size={18} /> : <CaretDown size={18} />}</span>
    </button>

    {open ? <div className="publishing-day-body">
      {!sortedAds.length ? <div className="publishing-day-empty">لا توجد إعلانات في هذا اليوم.</div> : <div className="professional-table-scroll"><table className="publishing-table"><thead><tr><th>#</th><th>وقت النشر</th><th>الفترة</th><th>السيارة</th><th>الاسم / الفرع</th><th>النوع</th><th>عنوان الإعلان</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>{sortedAds.flatMap((ad, index) => {
        const agent = agentById.get(ad.agentId);
        const branch = branchById.get(adBranchId(ad));
        const previewOpen = previewId === ad.id;
        const late = isOverdue(ad);
        const timeText = ad.publishingPeriodStart && ad.publishingPeriodEnd ? `${ad.publishingPeriodStart} - ${ad.publishingPeriodEnd}` : "—";
        const rows = [<tr className={`${late ? "publishing-row-late" : ""} ${isPublished(ad) ? "publishing-row-done" : ""}`} key={ad.id}>
          <td className="row-number">{index + 1}</td>
          <td><strong className="ltr-value schedule-time-value">{timeText}</strong></td>
          <td><span className="period-pill">{ad.publishingPeriodName || "بدون فترة"}</span></td>
          <td><div className="vehicle-cell"><strong>{ad.carName}</strong><small>{[ad.statement, ad.modelYear].filter(Boolean).join(" · ")}</small></div></td>
          <td><div className="agent-cell"><strong>{agent?.name || ad.agentNameSnapshot || "محذوف"}</strong><small>{branch?.name || "بدون فرع"}</small></div></td>
          <td><span className={`agent-type-pill ${ad.agentTypeSnapshot === "installment" ? "installment" : "cash"}`}>{ad.agentTypeSnapshot === "installment" ? "تقسيط" : "كاش"}</span></td>
          <td><div className="title-cell"><strong>{ad.adTitle || "عنوان غير جاهز"}</strong><ReadinessBadge ad={ad} /></div></td>
          <td><select className={`status-select table-status ${ad.status}`} value={ad.status} onChange={(e) => void updateAd(ad.id, { status: e.target.value as AdStatus })}>{statuses.map((status) => <option key={status} value={status}>{AD_STATUS_LABELS[status]}</option>)}</select></td>
          <td><div className="day-row-action-stack"><div className="day-row-action-line"><CopyButtons ad={ad} onPreview={() => setPreviewId((current) => current === ad.id ? "" : ad.id)} />{allowDelete ? <ConfirmButton className="table-delete-button" confirmText="حذف التكليف؟" onConfirm={() => removeAd(ad.id)}><Trash size={15} /></ConfirmButton> : null}</div><PublishLinkEditor ad={ad} showNotes={showNotes} /></div></td>
        </tr>];
        if (previewOpen) rows.push(<tr className="publishing-preview-row" key={`${ad.id}-preview`}><td colSpan={9}><div className="publishing-preview-panel"><div><span>عنوان إعلان حراج</span><strong>{ad.adTitle || "—"}</strong><small>{ad.agentTypeSnapshot === "installment" ? "عنوان تمويل" : "عنوان كاش"} · {ad.harajAccountName || publishingSettings.accountName || "حساب حراج غير محدد"}</small></div><pre>{getPublishingAdText(ad) || "صيغة الإعلان غير جاهزة."}</pre>{ad.websitePermalink ? <a href={ad.websitePermalink} target="_blank" rel="noreferrer"><ArrowSquareOut size={15} />فتح صفحة السيارة بالموقع</a> : null}</div></td></tr>);
        return rows;
      })}</tbody></table></div>}
    </div> : null}
  </article>;
}
