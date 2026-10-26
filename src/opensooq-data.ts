import {
  collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where,
} from "firebase/firestore";
import { ADMIN_EMAIL, db } from "./firebase";
import {
  assignOpenSooqBranches, getOpenSooqRemaining, OPEN_SOOQ_BRANCHES, openSooqVariantIdentity, openSooqWeekId,
} from "./opensooq";
import type {
  OpenSooqAssignment, OpenSooqBranchId, OpenSooqBranchManagers, OpenSooqMonth,
  OpenSooqPlan, OpenSooqScheduleRow, OpenSooqSettings,
} from "./types";

const SETTINGS_DOC = doc(db, "settings", "opensooq_publishing");
const monthRef = (monthKey: string) => doc(db, "opensooq_months", monthKey);
const planRef = (planId: string) => doc(db, "opensooq_plans", planId);
const branchRows = (branchId: OpenSooqBranchId) => collection(db, "opensooq_branch_assignments", branchId, "rows");
const assignmentRef = (branchId: OpenSooqBranchId, planId: string, rowId: string) =>
  doc(branchRows(branchId), `${planId}__${rowId}`);
const EMPTY_MONTH = (key: string): OpenSooqMonth => ({ id: key, monthlyLimit: 0, activeCount: 0, reservedCount: 0, usedUnitKeys: [] });
const num = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const errorMessage = (message: string) => new Error(message);
const defaultManagers = (): OpenSooqBranchManagers => ({
  showroom: { name: "", email: "" }, qadisiyah: { name: "", email: "" },
});
function normalizeManagers(raw: unknown): OpenSooqBranchManagers {
  const managers = raw && typeof raw === "object" ? raw as Record<string, Record<string, unknown>> : {};
  const result = defaultManagers();
  for (const branch of OPEN_SOOQ_BRANCHES) {
    result[branch.id] = {
      name: String(managers[branch.id]?.name || ""),
      email: String(managers[branch.id]?.email || "").trim().toLowerCase(),
    };
  }
  return result;
}
function toAssignment(row: OpenSooqScheduleRow, monthKey: string, planId: string, weekStart: string): OpenSooqAssignment {
  if (!row.branchId) throw errorMessage("لا يوجد فرع مسؤول عن الإعلان.");
  return { ...row, branchId: row.branchId, planId, monthKey, weekStart, publishedAt: row.publishedAt || "" };
}
function weekStartPlus5(start: string) {
  const [y, m, d] = start.split("-").map(Number);
  const date = new Date(y, m - 1, d + 5, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function subscribeOpenSooqSettings(cb: (value: OpenSooqSettings) => void, onError?: (error: Error) => void) {
  return onSnapshot(SETTINGS_DOC, (snap) => {
    const raw = snap.data();
    cb({ accountName: String(raw?.accountName || ""), phone: String(raw?.phone || ""),
      dailyTarget: num(raw?.dailyTarget ?? 14) || 14, branchManagers: normalizeManagers(raw?.branchManagers) });
  }, onError);
}
export function subscribeOpenSooqMonth(key: string, cb: (value: OpenSooqMonth) => void, onError?: (error: Error) => void) {
  return onSnapshot(monthRef(key), (snap) => {
    const raw = snap.data();
    cb({ ...EMPTY_MONTH(key), monthlyLimit: num(raw?.monthlyLimit), activeCount: num(raw?.activeCount),
      reservedCount: num(raw?.reservedCount), usedUnitKeys: Array.isArray(raw?.usedUnitKeys) ? raw.usedUnitKeys.map(String) : [] });
  }, onError);
}
export function subscribeOpenSooqPlans(monthKey: string, cb: (value: OpenSooqPlan[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(query(collection(db, "opensooq_plans"), where("monthKey", "==", monthKey)), (snap) => {
    cb(snap.docs.map((item) => ({ id: item.id, ...item.data() } as OpenSooqPlan))
      .filter((item) => item.monthKey === monthKey)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)));
  }, onError);
}
/** Manager queries are scoped to their own collection; no global ad list is exposed. */
export function subscribeOpenSooqBranchRows(branchId: OpenSooqBranchId, monthKey: string,
  cb: (value: OpenSooqAssignment[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(query(branchRows(branchId), where("monthKey", "==", monthKey)), (snap) => {
    cb(snap.docs.map((item) => item.data() as OpenSooqAssignment)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.order - b.order));
  }, onError);
}
export function subscribeOpenSooqAdminAssignments(monthKey: string,
  cb: (value: OpenSooqAssignment[]) => void, onError?: (error: Error) => void) {
  const parts: Record<OpenSooqBranchId, OpenSooqAssignment[] | null> = { showroom: null, qadisiyah: null };
  const unsubs = OPEN_SOOQ_BRANCHES.map((branch) => subscribeOpenSooqBranchRows(branch.id, monthKey, (rows) => {
    parts[branch.id] = rows;
    if (parts.showroom && parts.qadisiyah) cb([...parts.showroom, ...parts.qadisiyah]);
  }, onError));
  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}

/** Save account settings and this month's quota together, without re-counting existing schedules. */
export async function saveOpenSooqConfiguration(monthKey: string, settings: OpenSooqSettings, monthlyLimit: number, activeCount: number) {
  const accountName = settings.accountName.trim();
  const phone = settings.phone.trim();
  const dailyTarget = Number(settings.dailyTarget);
  if (!accountName) throw errorMessage("اكتب اسم حساب السوق المفتوح.");
  if (!/^\+?[0-9][0-9\s-]{6,18}$/.test(phone)) throw errorMessage("رقم التواصل الموحد غير صحيح.");
  if (![monthlyLimit, activeCount, dailyTarget].every((n) => Number.isSafeInteger(n) && n >= 0)) throw errorMessage("يجب كتابة أعداد صحيحة غير سالبة.");
  if (dailyTarget < 1 || dailyTarget > 160) throw errorMessage("العدد اليومي يجب أن يكون بين 1 و160.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw errorMessage("شهر الباقة غير صحيح.");
  const branchManagers = normalizeManagers(settings.branchManagers);
  const assignedEmails: string[] = [];
  for (const branch of OPEN_SOOQ_BRANCHES) {
    const manager = branchManagers[branch.id];
    if (!manager.email && manager.name) throw errorMessage(`اكتب بريد مدير فرع ${branch.name} أو امسح اسمه.`);
    if (manager.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manager.email)) throw errorMessage(`بريد مدير فرع ${branch.name} غير صحيح.`);
    if (manager.email && !manager.name) throw errorMessage(`اكتب اسم مدير فرع ${branch.name}.`);
    if (manager.email === ADMIN_EMAIL.toLowerCase()) throw errorMessage("لا يمكن تخصيص حساب الأدمن كمدير فرع.");
    if (manager.email) assignedEmails.push(manager.email);
  }
  if (new Set(assignedEmails).size !== assignedEmails.length) throw errorMessage("لا يمكن تعيين نفس البريد الإلكتروني للفرعين.");
  await runTransaction(db, async (tx) => {
    const ref = monthRef(monthKey);
    const snap = await tx.get(ref);
    const reservedCount = num(snap.data()?.reservedCount);
    if (activeCount + reservedCount > monthlyLimit) throw errorMessage("العدد النشط + المحجوز أكبر من إجمالي الباقة. راجع القيم.");
    tx.set(ref, { monthlyLimit, activeCount, reservedCount,
      usedUnitKeys: Array.isArray(snap.data()?.usedUnitKeys) ? snap.data()!.usedUnitKeys : [],
      updatedAt: serverTimestamp() }, { merge: true });
    tx.set(SETTINGS_DOC, { accountName, phone, dailyTarget, branchManagers, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function createOpenSooqPlan(monthKey: string, weekStart: string, rows: OpenSooqScheduleRow[]) {
  if (!rows.length) throw errorMessage("لا توجد إعلانات جاهزة في معاينة هذا الأسبوع.");
  const assignedRows = assignOpenSooqBranches(rows);
  const key = openSooqWeekId(monthKey, weekStart);
  if (new Set(assignedRows.map((row) => row.id)).size !== assignedRows.length) throw errorMessage("يوجد تكرار في وحدات الاستوك المختارة.");
  const variantsPerDay = new Set<string>();
  for (const row of assignedRows) {
    const variant = `${row.scheduledDate}|${openSooqVariantIdentity(row)}`;
    if (variantsPerDay.has(variant)) throw errorMessage("لا يمكن جدولة نفس السيارة والفئة والموديل أكثر من مرة في اليوم نفسه.");
    variantsPerDay.add(variant);
  }
  if (assignedRows.some((row) => !row.scheduledDate.startsWith(`${monthKey}-`) || row.scheduledDate < weekStart || row.scheduledDate > weekStartPlus5(weekStart))) {
    throw errorMessage("تواريخ الجدول لا تتوافق مع أسبوع النشر أو شهر الباقة.");
  }
  await runTransaction(db, async (transaction) => {
    const monthDoc = monthRef(monthKey);
    const planDoc = planRef(key);
    const [monthSnap, planSnap] = await Promise.all([transaction.get(monthDoc), transaction.get(planDoc)]);
    if (planSnap.exists()) throw errorMessage("تم إنشاء جدول لهذا الأسبوع بالفعل. افتحه من الجداول المحفوظة.");
    if (!monthSnap.exists()) throw errorMessage("احفظ إعدادات باقة هذا الشهر أولًا.");
    const data = monthSnap.data() || {};
    const month = { monthlyLimit: num(data.monthlyLimit), activeCount: num(data.activeCount), reservedCount: num(data.reservedCount) };
    if (assignedRows.length > getOpenSooqRemaining(month)) throw errorMessage("تغير الرصيد المتبقي. حدّث المعاينة قبل الحفظ.");
    const usedUnitKeys = Array.isArray(data.usedUnitKeys) ? data.usedUnitKeys.map(String) : [];
    const used = new Set<string>(usedUnitKeys);
    if (assignedRows.some((row) => used.has(row.id))) throw errorMessage("بعض السيارات تم جدولتها من شاشة أخرى. حدّث جدول الأسبوع وأعد المحاولة.");
    transaction.set(planDoc, { monthKey, weekStart, planStart: assignedRows[0].scheduledDate,
      planEnd: assignedRows[assignedRows.length - 1].scheduledDate, rows: assignedRows,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    for (const row of assignedRows) {
      const assignment = toAssignment(row, monthKey, key, weekStart);
      transaction.set(assignmentRef(assignment.branchId, key, row.id), { ...assignment, updatedAt: serverTimestamp() });
    }
    transaction.update(monthDoc, { reservedCount: month.reservedCount + assignedRows.length,
      usedUnitKeys: [...usedUnitKeys, ...assignedRows.map((row) => row.id)], updatedAt: serverTimestamp() });
  });
  return key;
}

/**
 * Replace only unpublished vehicle choices in one SAVED schedule using NEXT ERP.
 * The month quota and reserved count never change. Published assignments are never touched.
 * All updates happen in a single Firestore transaction, or none are applied.
 */
export async function replaceOpenSooqUnpublishedPlan(planId: string, expectedRows: OpenSooqScheduleRow[], proposedRows: OpenSooqScheduleRow[]) {
  if (!expectedRows.length || expectedRows.length !== proposedRows.length) throw errorMessage("بيانات تحديث الجدول غير مكتملة.");
  await runTransaction(db, async (transaction) => {
    const ref = planRef(planId);
    const planSnap = await transaction.get(ref);
    if (!planSnap.exists()) throw errorMessage("الجدول لم يعد موجودًا.");
    const plan = planSnap.data() as Omit<OpenSooqPlan, "id">;
    const original = assignOpenSooqBranches(Array.isArray(plan.rows) ? plan.rows : []);
    if (original.length !== expectedRows.length || original.some((row, index) => row.id !== expectedRows[index].id)) {
      throw errorMessage("تغيرت بيانات الجدول. افتحه مجددًا قبل إعادة التجهيز.");
    }
    const monthDoc = monthRef(plan.monthKey);
    const monthSnap = await transaction.get(monthDoc);
    if (!monthSnap.exists()) throw errorMessage("لم يتم العثور على باقة شهر الجدول.");
    const oldRefs = original.map((row) => assignmentRef(row.branchId!, planId, row.id));
    const assignmentSnaps = await Promise.all(oldRefs.map((item) => transaction.get(item)));
    const live = original.map((row, index) => {
      const assignment = assignmentSnaps[index].exists() ? assignmentSnaps[index].data() as OpenSooqAssignment : null;
      const publishedAt = assignment?.publishedAt || row.publishedAt;
      return { ...row, status: assignment?.status || row.status, price: assignment?.price ?? row.price,
        ...(publishedAt ? { publishedAt } : {}) };
    });
    if (live.some((row, index) => row.status !== expectedRows[index].status)) {
      throw errorMessage("تغيرت حالة نشر أحد الإعلانات. حدّث الجدول أولًا حتى لا يتغير إعلان منشور.");
    }
    const toReplace = new Set(live.filter((row) => row.status !== "published").map((row) => row.id));
    if (!toReplace.size) throw errorMessage("جميع إعلانات الجدول منشورة بالفعل، ولن يتم تغييرها.");
    const usedUnitKeys: string[] = Array.isArray(monthSnap.data()?.usedUnitKeys) ? monthSnap.data()!.usedUnitKeys.map(String) : [];
    const usedElsewhere = new Set(usedUnitKeys.filter((id) => !toReplace.has(id)));
    const nextIds = new Set<string>();
    const blockedVariants = new Set<string>();
    const variant = (row: OpenSooqScheduleRow) => `${row.scheduledDate}|${openSooqVariantIdentity(row)}`;
    for (const row of live) if (row.status === "published") blockedVariants.add(variant(row));
    const updated = live.map((old, index) => {
      if (old.status === "published") {
        if (proposedRows[index].id !== old.id) throw errorMessage("لا يمكن استبدال إعلان منشور.");
        return old;
      }
      const next = proposedRows[index];
      if (next.stockSource !== "next_erp" || !next.id.startsWith("erp-") || !next.stockKey.startsWith("erp-")) {
        throw errorMessage("يجب أن تكون السيارات البديلة من NEXT ERP فقط.");
      }
      if (next.scheduledDate !== old.scheduledDate || next.order !== old.order || next.branchId !== old.branchId
        || next.phone !== old.phone || next.status !== "scheduled") {
        throw errorMessage("لا يمكن تغيير تاريخ الإعلان أو فرعه أو رقم التواصل عند تحديث السيارات.");
      }
      if (usedElsewhere.has(next.id) || nextIds.has(next.id)) throw errorMessage("السيارة البديلة محجوزة في جدول آخر.");
      if (blockedVariants.has(variant(next))) throw errorMessage("يوجد تكرار لنفس السيارة والفئة والموديل في اليوم الواحد.");
      blockedVariants.add(variant(next));
      nextIds.add(next.id);
      return next;
    });
    // Reads are complete. Keep all published manager documents, and only replace unpublished ones.
    // Delete only old IDs that are absent from the new schedule, then upsert replacements.
    // This also supports repeating the refresh without delete/set conflicts for reused ERP IDs.
    const newAssignmentPaths = new Set(updated.filter((row) => row.status !== "published")
      .map((row) => assignmentRef(row.branchId!, planId, row.id).path));
    live.forEach((row, index) => {
      if (row.status !== "published" && !newAssignmentPaths.has(oldRefs[index].path)) transaction.delete(oldRefs[index]);
    });
    updated.forEach((row) => {
      if (row.status === "published") return;
      const assignment = toAssignment(row, plan.monthKey, planId, plan.weekStart);
      transaction.set(assignmentRef(row.branchId!, planId, row.id), { ...assignment, updatedAt: serverTimestamp() });
    });
    transaction.update(ref, { rows: updated, updatedAt: serverTimestamp() });
    transaction.update(monthDoc, { usedUnitKeys: [
      ...usedUnitKeys.filter((id) => !toReplace.has(id)), ...updated.filter((row) => row.status !== "published").map((row) => row.id),
    ], updatedAt: serverTimestamp() });
  });
}

/** One-time, idempotent migration for saved v1.20 plans. No quota, date or status is changed. */
export async function ensureOpenSooqAssignments(planId: string) {
  await runTransaction(db, async (transaction) => {
    const ref = planRef(planId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const plan = snap.data() as Omit<OpenSooqPlan, "id">;
    const original = Array.isArray(plan.rows) ? plan.rows : [];
    const rows = assignOpenSooqBranches(original);
    const references = rows.map((row) => assignmentRef(row.branchId!, planId, row.id));
    const existing = await Promise.all(references.map((item) => transaction.get(item)));
    for (let index = 0; index < rows.length; index++) {
      if (!existing[index].exists()) {
        const assignment = toAssignment(rows[index], plan.monthKey, planId, plan.weekStart);
        transaction.set(references[index], { ...assignment, updatedAt: serverTimestamp() });
      }
    }
    if (original.some((row) => !row.branchId)) transaction.update(ref, { rows, updatedAt: serverTimestamp() });
  });
}

/** Update only the manager-visible ad document. The admin screen overlays these live values. */
export async function changeOpenSooqRow(branchId: OpenSooqBranchId, planId: string, rowId: string,
  patch: { status?: "scheduled" | "published"; price?: number }) {
  await runTransaction(db, async (transaction) => {
    const ref = assignmentRef(branchId, planId, rowId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw errorMessage("الإعلان غير متاح في جدول الفرع. افتح الجدول من جديد.");
    const found = snap.data() as OpenSooqAssignment;
    if (patch.price !== undefined && (!Number.isSafeInteger(patch.price) || patch.price < 0)) throw errorMessage("السعر يجب أن يكون عددًا صحيحًا غير سالب.");
    if (patch.status === "published" && !(patch.price ?? found.price)) throw errorMessage("حدد السعر أولًا قبل تأكيد نشر الإعلان.");
    const publishedAt = patch.status === "published" ? new Date().toISOString()
      : patch.status === "scheduled" ? "" : found.publishedAt || "";
    transaction.update(ref, { ...patch, publishedAt, updatedAt: serverTimestamp() });
  });
}

export async function deleteOpenSooqPlan(planId: string) {
  await runTransaction(db, async (transaction) => {
    const ref = planRef(planId);
    const planSnap = await transaction.get(ref);
    if (!planSnap.exists()) throw errorMessage("الجدول محذوف بالفعل.");
    const plan = planSnap.data() as Omit<OpenSooqPlan, "id">;
    const monthDoc = monthRef(plan.monthKey);
    const monthSnap = await transaction.get(monthDoc);
    if (!monthSnap.exists()) throw errorMessage("لم يتم العثور على باقة هذا الشهر.");
    const rows = assignOpenSooqBranches(Array.isArray(plan.rows) ? plan.rows : []);
    const references = rows.map((row) => assignmentRef(row.branchId!, planId, row.id));
    const savedRows = await Promise.all(references.map((item) => transaction.get(item)));
    if (rows.some((row, index) => row.status === "published" || savedRows[index].data()?.status === "published")) {
      throw errorMessage("لا يمكن حذف جدول يحتوي إعلانات منشورة من أي فرع.");
    }
    const raw = monthSnap.data();
    const reservedCount = num(raw?.reservedCount);
    if (reservedCount < rows.length) throw errorMessage("رصيد الحجز غير متطابق، لا يمكن حذف الجدول دون مراجعة.");
    const released = new Set(rows.map((row) => row.id));
    const used = Array.isArray(raw?.usedUnitKeys) ? raw.usedUnitKeys.map(String) as string[] : [];
    for (const [index, item] of savedRows.entries()) if (item.exists()) transaction.delete(references[index]);
    transaction.delete(ref);
    transaction.update(monthDoc, { reservedCount: reservedCount - rows.length,
      usedUnitKeys: used.filter((key) => !released.has(key)), updatedAt: serverTimestamp() });
  });
}
