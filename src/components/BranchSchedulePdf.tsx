import logo from "../assets/mzj-logo.png";
import { formatDateArabic, formatPlanRange, getPlanDays, isPublished } from "../schedule";
import type { Agent, HarajAccount, HarajAd } from "../types";

const POLICIES = [
  "كتابة السعر بشكل واضح ومباشر داخل الإعلان.",
  "ممنوع كتابة: السعر عند الاتصال.",
  "ممنوع الترويج لحسابات التواصل الاجتماعي داخل الإعلان.",
  "بيانات السيارة والبيان والموديل يجب أن تطابق التكليف.",
  "إذا طلب حراج تحديث الإعلان أو تعديل عبارة يتم التنفيذ فورًا.",
];

const FOLLOW_UP = [
  "فحص رسائل حراج والرد على أي رسالة تحتاج رد.",
  "فحص التعليقات والرد على أي تعليق يحتاج رد.",
  "متابعة أي تنبيه أو طلب تعديل ظاهر على الحساب أو الإعلان.",
  "أي قيد أو مشكلة قد تؤثر على حد النشر يتم إبلاغ الإدارة بها فورًا.",
  "إرسال رابط كل إعلان بعد النشر حتى يتم تسجيله في النظام.",
];

const MAX_ROWS_PER_DAY_PAGE = 16;

type PlanDay = ReturnType<typeof getPlanDays>[number];

type SchedulePdfPage = {
  kind: "schedule";
  day: PlanDay;
  rows: HarajAd[];
  segmentIndex: number;
  segmentCount: number;
};

type GuidancePdfPage = {
  kind: "guidance";
};

type PdfPage = SchedulePdfPage | GuidancePdfPage;

function splitRows<T>(rows: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

function buildPages(days: PlanDay[], ads: HarajAd[]): PdfPage[] {
  const schedulePages: SchedulePdfPage[] = [];

  for (const day of days) {
    const rows = ads
      .filter((ad) => ad.scheduledDate === day.key)
      .sort((a, b) => Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0));

    if (!rows.length) continue;

    const daySegments = splitRows(rows, MAX_ROWS_PER_DAY_PAGE);
    daySegments.forEach((segmentRows, segmentIndex) => {
      schedulePages.push({
        kind: "schedule",
        day,
        rows: segmentRows,
        segmentIndex,
        segmentCount: daySegments.length,
      });
    });
  }

  return [...schedulePages, { kind: "guidance" }];
}

function PdfHeader({ account, planStart, planEnd }: { account: HarajAccount; planStart: string; planEnd: string }) {
  return <header className="pdf-header">
    <img src={logo} alt="MZJ" />
    <div>
      <span>إدارة إعلانات حراج</span>
      <h1>جدول النشر - {account.name}</h1>
      <p>{formatPlanRange(planStart, planEnd)}</p>
    </div>
  </header>;
}

function PdfFooter({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return <footer className="pdf-footer">
    <span>مجموعة محمد بن ذعار العجمي - MZJ</span>
    <span>صفحة {pageNumber} من {totalPages}</span>
    <span>المطلوب من المندوب بعد النشر: رابط الإعلان.</span>
  </footer>;
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
  const planDays = getPlanDays(planStart, planEnd);
  if (!ads.length || !planDays.length) return null;

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const activeBranchAgents = agents.filter((agent) => agent.active && agent.accountId === account.id);
  const periodCapacity = Number(account.adLimit || 0) * planDays.length;
  const pages = buildPages(planDays, ads);
  const totalPages = pages.length;
  const dayTotals = planDays.map((day) => ({
    day,
    count: ads.filter((ad) => ad.scheduledDate === day.key).length,
  }));

  return <div className="pdf-export-sheet" data-branch-id={account.id} aria-hidden="true">
    {pages.map((page, pageIndex) => {
      const pageNumber = pageIndex + 1;

      if (page.kind === "guidance") {
        return <section className="pdf-page pdf-guidance-page" data-pdf-page key={`${account.id}-guidance`}>
          <PdfHeader account={account} planStart={planStart} planEnd={planEnd} />

          <div className="pdf-summary pdf-summary-final">
            <div><span>الحد اليومي للفرع</span><strong>{account.adLimit}</strong></div>
            <div><span>أيام الجدول</span><strong>{planDays.length}</strong></div>
            <div><span>إجمالي حد الفترة</span><strong>{periodCapacity}</strong></div>
            <div><span>إعلانات الجدول</span><strong>{ads.length}</strong></div>
          </div>

          <div className="pdf-final-day-summary">
            {dayTotals.map(({ day, count }) => <div key={`${account.id}-final-${day.key}`}>
              <span>{day.name}</span>
              <b>{count} إعلان</b>
            </div>)}
          </div>

          <div className="pdf-guidance-heading">
            <span>تعليمات مدير الفرع والمناديب</span>
            <h2>سياسات النشر والمتابعة</h2>
            <p>هذه الصفحة مرجع ثابت بعد انتهاء جدول الأيام، ويجب متابعة الحساب طوال فترة النشر.</p>
          </div>

          <div className="pdf-guidance-grid pdf-guidance-grid-final">
            <section className="pdf-guidance">
              <h2>سياسات النشر المختصرة</h2>
              {POLICIES.map((item) => <p key={item}>✓ {item}</p>)}
            </section>
            <section className="pdf-guidance follow">
              <h2>متابعة الرسائل والتعليقات والقيود</h2>
              {FOLLOW_UP.map((item) => <p key={item}>• {item}</p>)}
            </section>
          </div>

          <div className="pdf-final-callout">
            <strong>بعد نشر كل إعلان</strong>
            <span>يرسل المندوب رابط الإعلان إلى مدير الفرع ليتم تسجيله ومراجعته في النظام.</span>
          </div>

          <PdfFooter pageNumber={pageNumber} totalPages={totalPages} />
        </section>;
      }

      const isContinuation = page.segmentCount > 1 && page.segmentIndex > 0;
      const fullDayCount = dayTotals.find((item) => item.day.key === page.day.key)?.count || page.rows.length;
      const participatingAgentIds = new Set(
        ads.filter((ad) => ad.scheduledDate === page.day.key).map((ad) => ad.agentId).filter(Boolean),
      );

      return <section className="pdf-page pdf-schedule-page" data-pdf-page key={`${account.id}-${page.day.key}-${page.segmentIndex}`}>
        <PdfHeader account={account} planStart={planStart} planEnd={planEnd} />

        <div className="pdf-day-banner">
          <div>
            <span>{isContinuation ? "استكمال إعلانات اليوم" : "إعلانات اليوم"}</span>
            <h2>{page.day.name} — {formatDateArabic(page.day.key, { day: "numeric", month: "long", year: "numeric" })}</h2>
          </div>
          <div className="pdf-day-metrics">
            <span>حد الفرع اليومي <b>{account.adLimit}</b></span>
            <span>إعلانات اليوم <b>{fullDayCount}</b></span>
            <span>المناديب المشاركون <b>{participatingAgentIds.size}</b></span>
          </div>
        </div>

        {page.segmentCount > 1 ? <div className="pdf-continuation-strip">
          اليوم نفسه مستمر في أكثر من صفحة بسبب عدد الإعلانات — جزء {page.segmentIndex + 1} من {page.segmentCount}
        </div> : null}

        <table className={`pdf-table pdf-day-table ${page.rows.length >= 14 ? "pdf-table-dense" : ""}`}>
          <thead>
            <tr>
              <th>المندوب</th>
              <th>السيارة</th>
              <th>البيان</th>
              <th>الموديل</th>
              <th>رابط الإعلان</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((ad) => <tr key={ad.id}>
              <td>{agentById.get(ad.agentId)?.name || "—"}</td>
              <td>{ad.carName || "—"}</td>
              <td>{ad.statement || "—"}</td>
              <td>{ad.modelYear || "—"}</td>
              <td className={isPublished(ad) ? "pdf-done" : "pdf-link-placeholder"}>{isPublished(ad) ? "تم استلام الرابط" : "يرسل بعد النشر"}</td>
            </tr>)}
          </tbody>
        </table>

        <div className="pdf-day-note">
          <span>إجمالي إعلانات {page.day.name}: <b>{fullDayCount}</b></span>
          <span>الحد اليومي خاص بالفرع بالكامل، وليس لكل مندوب.</span>
          <span>المناديب النشطون بالفرع: <b>{activeBranchAgents.length}</b></span>
        </div>

        <PdfFooter pageNumber={pageNumber} totalPages={totalPages} />
      </section>;
    })}
  </div>;
}
