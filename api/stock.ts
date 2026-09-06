import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";

const FIREBASE_API_KEY = "AIzaSyCFJSPtJ7zUieFJLek89bRjwbpjx4RTH4Q";
const ADMIN_EMAIL = "admin@mzj.com";
const DEFAULT_PLATFORM_BASE_URL = "https://mzj-platform.vercel.app";
const PAGE_SIZE = 200;
const MAX_PAGES = 100;

type PlatformVehicle = {
  id?: string;
  car_name?: string | null;
  statement?: string | null;
  model_year?: string | number | null;
  status_code?: string | null;
  status_name?: string | null;
};

type PlatformVehiclesResponse = {
  ok?: boolean;
  rows?: PlatformVehicle[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function json(response: VercelResponse, status: number, payload: Record<string, unknown>) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  return response.status(status).json(payload);
}

function bearerToken(request: VercelRequest) {
  const header = String(request.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function verifyFirebaseAdmin(idToken: string) {
  if (!idToken) return false;
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!lookup.ok) return false;
  const payload = await lookup.json() as { users?: Array<{ email?: string; disabled?: boolean }> };
  const user = payload.users?.[0];
  return Boolean(user && !user.disabled && clean(user.email).toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

function platformConfig() {
  const baseUrl = clean(process.env.MZJ_PLATFORM_BASE_URL || DEFAULT_PLATFORM_BASE_URL).replace(/\/+$/, "");
  const identifier = clean(process.env.MZJ_PLATFORM_IDENTIFIER);
  const password = String(process.env.MZJ_PLATFORM_PASSWORD || "");
  if (!identifier || !password) throw new Error("PLATFORM_ENV_MISSING");
  return { baseUrl, identifier, password };
}

async function platformSessionCookie(baseUrl: string, identifier: string, password: string) {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "MZJ-Haraj-Manager/1.1" },
    body: JSON.stringify({ identifier, password }),
    redirect: "manual",
  });
  const payload = await login.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!login.ok || payload.ok === false) throw new Error(payload.error || "PLATFORM_LOGIN_FAILED");

  const rawCookie = login.headers.get("set-cookie") || "";
  const match = rawCookie.match(/(?:^|,\s*)mzj_session=([^;]+)/i) || rawCookie.match(/mzj_session=([^;]+)/i);
  if (!match?.[1]) throw new Error("PLATFORM_SESSION_MISSING");
  return `mzj_session=${match[1]}`;
}

async function readAllAvailableVehicles(baseUrl: string, cookie: string) {
  const all: PlatformVehicle[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (all.length < total && page <= MAX_PAGES) {
    const url = new URL(`${baseUrl}/api/operations`);
    url.searchParams.set("resource", "vehicles");
    url.searchParams.set("status", "available_for_sale");
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));

    const result = await fetch(url, {
      method: "GET",
      headers: { cookie, accept: "application/json", "user-agent": "MZJ-Haraj-Manager/1.1" },
      cache: "no-store",
    });
    const payload = await result.json().catch(() => ({})) as PlatformVehiclesResponse;
    if (!result.ok || payload.ok === false) throw new Error(payload.error || "PLATFORM_STOCK_FAILED");

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    all.push(...rows.filter((row) => clean(row.status_code) === "available_for_sale" || clean(row.status_name) === "متاح للبيع"));
    total = Number.isFinite(Number(payload.total)) ? Number(payload.total) : all.length;
    if (!rows.length || all.length >= total) break;
    page += 1;
  }

  if (page > MAX_PAGES && all.length < total) throw new Error("PLATFORM_STOCK_TOO_LARGE");
  return all;
}

function groupVehicles(vehicles: PlatformVehicle[]) {
  const groups = new Map<string, { key: string; carName: string; statement: string; modelYear: string; statusName: string; quantity: number }>();
  for (const vehicle of vehicles) {
    const carName = clean(vehicle.car_name) || "—";
    const statement = clean(vehicle.statement) || "—";
    const modelYear = clean(vehicle.model_year) || "—";
    const normalized = `${carName.toLowerCase()}|${statement.toLowerCase()}|${modelYear.toLowerCase()}`;
    const key = createHash("sha256").update(normalized).digest("hex").slice(0, 24);
    const current = groups.get(key);
    if (current) current.quantity += 1;
    else groups.set(key, { key, carName, statement, modelYear, statusName: "متاح للبيع", quantity: 1 });
  }
  return [...groups.values()].sort((a, b) => a.carName.localeCompare(b.carName, "ar") || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") return json(response, 405, { ok: false, error: "Method not allowed" });

  try {
    const authorized = await verifyFirebaseAdmin(bearerToken(request));
    if (!authorized) return json(response, 401, { ok: false, error: "غير مصرح بالدخول" });

    const { baseUrl, identifier, password } = platformConfig();
    const cookie = await platformSessionCookie(baseUrl, identifier, password);
    const vehicles = await readAllAvailableVehicles(baseUrl, cookie);
    const rows = groupVehicles(vehicles);

    return json(response, 200, {
      ok: true,
      rows,
      totalVehicles: vehicles.length,
      totalGroups: rows.length,
      fetchedAt: new Date().toISOString(),
      source: "MZJ Platform / Operations / Vehicles / available_for_sale",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("Stock proxy failed:", message);
    if (message === "PLATFORM_ENV_MISSING") return json(response, 500, { ok: false, error: "بيانات دخول منصة MZJ غير مضافة في إعدادات Vercel." });
    if (message === "PLATFORM_LOGIN_FAILED" || message.includes("بيانات تسجيل الدخول")) return json(response, 502, { ok: false, error: "تعذر تسجيل الدخول إلى منصة MZJ. راجع بيانات الربط في Vercel." });
    if (message === "PLATFORM_SESSION_MISSING") return json(response, 502, { ok: false, error: "تم تسجيل الدخول للمنصة لكن لم يتم إنشاء جلسة قراءة." });
    return json(response, 502, { ok: false, error: `تعذر قراءة مخزون منصة MZJ: ${message}` });
  }
}
