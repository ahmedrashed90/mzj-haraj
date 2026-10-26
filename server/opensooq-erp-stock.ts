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
    if (disabled(item.disabled) || !enabled(item.is_sales_item)) continue;
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
