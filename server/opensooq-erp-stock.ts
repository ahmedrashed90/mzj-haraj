import { createHash } from "node:crypto";
import type { StockGroup } from "../src/types";

type ErpRecord = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("ar-SA")
    .replace(/[\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه").replace(/ى/g, "ي");
}

function enabled(value: unknown) {
  return value === 1 || value === true || clean(value) === "1";
}

function disabled(value: unknown) {
  return value === 1 || value === true || clean(value) === "1";
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export type NextErpStockGroup = StockGroup & {
  unitKeys: string[];
  stockSource: "next_erp";
};

/**
 * Read-only NEXT ERP inventory mapping. A Serial No represents one actual VIN;
 * a publishing variant is exactly Item.type + Item.class + Item.model.
 * Never guess missing Item fields from a free-text title or from MZJ Operations.
 */
export function mapNextErpStock(items: ErpRecord[], serials: ErpRecord[]) {
  const itemsByCode = new Map<string, ErpRecord>();
  for (const item of items) {
    // The verified Postman Item query returns only six public stock-description
    // fields. Optional flags must never cause those valid Items to be discarded.
    if (disabled(item.disabled) || (item.is_sales_item !== undefined && !enabled(item.is_sales_item))) continue;
    const code = clean(item.item_code || item.name);
    if (code) itemsByCode.set(code, item);
  }

  const groups = new Map<string, NextErpStockGroup>();
  const seenVins = new Set<string>();
  let excludedUnmapped = 0;
  let excludedUnavailable = 0;
  for (const serial of serials) {
    const vin = clean(serial.name).toUpperCase();
    if (!vin || seenVins.has(vin)) continue;
    seenVins.add(vin);
    if (clean(serial.status).toLowerCase() !== "active" || normalize(serial.car_status) !== normalize("متاحة للحجز")) {
      excludedUnavailable += 1;
      continue;
    }
    const item = itemsByCode.get(clean(serial.item_code));
    const carName = clean(item?.type);
    const statement = clean(item?.class);
    const modelYear = clean(item?.model);
    if (!carName || !statement || !modelYear) {
      excludedUnmapped += 1;
      continue;
    }
    const variant = [normalize(carName), normalize(statement), normalize(modelYear)].join("|");
    const key = `erp-${hash(`variant:${variant}`)}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, carName, statement, modelYear, statusName: "متاحة للحجز", quantity: 0,
        unitKeys: [], stockSource: "next_erp" };
      groups.set(key, group);
    }
    group.unitKeys.push(`${key}:${hash(`serial:${vin}`)}`);
    group.quantity += 1;
  }
  const rows = [...groups.values()].map((group) => ({ ...group, unitKeys: group.unitKeys.sort() }))
    .sort((a, b) => a.carName.localeCompare(b.carName, "ar")
      || a.statement.localeCompare(b.statement, "ar") || a.modelYear.localeCompare(b.modelYear, "ar"));
  return {
    rows,
    totalVehicles: rows.reduce((sum, row) => sum + row.quantity, 0),
    totalGroups: rows.length,
    excludedUnmapped,
    excludedUnavailable,
  };
}

/** Read-only Frappe client matching the successful Postman get_list tests. */
const PAGE_SIZE = 200;
const MAX_PAGES = 100;
const ITEM_BATCH_SIZE = 40;

async function erpList(
  baseUrl: string, token: string, doctype: string, fields: string[], filters: unknown[],
  fetchImpl: typeof fetch,
): Promise<ErpRecord[]> {
  const rows: ErpRecord[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${baseUrl}/api/method/frappe.client.get_list`);
    url.searchParams.set("doctype", doctype);
    url.searchParams.set("fields", JSON.stringify(fields));
    url.searchParams.set("filters", JSON.stringify(filters));
    url.searchParams.set("limit_start", String(page * PAGE_SIZE));
    url.searchParams.set("limit_page_length", String(PAGE_SIZE));
    url.searchParams.set("order_by", "name asc");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(url, { method: "GET", headers: { accept: "application/json", authorization: token },
        cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as { message?: ErpRecord[] } | null;
      if (!response.ok) throw new Error(`ERP_${doctype.replace(/\s/g, "_").toUpperCase()}_HTTP_${response.status}`);
      if (!payload || !Array.isArray(payload.message)) throw new Error("ERP_INVALID_RESPONSE");
      rows.push(...payload.message);
      if (payload.message.length < PAGE_SIZE) return rows;
    } finally { clearTimeout(timer); }
  }
  throw new Error("ERP_PAGINATION_LIMIT");
}

/**
 * Fetch only Serial Nos that are Active and available for reservation, then
 * fetch the linked Item records using the exact six fields verified in Postman.
 * Item flags that were not returned by the verified query are never assumed.
 * No real VINs or API secrets are returned to the browser.
 */
export async function readNextErpStock(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch) {
  const serials = await erpList(baseUrl, token, "Serial No", ["name", "item_code", "status", "car_status"],
    [["car_status", "=", "متاحة للحجز"], ["status", "=", "Active"]], fetchImpl);
  const codes = [...new Set(serials.map((row) => clean(row.item_code)).filter(Boolean))].sort();
  const items: ErpRecord[] = [];
  for (let start = 0; start < codes.length; start += ITEM_BATCH_SIZE) {
    const batch = codes.slice(start, start + ITEM_BATCH_SIZE);
    items.push(...await erpList(baseUrl, token, "Item", ["item_code", "item_name", "item_group", "type", "class", "model"],
      [["item_code", "in", batch]], fetchImpl));
  }
  return mapNextErpStock(items, serials);
}
