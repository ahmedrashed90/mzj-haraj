import {
  collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { getOpenSooqRemaining, openSooqWeekId } from "./opensooq";
import type { OpenSooqMonth, OpenSooqPlan, OpenSooqScheduleRow, OpenSooqSettings } from "./types";

const SETTINGS_DOC = doc(db, "settings", "opensooq_publishing");
const monthRef = (monthKey: string) => doc(db, "opensooq_months", monthKey);
const planRef = (planId: string) => doc(db, "opensooq_plans", planId);
const EMPTY_MONTH = (key: string): OpenSooqMonth => ({ id: key, monthlyLimit: 0, activeCount: 0, reservedCount: 0, usedUnitKeys: [] });
const num = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const errorMessage = (message: string) => new Error(message);

export function subscribeOpenSooqSettings(cb: (value: OpenSooqSettings) => void, onError?: (error: Error) => void) {
  return onSnapshot(SETTINGS_DOC, (snap) => {
    const raw = snap.data();
    cb({ accountName: String(raw?.accountName || ""), phone: String(raw?.phone || ""), dailyTarget: num(raw?.dailyTarget ?? 14) || 14 });
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
  // Only the selected month's plans are read; no composite Firestore index is required.
  return onSnapshot(query(collection(db, "opensooq_plans"), where("monthKey", "==", monthKey)), (snap) => {
    cb(snap.docs.map((item) => ({ id: item.id, ...item.data() } as OpenSooqPlan))
      .filter((item) => item.monthKey === monthKey)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)));
  }, onError);
}
/** Save account and month's baseline together to avoid partial settings updates. */
export async function saveOpenSooqConfiguration(monthKey: string, settings: OpenSooqSettings, monthlyLimit: number, activeCount: number) {
  const accountName = settings.accountName.trim();
  const phone = settings.phone.trim();
  const dailyTarget = Number(settings.dailyTarget);
  if (!accountName) throw errorMessage("اكتب اسم حساب السوق المفتوح.");
  if (!/^\+?[0-9][0-9\s-]{6,18}$/.test(phone)) throw errorMessage("رقم التواصل الموحد غير صحيح.");
  if (![monthlyLimit, activeCount, dailyTarget].every((n) => Number.isSafeInteger(n) && n >= 0)) throw errorMessage("يجب كتابة أعداد صحيحة غير سالبة.");
  if (dailyTarget < 1 || dailyTarget > 160) throw errorMessage("العدد اليومي يجب أن يكون بين 1 و160.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw errorMessage("شهر الباقة غير صحيح.");
  await runTransaction(db, async (tx) => {
    const ref = monthRef(monthKey);
    const snap = await tx.get(ref);
    const reservedCount = num(snap.data()?.reservedCount);
    if (activeCount + reservedCount > monthlyLimit) throw errorMessage("العدد النشط + المحجوز أكبر من إجمالي الباقة. راجع القيم.");
    tx.set(ref, { monthlyLimit, activeCount, reservedCount,
      usedUnitKeys: Array.isArray(snap.data()?.usedUnitKeys) ? snap.data()!.usedUnitKeys : [],
      updatedAt: serverTimestamp() }, { merge: true });
    tx.set(SETTINGS_DOC, { accountName, phone, dailyTarget, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function createOpenSooqPlan(monthKey: string, weekStart: string, rows: OpenSooqScheduleRow[]) {
  if (!rows.length) throw errorMessage("لا توجد إعلانات جاهزة في معاينة هذا الأسبوع.");
  const key = openSooqWeekId(monthKey, weekStart);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw errorMessage("يوجد تكرار في وحدات الاستوك المختارة.");
  if (rows.some((row) => !row.scheduledDate.startsWith(`${monthKey}-`) || row.scheduledDate < weekStart || row.scheduledDate > weekStartPlus5(weekStart))) {
    throw errorMessage("تواريخ الجدول لا تتوافق مع أسبوع النشر أو شهر الباقة.");
  }
  await runTransaction(db, async (transaction) => {
    const monthDoc = monthRef(monthKey);
    const planDoc = planRef(key);
    // All reads precede writes, preserving Firebase transaction requirements.
    const [monthSnap, planSnap] = await Promise.all([transaction.get(monthDoc), transaction.get(planDoc)]);
    if (planSnap.exists()) throw errorMessage("تم إنشاء جدول لهذا الأسبوع بالفعل. افتحه من الجداول المحفوظة.");
    if (!monthSnap.exists()) throw errorMessage("احفظ إعدادات باقة هذا الشهر أولًا.");
    const data = monthSnap.data() || {};
    const month = { monthlyLimit: num(data?.monthlyLimit), activeCount: num(data?.activeCount), reservedCount: num(data?.reservedCount) };
    if (rows.length > getOpenSooqRemaining(month)) throw errorMessage("تغير الرصيد المتبقي. حدّث المعاينة قبل الحفظ.");
    const usedUnitKeys = Array.isArray(data.usedUnitKeys) ? data.usedUnitKeys.map(String) : [];
    const used = new Set<string>(usedUnitKeys);
    if (rows.some((row) => used.has(row.id))) throw errorMessage("بعض السيارات تم جدولتها من شاشة أخرى. حدّث جدول الأسبوع وأعد المحاولة.");
    const newReserved = month.reservedCount + rows.length;
    transaction.set(planDoc, { monthKey, weekStart, planStart: rows[0].scheduledDate,
      planEnd: rows[rows.length - 1].scheduledDate, rows, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.update(monthDoc, { reservedCount: newReserved, usedUnitKeys: [...usedUnitKeys, ...rows.map((row) => row.id)], updatedAt: serverTimestamp() });
  });
  return key;
}
function weekStartPlus5(start: string) {
  const [y, m, d] = start.split("-").map(Number);
  const date = new Date(y, m - 1, d + 5, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export async function changeOpenSooqRow(planId: string, rowId: string, patch: { status?: "scheduled" | "published"; price?: number }) {
  await runTransaction(db, async (transaction) => {
    const ref = planRef(planId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw errorMessage("لم يعد جدول النشر موجودًا.");
    const rows = (snap.data().rows || []) as OpenSooqScheduleRow[];
    const found = rows.find((row) => row.id === rowId);
    if (!found) throw errorMessage("لم يعد الإعلان موجودًا.");
    if (patch.price !== undefined && (!Number.isSafeInteger(patch.price) || patch.price < 0)) throw errorMessage("السعر يجب أن يكون عددًا صحيحًا غير سالب.");
    if (patch.status === "published" && !(patch.price ?? found.price)) throw errorMessage("حدد السعر أولًا قبل تأكيد نشر الإعلان.");
    const updatedRows = rows.map((row) => row.id === rowId ? {
      ...row, ...patch, publishedAt: patch.status === "published" ? new Date().toISOString()
        : patch.status === "scheduled" ? "" : row.publishedAt || "",
    } : row);
    transaction.update(ref, { rows: updatedRows, updatedAt: serverTimestamp() });
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
    const rows = Array.isArray(plan.rows) ? plan.rows : [];
    if (rows.some((row) => row.status === "published")) throw errorMessage("لا يمكن إلغاء جدول به إعلانات منشورة. الإعلانات المنشورة ما زالت تشغل رصيد الباقة.");
    const raw = monthSnap.data();
    const reservedCount = num(raw?.reservedCount);
    if (reservedCount < rows.length) throw errorMessage("رصيد الحجز غير متطابق، لا يمكن حذف الجدول دون مراجعة.");
    const released = new Set(rows.map((row) => row.id));
    const used = Array.isArray(raw?.usedUnitKeys) ? raw.usedUnitKeys.map(String) as string[] : [];
    transaction.delete(ref);
    transaction.update(monthDoc, { reservedCount: reservedCount - rows.length,
      usedUnitKeys: used.filter((key) => !released.has(key)), updatedAt: serverTimestamp() });
  });
}
