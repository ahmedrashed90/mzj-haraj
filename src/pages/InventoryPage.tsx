import { useMemo, useState } from "react";
import { ArrowClockwise, CheckCircle, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { useAppData } from "../AppDataContext";
import { addAd } from "../data";
import type { StockGroup } from "../types";
import { EmptyState, PageTitle } from "../components/Ui";

export function InventoryPage() {
  const { accounts, agents, ads, stock, stockLoading, stockError, refreshStock } = useAppData();
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState<"all" | "covered" | "uncovered">("all");
  const [selected, setSelected] = useState<StockGroup | null>(null);
  const [accountId, setAccountId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeAds = useMemo(() => ads.filter((ad) => ad.status !== "closed"), [ads]);
  const adCountsByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    activeAds.forEach((ad) => map.set(ad.vehicleKey, (map.get(ad.vehicleKey) || 0) + 1));
    return map;
  }, [activeAds]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return stock.filter((row) => {
      const count = adCountsByVehicle.get(row.key) || 0;
      if (coverage === "covered" && count === 0) return false;
      if (coverage === "uncovered" && count > 0) return false;
      if (!needle) return true;
      return `${row.carName} ${row.statement} ${row.modelYear}`.toLowerCase().includes(needle);
    });
  }, [stock, search, coverage, adCountsByVehicle]);

  const account = accounts.find((item) => item.id === accountId);
  const agentsForAccount = agents.filter((item) => item.accountId === accountId && item.active);
  const accountUsed = accountId ? activeAds.filter((ad) => ad.accountId === accountId).length : 0;
  const agent = agents.find((item) => item.id === agentId);
  const agentUsed = agentId ? activeAds.filter((ad) => ad.agentId === agentId).length : 0;

  function openAssign(row: StockGroup) {
    setSelected(row); setAccountId(""); setAgentId(""); setNote(""); setError("");
  }

  async function assign() {
    if (!selected) return;
    setError("");
    if (!accountId) return setError("اختر حساب حراج.");
    if (!agentId) return setError("اختر المندوب.");
    if (!account || !account.active) return setError("حساب حراج غير نشط.");
    if (!agent || !agent.active || agent.accountId !== accountId) return setError("المندوب غير صالح لهذا الحساب.");
    if (accountUsed >= Number(account.adLimit || 0)) return setError("اكتملت سعة الإعلانات المحددة لهذا الحساب.");
    if (agentUsed >= Number(agent.adLimit || 0)) return setError("اكتمل العدد المحدد لهذا المندوب.");
    const duplicateSameAccount = activeAds.some((ad) => ad.vehicleKey === selected.key && ad.accountId === accountId);
    if (duplicateSameAccount) return setError("هذه السيارة مرتبطة بالفعل بإعلان نشط على نفس حساب حراج.");

    setSaving(true);
    try {
      await addAd({
        vehicleKey: selected.key,
        carName: selected.carName,
        statement: selected.statement,
        modelYear: selected.modelYear,
        stockQtySnapshot: selected.quantity,
        accountId,
        agentId,
        status: "assigned",
        notes: note.trim(),
      });
      setSelected(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "تعذر إنشاء التكليف");
    } finally { setSaving(false); }
  }

  return <>
    <PageTitle title="مخزون السيارات" subtitle="قراءة فقط من المنصة — الحالة: متاح للبيع — الحقول: سيارة، البيان، موديل، الحالة." actions={<button className="secondary-button" onClick={() => void refreshStock()} disabled={stockLoading}><ArrowClockwise size={18} />{stockLoading ? "جارٍ القراءة" : "تحديث الاستوك"}</button>} />
    {stockError ? <div className="alert warning"><WarningCircle size={19} />{stockError}</div> : null}
    <div className="filters-bar">
      <label className="search-box"><MagnifyingGlass size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم السيارة أو البيان أو الموديل" /></label>
      <select value={coverage} onChange={(e) => setCoverage(e.target.value as typeof coverage)}><option value="all">كل السيارات</option><option value="uncovered">لم يُعلن عنها</option><option value="covered">تم الإعلان عنها</option></select>
    </div>

    <section className="panel">
      {!stock.length && !stockLoading ? <EmptyState title="لا توجد بيانات" text={stockError ? "تعذر الاتصال بمصدر الاستوك." : "لا توجد سيارات متاح للبيع حاليًا."} /> : !rows.length ? <EmptyState title="لا توجد نتائج" text="غيّر البحث أو الفلتر." /> : <div className="table-scroll"><table><thead><tr><th>السيارة</th><th>البيان</th><th>الموديل</th><th>الحالة</th><th>عدد الاستوك</th><th>إعلانات مرتبطة</th><th>التغطية</th><th></th></tr></thead><tbody>
        {rows.map((row) => {
          const count = adCountsByVehicle.get(row.key) || 0;
          return <tr key={row.key}>
            <td><strong>{row.carName || "—"}</strong></td>
            <td>{row.statement || "—"}</td>
            <td>{row.modelYear || "—"}</td>
            <td><span className="status-pill approved">{row.statusName}</span></td>
            <td>{row.quantity.toLocaleString("ar-SA-u-nu-latn")}</td>
            <td>{count.toLocaleString("ar-SA-u-nu-latn")}</td>
            <td>{count > 0 ? <span className="coverage-state covered"><CheckCircle size={18} />تم الإعلان</span> : <span className="coverage-state uncovered">لم يُعلن</span>}</td>
            <td><button className="primary-button compact" onClick={() => openAssign(row)}><Plus size={17} />إنشاء تكليف</button></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>

    {selected ? <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setSelected(null); }}><div className="modal-card">
      <div className="modal-head"><div><h2>إنشاء تكليف إعلان</h2><p>{selected.carName} — {selected.statement} — {selected.modelYear}</p></div><button className="icon-button" onClick={() => setSelected(null)}>×</button></div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="form-grid">
        <label>حساب حراج<select value={accountId} onChange={(e) => { setAccountId(e.target.value); setAgentId(""); }}><option value="">اختر الحساب</option>{accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>المندوب<select value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={!accountId}><option value="">اختر المندوب</option>{agentsForAccount.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.phone}</option>)}</select></label>
      </div>
      {account ? <div className="quota-preview"><span>الحساب: <b>{accountUsed}/{account.adLimit}</b></span>{agent ? <span>المندوب: <b>{agentUsed}/{agent.adLimit}</b></span> : null}</div> : null}
      <label className="field-block">ملاحظات التكليف (اختياري)<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="أي ملاحظة داخلية" /></label>
      <div className="modal-actions"><button className="ghost-button" onClick={() => setSelected(null)}>إلغاء</button><button className="primary-button" onClick={() => void assign()} disabled={saving}>{saving ? "جارٍ الحفظ..." : "إسناد الإعلان"}</button></div>
    </div></div> : null}
  </>;
}
