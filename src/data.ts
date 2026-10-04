import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Agent, HarajAccount, HarajAd, PublishingSettings, StockResponse, WebsiteCarsResponse } from "./types";

function isoNow() { return new Date().toISOString(); }
function asClientDoc<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  const raw = snap.data();
  const normalize = (value: unknown) => value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : value;
  return Object.fromEntries([["id", snap.id], ...Object.entries(raw).map(([key, value]) => [key, normalize(value)])]) as T;
}
function normalizeSettings(raw: Record<string, unknown> | undefined): PublishingSettings {
  return {
    accountName: String(raw?.accountName || ""),
    dailyLimit: Math.max(0, Math.floor(Number(raw?.dailyLimit || 0))),
    updatedAt: raw?.updatedAt && typeof raw.updatedAt === "object" && "toDate" in raw.updatedAt
      ? (raw.updatedAt as { toDate: () => Date }).toDate().toISOString()
      : String(raw?.updatedAt || ""),
  };
}

export function subscribeAccounts(cb: (rows: HarajAccount[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, "haraj_accounts"), (snapshot) => cb(snapshot.docs.map((item) => asClientDoc<HarajAccount>(item)).sort((a, b) => a.name.localeCompare(b.name, "ar"))), (error) => onError?.(error));
}
export function subscribeAgents(cb: (rows: Agent[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, "agents"), (snapshot) => cb(snapshot.docs.map((item) => asClientDoc<Agent>(item)).sort((a, b) => a.name.localeCompare(b.name, "ar"))), (error) => onError?.(error));
}
export function subscribeAds(cb: (rows: HarajAd[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, "haraj_ads"), (snapshot) => cb(snapshot.docs.map((item) => asClientDoc<HarajAd>(item)).sort((a, b) => String(b.scheduledDate || b.updatedAt || b.assignedAt || "").localeCompare(String(a.scheduledDate || a.updatedAt || a.assignedAt || "")))), (error) => onError?.(error));
}
export function subscribePublishingSettings(cb: (row: PublishingSettings) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(db, "settings", "haraj_publishing"), (snapshot) => cb(normalizeSettings(snapshot.exists() ? snapshot.data() : undefined)), (error) => onError?.(error));
}
export async function savePublishingSettings(patch: Partial<PublishingSettings>) {
  return setDoc(doc(db, "settings", "haraj_publishing"), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// haraj_accounts is retained as the branch directory to preserve existing agent links.
export async function addAccount(input: Omit<HarajAccount, "id" | "createdAt" | "updatedAt">) { return addDoc(collection(db, "haraj_accounts"), { ...input, adLimit: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
export async function updateAccount(id: string, patch: Partial<HarajAccount>) { return updateDoc(doc(db, "haraj_accounts", id), { ...patch, updatedAt: serverTimestamp() }); }
export async function removeAccount(id: string) { return deleteDoc(doc(db, "haraj_accounts", id)); }
export async function addAgent(input: Omit<Agent, "id" | "createdAt" | "updatedAt">) { return addDoc(collection(db, "agents"), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
export async function updateAgent(id: string, patch: Partial<Agent>) { return updateDoc(doc(db, "agents", id), { ...patch, updatedAt: serverTimestamp() }); }
export async function removeAgent(id: string) { return deleteDoc(doc(db, "agents", id)); }
export async function addAd(input: Omit<HarajAd, "id" | "assignedAt" | "updatedAt">) { return addDoc(collection(db, "haraj_ads"), { ...input, assignedAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
export async function createPublishingAssignments(assignments: Array<Omit<HarajAd, "id" | "assignedAt" | "updatedAt" | "publishedAt">>) {
  const chunkSize = 400;
  for (let start = 0; start < assignments.length; start += chunkSize) {
    const batch = writeBatch(db);
    assignments.slice(start, start + chunkSize).forEach((assignment) => batch.set(doc(collection(db, "haraj_ads")), { ...assignment, assignedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await batch.commit();
  }
}
export async function updateAd(id: string, patch: Partial<HarajAd>) {
  const next: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.url && patch.status === "published" && !patch.publishedAt) next.publishedAt = serverTimestamp();
  return updateDoc(doc(db, "haraj_ads", id), next);
}
export async function removeAd(id: string) { return deleteDoc(doc(db, "haraj_ads", id)); }
export async function removeScheduleAds(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  for (let start = 0; start < uniqueIds.length; start += 400) {
    const batch = writeBatch(db);
    uniqueIds.slice(start, start + 400).forEach((id) => batch.delete(doc(db, "haraj_ads", id)));
    await batch.commit();
  }
}

async function authenticatedGet<T>(url: string, fallback: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("يجب تسجيل الدخول أولًا");
  const token = await user.getIdToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || fallback);
  return payload as T;
}
export async function fetchStock(): Promise<StockResponse> { return authenticatedGet<StockResponse>("/api/stock", "تعذر قراءة مخزون السيارات"); }
export async function fetchWebsiteCars(): Promise<WebsiteCarsResponse> { return authenticatedGet<WebsiteCarsResponse>("/api/website-cars", "تعذر قراءة مواصفات سيارات الموقع"); }

export function normalizeHarajUrl(value: string) {
  const trimmed = value.trim(); if (!trimmed) return "";
  try { return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString(); } catch { return trimmed; }
}
export function nowIso() { return isoNow(); }
