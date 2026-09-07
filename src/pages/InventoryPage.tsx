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
import { createPublishingAssignments } from "../data";
import {
  buildPublishingAssignments,
  formatPlanRange,
  getAccountPlanCapacity,
  getAccountPlanUsage,
  getCoverageState,
  getPlanDays,
  getPlanRemainingCapacity,
  getPlanTotalCapacity,
  getSuggestedPlanWindow,
  getWeekStartKey,
} from "../schedule";
import type { StockGroup } from "../types";
import { EmptyState, PageTitle, StatCard } from "../components/Ui";

function sortEligibleRows(rows: StockGroup[]) {
  return [...rows].sort(
    (a, b) =>
      a.carName.localeCompare(b.carName, "ar") ||
      a.statement.localeCompare(b.statement, "ar") ||
      a.modelYear.localeCompare(b.modelYear, "ar"),
  );
}

export function InventoryPage() {
  const navigate = useNavigate();
  const {
    accounts,
    agents,
    ads,
    stock,
    stockExcludedAgencyVehicles,
    stockLoading,
    stockError,
    refreshStock,
  } = useAppData();

  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState<"available" | "covered" | "all">("available");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  const [showPlan, setShowPlan] = useState(false);
  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suggested = getSuggestedPlanWindow();
  const suggestedDays = getPlanDays(suggested.planStart, suggested.planEnd).length;
  const suggestedWeekStart = getWeekStartKey(suggested.planStart);

  const coverageState = useMemo(() => getCoverageState(stock, ads), [stock, ads]);
  const eligibleKeySet = useMemo(
    () => new Set(coverageState.eligibleRows.map((row) => row.key)),
    [coverageState.eligibleRows],
  );

  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts]);
  const totalDailyCapacity = useMemo(
    () => activeAccounts.reduce((sum, account) => sum + Number(account.adLimit || 0), 0),
    [activeAccounts],
  );
  const totalPeriodCapacity = useMemo(
    () => getPlanTotalCapacity(accounts, suggested.planStart, suggested.planEnd),
    [accounts, suggested.planStart, suggested.planEnd],
  );
  const activeAgents = useMemo(() => agents.filter((agent) => agent.active), [agents]);
  const missingBranchAgents = activeAgents.filter((agent) => !agent.accountId).length;

  const remainingForSuggestedPeriod = useMemo(
    () => getPlanRemainingCapacity(accounts, ads, suggested.planStart, suggested.planEnd),
    [accounts, ads, suggested.planStart, suggested.planEnd],
  );
  const automaticTargetCount = Math.min(coverageState.eligibleRows.length, remainingForSuggestedPeriod);

  const latestAdByVehicle = useMemo(() => {
    const map = new Map<string, (typeof ads)[number]>();
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

  const selectedRows = useMemo(
    () => stock.filter((row) => selectedKeys.has(row.key) && eligibleKeySet.has(row.key)),
    [stock, selectedKeys, eligibleKeySet],
  );
  const draftRows = useMemo(
    () => stock.filter((row) => draftKeys.has(row.key) && eligibleKeySet.has(row.key)),
    [stock, draftKeys, eligibleKeySet],
  );

  function toggleRow(row: StockGroup) {
    if (!eligibleKeySet.has(row.key)) return;
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
    setError("");
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setError("");
  }

  function validateBeforePlan(vehicleRows: StockGroup[]) {
    if (!vehicleRows.length) return "لا توجد سيارات متاحة لإنشاء الجدول.";
    if (!accounts.some((account) => account.active && Number(account.adLimit || 0) > 0)) {
      return "أضف فرعًا نشطًا وحدد له حد إعلانات يومي أكبر من صفر.";
    }
    if (!agents.some((agent) => agent.active)) return "أضف مندوبًا نشطًا أولًا.";
    if (vehicleRows.length > remainingForSuggestedPeriod) {
      return `عدد السيارات (${vehicleRows.length}) أكبر من السعة المتبقية للفترة (${remainingForSuggestedPeriod}).`;
    }
    return "";
  }

  function openPlanForRows(vehicleRows: StockGroup[]) {
    setError("");
    const validation = validateBeforePlan(vehicleRows);
    if (validation) return setError(validation);

    const freshWindow = getSuggestedPlanWindow();
    setPlanStart(freshWindow.planStart);
    setPlanEnd(freshWindow.planEnd);
    const keys = new Set(vehicleRows.map((row) => row.key));
    setDraftKeys(keys);
    setSelectedKeys(keys);
    setShowPlan(true);
  }

  function prepareAutomaticPlan() {
    setError("");
    if (!remainingForSuggestedPeriod) {
      return setError("سعة الفترة مستخدمة بالكامل. إذا حراج رفع الحد اليومي لأي فرع، حدّثه أولًا ثم جهّز الجدول من جديد.");
    }
    const candidates = sortEligibleRows(coverageState.eligibleRows).slice(0, automaticTargetCount);
    openPlanForRows(candidates);
  }

  function selectAutomaticRows() {
    setError("");
    if (!automaticTargetCount) return setError("لا توجد سعة أو سيارات جديدة متاحة للتحديد.");
    const candidates = sortEligibleRows(coverageState.eligibleRows).slice(0, automaticTargetCount);
    setSelectedKeys(new Set(candidates.map((row) => row.key)));
  }

  const periodDays = planStart && planEnd ? getPlanDays(planStart, planEnd).length : suggestedDays;
  const remainingForPlan = planStart && planEnd ? getPlanRemainingCapacity(accounts, ads, planStart, planEnd) : remainingForSuggestedPeriod;

  const preview = useMemo(() => {
    if (!showPlan || !draftRows.length || !planStart || !planEnd) {
      return { rows: [] as ReturnType<typeof buildPublishingAssignments>, error: "" };
    }
    try {
      return {
        rows: buildPublishingAssignments({
          vehicles: draftRows,
          planStart,
          planEnd,
          coverageCycle: coverageState.cycle,
          accounts,
          agents,
          existingAds: ads,
        }),
        error: "",
      };
    } catch (failure) {
      return {
        rows: [] as ReturnType<typeof buildPublishingAssignments>,
        error: failure instanceof Error ? failure.message : "تعذر تجهيز الجدول",
      };
    }
  }, [showPlan, draftRows, planStart, planEnd, coverageState.cycle, accounts, agents, ads]);

  const previewByAccount = useMemo(() => {
    const planned = new Map<string, number>();
    preview.rows.forEach((ad) => planned.set(ad.accountId, (planned.get(ad.accountId) || 0) + 1));

    return accounts
      .filter((account) => account.active && Number(account.adLimit || 0) > 0)
      .map((account) => ({
        account,
        count: planned.get(account.id) || 0,
        used: planStart && planEnd ? getAccountPlanUsage(ads, account.id, planStart, planEnd) : 0,
        capacity: planStart && planEnd ? getAccountPlanCapacity(account, planStart, planEnd) : 0,
        reps: agents.filter((agent) => agent.accountId === account.id && agent.active).length,
      }));
  }, [preview.rows, accounts, agents, ads, planStart, planEnd]);

  const previewByAgent = useMemo(() => {
    const map = new Map<string, number>();
    preview.rows.forEach((ad) => map.set(ad.agentId, (map.get(ad.agentId) || 0) + 1));
    return [...map.entries()]
      .map(([agentId, count]) => ({ agent: agents.find((item) => item.id === agentId), count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.agent?.name || "").localeCompare(b.agent?.name || "", "ar"),
      );
  }, [preview.rows, agents]);

  async function createPlan() {
    setError("");
    if (preview.error) return setError(preview.error);
    if (!preview.rows.length) return setError("لا توجد تكليفات جاهزة للحفظ.");

    const latest = getCoverageState(stock, ads);
    const latestEligible = new Set(latest.eligibleRows.map((row) => row.key));
    if (latest.cycle !== coverageState.cycle || draftRows.some((row) => !latestEligible.has(row.key))) {
      setShowPlan(false);
      setDraftKeys(new Set());
      clearSelection();
      return setError("تغيرت تغطية الاستوك أثناء تجهيز الجدول. حدّث الاختيارات ثم حاول مرة أخرى.");
    }

    setSaving(true);
    try {
      await createPublishingAssignments(preview.rows);
      setShowPlan(false);
      setDraftKeys(new Set());
      clearSelection();
      navigate(`/schedule?week=${getWeekStartKey(planStart)}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "تعذر إنشاء جدول النشر");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageTitle
      title="مخزون السيارات"
      subtitle="سيارات المكان = الوكالة مستبعدة من إعلانات حراج. الأولوية دائمًا للسيارات التي لم تدخل دورة النشر الحالية."
      actions={
        <button className="secondary-button" onClick={() => void refreshStock()} disabled={stockLoading}>
          <ArrowClockwise size={18} />{stockLoading ? "جارٍ القراءة" : "تحديث الاستوك"}
        </button>
      }
    />

    {stockError ? <div className="alert warning"><WarningCircle size={19} />{stockError}</div> : null}
    {error ? <div className="alert error"><WarningCircle size={19} />{error}</div> : null}
    {stockExcludedAgencyVehicles > 0 ? <div className="alert info"><CheckCircle size={19} />تم استبعاد {stockExcludedAgencyVehicles} سيارة لأن المكان = الوكالة.</div> : null}
    {missingBranchAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {missingBranchAgents} مندوب نشط بدون فرع. اربطه بفرعه من صفحة الفروع والمناديب.</div> : null}
    {coverageState.startedNewCycle && stock.length ? <div className="alert success"><CheckCircle size={19} />تمت تغطية كل الاستوك في الدورة السابقة. تبدأ الآن دورة تغطية جديدة رقم {coverageState.cycle}.</div> : null}

    <section className="plan-window-hero">
      <div className="plan-window-main">
        <div className="plan-window-icon"><CalendarBlank size={30} weight="duotone" /></div>
        <div>
          <span>{suggested.isFridayPreparation ? "الجدول الأسبوعي الجديد" : "جدول النشر الحالي"}</span>
          <h2>{formatPlanRange(suggested.planStart, suggested.planEnd)}</h2>
          <p>
            {suggested.isFridayPreparation
              ? "اليوم الجمعة: الجدول الجديد يبدأ السبت وينتهي الجمعة التالية ويستخدم آخر حد يومي مسجل لكل فرع."
              : "هذا الجدول يبدأ من بكرة وينتهي الجمعة. الحد اليومي لكل فرع يتكرر في كل يوم من أيام الفترة."}
          </p>
        </div>
      </div>
      <div className="plan-window-metrics">
        <div><span>أيام النشر</span><b>{suggestedDays}</b></div>
        <div><span>حد الشركة اليومي</span><b>{totalDailyCapacity}</b></div>
        <div><span>سعة الفترة</span><b>{totalPeriodCapacity}</b></div>
        <div><span>متاح للتجهيز</span><b>{automaticTargetCount}</b></div>
      </div>
      <button className="primary-button plan-window-action" onClick={prepareAutomaticPlan} disabled={!automaticTargetCount || stockLoading}>
        <CalendarBlank size={20} />تجهيز جدول النشر تلقائيًا <b>{automaticTargetCount || ""}</b>
      </button>
    </section>

    <section className="stats-grid inventory-stats">
      <StatCard label="دورة التغطية" value={coverageState.cycle} hint="لا تكرار قبل تغطية الاستوك" tone="info" />
      <StatCard label="متاح للتكليف" value={coverageState.eligibleRows.length} hint="لم يدخل الدورة الحالية" tone={coverageState.eligibleRows.length ? "warn" : "good"} />
      <StatCard label="تمت تغطيته" value={coverageState.coveredCount} hint={`من ${stock.length} سيارة/فئة`} tone="good" />
      <StatCard label="الحد اليومي للشركة" value={totalDailyCapacity} hint="مجموع حدود الفروع اليومية" />
      <StatCard label="المحدد يدويًا" value={selectedRows.length} hint="اختياري قبل تجهيز الجدول" tone={selectedRows.length ? "info" : "default"} />
    </section>

    <div className="inventory-toolbar">
      <div className="filters-bar inventory-filters">
        <label className="search-box"><MagnifyingGlass size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم السيارة أو البيان أو الموديل" /></label>
        <select value={coverage} onChange={(e) => setCoverage(e.target.value as typeof coverage)}>
          <option value="available">متاح للتكليف</option>
          <option value="covered">تمت تغطيته</option>
          <option value="all">كل الاستوك</option>
        </select>
      </div>
      <div className="selection-actions">
        <button className="secondary-button" onClick={selectAutomaticRows} disabled={!automaticTargetCount}><CheckSquare size={18} />تحديد {automaticTargetCount || ""} تلقائيًا</button>
        {selectedRows.length ? <button className="ghost-button" onClick={clearSelection}>إلغاء التحديد</button> : null}
        <button className="secondary-button emphasized" onClick={() => openPlanForRows(selectedRows)} disabled={!selectedRows.length}><CalendarBlank size={19} />تجهيز المحدد <b>{selectedRows.length || ""}</b></button>
      </div>
    </div>

    <section className="panel table-panel">
      {!stock.length && !stockLoading ? (
        <EmptyState title="لا توجد بيانات" text={stockError ? "تعذر الاتصال بمصدر الاستوك." : "لا توجد سيارات متاح للبيع خارج الوكالة حاليًا."} />
      ) : !rows.length ? (
        <EmptyState title="لا توجد نتائج" text={coverage === "available" ? "كل السيارات الحالية تمت تغطيتها في هذه الدورة." : "غيّر البحث أو الفلتر."} />
      ) : (
        <div className="table-scroll">
          <table className="inventory-table">
            <thead><tr><th className="check-col"></th><th>السيارة</th><th>البيان</th><th>الموديل</th><th>عدد الاستوك</th><th>حالة التغطية</th><th>آخر تكليف</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const available = eligibleKeySet.has(row.key);
                const selected = selectedKeys.has(row.key);
                const latestAd = latestAdByVehicle.get(row.key);
                return <tr key={row.key} className={`${selected ? "selected-row" : ""} ${available ? "" : "covered-row"}`} onClick={() => available && toggleRow(row)}>
                  <td className="check-col"><input type="checkbox" checked={selected} disabled={!available} onChange={() => toggleRow(row)} onClick={(e) => e.stopPropagation()} aria-label={`اختيار ${row.carName}`} /></td>
                  <td><strong>{row.carName || "—"}</strong></td>
                  <td>{row.statement || "—"}</td>
                  <td>{row.modelYear || "—"}</td>
                  <td><span className="stock-badge"><SquaresFour size={16} />{row.quantity.toLocaleString("ar-SA-u-nu-latn")}</span></td>
                  <td>{available ? <span className="coverage-state uncovered">متاح للتكليف</span> : <span className="coverage-state covered"><CheckCircle size={17} />تمت التغطية</span>}</td>
                  <td>{latestAd?.scheduledDate ? <span className="muted">{latestAd.scheduledDate}</span> : <span className="muted">—</span>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {showPlan ? <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) setShowPlan(false); }}>
      <div className="modal-card weekly-plan-modal">
        <div className="modal-head">
          <div><h2>مراجعة جدول النشر قبل الاعتماد</h2><p>الحد المسجل لكل فرع هو حد يومي، والنظام يوزعه على كل يوم داخل الفترة.</p></div>
          <button className="icon-button" onClick={() => setShowPlan(false)} disabled={saving}>×</button>
        </div>

        <div className="period-card locked-period">
          <CalendarBlank size={23} />
          <div><span>فترة النشر</span><strong>{formatPlanRange(planStart, planEnd)}</strong><small>{suggested.isFridayPreparation ? "السبت إلى الجمعة" : "من بكرة إلى الجمعة"} · الفترة محددة تلقائيًا</small></div>
          <span className="locked-period-badge">{periodDays} أيام</span>
        </div>

        <div className="plan-summary-grid">
          <div><span>إعلانات الجدول</span><strong>{draftRows.length}</strong></div>
          <div><span>الحد اليومي للشركة</span><strong>{totalDailyCapacity}</strong></div>
          <div><span>السعة المتبقية للفترة</span><strong>{remainingForPlan}</strong></div>
          <div><span>المناديب النشطون</span><strong>{activeAgents.length}</strong></div>
        </div>

        {preview.error ? <div className="alert error"><WarningCircle size={18} />{preview.error}</div> : <>
          <div className="preview-columns">
            <div className="preview-box">
              <h3>توزيع الفروع</h3>
              {previewByAccount.map(({ account, count, used, capacity, reps }) => <div key={account.id}>
                <span>{account.name}<small>حد يومي {account.adLimit} × {periodDays} أيام = {capacity} · {reps} مندوب نشط · موجود مسبقًا {used}</small></span>
                <b>+{count} / {capacity}</b>
              </div>)}
            </div>
            <div className="preview-box">
              <h3>توزيع المناديب</h3>
              {previewByAgent.map(({ agent, count }) => <div key={agent?.id || "missing"}>
                <span>{agent?.name || "مندوب غير موجود"}<small>{accounts.find((a) => a.id === agent?.accountId)?.name || "بدون فرع"}</small></span>
                <b>{count}</b>
              </div>)}
            </div>
          </div>
          <div className="preview-note"><CheckCircle size={18} />كل فرع يأخذ حدّه اليومي في أيام الفترة، وكل تكليف يذهب فقط إلى مندوب نشط من نفس الفرع. السيارات لا تتكرر قبل تغطية باقي الاستوك.</div>
        </>}

        <div className="modal-actions">
          <button className="ghost-button" onClick={() => setShowPlan(false)} disabled={saving}>إلغاء</button>
          <button className="primary-button" onClick={() => void createPlan()} disabled={saving || Boolean(preview.error)}><Plus size={18} />{saving ? "جارٍ إنشاء الجدول..." : `اعتماد جدول ${draftRows.length} إعلان`}</button>
        </div>
      </div>
    </div> : null}
  </>;
}
