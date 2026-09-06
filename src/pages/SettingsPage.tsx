import { ArrowClockwise, CheckCircle, Database, LockKey, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { ADMIN_EMAIL } from "../firebase";
import { getCoverageState } from "../schedule";
import { PageTitle } from "../components/Ui";

export function SettingsPage() {
  const { ads, stock, stockTotalVehicles, stockFetchedAt, stockLoading, stockError, refreshStock } = useAppData();
  const coverage = getCoverageState(stock, ads);
  return <>
    <PageTitle title="الإعدادات" subtitle="Vercel + Firebase Auth/Firestore فقط. لا Firebase Functions ولا Firebase Hosting." />
    <section className="settings-grid">
      <article className="panel settings-card">
        <div className="settings-icon"><Database size={28} /></div>
        <div><h2>مصدر مخزون السيارات</h2><p>منصة MZJ → العمليات → مخزون السيارات — قراءة فقط</p></div>
        <dl>
          <div><dt>الحالة المقروءة</dt><dd>متاح للبيع</dd></div>
          <div><dt>الحقول</dt><dd>سيارة، البيان، موديل، الحالة</dd></div>
          <div><dt>السجلات الحالية</dt><dd>{stockTotalVehicles} سيارة / {stock.length} سيارة وفئة</dd></div>
          <div><dt>دورة التغطية الحالية</dt><dd>{coverage.cycle}</dd></div>
          <div><dt>متاح للتكليف</dt><dd>{coverage.eligibleRows.length}</dd></div>
          <div><dt>آخر تحديث</dt><dd>{stockFetchedAt ? new Date(stockFetchedAt).toLocaleString("ar-SA-u-nu-latn") : "لم يتم"}</dd></div>
        </dl>
        {stockError ? <div className="alert warning"><WarningCircle size={18} />{stockError}</div> : <div className="connection-ok"><CheckCircle size={19} />{stockFetchedAt ? "تم الاتصال بمصدر الاستوك" : "في انتظار أول قراءة"}</div>}
        <button className="secondary-button" onClick={() => void refreshStock()} disabled={stockLoading}><ArrowClockwise size={18} />تجربة القراءة الآن</button>
      </article>
      <article className="panel settings-card">
        <div className="settings-icon"><LockKey size={28} /></div>
        <div><h2>الأمان والمعمارية</h2><p>Firebase Authentication + Firestore Rules + Vercel API</p></div>
        <ul className="settings-list">
          <li>دخول المدير فقط: {ADMIN_EMAIL}</li>
          <li>لا توجد صفحة إنشاء مستخدمين أو دخول للمناديب.</li>
          <li>لا يتم تخزين كلمات مرور حسابات حراج.</li>
          <li>بيانات دخول منصة MZJ محفوظة كـ Environment Variables في Vercel فقط.</li>
          <li>قراءة الاستوك تمر عبر <code>/api/stock</code> في Vercel.</li>
          <li><code>api/stock.ts</code> يقرأ فقط من المنصة ولا يرسل أي تحديث على السيارات.</li>
          <li>خطط النشر، الحسابات، المناديب وروابط الإعلانات تحفظ في Firestore الخاص بهذا النظام فقط.</li>
        </ul>
      </article>
    </section>
  </>;
}
