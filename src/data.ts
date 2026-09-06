import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Agent, HarajAccount, HarajAd, StockResponse } from "./types";

function isoNow() {
  return new Date().toISOString();
}

function asClientDoc<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  const raw = snap.data();
  const normalize = (value: unknown) => {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    return value;
  };
  return Object.fromEntries([["id", snap.id], ...Object.entries(raw).map(([key, value]) => [key, normalize(value)])]) as T;
}

export function subscribeAccounts(cb: (rows: HarajAccount[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, "haraj_accounts"), (snapshot) => {
    const rows = snapshot.docs.map((item) => asClientDoc<HarajAccount>(item)).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    cb(rows);
  }, (error) => onError?.(error));
}

export function subscribeAgents(cb: (rows: Agent[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, "agents"), (snapshot) => {
    const rows = snapshot.docs.map((item) => asClientDoc<Agent>(item)).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    cb(rows);
  }, (error) => onError?.(error));
}

export function subscribeAds(cb: (rows: HarajAd[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, "haraj_ads"), (snapshot) => {
    const rows = snapshot.docs.map((item) => asClientDoc<HarajAd>(item)).sort((a, b) => String(b.updatedAt || b.assignedAt || "").localeCompare(String(a.updatedAt || a.assignedAt || "")));
    cb(rows);
  }, (error) => onError?.(error));
}

export async function addAccount(input: Omit<HarajAccount, "id" | "createdAt" | "updatedAt">) {
  return addDoc(collection(db, "haraj_accounts"), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateAccount(id: string, patch: Partial<HarajAccount>) {
  return updateDoc(doc(db, "haraj_accounts", id), { ...patch, updatedAt: serverTimestamp() });
}

export async function removeAccount(id: string) {
  return deleteDoc(doc(db, "haraj_accounts", id));
}

export async function addAgent(input: Omit<Agent, "id" | "createdAt" | "updatedAt">) {
  return addDoc(collection(db, "agents"), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateAgent(id: string, patch: Partial<Agent>) {
  return updateDoc(doc(db, "agents", id), { ...patch, updatedAt: serverTimestamp() });
}

export async function removeAgent(id: string) {
  return deleteDoc(doc(db, "agents", id));
}

export async function distributeAgentLimits(account: HarajAccount, agents: Agent[], ads: HarajAd[]) {
  const active = agents.filter((agent) => agent.accountId === account.id && agent.active);
  if (!active.length) return;
  const liveAds = ads.filter((ad) => ad.status !== "closed" && ad.accountId === account.id);
  const usedByAgent = new Map<string, number>();
  liveAds.forEach((ad) => usedByAgent.set(ad.agentId, (usedByAgent.get(ad.agentId) || 0) + 1));
  const usedTotal = [...usedByAgent.values()].reduce((sum, value) => sum + value, 0);
  if (usedTotal > account.adLimit) throw new Error("الإعلانات المسندة حاليًا أكبر من حد الحساب.");

  const quotas = new Map(active.map((agent) => [agent.id, usedByAgent.get(agent.id) || 0]));
  let remaining = account.adLimit - usedTotal;
  const ordered = [...active].sort((a, b) => (quotas.get(a.id) || 0) - (quotas.get(b.id) || 0) || a.name.localeCompare(b.name, "ar"));
  let cursor = 0;
  while (remaining > 0 && ordered.length) {
    const agent = ordered[cursor % ordered.length];
    quotas.set(agent.id, (quotas.get(agent.id) || 0) + 1);
    remaining -= 1;
    cursor += 1;
  }

  const batch = writeBatch(db);
  active.forEach((agent) => batch.update(doc(db, "agents", agent.id), { adLimit: quotas.get(agent.id) || 0, updatedAt: serverTimestamp() }));
  await batch.commit();
}

export async function addAd(input: Omit<HarajAd, "id" | "assignedAt" | "updatedAt">) {
  return addDoc(collection(db, "haraj_ads"), { ...input, assignedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateAd(id: string, patch: Partial<HarajAd>) {
  const next: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.url && patch.status === "published" && !patch.publishedAt) next.publishedAt = serverTimestamp();
  return updateDoc(doc(db, "haraj_ads", id), next);
}

export async function removeAd(id: string) {
  return deleteDoc(doc(db, "haraj_ads", id));
}

export async function fetchStock(): Promise<StockResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("يجب تسجيل الدخول أولًا");
  const token = await user.getIdToken();
  const response = await fetch("/api/stock", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || "تعذر قراءة مخزون السيارات");
  return payload as StockResponse;
}

export function normalizeHarajUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function nowIso() {
  return isoNow();
}
