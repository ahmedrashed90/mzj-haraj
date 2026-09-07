import { useMemo, useState } from "react";
import { ArrowSquareOut, FloppyDisk, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { normalizeHarajUrl, removeAd, updateAd } from "../data";
import { formatDateArabic, getWeekStartKey, isOverdue } from "../schedule";
import { AD_STATUS_LABELS, type AdStatus, type HarajAd } from "../types";
import { ConfirmButton, EmptyState, PageTitle } from "../components/Ui";

const statuses: AdStatus[] = ["assigned", "published", "approved", "needs_fix", "closed"];

function AdEditor({ ad }: { ad: HarajAd }) {
  const [url, setUrl] = useState(ad.url || "");
  const [notes, setNotes] = useState(ad.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const cleanUrl = normalizeHarajUrl(url);
      const patch: Partial<HarajAd> = { url: cleanUrl, notes: notes.trim() };
      if (cleanUrl && ad.status === "assigned") patch.status = "published";
      await updateAd(ad.id, patch);
    } finally { setSaving(false); }
  }

  return <div className="ad-editor">
    <input className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://haraj.com.sa/..." />
    <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة داخلية" />
    <button className="secondary-button compact" onClick={() => void save()} disabled={saving}><FloppyDisk size={17} />{saving ? "حفظ..." : "حفظ"}</button>
    {ad.url ? <a className="link-button" href={ad.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={17} />فتح</a> : null}
  </div>;
}

export function AdsPage() {
  const { accounts, agents, ads } = useAppData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | AdStatus>("all");
  const [accountId, setAccountId] = useState("all");
  const [agentId, setAgentId] = useState("all");
  const [urlFilter, setUrlFilter] = useState<"all" | "with" | "without">("all");
  const [weekFilter, setWeekFilter] = useState<"all" | "current" | "legacy">("all");

  const currentWeek = getWeekStartKey();
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ads.filter((ad) => {
      if (status !== "all" && ad.status !== status) return false;
      if (accountId !== "all" && ad.accountId !== accountId) return false;
      if (agentId !== "all" && ad.agentId !== agentId) return false;
      if (urlFilter === "with" && !ad.url) return false;
      if (urlFilter === "without" && ad.url) return false;
      if (weekFilter === "current" && ad.weekStart !== currentWeek) return false;
      if (weekFilter === "legacy" && ad.weekStart) return false;
      if (!needle) return true;
      const bag = `${ad.carName} ${ad.statement} ${ad.modelYear} ${accountById.get(ad.accountId)?.name || ""} ${agentById.get(ad.agentId)?.name || ""}`.toLowerCase();
      return bag.includes(needle);
    });
  }, [ads, status, accountId, agentId, urlFilter, weekFilter, search, accountById, agentById, currentWeek]);

  return <>
    <PageTitle title="الإعلانات" subtitle="سجل كل التكليفات وروابط حراج. يمكنك فتح الإعلان الحقيقي ومراجعته ثم تغيير حالته من هنا." />
    <div className="filters-bar multi">
      <label className="search-box"><MagnifyingGlass size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالسيارة أو المندوب" /></label>
      <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value as typeof weekFilter)}><option value="all">كل الفترات</option><option value="current">الفترة الحالية</option><option value="legacy">تكليفات قديمة غير مجدولة</option></select>
      <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">كل الحالات</option>{statuses.map((item) => <option key={item} value={item}>{AD_STATUS_LABELS[item]}</option>)}</select>
      <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="all">كل الفروع</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="all">كل المناديب</option>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={urlFilter} onChange={(e) => setUrlFilter(e.target.value as typeof urlFilter)}><option value="all">كل الروابط</option><option value="with">برابط</option><option value="without">بدون رابط</option></select>
    </div>

    <section className="panel table-panel">
      {!rows.length ? <EmptyState title="لا توجد إعلانات" text="اختَر السيارات من مخزون السيارات وأنشئ جدول نشر." /> : <div className="table-scroll"><table className="ads-table"><thead><tr><th>موعد النشر</th><th>السيارة</th><th>البيان</th><th>موديل</th><th>الفرع</th><th>المندوب</th><th>الحالة</th><th>الرابط والملاحظات</th><th></th></tr></thead><tbody>
        {rows.map((ad) => {
          const late = isOverdue(ad);
          return <tr key={ad.id} className={late ? "late-row" : ""}>
            <td>{ad.scheduledDate ? <div className="schedule-date-cell"><strong>{formatDateArabic(ad.scheduledDate, { day: "numeric", month: "short" })}</strong>{late ? <span>متأخر</span> : null}</div> : <span className="muted">قديم/غير مجدول</span>}</td>
            <td><strong>{ad.carName || "—"}</strong></td><td>{ad.statement || "—"}</td><td>{ad.modelYear || "—"}</td>
            <td>{accountById.get(ad.accountId)?.name || "حساب محذوف"}</td><td>{agentById.get(ad.agentId)?.name || "مندوب محذوف"}</td>
            <td><select className={`status-select ${ad.status}`} value={ad.status} onChange={(e) => void updateAd(ad.id, { status: e.target.value as AdStatus })}>{statuses.map((item) => <option value={item} key={item}>{AD_STATUS_LABELS[item]}</option>)}</select></td>
            <td><AdEditor ad={ad} /></td>
            <td><ConfirmButton className="icon-danger" confirmText="حذف سجل الإعلان من النظام؟ حذف السجل يعيد السيارة للتغطية إذا لم يوجد لها تكليف آخر في نفس الدورة." onConfirm={() => removeAd(ad.id)}><Trash size={17} /></ConfirmButton></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>
  </>;
}
