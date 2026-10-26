import { CalendarBlank } from "@phosphor-icons/react";
import { openSooqBranchName } from "../opensooq";
import { buildOpenSooqXlsx, type OpenSooqExcelRow } from "../opensooq-xlsx";
import type { OpenSooqBranchId, OpenSooqScheduleRow } from "../types";

export const numberText = (value: number) => Number(value).toLocaleString("ar-SA-u-nu-latn");
export const dateText = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("ar-SA-u-nu-latn", { day: "numeric", month: "long" });
};
export const priceText = (value: number) => value > 0 ? `${numberText(value)} ر.س` : "يحتاج تحديد سعر";
export const formatLabel = (value: OpenSooqScheduleRow) => `${value.carName} — ${value.statement} — ${value.modelYear}`;
export function downloadOpenSooqXlsx(rows: OpenSooqScheduleRow[], start: string, end: string, branchId?: OpenSooqBranchId) {
  const titles = ["تاريخ النشر", "الفرع", "السيارة", "البيان", "الموديل", "السعر (ر.س)", "رقم التواصل", "حالة الإعلان"];
  const data: OpenSooqExcelRow[] = rows.map((ad) => ({
    date: ad.scheduledDate,
    branch: ad.branchId ? openSooqBranchName(ad.branchId) : "",
    car: ad.carName,
    statement: ad.statement,
    modelYear: ad.modelYear,
    price: Number.isFinite(ad.price) && ad.price > 0 ? ad.price : null,
    phone: String(ad.phone ?? ""),
    statusLabel: ad.status === "published" ? "\u062a\u0645 \u0627\u0644\u0646\u0634\u0631" : "\u0644\u0645 \u064a\u0646\u0634\u0631",
    published: ad.status === "published",
    order: ad.order,
  }));
  const bytes = buildOpenSooqXlsx(data, { headers: titles, sheetName: "\u062c\u062f\u0648\u0644 \u0627\u0644\u0646\u0634\u0631" });
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const element = document.createElement("a");
  element.href = url;
  element.download = `MZJ-OpenSooq-${branchId || "all"}-${start}-to-${end}.xlsx`;
  document.body.appendChild(element);
  element.click();
  element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ScheduleRowsTable({ rows, readOnly = false, showBranch = false, savingRow, onPrice, onStatus }: {
  rows: OpenSooqScheduleRow[];
  readOnly?: boolean;
  showBranch?: boolean;
  savingRow?: string;
  onPrice?: (row: OpenSooqScheduleRow) => void;
  onStatus?: (row: OpenSooqScheduleRow) => void;
}) {
  return <div className="table-scroll"><table className="opensooq-table">
    <thead><tr><th>#</th>{showBranch ? <th>الفرع المسؤول</th> : null}<th>السيارة</th><th>البيان</th><th>الموديل</th><th>السعر</th><th>رقم التواصل الموحد</th>{readOnly ? null : <th>حالة الإعلان</th>}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.id}>
      <td>{index + 1}</td>
      {showBranch ? <td><span className="opensooq-branch-tag">{row.branchId ? openSooqBranchName(row.branchId) : "غير محدد"}</span></td> : null}
      <td><strong>{row.carName}</strong>{row.stockSource !== "next_erp" && row.unitIndex > 1 ? <small className="opensooq-variant-note">وحدة مخزون {row.unitIndex}</small> : null}</td>
      <td>{row.statement}</td><td>{row.modelYear}</td>
      <td><span className={row.price > 0 ? "opensooq-price" : "opensooq-missing-price"}>{priceText(row.price)}</span>
        {!readOnly ? <button className="opensooq-mini-link" onClick={() => onPrice?.(row)} disabled={Boolean(savingRow)} title="تعديل السعر لهذا الإعلان">تعديل</button> : null}</td>
      <td className="opensooq-phone">{row.phone}</td>
      {!readOnly ? <td><button type="button" disabled={Boolean(savingRow)} onClick={() => onStatus?.(row)} className={`opensooq-status ${row.status === "published" ? "is-published" : ""}`}>
        {savingRow === row.id ? "جارٍ الحفظ..." : row.status === "published" ? "تم النشر ✓" : "تأكيد النشر"}
      </button></td> : null}
    </tr>)}</tbody>
  </table></div>;
}

export function DailySchedule({ rows, preview = false, showBranch = false, savingRow, onPrice, onStatus }: {
  rows: OpenSooqScheduleRow[];
  preview?: boolean;
  showBranch?: boolean;
  savingRow?: string;
  onPrice?: (row: OpenSooqScheduleRow) => void;
  onStatus?: (row: OpenSooqScheduleRow) => void;
}) {
  const days = [...new Set(rows.map((r) => r.scheduledDate))];
  return <div className="opensooq-day-list">{days.map((day, index) => {
    const dayRows = rows.filter((row) => row.scheduledDate === day);
    const published = dayRows.filter((row) => row.status === "published").length;
    const branchSummary = showBranch ? ` · الصالة ${dayRows.filter((row) => row.branchId === "showroom").length} / القادسية ${dayRows.filter((row) => row.branchId === "qadisiyah").length}` : "";
    return <details className="opensooq-day" key={day} open={index === 0}>
      <summary><span><CalendarBlank size={19} weight="duotone" />{dateText(day)} <small>{day}</small></span>
        <span>{dayRows.length} إعلان{branchSummary}{!preview ? ` · ${published} منشور` : ""}</span></summary>
      <ScheduleRowsTable rows={dayRows} readOnly={preview} showBranch={showBranch} savingRow={savingRow} onPrice={onPrice} onStatus={onStatus} />
    </details>;
  })}</div>;
}
