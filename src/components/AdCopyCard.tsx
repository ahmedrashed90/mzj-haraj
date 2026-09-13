import { Check, Copy, LinkSimple, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { HarajAd } from "../types";

function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus(); area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

function clean(value: unknown) { return String(value ?? "").trim(); }

export function formatPublishingPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 }).format(value);
}

export function normalizeAdTextForPublishing(value: unknown, price: string) {
  let text = clean(value)
    .replace(/(^|\n)المندوب:\s*/g, "$1")
    .replace(/(^|\n)متوفرة الآن لدى[^\n]*/g, "$1متوفرة الآن")
    .replace(/(^|\n)السعر:\s*[^\n]*/g, "$1")
    .replace(/(^|\n)السعر شامل الضريبة:\s*[^\n]*/g, "$1")
    .replace(/(^|\n)احصل على الخصم والهدايا عند التواصل\s*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (price) {
    text = `${text}\n\nالسعر شامل الضريبة: ${price} ريال\nاحصل على الخصم والهدايا عند التواصل`;
  }
  return text.trim();
}


export function getPublishingAdText(ad: HarajAd) {
  const price = formatPublishingPrice(Number(ad.websitePrice || 0));
  return normalizeAdTextForPublishing(ad.adText, price);
}

export function getPublishingPrice(ad: HarajAd) {
  return formatPublishingPrice(Number(ad.websitePrice || 0));
}

export function AdCopyCard({ ad, compact = false }: { ad: HarajAd; compact?: boolean }) {
  const [copiedKey, setCopiedKey] = useState("");
  const agentName = clean(ad.agentNameSnapshot);
  const agentPhone = clean(ad.agentPhoneSnapshot);
  const numericPrice = Number(ad.websitePrice || 0);
  const price = formatPublishingPrice(numericPrice);
  const text = normalizeAdTextForPublishing(ad.adText, price);
  const title = clean(ad.adTitle);
  const compareKeyReady = ad.specsStatus === "matched";
  const contactReady = Boolean(agentName && agentPhone);
  const priceReady = Boolean(price);
  const ready = compareKeyReady && Boolean(title) && Boolean(text) && contactReady && priceReady;
  const partial = ad.specsStatus === "partial";

  async function copyValue(key: string, value: string) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else if (!fallbackCopy(value)) throw new Error("COPY_FAILED");
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1500);
    } catch {
      window.alert("تعذر النسخ التلقائي. حدد القيمة يدويًا.");
    }
  }

  const issues: string[] = [];
  if (!title) issues.push("عنوان إعلان حراج غير جاهز.");
  if (!compareKeyReady) issues.push(ad.specsIssue || (partial ? "CompareKey مرتبط لكن المواصفات غير مكتملة." : "المواصفات غير مرتبطة بـ CompareKey كامل."));
  if (!priceReady) issues.push("السعر غير متوفر في بيانات سيارة الموقع، لذلك الإعلان غير جاهز للنشر.");
  if (!agentName) issues.push("اسم المندوب غير موجود في التكليف.");
  if (!agentPhone) issues.push("رقم جوال المندوب غير موجود في التكليف.");

  return <div className={`ad-copy-card ${compact ? "compact-copy" : ""}`}>
    <div className="haraj-title-copy">
      <div><span>عنوان إعلان حراج</span><b>{title || "—"}</b><small>{ad.agentTypeSnapshot === "installment" ? "عنوان تمويل" : "عنوان كاش"}</small></div>
      <button type="button" className="secondary-button compact" disabled={!title} onClick={() => void copyValue("title", title)}>{copiedKey === "title" ? <Check size={16} /> : <Copy size={16} />}{copiedKey === "title" ? "تم النسخ" : "نسخ العنوان"}</button>
    </div>
    <div className="ad-publish-values">
      <div className="ad-publish-value"><span>الاسم</span><b>{agentName || "—"}</b><button type="button" className="copy-mini-button" disabled={!agentName} onClick={() => void copyValue("agent", agentName)}>{copiedKey === "agent" ? <Check size={14} /> : <Copy size={14} />}<em>{copiedKey === "agent" ? "تم" : "نسخ"}</em></button></div>
      <div className="ad-publish-value"><span>رقم الجوال</span><b className="ltr-value">{agentPhone || "—"}</b><button type="button" className="copy-mini-button" disabled={!agentPhone} onClick={() => void copyValue("phone", agentPhone)}>{copiedKey === "phone" ? <Check size={14} /> : <Copy size={14} />}<em>{copiedKey === "phone" ? "تم" : "نسخ"}</em></button></div>
      <div className="ad-publish-value"><span>السعر في حراج</span><b>{price ? `${price} ريال` : "—"}</b><button type="button" className="copy-mini-button" disabled={!price} onClick={() => void copyValue("price", price)}>{copiedKey === "price" ? <Check size={14} /> : <Copy size={14} />}<em>{copiedKey === "price" ? "تم" : "نسخ"}</em></button></div>
    </div>

    <div className="ad-copy-actions">
      <button className="secondary-button compact" disabled={!ready} onClick={() => void copyValue("ad", text)} title={!ready ? "يلزم CompareKey كامل + السعر + اسم ورقم المندوب" : "نسخ صيغة الإعلان كاملة"}>
        {copiedKey === "ad" ? <Check size={16} /> : <Copy size={16} />}{copiedKey === "ad" ? "تم النسخ" : "نسخ صيغة الإعلان"}
      </button>
      {ad.websitePermalink ? <a className="icon-button" href={ad.websitePermalink} target="_blank" rel="noreferrer" title="فتح صفحة السيارة بالموقع"><LinkSimple size={16} /></a> : null}
      <span className={`specs-status ${ready ? "matched" : partial ? "partial" : "missing"}`}>
        {ready ? "جاهز للنشر" : compareKeyReady ? "بيانات النشر ناقصة" : partial ? "CompareKey جزئي" : "CompareKey غير جاهز"}
      </span>
    </div>
    {issues.length ? <div className="copy-warning"><WarningCircle size={15} /><div>{issues.map((issue) => <span key={issue}>{issue}</span>)}</div></div> : null}
    {text ? <details className="ad-copy-preview"><summary>معاينة صيغة الإعلان</summary><pre>{text}</pre></details> : null}
  </div>;
}
