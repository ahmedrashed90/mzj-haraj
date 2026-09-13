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

export function AdCopyCard({ ad, compact = false }: { ad: HarajAd; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = String(ad.adText || "").trim();
  const missing = ad.specsStatus === "missing" || !text;
  const partial = ad.specsStatus === "partial";

  async function copy() {
    if (missing) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else if (!fallbackCopy(text)) throw new Error("COPY_FAILED");
      setCopied(true); window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.alert("تعذر النسخ التلقائي. افتح المعاينة وحدد النص يدويًا.");
    }
  }

  return <div className={`ad-copy-card ${compact ? "compact-copy" : ""}`}>
    <div className="ad-copy-actions">
      <button className="secondary-button compact" disabled={missing} onClick={() => void copy()} title={missing ? "المواصفات غير مرتبطة بالموقع بعد" : "نسخ صيغة الإعلان كاملة"}>
        {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "تم النسخ" : "نسخ صيغة الإعلان"}
      </button>
      {ad.websitePermalink ? <a className="icon-button" href={ad.websitePermalink} target="_blank" rel="noreferrer" title="فتح صفحة السيارة بالموقع"><LinkSimple size={16} /></a> : null}
      <span className={`specs-status ${missing ? "missing" : partial ? "partial" : "matched"}`}>
        {missing ? "بدون مواصفات" : partial ? "مواصفات جزئية" : "مواصفات مرتبطة"}
      </span>
    </div>
    {missing ? <div className="copy-warning"><WarningCircle size={15} />لم يتم العثور على مطابقة مؤكدة في الموقع، لذلك النسخ متوقف حتى لا ننشر مواصفات غير مؤكدة.</div> : null}
    {text ? <details className="ad-copy-preview"><summary>معاينة صيغة الإعلان</summary><pre>{text}</pre></details> : null}
  </div>;
}
