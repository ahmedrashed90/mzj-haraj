import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mapNextErpStock } from "../server/opensooq-erp-stock";

const FIREBASE_API_KEY = "AIzaSyCFJSPtJ7zUieFJLek89bRjwbpjx4RTH4Q";
const ADMIN_EMAIL = "admin@mzj.com";
const PAGE_SIZE = 200;
const MAX_PAGES = 100;
type ErpRecord = Record<string, unknown>;

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function json(res: VercelResponse, status: number, payload: Record<string, unknown>) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(status).json(payload);
}
function bearer(req: VercelRequest) {
  return String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}
async function verifyFirebaseAdmin(idToken: string) {
  if (!idToken) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return false;
  const payload = await response.json() as { users?: Array<{ email?: string; disabled?: boolean }> };
  const user = payload.users?.[0];
  return Boolean(user && !user.disabled && clean(user.email).toLowerCase() === ADMIN_EMAIL);
}

function erpConfig() {
  const baseUrl = clean(process.env.NEXT_ERP_URL || process.env.ERPNEXT_URL || process.env.NEXT_ERP_BASE_URL).replace(/\/+$/, "");
  const apiKey = clean(process.env.NEXT_API_KEY || process.env.ERPNEXT_API_KEY);
  const apiSecret = clean(process.env.NEXT_API_SECRET || process.env.ERPNEXT_API_SECRET);
  if (!baseUrl || !apiKey || !apiSecret) throw new Error("ERP_CONFIG_MISSING");
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error("ERP_URL_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("ERP_URL_INVALID");
  return { baseUrl, token: `token ${apiKey}:${apiSecret}` };
}

async function erpList(baseUrl: string, token: string, doctype: string, fields: string[], filters: unknown[]) {
  const rows: ErpRecord[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${baseUrl}/api/resource/${encodeURIComponent(doctype)}`);
    url.searchParams.set("fields", JSON.stringify(fields));
    url.searchParams.set("filters", JSON.stringify(filters));
    url.searchParams.set("limit_start", String(page * PAGE_SIZE));
    url.searchParams.set("limit_page_length", String(PAGE_SIZE));
    url.searchParams.set("order_by", "name asc");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { method: "GET", headers: { accept: "application/json", authorization: token },
        cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as { data?: ErpRecord[] } | null;
      if (!response.ok) throw new Error(`ERP_${doctype.replace(/\s/g, "_").toUpperCase()}_HTTP_${response.status}`);
      if (!payload || !Array.isArray(payload.data)) throw new Error("ERP_INVALID_RESPONSE");
      rows.push(...payload.data);
      if (payload.data.length < PAGE_SIZE) return rows;
    } finally { clearTimeout(timer); }
  }
  throw new Error("ERP_PAGINATION_LIMIT");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    if (!await verifyFirebaseAdmin(bearer(req))) return json(res, 401, { ok: false, error: "غير مصرح بالدخول" });
    const { baseUrl, token } = erpConfig();
    // These are the same Item/Serial No fields and availability rules used by MZJ's ERPNext integration.
    const [items, serials] = await Promise.all([
      erpList(baseUrl, token, "Item", ["name", "item_code", "item_name", "item_group", "type", "class", "model", "disabled", "is_sales_item"],
        [["disabled", "=", 0], ["is_sales_item", "=", 1]]),
      erpList(baseUrl, token, "Serial No", ["name", "item_code", "status", "car_status"],
        [["status", "=", "Active"], ["car_status", "=", "متاحة للحجز"]]),
    ]);
    const mapped = mapNextErpStock(items, serials);
    return json(res, 200, { ok: true, ...mapped, fetchedAt: new Date().toISOString(),
      source: "NEXT ERP / Item + Serial No / Active + متاحة للحجز" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("OpenSooq NEXT ERP stock read failed:", code);
    if (code === "ERP_CONFIG_MISSING") return json(res, 503, { ok: false,
      error: "ربط NEXT ERP غير مهيأ في مشروع Vercel الخاص بحراج. أضف NEXT_ERP_URL وNEXT_API_KEY وNEXT_API_SECRET." });
    if (code === "ERP_URL_INVALID") return json(res, 503, { ok: false, error: "عنوان NEXT ERP في إعدادات Vercel غير صحيح." });
    return json(res, 502, { ok: false, error: `تعذر قراءة سيارات NEXT ERP (${code}). لن يتم استخدام استوك بديل.` });
  }
}
