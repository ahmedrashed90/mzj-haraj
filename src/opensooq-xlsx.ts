/**
 * Browser-side OpenSooq Excel export. Produces a standards-compliant XLSX workbook
 * with no runtime dependency or server request. Exporting never changes quota or ads.
 */
export type OpenSooqExcelRow = {
  date: string;
  branch: string;
  car: string;
  statement: string;
  modelYear: string;
  price: number | null;
  phone: string;
  statusLabel: string;
  published: boolean;
  order: number;
};

export type OpenSooqExcelOptions = {
  headers: readonly string[];
  sheetName: string;
};

const PALETTES = [
  { fill: "E7F2FF", accent: "78A6D5" },
  { fill: "EAF6E5", accent: "83B88D" },
  { fill: "FFF0E6", accent: "E5AA83" },
  { fill: "F3E9FF", accent: "B49AD8" },
  { fill: "E6F6F4", accent: "7ABCB7" },
  { fill: "FFF7E3", accent: "D7BA76" },
] as const;
const COLUMNS = [17, 17, 25, 50, 13, 19, 21, 18] as const;
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const encoder = new TextEncoder();

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textCell(address: string, value: unknown, style: number): string {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function numberCell(address: string, value: number, style: number): string {
  return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
}

function excelDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

function buildStyles() {
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const cache = new Map<string, number>();
  function style(font: number, fill: number, border: number, format: number, alignment: "center" | "right") {
    const key = [font, fill, border, format, alignment].join(":");
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    const id = xfs.length;
    xfs.push(`<xf numFmtId="${format}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center" readingOrder="2" wrapText="1"/></xf>`);
    cache.set(key, id);
    return id;
  }
  const header = style(1, 2, 1, 0, "center");
  const stylesByDay = PALETTES.map((_, index) => {
    const fill = 3 + index;
    return [true, false].map((first) => {
      const border = first ? 3 + index : 2;
      return {
        date: style(0, fill, border, 164, "center"),
        branch: style(0, fill, border, 0, "center"),
        car: style(2, fill, border, 0, "right"),
        statement: style(0, fill, border, 0, "right"),
        year: style(0, fill, border, 1, "center"),
        yearText: style(0, fill, border, 0, "center"),
        price: style(0, fill, border, 3, "center"),
        phone: style(0, fill, border, 0, "center"),
        published: style(3, fill, border, 0, "center"),
        pending: style(4, fill, border, 0, "center"),
      };
    });
  });

  const font = (color: string, bold = false) => `<font><sz val="11"/><name val="Tajawal"/><family val="2"/><color rgb="FF${color}"/>${bold ? "<b/>" : ""}</font>`;
  const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const border = (top?: string) => `<border><left/><right style="thin"><color rgb="FFE3EAF1"/></right>${top ? `<top style="medium"><color rgb="FF${top}"/></top>` : "<top/>"}<bottom style="thin"><color rgb="FFDCE5EE"/></bottom><diagonal/></border>`;
  const xml = `${XML_DECLARATION}<styleSheet xmlns="${SHEET_NS}">` +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
    `<fonts count="5">${font("25364B")}${font("FFFFFF", true)}${font("24364A", true)}${font("176747", true)}${font("80521D", true)}</fonts>` +
    `<fills count="${3 + PALETTES.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill("123C5B")}${PALETTES.map((palette) => fill(palette.fill)).join("")}</fills>` +
    `<borders count="${3 + PALETTES.length}"><border><left/><right/><top/><bottom/><diagonal/></border>${border("0D2F4A")}${border()}${PALETTES.map((palette) => border(palette.accent)).join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return { xml, header, stylesByDay };
}

function worksheetXml(rows: OpenSooqExcelRow[], headers: readonly string[], styles: ReturnType<typeof buildStyles>) {
  const headerCells = headers.map((name, index) => textCell(`${String.fromCharCode(65 + index)}1`, name, styles.header)).join("");
  const lines: string[] = [`<row r="1" ht="40" customHeight="1">${headerCells}</row>`];
  let lastDate = "";
  let group = -1;
  rows.forEach((row, index) => {
    const first = row.date !== lastDate;
    if (first) { lastDate = row.date; group++; }
    const s = styles.stylesByDay[group % PALETTES.length][first ? 0 : 1];
    const rowNumber = index + 2;
    const date = excelDate(row.date);
    const year = /^\d{4}$/.test(row.modelYear) ? Number(row.modelYear) : null;
    const price = row.price !== null && Number.isFinite(row.price) && row.price > 0 ? row.price : null;
    lines.push(`<row r="${rowNumber}" ht="32" customHeight="1">` +
      (date === null ? textCell(`A${rowNumber}`, row.date, s.branch) : numberCell(`A${rowNumber}`, date, s.date)) +
      textCell(`B${rowNumber}`, row.branch, s.branch) +
      textCell(`C${rowNumber}`, row.car, s.car) +
      textCell(`D${rowNumber}`, row.statement, s.statement) +
      (year === null ? textCell(`E${rowNumber}`, row.modelYear, s.yearText) : numberCell(`E${rowNumber}`, year, s.year)) +
      (price === null ? textCell(`F${rowNumber}`, "", s.price) : numberCell(`F${rowNumber}`, price, s.price)) +
      textCell(`G${rowNumber}`, row.phone, s.phone) +
      textCell(`H${rowNumber}`, row.statusLabel, row.published ? s.published : s.pending) +
      '</row>');
  });
  const lastRow = rows.length + 1;
  const columns = COLUMNS.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return `${XML_DECLARATION}<worksheet xmlns="${SHEET_NS}">` +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:H${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0" rightToLeft="1" showGridLines="0" zoomScale="90"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="32"/>' +
    `<cols>${columns}</cols><sheetData>${lines.join("")}</sheetData>` +
    `<autoFilter ref="A1:H${lastRow}"/>` +
    '<printOptions horizontalCentered="1"/>' +
    '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';
}

// OOXML containers use ordinary ZIP files. Stored entries are intentionally used:
// small schedule workbooks do not justify another large browser dependency.
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function zipXml(entries: Array<{ name: string; xml: string }>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const now = new Date();
  const year = Math.max(1980, Math.min(2107, now.getFullYear()));
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.xml);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.push(localHeader, name, data);
    const centralHeader = new Uint8Array(46);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const localBytes = concatenate(local);
  const centralBytes = concatenate(central);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBytes.length, true);
  ev.setUint32(16, localBytes.length, true);
  return concatenate([localBytes, centralBytes, end]);
}

/** Pure workbook builder, also used by automated export tests. */
export function buildOpenSooqXlsx(sourceRows: OpenSooqExcelRow[], options: OpenSooqExcelOptions): Uint8Array {
  if (options.headers.length !== 8) throw new Error("The OpenSooq Excel export requires exactly eight headers.");
  if (!sourceRows.length) throw new Error("Cannot export an empty OpenSooq schedule.");
  const sheetName = options.sheetName.replace(/[\\/?*\[\]:]/g, "").slice(0, 31) || "OpenSooq";
  const rows = [...sourceRows].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const styles = buildStyles();
  const now = new Date().toISOString();
  const printTitle = xmlEscape(sheetName.replace(/'/g, "''"));
  const entries = [
    { name: "[Content_Types].xml", xml: `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", xml: `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "xl/workbook.xml", xml: `${XML_DECLARATION}<workbook xmlns="${SHEET_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${printTitle}'!$1:$1</definedName></definedNames></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", xml: `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", xml: styles.xml },
    { name: "xl/worksheets/sheet1.xml", xml: worksheetXml(rows, options.headers, styles) },
    { name: "docProps/core.xml", xml: `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>MZJ OpenSooq Publishing Schedule</dc:title><dc:creator>MZJ</dc:creator><cp:lastModifiedBy>MZJ</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", xml: `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MZJ</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${xmlEscape(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts></Properties>` },
  ];
  return zipXml(entries);
}
