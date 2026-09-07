import logo from "../assets/mzj-logo.png";
import { formatDateArabic, formatPlanRange, getPlanDays, isPublished } from "../schedule";
import type { Agent, HarajAccount, HarajAd } from "../types";

const policies = [
  "كتابة السعر بشكل واضح ومباشر داخل الإعلان.",
  "ممنوع كتابة: السعر عند الاتصال.",
  "ممنوع الترويج لحسابات التواصل الاجتماعي داخل الإعلان.",
  "بيانات السيارة والبيان والموديل يجب أن تطابق التكليف.",
  "إذا طلب حراج تحديث الإعلان أو تعديل عبارة يتم التنفيذ فورًا.",
];

const accountFollowUp = [
  "فحص رسائل حراج والرد على أي رسالة تحتاج رد.",
  "فحص التعليقات والرد على أي تعليق يحتاج رد.",
  "متابعة أي تنبيه أو طلب تعديل ظاهر على الحساب أو الإعلان.",
  "أي قيد أو مشكلة قد تؤثر على حد النشر يتم إبلاغ الإدارة بها فورًا.",
  "إرسال رابط كل إعلان بعد النشر حتى يتم تسجيله في النظام.",
];

function chunks<T>(rows: T[], firstSize = 7, nextSize = 12) {
  const out: T[][] = [];
  if (!rows.length) return out;
  out.push(rows.slice(0, firstSize));
  let cursor = firstSize;
  while (cursor < rows.length) {
    out.push(rows.slice(cursor, cursor + nextSize));
    cursor += nextSize;
  }
  return out;
}

export function BranchSchedulePdf({
  account,
  ads,
  agents,
  planStart,
  planEnd,
}: {
  account: HarajAccount;
  ads: HarajAd[];
  agents: Agent[];
  planStart: string;
  planEnd: string;
}) {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const pages = chunks(ads);
  if (!pages.length) return null;

  const planDays = getPlanDays(planStart, planEnd).length;
  const periodCapacity = Number(account.adLimit || 0) * planDays;
  const activeBranchAgents = agents.filter((agent) => agent.active && agent.accountId === account.id).length;

  return <div className="pdf-export-sheet" data-branch-id={account.id} aria-hidden="true">
    {pages.map((pageAds, pageIndex) => <section className="pdf-page" data-pdf-page key={`${account.id}-${pageIndex}`}>
      <header className="pdf-header">
        <img src={logo} alt="MZJ" />
        <div>
          <span>إدارة إعلانات حراج</span>
          <h1>جدول النشر - {account.name}</h1>
          <p>{formatPlanRange(planStart, planEnd)}</p>
        </div>
      </header>

      <div className="pdf-summary">
        <div><span>الحد اليومي</span><strong>{account.adLimit}</strong></div>
        <div><span>أيام الجدول</span><strong>{planDays}</strong></div>
        <div><span>إجمالي حد الفترة</span><strong>{periodCapacity}</strong></div>
        <div><span>إعلانات الجدول</span><strong>{ads.length}</strong></div>
      </div>

      <div className="pdf-sub-summary">
        <span>المناديب النشطون في الفرع: <b>{activeBranchAgents}</b></span>
        <span>صفحة <b>{pageIndex + 1}</b> من <b>{pages.length}</b></span>
      </div>

      <table className="pdf-table">
        <thead>
          <tr>
            <th>اليوم والتاريخ</th>
            <th>المندوب</th>
            <th>السيارة</th>
            <th>البيان</th>
            <th>الموديل</th>
            <th>رابط الإعلان</th>
          </tr>
        </thead>
        <tbody>
          {pageAds.map((ad) => <tr key={ad.id}>
            <td>{ad.scheduledDate ? formatDateArabic(ad.scheduledDate, { weekday: "long", day: "numeric", month: "numeric" }) : "—"}</td>
            <td>{agentById.get(ad.agentId)?.name || "—"}</td>
            <td>{ad.carName || "—"}</td>
            <td>{ad.statement || "—"}</td>
            <td>{ad.modelYear || "—"}</td>
            <td className={isPublished(ad) ? "pdf-done" : "pdf-link-placeholder"}>{isPublished(ad) ? "تم استلام الرابط" : "يرسل بعد النشر"}</td>
          </tr>)}
        </tbody>
      </table>

      {pageIndex === 0 ? <div className="pdf-guidance-grid">
        <section className="pdf-guidance">
          <h2>سياسات النشر المختصرة</h2>
          {policies.map((item) => <p key={item}>✓ {item}</p>)}
        </section>
        <section className="pdf-guidance follow">
          <h2>متابعة الرسائل والتعليقات والقيود</h2>
          {accountFollowUp.map((item) => <p key={item}>• {item}</p>)}
        </section>
      </div> : <div className="pdf-continuation-note">استكمال جدول النشر الخاص بفرع {account.name}</div>}

      <footer className="pdf-footer">
        <span>مجموعة محمد بن ذعار العجمي - MZJ</span>
        <span>المطلوب من المندوب بعد النشر: رابط الإعلان.</span>
      </footer>
    </section>)}
  </div>;
}
