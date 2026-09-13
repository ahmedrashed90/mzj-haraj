import logo from "../assets/mzj-logo.png";
import { formatDateArabic, formatPlanRange, getPlanDays, isPublished } from "../schedule";
import type { Agent, HarajAccount, HarajAd, PublishingSettings } from "../types";
import { getBranchAdvertiserName } from "../branch-advertiser";

const POLICIES = [
  "كتابة السعر بشكل واضح ومباشر، والتأكد من اكتمال بيانات ووصف السيارة.",
  "عدم كتابة «السعر عند الاتصال» وعدم الترويج لحسابات التواصل الاجتماعي داخل الإعلان.",
  "عدم تكرار إعلان نفس السيارة؛ عند الحاجة يتم تحديث الإعلان الحالي بدل إنشاء إعلان مكرر.",
  "استخدام متجر حراج واحد فقط للشركة خلال وضع النشر الحالي.",
  "المواصفات المنشورة يجب أن تطابق السيارة وصيغة الإعلان المسلمة من النظام.",
];
const FOLLOW_UP = [
  "فحص رسائل حراج يوميًا والرد داخل محادثة حراج نفسها، وليس الاكتفاء بطلب الاتصال أو الواتساب.",
  "فحص التعليقات والرد على كل تعليق يحتاج رد.",
  "متابعة أي تنبيه أو طلب تحديث أو تعديل يظهر على الحساب أو الإعلان وتنفيذه فورًا.",
  "إبلاغ الإدارة فورًا بأي قيد أو انخفاض في حد النشر أو مشكلة تؤثر على جودة الحساب.",
  "إرسال رابط كل إعلان بعد النشر حتى يتم تسجيله ومراجعته في النظام.",
];
const MAX_ROWS_PER_DAY_PAGE = 13;
type PlanDay = ReturnType<typeof getPlanDays>[number];
type PdfPage = { kind: "schedule"; day: PlanDay; rows: HarajAd[]; segmentIndex: number; segmentCount: number } | { kind: "guidance" };
function splitRows<T>(rows: T[], size: number) { const out: T[][] = []; for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size)); return out; }
function buildPages(days: PlanDay[], ads: HarajAd[]): PdfPage[] {
  const out: PdfPage[] = [];
  days.forEach((day) => {
    const rows = ads.filter((ad) => ad.scheduledDate === day.key).sort((a, b) => Number(a.publishingPeriodOrder || 0) - Number(b.publishingPeriodOrder || 0) || Number(a.periodAgentSequence || 0) - Number(b.periodAgentSequence || 0) || Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0));
    const segments = splitRows(rows, MAX_ROWS_PER_DAY_PAGE);
    segments.forEach((segment, index) => out.push({ kind: "schedule", day, rows: segment, segmentIndex: index, segmentCount: segments.length }));
  });
  return ads.length ? [...out, { kind: "guidance" }] : out;
}
function Header({ branch, publishing, planStart, planEnd }: { branch: HarajAccount; publishing: PublishingSettings; planStart: string; planEnd: string }) {
  return <header className="pdf-header"><img src={logo} alt="MZJ" /><div><span>إدارة إعلانات حراج · حساب: {publishing.accountName || "—"}</span><h1>جدول النشر - {branch.name}</h1><p>اسم المعرض داخل الإعلان: {getBranchAdvertiserName(branch, publishing.accountName)}</p><p>{formatPlanRange(planStart, planEnd)}</p></div></header>;
}
function Footer({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) { return <footer className="pdf-footer"><span>مجموعة محمد بن ذعار العجمي - MZJ</span><span>صفحة {pageNumber} من {totalPages}</span><span>المطلوب بعد النشر: رابط الإعلان.</span></footer>; }

export function BranchSchedulePdf({ branch, ads, agents, publishingSettings, planStart, planEnd }: { branch: HarajAccount; ads: HarajAd[]; agents: Agent[]; publishingSettings: PublishingSettings; planStart: string; planEnd: string }) {
  const planDays = getPlanDays(planStart, planEnd); if (!ads.length || !planDays.length) return null;
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const pages = buildPages(planDays, ads); const totalPages = pages.length;
  const dayTotals = planDays.map((day) => ({ day, count: ads.filter((ad) => ad.scheduledDate === day.key).length }));
  const companyCapacity = Number(publishingSettings.dailyLimit || 0) * planDays.length;
  return <div className="pdf-export-sheet" data-branch-id={branch.id} aria-hidden="true">{pages.map((page, pageIndex) => {
    const pageNo = pageIndex + 1;
    if (page.kind === "guidance") return <section className="pdf-page pdf-guidance-page" data-pdf-page key={`${branch.id}-guide`}>
      <Header branch={branch} publishing={publishingSettings} planStart={planStart} planEnd={planEnd} />
      <div className="pdf-summary pdf-summary-final"><div><span>حد حساب حراج اليومي</span><strong>{publishingSettings.dailyLimit}</strong></div><div><span>أيام الجدول</span><strong>{planDays.length}</strong></div><div><span>سعة الشركة للفترة</span><strong>{companyCapacity}</strong></div><div><span>تكليفات هذا الفرع</span><strong>{ads.length}</strong></div></div>
      <div className="pdf-final-day-summary">{dayTotals.map(({ day, count }) => <div key={day.key}><span>{day.name}</span><b>{count} إعلان</b></div>)}</div>
      <div className="pdf-guidance-heading"><span>تعليمات مدير الفرع والمناديب</span><h2>سياسات النشر والمتابعة</h2><p>حد حساب حراج واحد للشركة، ويتم تنفيذ العدد اليومي حسب فترات النشر وترتيب المناديب المحدد في الإعدادات. الصفحة دي مرجع المتابعة بعد جدول الأيام.</p></div>
      <div className="pdf-guidance-grid pdf-guidance-grid-final"><section className="pdf-guidance"><h2>سياسات النشر المختصرة</h2>{POLICIES.map((x) => <p key={x}>✓ {x}</p>)}</section><section className="pdf-guidance follow"><h2>متابعة الرسائل والتعليقات والقيود</h2>{FOLLOW_UP.map((x) => <p key={x}>• {x}</p>)}</section></div>
      <div className="pdf-final-callout"><strong>بعد نشر كل إعلان</strong><span>يرسل المندوب رابط الإعلان لمدير الفرع ليتم تسجيله ومراجعته في النظام.</span></div>
      <Footer pageNumber={pageNo} totalPages={totalPages} />
    </section>;
    const fullDayCount = dayTotals.find((x) => x.day.key === page.day.key)?.count || page.rows.length;
    const reps = new Set(ads.filter((ad) => ad.scheduledDate === page.day.key).map((ad) => ad.agentId)).size;
    return <section className="pdf-page pdf-schedule-page" data-pdf-page key={`${branch.id}-${page.day.key}-${page.segmentIndex}`}>
      <Header branch={branch} publishing={publishingSettings} planStart={planStart} planEnd={planEnd} />
      <div className="pdf-day-banner"><div><span>{page.segmentIndex ? "استكمال إعلانات اليوم" : "إعلانات اليوم"}</span><h2>{page.day.name} — {formatDateArabic(page.day.key, { day: "numeric", month: "long", year: "numeric" })}</h2></div><div className="pdf-day-metrics"><span>حد حساب حراج للشركة <b>{publishingSettings.dailyLimit}</b></span><span>إعلانات الفرع اليوم <b>{fullDayCount}</b></span><span>مناديب الفرع المشاركون <b>{reps}</b></span></div></div>
      {page.segmentCount > 1 ? <div className="pdf-continuation-strip">استكمال اليوم نفسه — جزء {page.segmentIndex + 1} من {page.segmentCount}</div> : null}
      <table className={`pdf-table pdf-day-table ${page.rows.length >= 11 ? "pdf-table-dense" : ""}`}><thead><tr><th>الفترة</th><th>الوقت</th><th>الاسم</th><th>النوع</th><th>السيارة / البيان</th><th>الموديل</th><th>رابط الإعلان</th></tr></thead><tbody>{page.rows.map((ad) => <tr key={ad.id}><td>{ad.publishingPeriodName || "—"}</td><td className="ltr-cell">{ad.publishingPeriodStart && ad.publishingPeriodEnd ? `${ad.publishingPeriodStart}-${ad.publishingPeriodEnd}` : "—"}</td><td>{agentById.get(ad.agentId)?.name || ad.agentNameSnapshot || "—"}</td><td>{ad.agentTypeSnapshot === "installment" ? "تقسيط" : "كاش"}</td><td><b>{ad.carName}</b><small className="pdf-cell-sub">{ad.statement}</small></td><td>{ad.modelYear}</td><td className={isPublished(ad) ? "pdf-done" : "pdf-link-placeholder"}>{isPublished(ad) ? "تم استلام الرابط" : "يرسل بعد النشر"}</td></tr>)}</tbody></table>
      <div className="pdf-day-note"><span>إعلانات {branch.name} في {page.day.name}: <b>{fullDayCount}</b></span><span>هذه تكليفات مناديب الفرع الناتجة من فترات النشر وترتيب المناديب المحدد لكل فترة.</span></div>
      <Footer pageNumber={pageNo} totalPages={totalPages} />
    </section>;
  })}</div>;
}
