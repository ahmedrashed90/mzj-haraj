import logo from "../assets/mzj-logo.png";
import { formatDateArabic, formatPlanRange, isPublished } from "../schedule";
import type { Agent, HarajAccount, HarajAd } from "../types";

const policies = [
  "كتابة السعر بشكل واضح ومباشر.",
  "ممنوع كتابة: السعر عند الاتصال.",
  "ممنوع الترويج لحسابات التواصل الاجتماعي داخل الإعلان.",
  "بيانات السيارة والموديل والبيان يجب أن تطابق التكليف.",
  "تحديث الإعلان فورًا إذا طلب حراج ذلك.",
];

const followUp = [
  "فحص رسائل حراج والتعليقات يوميًا.",
  "الرد على الرسائل والتعليقات بدون تأخير.",
  "أي إشعار من حراج يطلب تحديث إعلان أو إزالة عبارة أو توضيح السعر يتم تنفيذه فورًا.",
  "أي قيد أو مخالفة قد تؤثر على عدد الإعلانات يتم رفعها لمدير الفرع فورًا.",
  "إرسال رابط كل إعلان بعد النشر.",
];

function chunks<T>(rows: T[], firstSize = 6, nextSize = 10) {
  if (!rows.length) return [[] as T[]];
  const out: T[][] = [];
  out.push(rows.slice(0, firstSize));
  let cursor = firstSize;
  while (cursor < rows.length) {
    out.push(rows.slice(cursor, cursor + nextSize));
    cursor += nextSize;
  }
  return out;
}

export function BranchSchedulePdf({ account, ads, agents, planStart, planEnd }: {
  account: HarajAccount;
  ads: HarajAd[];
  agents: Agent[];
  planStart: string;
  planEnd: string;
}) {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const pages = chunks(ads);
  return <div className="pdf-export-sheet" data-branch-id={account.id} aria-hidden="true">
    {pages.map((pageAds, pageIndex) => <section className="pdf-page" data-pdf-page key={`${account.id}-${pageIndex}`}>
      <header className="pdf-header">
        <img src={logo} alt="MZJ" />
        <div><span>إدارة إعلانات حراج</span><h1>جدول النشر - {account.name}</h1><p>{formatPlanRange(planStart, planEnd)}</p></div>
      </header>

      <div className="pdf-summary">
        <div><span>حد إعلانات الفرع</span><strong>{account.adLimit}</strong></div>
        <div><span>إعلانات الجدول</span><strong>{ads.length}</strong></div>
        <div><span>الصفحة</span><strong>{pageIndex + 1} / {pages.length}</strong></div>
      </div>

      <table className="pdf-table">
        <thead><tr><th>اليوم والتاريخ</th><th>المندوب</th><th>السيارة</th><th>البيان</th><th>الموديل</th><th>رابط الإعلان</th></tr></thead>
        <tbody>{pageAds.map((ad) => <tr key={ad.id}>
          <td>{ad.scheduledDate ? formatDateArabic(ad.scheduledDate, { weekday: "long", day: "numeric", month: "numeric" }) : "—"}</td>
          <td>{agentById.get(ad.agentId)?.name || "—"}</td>
          <td>{ad.carName || "—"}</td>
          <td>{ad.statement || "—"}</td>
          <td>{ad.modelYear || "—"}</td>
          <td className={isPublished(ad) ? "pdf-done" : "pdf-link-placeholder"}>{isPublished(ad) ? "تم استلام الرابط" : "يرسل بعد النشر"}</td>
        </tr>)}</tbody>
      </table>

      {pageIndex === 0 ? <div className="pdf-guidance-grid">
        <section className="pdf-guidance"><h2>سياسات النشر</h2>{policies.map((item) => <p key={item}>✓ {item}</p>)}</section>
        <section className="pdf-guidance follow"><h2>التنبيهات والرسائل والتعليقات</h2>{followUp.map((item) => <p key={item}>• {item}</p>)}</section>
      </div> : <div className="pdf-continuation-note">استكمال جدول النشر الخاص بفرع {account.name}</div>}

      <footer className="pdf-footer"><span>مجموعة محمد بن ذعار العجمي - MZJ</span><span>الالتزام بالجودة والردود يساعد على تحسين حالة حساب حراج.</span></footer>
    </section>)}
  </div>;
}
