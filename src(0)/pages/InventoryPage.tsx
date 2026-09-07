import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  CalendarBlank,
  CheckCircle,
  CheckSquare,
  MagnifyingGlass,
  Plus,
  SquaresFour,
  WarningCircle,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { createWeeklyAssignments } from "../data";
import {
  buildWeeklyAssignments,
  formatPlanRange,
  getCoverageState,
  getSuggestedPlanWindow,
  getWeekRemainingCapacity,
  getWeekStartKey,
} from "../schedule";
import type { StockGroup } from "../types";
import { EmptyState, PageTitle, StatCard } from "../components/Ui";

export function InventoryPage() {
  const navigate = useNavigate();
  const { accounts, agents, ads, stock, stockLoading, stockError, refreshStock } = useAppData();
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState<"available" | "covered" | "all">("available");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showPlan, setShowPlan] = useState(false);
  const suggested = getSuggestedPlanWindow();
  const [planStart, setPlanStart] = useState(suggested.planStart);
  const [planEnd, setPlanEnd] = useState(suggested.planEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const coverageState = useMemo(() => getCoverageState(stock, ads), [stock, ads]);
  const eligibleKeySet = useMemo(() => new Set(coverageState.eligibleRows.map((row) => row.key)), [coverageState.eligibleRows]);
  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts]);
  const totalCapacity = useMemo(() => activeAccounts.reduce((sum, account) => sum + Number(account.adLimit || 0), 0), [activeAccounts]);
  const activeAgents = useMemo(() => agents.filter((agent) => agent.active), [agents]);
  const missingBranchAgents = activeAgents.filter((agent) => !agent.accountId).length;

  const latestAdByVehicle = useMemo(() => {
    const map = new Map<string, typeof ads[number]>();
    ads.forEach((ad) => {
      const current = map.get(ad.vehicleKey);
      const currentStamp = String(current?.scheduledDate || current?.assignedAt || "");
      const nextStamp = String(ad.scheduledDate || ad.assignedAt || "");
      if (!current || nextStamp > currentStamp) map.set(ad.vehicleKey, ad);
    });
    return map;
  }, [ads]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return stock.filter((row) => {
      const available = eligibleKeySet.has(row.key);
      if (coverage === "available" && !available) return false;
      if (coverage === "covered" && available) return false;
      if (!needle) return true;
      return `${row.carName} ${row.statement} ${row.modelYear}`.toLowerCase().includes(needle);
    });
  }, [stock, search, coverage, eligibleKeySet]);

  const selectedRows = useMemo(() => stock.filter((row) => selectedKeys.has(row.key) && eligibleKeySet.has(row.key)), [stock, selectedKeys, eligibleKeySet]);

  function toggleRow(row: StockGroup) {
    if (!eligibleKeySet.has(row.key)) return;
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
      return next;
    });
    setError("");
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setError("");
  }

  function autoSelect() {
    setError("");
    if (!totalCapacity) return setError("حدود الفروع الحالية تساوي صفر.");
    const sorted = [...coverageState.eligibleRows].sort((a, b) =>
      a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar")
    );
    setSelectedKeys(new Set(sorted.slice(0, totalCapacity).map((row) => row.key)));
  }

  function openWeeklyPlan() {
    setError("");
    if (!selectedRows.length) return setError("اختر سيارة واحدة على الأقل لإنشاء الجدول.");
    if (!accounts.some((account) => account.active && Number(account.adLimit || 0) > 0)) return setError("أضف فرعًا نشطًا وحدد له حد إعلانات أكبر من صفر.");
    if (!agents.some((agent) => agent.active)) return setError("أضف مندوبًا نشطًا أولًا.");
    const next = getSuggestedPlanWindow();
    setPlanStart(next.planStart);
    setPlanEnd(next.planEnd);
    setShowPlan(true);
  }

  const weekStart = getWeekStartKey(planStart);
  const remainingForWeek = getWeekRemainingCapacity(accounts, ads, weekStart);

  const preview = useMemo(() => {
    if (!showPlan || !selectedRows.length) return { rows: [] as ReturnType<typeof buildWeeklyAssignments>, error: "" };
    try {
      return {
        rows: buildWeeklyAssignments({ vehicles: selectedRows, planStart, planEnd, coverageCycle: coverageState.cycle, accounts, agents, existingAds: ads }),
        error: "",
      };
    } catch (failure) {
      return { rows: [] as ReturnType<typeof buildWeeklyAssignments>, error: failure instanceof Error ? failure.message : "تعذر تجهيز الجدول" };
    }
  }, [showPlan, selectedRows, planStart, planEnd, coverageState.cycle, accounts, agents, ads]);

  const previewByAccount = useMemo(() => {
    const map = new Map<string, number>();
    preview.rows.forEach((ad) => map.set(ad.accountId, (map.get(ad.accountId) || 0) + 1));
    return accounts.map((account) => ({ account, count: map.get(account.id) || 0, reps: agents.filter((agent) => agent.accountId === account.id && agent.active).length })).filter((row) => row.count > 0 || Number(row.account.adLimit || 0) > 0);
  }, [preview.rows, accounts, agents]);

  const previewByAgent = useMemo(() => {
    const map = new Map<string, number>();
    preview.rows.forEach((ad) => map.set(ad.agentId, (map.get(ad.agentId) || 0) + 1));
    return [...map.entries()].map(([agentId, count]) => ({ agent: agents.find((item) => item.id === agentId), count })).sort((a, b) => b.count - a.count || (a.agent?.name || "").localeCompare(b.agent?.name || "", "ar"));
  }, [preview.rows, agents]);

  async function createPlan() {
    setError("");
    if (preview.error) return setError(preview.error);
    if (!preview.rows.length) return setError("لا توجد تكليفات جاهزة للحفظ.");

    const latest = getCoverageState(stock, ads);
    const latestEligible = new Set(latest.eligibleRows.map((row) => row.key));
    if (latest.cycle !== coverageState.cycle || selectedRows.some((row) => !latestEligible.has(row.key))) {
      setShowPlan(false); clearSelection();
      return setError("تغيرت تغطية الاستوك أثناء تجهيز الجدول. حدّث الاختيارات ثم حاول مرة أخرى.");
    }

    setSaving(true);
    try {
      await createWeeklyAssignments(preview.rows);
      setShowPlan(false); clearSelection();
      navigate(`/schedule?week=${weekStart}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "تعذر إنشاء الجدول الأسبوعي");
    } finally { setSaving(false); }
  }

  return <>
    <PageTitle
      title="مخزون السيارات"
      subtitle="اختر سيارات الخطة. كل فرع يأخذ عدد إعلاناته الحالي، والتوزيع يكون فقط على مناديب نفس الفرع."
      actions={<button className="secondary-button" onClick={() => void refreshStock()} disabled={stockLoading}><ArrowClockwise size={18} />{stockLoading ? "جارٍ القراءة" : "تحديث الاستوك"}</button>}
    />

    {stockError ? <div className="alert warning"><WarningCircle size={19} />{stockError}</div> : null}
    {error ? <div className="alert error"><WarningCircle size={19} />{error}</div> : null}
    {missingBranchAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {missingBranchAgents} مندوب نشط بدون فرع. اربطه بفرع من صفحة الفروع والمناديب قبل إنشاء الجدول.</div> : null}
    {coverageState.startedNewCycle && stock.length ? <div className="alert success"><CheckCircle size={19} />تمت تغطية كل الاستوك في الدورة السابقة. تبدأ الآن دورة تغطية جديدة رقم {coverageState.cycle}.</div> : null}

    <section className="stats-grid inventory-stats">
      <StatCard label="دورة التغطية" value={coverageState.cycle} hint="لا تكرار قبل تغطية الاستوك" tone="info" />
      <StatCard label="متاح للتكليف" value={coverageState.eligibleRows.length} hint="لم يدخل الدورة الحالية" tone={coverageState.eligibleRows.length ? "warn" : "good"} />
      <StatCard label="تمت تغطيته" value={coverageState.coveredCount} hint={`من ${stock.length} سيارة/فئة`} tone="good" />
      <StatCard label="سعة الفروع الحالية" value={totalCapacity} hint="مجموع حدود حسابات حراج" />
      <StatCard label="المحدد الآن" value={selectedRows.length} hint="سيتم إدراجه في الجدول" tone={selectedRows.length ? "info" : "default"} />
    </section>

    <div className="inventory-toolbar">
      <div className="filters-bar inventory-filters">
        <label className="search-box"><MagnifyingGlass size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم السيارة أو البيان أو الموديل" /></label>
        <select value={coverage} onChange={(e) => setCoverage(e.target.value as typeof coverage)}><option value="available">متاح للتكليف</option><option value="covered">تمت تغطيته</option><option value="all">كل الاستوك</option></select>
      </div>
      <div className="selection-actions">
        <button className="secondary-button" onClick={autoSelect} disabled={!coverageState.eligibleRows.length}><CheckSquare size={18} />تحديد حتى سعة الفروع</button>
        {selectedRows.length ? <button className="ghost-button" onClick={clearSelection}>إلغاء التحديد</button> : null}
        <button className="primary-button" onClick={openWeeklyPlan} disabled={!selectedRows.length}><CalendarBlank size={19} />تجهيز جدول النشر <b>{selectedRows.length || ""}</b></button>
      </div>
    </div>

    <section className="panel table-panel">
      {!stock.length && !stockLoading ? <EmptyState title="لا توجد بيانات" text={stockError ? "تعذر الاتصال بمصدر الاستوك." : "لا توجد سيارات متاح للبيع حاليًا."} /> : !rows.length ? <EmptyState title="لا توجد نتائج" text={coverage === "available" ? "كل السيارات الحالية تمت تغطيتها في هذه الدورة." : "غيّر البحث أو الفلتر."} /> : <div className="table-scroll"><table className="inventory-table"><thead><tr><th className="check-col"></th><th>السيارة</th><th>البيان</th><th>الموديل</th><th>عدد الاستوك</th><th>حالة التغطية</th><th>آخر تكليف</th></tr></thead><tbody>
        {rows.map((row) => {
          const available = eligibleKeySet.has(row.key);
          const selected = selectedKeys.has(row.key);
          const latestAd = latestAdByVehicle.get(row.key);
          return <tr key={row.key} className={`${selected ? "selected-row" : ""} ${available ? "" : "covered-row"}`} onClick={() => available && toggleRow(row)}>
            <td className="check-col"><input type="checkbox" checked={selected} disabled={!available} onChange={() => toggleRow(row)} onClick={(e) => e.stopPropagation()} aria-label={`اختيار ${row.carName}`} /></td>
            <td><strong>{row.carName || "—"}</strong></td><td>{row.statement || "—"}</td><td>{row.modelYear || "—"}</td>
            <td><span className="stock-badge"><SquaresFour size={16} />{row.quantity.toLocaleString("ar-SA-u-nu-latn")}</span></td>
            <td>{available ? <span className="coverage-state uncovered">متاح للتكليف</span> : <span className="coverage-state covered"><CheckCircle size={17} />تمت التغطية</span>}</td>
            <td>{latestAd?.scheduledDate ? <span className="muted">{latestAd.scheduledDate}</span> : <span className="muted">—</span>}</td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>

    {showPlan ? <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) setShowPlan(false); }}>
      <div className="modal-card weekly-plan-modal">
        <div className="modal-head"><div><h2>تجهيز جدول النشر</h2><p>التوزيع حسب حد إعلانات كل فرع وعلى مناديب نفس الفرع فقط.</p></div><button className="icon-button" onClick={() => setShowPlan(false)} disabled={saving}>×</button></div>

        <div className="period-card"><CalendarBlank size={23} /><div><span>فترة النشر المقترحة</span><strong>{formatPlanRange(planStart, planEnd)}</strong><small>{new Date().getDay() === 5 ? "جدول أسبوعي جديد: السبت إلى الجمعة" : "الجدول الحالي: من بكرة إلى الجمعة"}</small></div></div>
        <div className="plan-date-controls"><label>من<input type="date" value={planStart} onChange={(e) => setPlanStart(e.target.value)} /></label><label>إلى<input type="date" value={planEnd} onChange={(e) => setPlanEnd(e.target.value)} /></label></div>

        <div className="plan-summary-grid">
          <div><span>السيارات المختارة</span><strong>{selectedRows.length}</strong></div>
          <div><span>السعة المتبقية</span><strong>{remainingForWeek}</strong></div>
          <div><span>دورة التغطية</span><strong>{coverageState.cycle}</strong></div>
          <div><span>المناديب النشطون</span><strong>{activeAgents.length}</strong></div>
        </div>

        {preview.error ? <div className="alert error"><WarningCircle size={18} />{preview.error}</div> : <>
          <div className="preview-columns">
            <div className="preview-box"><h3>توزيع الفروع</h3>{previewByAccount.map(({ account, count, reps }) => <div key={account.id}><span>{account.name}<small>{reps} مندوب نشط</small></span><b>{count} / {account.adLimit}</b></div>)}</div>
            <div className="preview-box"><h3>توزيع المناديب</h3>{previewByAgent.map(({ agent, count }) => <div key={agent?.id || "missing"}><span>{agent?.name || "مندوب غير موجود"}<small>{accounts.find((a) => a.id === agent?.accountId)?.name || "بدون فرع"}</small></span><b>{count}</b></div>)}</div>
          </div>
          <div className="preview-note"><CheckCircle size={18} />السيارات التي تدخل هذه الخطة لن تظهر في خطة جديدة قبل تغطية باقي الاستوك.</div>
        </>}

        <div className="modal-actions"><button className="ghost-button" onClick={() => setShowPlan(false)} disabled={saving}>إلغاء</button><button className="primary-button" onClick={() => void createPlan()} disabled={saving || Boolean(preview.error)}><Plus size={18} />{saving ? "جارٍ إنشاء الجدول..." : `اعتماد جدول ${selectedRows.length} إعلان`}</button></div>
      </div>
    </div> : null}
  </>;
}
