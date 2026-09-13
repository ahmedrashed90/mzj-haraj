import { useMemo, useState } from "react";
import { ArrowClockwise, CalendarBlank, CheckCircle, CheckSquare, MagnifyingGlass, Plus, SquaresFour, WarningCircle } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../AppDataContext";
import { enrichAssignmentsWithAdCopy } from "../ad-copy";
import { createPublishingAssignments } from "../data";
import {
  buildPublishingAssignments,
  formatPlanRange,
  getCoverageState,
  getPlanDays,
  getPublishingPlanCapacity,
  getPublishingRemainingCapacity,
  getSuggestedPlanWindow,
  getWeekStartKey,
} from "../schedule";
import type { StockGroup } from "../types";
import { EmptyState, PageTitle, StatCard } from "../components/Ui";

function sortRows(rows: StockGroup[]) {
  return [...rows].sort((a, b) => a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
}

export function InventoryPage() {
  const navigate = useNavigate();
  const {
    accounts, agents, ads, publishingSettings,
    stock, stockExcludedAgencyVehicles, stockLoading, stockError, refreshStock,
    websiteCars, websiteCarsLoading, websiteCarsError, refreshWebsiteCars,
  } = useAppData();
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState<"available" | "covered" | "all">("available");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  const [automatic, setAutomatic] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const suggested = getSuggestedPlanWindow();
  const suggestedDays = getPlanDays(suggested.planStart, suggested.planEnd).length;
  const coverageState = useMemo(() => getCoverageState(stock, ads), [stock, ads]);
  const eligibleSet = useMemo(() => new Set(coverageState.eligibleRows.map((row) => row.key)), [coverageState.eligibleRows]);
  const activeAgents = agents.filter((agent) => agent.active && agent.accountId);
  const unassignedActiveAgents = agents.filter((agent) => agent.active && !agent.accountId).length;
  const dailyLimit = Math.max(0, Number(publishingSettings.dailyLimit || 0));
  const periodCapacity = getPublishingPlanCapacity(publishingSettings, suggested.planStart, suggested.planEnd);
  const remainingCapacity = getPublishingRemainingCapacity(publishingSettings, ads, suggested.planStart, suggested.planEnd);
  const automaticTarget = Math.min(remainingCapacity, coverageState.eligibleRows.length);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return stock.filter((row) => {
      const available = eligibleSet.has(row.key);
      if (coverage === "available" && !available) return false;
      if (coverage === "covered" && available) return false;
      return !needle || `${row.carName} ${row.statement} ${row.modelYear}`.toLowerCase().includes(needle);
    });
  }, [stock, eligibleSet, coverage, search]);
  const selectedRows = useMemo(() => stock.filter((row) => selectedKeys.has(row.key) && eligibleSet.has(row.key)), [stock, selectedKeys, eligibleSet]);
  const draftRows = useMemo(() => stock.filter((row) => draftKeys.has(row.key) && eligibleSet.has(row.key)), [stock, draftKeys, eligibleSet]);
  const latestByVehicle = useMemo(() => {
    const map = new Map<string, (typeof ads)[number]>();
    ads.forEach((ad) => { const prev = map.get(ad.vehicleKey); if (!prev || String(ad.scheduledDate || ad.assignedAt || "") > String(prev.scheduledDate || prev.assignedAt || "")) map.set(ad.vehicleKey, ad); });
    return map;
  }, [ads]);

  function toggle(row: StockGroup) {
    if (!eligibleSet.has(row.key)) return;
    setSelectedKeys((current) => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; });
    setError("");
  }
  function clearSelection() { setSelectedKeys(new Set()); setError(""); }
  function validate(rowsToPlan: StockGroup[]) {
    if (!publishingSettings.accountName.trim()) return "اكتب اسم حساب حراج الحالي من صفحة إعداد النشر والمناديب.";
    if (dailyLimit < 1) return "حدد الحد اليومي لحساب حراج أولًا.";
    if (!activeAgents.length) return "لا يوجد مندوب نشط.";
    if (!rowsToPlan.length) return "لا توجد سيارات جديدة متاحة للتكليف.";
    if (rowsToPlan.length > remainingCapacity) return `عدد السيارات (${rowsToPlan.length}) أكبر من السعة المتبقية للفترة (${remainingCapacity}).`;
    return "";
  }
  function openManual() {
    const issue = validate(selectedRows); if (issue) return setError(issue);
    const window = getSuggestedPlanWindow(); setPlanStart(window.planStart); setPlanEnd(window.planEnd); setDraftKeys(new Set(selectedRows.map((r) => r.key))); setAutomatic(false); setShowPlan(true); setError("");
  }
  function openAutomatic() {
    const candidates = sortRows(coverageState.eligibleRows).slice(0, automaticTarget);
    const issue = validate(candidates); if (issue) return setError(issue);
    const window = getSuggestedPlanWindow(); setPlanStart(window.planStart); setPlanEnd(window.planEnd); setDraftKeys(new Set(candidates.map((r) => r.key))); setAutomatic(true); setShowPlan(true); setError("");
  }
  function selectAutomaticRows() { setSelectedKeys(new Set(sortRows(coverageState.eligibleRows).slice(0, automaticTarget).map((r) => r.key))); }

  const basePreview = useMemo(() => {
    if (!showPlan || !planStart || !planEnd || !draftRows.length) return { rows: [] as ReturnType<typeof buildPublishingAssignments>, error: "" };
    try {
      return { rows: buildPublishingAssignments({ vehicles: draftRows, planStart, planEnd, coverageCycle: coverageState.cycle, settings: publishingSettings, agents, existingAds: ads, requestedCount: draftRows.length }), error: "" };
    } catch (e) { return { rows: [] as ReturnType<typeof buildPublishingAssignments>, error: e instanceof Error ? e.message : "تعذر تجهيز الجدول" }; }
  }, [showPlan, planStart, planEnd, draftRows, coverageState.cycle, publishingSettings, agents, ads]);

  const previewRows = useMemo(() => enrichAssignmentsWithAdCopy(basePreview.rows, stock, websiteCars, publishingSettings), [basePreview.rows, stock, websiteCars, publishingSettings]);
  const days = planStart && planEnd ? getPlanDays(planStart, planEnd) : [];
  const dailyPreview = useMemo(() => days.map((day) => {
    const dayRows = previewRows.filter((ad) => ad.scheduledDate === day.key);
    const byAgent = new Map<string, number>(); dayRows.forEach((ad) => byAgent.set(ad.agentId, (byAgent.get(ad.agentId) || 0) + 1));
    return { day, total: dayRows.length, reps: [...byAgent.entries()].map(([id, count]) => ({ agent: agents.find((a) => a.id === id), count })).sort((a, b) => b.count - a.count || (a.agent?.name || "").localeCompare(b.agent?.name || "", "ar")) };
  }), [days, previewRows, agents]);
  const matched = previewRows.filter((ad) => ad.specsStatus === "matched").length;
  const partial = previewRows.filter((ad) => ad.specsStatus === "partial").length;
  const missing = previewRows.filter((ad) => ad.specsStatus === "missing").length;

  async function createPlan() {
    if (basePreview.error) return setError(basePreview.error);
    if (!previewRows.length) return setError("لا توجد تكليفات جاهزة للحفظ.");
    if (missing) return setError(`يوجد ${missing} إعلان بدون مطابقة مواصفات مؤكدة بالموقع. اربط مواصفات الموقع أولًا حتى لا ينشر المندوب بيانات ناقصة.`);
    const latest = getCoverageState(stock, ads); const eligible = new Set(latest.eligibleRows.map((r) => r.key));
    if (latest.cycle !== coverageState.cycle || draftRows.some((r) => !eligible.has(r.key))) { setShowPlan(false); setDraftKeys(new Set()); return setError("تغيرت تغطية الاستوك أثناء تجهيز الجدول. جهز الجدول من جديد."); }
    setSaving(true);
    try { await createPublishingAssignments(previewRows); setShowPlan(false); setDraftKeys(new Set()); clearSelection(); navigate(`/schedule?week=${getWeekStartKey(planStart)}`); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر إنشاء جدول النشر"); }
    finally { setSaving(false); }
  }

  async function refreshAll() { await Promise.allSettled([refreshStock(), refreshWebsiteCars()]); }

  return <>
    <PageTitle title="مخزون السيارات" subtitle="النظام يختار سيارات جديدة بدون تكرار، يوزعها على كل المناديب النشطين، ويجهز صيغة الإعلان من مواصفات الموقع." actions={<button className="secondary-button" onClick={() => void refreshAll()} disabled={stockLoading || websiteCarsLoading}><ArrowClockwise size={18} />{stockLoading || websiteCarsLoading ? "جارٍ التحديث" : "تحديث الاستوك والمواصفات"}</button>} />
    {stockError ? <div className="alert warning"><WarningCircle size={19} />{stockError}</div> : null}
    {websiteCarsError ? <div className="alert warning"><WarningCircle size={19} />الاستوك يعمل، لكن ربط مواصفات الموقع غير متاح: {websiteCarsError}</div> : null}
    {error ? <div className="alert error"><WarningCircle size={19} />{error}</div> : null}
    {unassignedActiveAgents ? <div className="alert warning"><WarningCircle size={19} />يوجد {unassignedActiveAgents} مندوب نشط بدون فرع، ولن يدخل في التوزيع حتى يتم ربطه.</div> : null}
    {stockExcludedAgencyVehicles > 0 ? <div className="alert info"><CheckCircle size={19} />تم استبعاد {stockExcludedAgencyVehicles} سيارة لأن المكان = الوكالة.</div> : null}
    {coverageState.startedNewCycle && stock.length ? <div className="alert success"><CheckCircle size={19} />تمت تغطية الاستوك بالكامل سابقًا، وبدأت دورة جديدة رقم {coverageState.cycle}.</div> : null}

    <section className="plan-window-hero">
      <div className="plan-window-main"><div className="plan-window-icon"><CalendarBlank size={30} weight="duotone" /></div><div><span>{suggested.isFridayPreparation ? "الجدول الأسبوعي الجديد" : "جدول النشر القادم"}</span><h2>{formatPlanRange(suggested.planStart, suggested.planEnd)}</h2><p>حساب حراج واحد: <b>{publishingSettings.accountName || "غير محدد"}</b>. الحد اليومي للشركة كلها يتوزع على كل المناديب النشطين في الفروع.</p></div></div>
      <div className="plan-window-metrics"><div><span>أيام النشر</span><b>{suggestedDays}</b></div><div><span>حد الحساب اليومي</span><b>{dailyLimit}</b></div><div><span>سعة الفترة</span><b>{periodCapacity}</b></div><div><span>سيارات جديدة للجدول</span><b>{automaticTarget}</b></div></div>
      <button className="primary-button plan-window-action" onClick={openAutomatic} disabled={!automaticTarget || stockLoading}><CalendarBlank size={20} />تجهيز جدول تلقائي <b>{automaticTarget || ""}</b></button>
    </section>

    {remainingCapacity > coverageState.eligibleRows.length && coverageState.eligibleRows.length > 0 ? <div className="alert info"><CheckCircle size={19} />السعة المتبقية {remainingCapacity} إعلان، لكن يوجد {coverageState.eligibleRows.length} سيارة مختلفة فقط لم تُغطَّ بعد. سيتم إنشاء {automaticTarget} إعلان بدون تكرار، وتُترك باقي السعة بدل تكرار السيارة.</div> : null}

    <section className="stats-grid inventory-stats">
      <StatCard label="دورة التغطية" value={coverageState.cycle} hint="لا تكرار قبل تغطية الجميع" tone="info" />
      <StatCard label="متاح بدون تكرار" value={coverageState.eligibleRows.length} hint="سيارات/فئات جديدة" tone="warn" />
      <StatCard label="تمت تغطيته" value={coverageState.coveredCount} hint={`من ${stock.length} سيارة/فئة`} tone="good" />
      <StatCard label="المناديب النشطون" value={activeAgents.length} hint="من كل الفروع" />
      <StatCard label="سيارات الموقع للمواصفات" value={websiteCars.length} hint={websiteCarsError ? "الربط يحتاج مراجعة" : "مصدر صيغة الإعلان"} tone={websiteCarsError ? "danger" : "good"} />
    </section>

    <div className="inventory-toolbar"><div className="filters-bar inventory-filters"><label className="search-box"><MagnifyingGlass size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم السيارة أو البيان أو الموديل" /></label><select value={coverage} onChange={(e) => setCoverage(e.target.value as typeof coverage)}><option value="available">متاح للتكليف</option><option value="covered">تمت تغطيته</option><option value="all">كل الاستوك</option></select></div><div className="selection-actions"><button className="secondary-button" onClick={selectAutomaticRows} disabled={!automaticTarget}><CheckSquare size={18} />تحديد {automaticTarget || ""} سيارة</button>{selectedRows.length ? <button className="ghost-button" onClick={clearSelection}>إلغاء التحديد</button> : null}<button className="secondary-button emphasized" onClick={openManual} disabled={!selectedRows.length}><CalendarBlank size={19} />تجهيز المحدد <b>{selectedRows.length || ""}</b></button></div></div>

    <section className="panel table-panel">{!stock.length && !stockLoading ? <EmptyState title="لا توجد بيانات" text={stockError ? "تعذر الاتصال بمصدر الاستوك." : "لا توجد سيارات متاح للبيع خارج الوكالة حاليًا."} /> : !rows.length ? <EmptyState title="لا توجد نتائج" text="غيّر البحث أو الفلتر." /> : <div className="table-scroll"><table className="inventory-table"><thead><tr><th></th><th>السيارة</th><th>البيان</th><th>الموديل</th><th>الاستوك</th><th>التغطية</th><th>آخر تكليف</th></tr></thead><tbody>{rows.map((row) => { const available = eligibleSet.has(row.key); const selected = selectedKeys.has(row.key); const last = latestByVehicle.get(row.key); return <tr key={row.key} className={`${selected ? "selected-row" : ""} ${available ? "" : "covered-row"}`} onClick={() => available && toggle(row)}><td><input type="checkbox" checked={selected} disabled={!available} onChange={() => toggle(row)} onClick={(e) => e.stopPropagation()} /></td><td><strong>{row.carName}</strong></td><td>{row.statement}</td><td>{row.modelYear}</td><td><span className="stock-badge"><SquaresFour size={16} />{row.quantity}</span></td><td>{available ? <span className="coverage-state uncovered">متاح</span> : <span className="coverage-state covered"><CheckCircle size={16} />تمت التغطية</span>}</td><td>{last?.scheduledDate || "—"}</td></tr>; })}</tbody></table></div>}</section>

    {showPlan ? <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) setShowPlan(false); }}><div className="modal-card weekly-plan-modal">
      <div className="modal-head"><div><h2>مراجعة جدول النشر قبل الاعتماد</h2><p>حساب واحد، توزيع عام على كل المناديب، ولا يوجد تكرار سيارات داخل الجدول.</p></div><button className="icon-button" onClick={() => setShowPlan(false)} disabled={saving}>×</button></div>
      <div className="period-card locked-period"><CalendarBlank size={23} /><div><span>فترة النشر</span><strong>{formatPlanRange(planStart, planEnd)}</strong><small>محددة تلقائيًا</small></div><span className="locked-period-badge">{days.length} أيام</span></div>
      <div className="plan-summary-grid"><div><span>حساب حراج</span><strong className="small-summary-value">{publishingSettings.accountName}</strong></div><div><span>الإعلانات</span><strong>{previewRows.length}</strong></div><div><span>الحد اليومي</span><strong>{dailyLimit}</strong></div><div><span>المناديب</span><strong>{activeAgents.length}</strong></div></div>
      {basePreview.error ? <div className="alert error"><WarningCircle size={18} />{basePreview.error}</div> : <>
        <div className="specs-preview-summary"><span className="matched">مواصفات كاملة/مرتبطة <b>{matched}</b></span><span className="partial">جزئية <b>{partial}</b></span><span className="missing">غير مرتبطة <b>{missing}</b></span></div>
        {missing ? <div className="alert warning"><WarningCircle size={18} />لن يسمح النظام باعتماد الجدول قبل ربط كل إعلان بمواصفات حقيقية من الموقع.</div> : null}
        <div className="daily-distribution-preview"><div className="daily-distribution-head"><h3>التوزيع اليومي على كل المناديب</h3><p>الفرع لا يقيد التوزيع؛ يظهر فقط بجوار اسم المندوب.</p></div><div className="daily-distribution-branches"><section className="daily-distribution-branch"><header><div><strong>{publishingSettings.accountName}</strong><span>حد الحساب: {dailyLimit} إعلان يوميًا</span></div><b>شركة واحدة / حساب واحد</b></header><div className="daily-distribution-rows">{dailyPreview.map(({ day, total, reps }) => <div className="daily-distribution-row" key={day.key}><div className="daily-distribution-day"><strong>{day.name}</strong><span>{day.key}</span></div><div className="daily-distribution-total"><span>إجمالي اليوم</span><b>{total}</b></div><div className="daily-distribution-agents">{reps.map(({ agent, count }) => <span key={agent?.id}><b>{agent?.name || "—"}</b><em>{count} إعلان</em><small>{accounts.find((b) => b.id === agent?.accountId)?.name || "بدون فرع"}</small></span>)}</div></div>)}</div></section></div></div>
        <div className="preview-note"><CheckCircle size={18} />كل سيارة تظهر مرة واحدة فقط في الجدول. الصيغة تُجهز تلقائيًا من مواصفات الموقع واسم حساب حراج الحالي.</div>
      </>}
      <div className="modal-actions"><button className="ghost-button" onClick={() => setShowPlan(false)} disabled={saving}>إلغاء</button><button className="primary-button" onClick={() => void createPlan()} disabled={saving || Boolean(basePreview.error) || Boolean(missing)}><Plus size={18} />{saving ? "جارٍ إنشاء الجدول..." : `اعتماد ${previewRows.length} إعلان`}</button></div>
    </div></div> : null}
  </>;
}
