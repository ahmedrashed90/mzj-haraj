import { ArrowClockwise, CheckCircle, Database, LockKey, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { ADMIN_EMAIL } from "../firebase";
import { getCoverageState } from "../schedule";
import { PageTitle } from "../components/Ui";

export function SettingsPage() {
  const { ads, stock, stockTotalVehicles, stockFetchedAt, stockLoading, stockError, refreshStock, websiteCars, websiteCarsFetchedAt, websiteCarsLoading, websiteCarsError, refreshWebsiteCars, publishingSettings } = useAppData();
  const coverage = getCoverageState(stock, ads);
  async function refreshAll() { await Promise.allSettled([refreshStock(), refreshWebsiteCars()]); }
  return <>
    <PageTitle title="الإعدادات" subtitle="Firebase Auth/Firestore + Vercel API. بيانات المنصة والموقع تبقى Server-only داخل Vercel." />
    <section className="settings-grid">
      <article className="panel settings-card"><div className="settings-icon"><Database size={28} /></div><div><h2>مخزون منصة MZJ</h2><p>العمليات → مخزون السيارات — قراءة فقط</p></div><dl><div><dt>الحالة</dt><dd>متاح للبيع</dd></div><div><dt>استبعاد</dt><dd>المكان = الوكالة</dd></div><div><dt>السجلات</dt><dd>{stockTotalVehicles} سيارة / {stock.length} مجموعة</dd></div><div><dt>دورة التغطية</dt><dd>{coverage.cycle}</dd></div><div><dt>متاح بدون تكرار</dt><dd>{coverage.eligibleRows.length}</dd></div><div><dt>آخر تحديث</dt><dd>{stockFetchedAt ? new Date(stockFetchedAt).toLocaleString("ar-SA-u-nu-latn") : "لم يتم"}</dd></div></dl>{stockError ? <div className="alert warning"><WarningCircle size={18} />{stockError}</div> : <div className="connection-ok"><CheckCircle size={19} />مصدر الاستوك جاهز</div>}</article>
      <article className="panel settings-card"><div className="settings-icon"><Database size={28} /></div><div><h2>مواصفات موقع MZJ</h2><p>WordPress + Panorama + CompareKey — قراءة فقط</p></div><dl><div><dt>السيارات المقروءة</dt><dd>{websiteCars.length}</dd></div><div><dt>الاستخدام</dt><dd>السعر والبيانات الأساسية + مواصفات CompareKey</dd></div><div><dt>آخر تحديث</dt><dd>{websiteCarsFetchedAt ? new Date(websiteCarsFetchedAt).toLocaleString("ar-SA-u-nu-latn") : "لم يتم"}</dd></div><div><dt>حساب حراج</dt><dd>{publishingSettings.accountName || "غير محدد"}</dd></div></dl>{websiteCarsError ? <div className="alert warning"><WarningCircle size={18} />{websiteCarsError}</div> : <div className="connection-ok"><CheckCircle size={19} />مصدر المواصفات جاهز</div>}<p className="settings-note">المواصفات الداخلية والخارجية والأمان تُقرأ من CompareKey فقط. يتطلب تثبيت البلجن المرفق <code>MZJ-Haraj-Ad-Data-Bridge</code> وإضافة <code>MZJ_WORDPRESS_BASE_URL</code> و <code>MZJ_HARAJ_BRIDGE_KEY</code> في Vercel.</p></article>
      <article className="panel settings-card"><div className="settings-icon"><LockKey size={28} /></div><div><h2>الأمان والمعمارية</h2><p>كل الأسرار Server-only.</p></div><ul className="settings-list"><li>دخول المدير فقط: {ADMIN_EMAIL}</li><li>لا كلمات مرور لحساب حراج داخل النظام.</li><li><code>/api/stock</code> يقرأ الاستوك فقط.</li><li><code>/api/website-cars</code> يقرأ مواصفات الموقع فقط.</li><li>البلجن المرافق لا يعدل Panorama أو السيارات.</li><li>الجدول، صيغة الإعلان، رابط حراج والحالة تحفظ في Firestore.</li></ul></article>
    </section>
    <button className="secondary-button" onClick={() => void refreshAll()} disabled={stockLoading || websiteCarsLoading}><ArrowClockwise size={18} />تجربة كل مصادر القراءة الآن</button>
  </>;
}
