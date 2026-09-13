import type { VercelRequest, VercelResponse } from "@vercel/node";

const FIREBASE_API_KEY = "AIzaSyCFJSPtJ7zUieFJLek89bRjwbpjx4RTH4Q";
const ADMIN_EMAIL = "admin@mzj.com";
const DEFAULT_WORDPRESS_BASE_URL = "https://mzjcars.com";

type RawCar = Record<string, unknown>;
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function num(value: unknown) { const n = Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function bool(value: unknown) { return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true"; }
function list(value: unknown) { return Array.isArray(value) ? value.map(clean).filter(Boolean) : []; }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v)) : {}; }
function json(res: VercelResponse, status: number, payload: Record<string, unknown>) { res.setHeader("Cache-Control", "no-store, max-age=0"); return res.status(status).json(payload); }
function bearer(req: VercelRequest) { return String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ""; }

async function verifyFirebaseAdmin(idToken: string) {
  if (!idToken) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return false;
  const payload = await response.json() as { users?: Array<{ email?: string; disabled?: boolean }> };
  const user = payload.users?.[0];
  return Boolean(user && !user.disabled && clean(user.email).toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

function normalizeCompareStatus(raw: RawCar, compareKey: string, compareKeyFound: boolean) {
  const supplied = clean(raw.compare_key_status ?? raw.compareKeyStatus).toLowerCase();
  if (["found", "missing_key", "not_found", "unavailable"].includes(supplied)) return supplied;
  if (!compareKey) return "missing_key";
  return compareKeyFound ? "found" : "not_found";
}

function normalize(raw: RawCar) {
  const compareKey = clean(raw.compare_key ?? raw.compareKey);
  const compareKeyFound = bool(raw.compare_key_found ?? raw.compareKeyFound);
  return {
    postId: Math.floor(num(raw.post_id ?? raw.postId ?? raw.id)),
    vehicleId: clean(raw.vehicle_id ?? raw.vehicleId),
    title: clean(raw.title),
    price: num(raw.price ?? raw.display_price),
    make: clean(raw.make),
    model: clean(raw.model),
    trim: clean(raw.trim),
    year: clean(raw.year),
    body: clean(raw.body),
    transmission: clean(raw.transmission),
    drivetrain: clean(raw.drivetrain),
    engine: clean(raw.engine),
    fuel: clean(raw.fuel),
    compareKey,
    compareKeyStatus: normalizeCompareStatus(raw, compareKey, compareKeyFound),
    compareKeyFound,
    permalink: clean(raw.permalink),
    baseSpecs: record(raw.base_specs ?? raw.baseSpecs),
    interiorSpecs: list(raw.interior_specs ?? raw.interiorSpecs),
    exteriorSpecs: list(raw.exterior_specs ?? raw.exteriorSpecs),
    safetySpecs: list(raw.safety_specs ?? raw.safetySpecs),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    if (!await verifyFirebaseAdmin(bearer(req))) return json(res, 401, { ok: false, error: "غير مصرح بالدخول" });
    const baseUrl = clean(process.env.MZJ_WORDPRESS_BASE_URL || DEFAULT_WORDPRESS_BASE_URL).replace(/\/+$/, "");
    const secret = clean(process.env.MZJ_HARAJ_BRIDGE_KEY);
    if (!secret) return json(res, 500, { ok: false, error: "أضف MZJ_HARAJ_BRIDGE_KEY في Environment Variables داخل Vercel." });

    const url = `${baseUrl}/wp-json/mzj-haraj/v1/cars?per_page=500`;
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", "x-mzj-bridge-key": secret, "user-agent": "MZJ-Haraj-Manager/1.8" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; items?: RawCar[]; error?: string; message?: string };
    if (!response.ok || payload.ok === false) throw new Error(payload.error || payload.message || `WORDPRESS_HTTP_${response.status}`);
    const items = (Array.isArray(payload.items) ? payload.items : []).map(normalize).filter((item) => item.postId && item.title);
    return json(res, 200, { ok: true, items, fetchedAt: new Date().toISOString(), source: `${baseUrl}/wp-json/mzj-haraj/v1/cars` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("Website specs proxy failed:", message);
    return json(res, 502, { ok: false, error: `تعذر قراءة مواصفات الموقع: ${message}` });
  }
}
