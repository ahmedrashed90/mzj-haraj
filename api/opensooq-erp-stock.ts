import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readNextErpStock } from "../server/opensooq-erp-stock";

const FIREBASE_API_KEY = "AIzaSyCFJSPtJ7zUieFJLek89bRjwbpjx4RTH4Q";
const ADMIN_EMAIL = "admin@mzj.com";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
  try {
    if (!await verifyFirebaseAdmin(bearer(req))) return json(res, 401, { ok: false, error: "غير مصرح بالدخول" });
    const { baseUrl, token } = erpConfig();
    const mapped = await readNextErpStock(baseUrl, token);
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
