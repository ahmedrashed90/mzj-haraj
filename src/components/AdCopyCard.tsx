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
  const ready = ad.specsStatus === "matched" && Boolean(text);
  const partial = ad.specsStatus === "partial";
  const missing = ad.specsStatus === "missing" || !text;

  async function copy() {
    if (!ready) return;
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
      <button className="secondary-button compact" disabled={!ready} onClick={() => void copy()} title={!ready ? "يلزم CompareKey كامل بالمواصفات الداخلية والخارجية والأمان" : "نسخ صيغة الإعلان كاملة"}>
        {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "تم النسخ" : "نسخ صيغة الإعلان"}
      </button>
      {ad.websitePermalink ? <a className="icon-button" href={ad.websitePermalink} target="_blank" rel="noreferrer" title="فتح صفحة السيارة بالموقع"><LinkSimple size={16} /></a> : null}
      <span className={`specs-status ${ready ? "matched" : partial ? "partial" : "missing"}`}>
        {ready ? "CompareKey كامل" : partial ? "CompareKey جزئي" : "CompareKey غير جاهز"}
      </span>
    </div>
    {!ready ? <div className="copy-warning"><WarningCircle size={15} />{ad.specsIssue || (missing ? "المواصفات غير مرتبطة بـ CompareKey." : "CompareKey مرتبط لكن المواصفات غير مكتملة.")}</div> : null}
    {text ? <details className="ad-copy-preview"><summary>معاينة صيغة الإعلان</summary><pre>{text}</pre></details> : null}
  </div>;
}
