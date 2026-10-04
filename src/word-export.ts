import { getBranchAdvertiserName } from "./branch-advertiser";
import { formatDateArabic, formatPlanRange, getPlanDays, isPublished } from "./schedule";
import type { Agent, HarajAccount, HarajAd, PublishingSettings } from "./types";

const POLICIES = [
  "كتابة السعر بشكل واضح ومباشر، والتأكد من اكتمال بيانات ووصف السيارة.",
  "عدم كتابة «السعر عند الاتصال» وعدم الترويج لحسابات التواصل الاجتماعي داخل الإعلان.",
  "عدم تكرار إعلان نفس السيارة؛ عند الحاجة يتم تحديث الإعلان الحالي بدل إنشاء إعلان مكرر.",
  "استخدام متجر حراج واحد فقط للشركة خلال وضع النشر الحالي.",
  "المواصفات المنشورة يجب أن تطابق السيارة وصيغة الإعلان المسلمة من النظام.",
];

const FOLLOW_UP = [
  "فحص رسائل حراج يوميًا والرد داخل محادثة حراج نفسها.",
  "فحص التعليقات والرد على كل تعليق يحتاج رد.",
  "متابعة أي تنبيه أو طلب تحديث أو تعديل يظهر على الحساب أو الإعلان وتنفيذه فورًا.",
  "إبلاغ الإدارة فورًا بأي قيد أو انخفاض في حد النشر أو مشكلة تؤثر على جودة الحساب.",
  "إرسال رابط كل إعلان بعد النشر حتى يتم تسجيله ومراجعته في النظام.",
];

const encoder = new TextEncoder();

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function run(text: string, options: { bold?: boolean; size?: number } = {}) {
  const props = [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>',
    '<w:rtl/>',
    options.bold ? '<w:b/>' : "",
    `<w:sz w:val="${options.size || 21}"/><w:szCs w:val="${options.size || 21}"/>`,
  ].join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(text: string, options: { bold?: boolean; size?: number; center?: boolean; after?: number; before?: number } = {}) {
  const align = options.center ? "center" : "right";
  return `<w:p><w:pPr><w:bidi/><w:jc w:val="${align}"/><w:spacing w:before="${options.before || 0}" w:after="${options.after ?? 80}"/></w:pPr>${run(text, options)}</w:p>`;
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function cell(content: string | string[], header = false) {
  const lines = Array.isArray(content) ? content : [content];
  const shade = header ? '<w:shd w:val="clear" w:fill="7B3428"/>' : "";
  const textColor = header ? '<w:color w:val="FFFFFF"/>' : "";
  const paragraphs = lines.map((line) => {
    const pPr = '<w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="40"/></w:pPr>';
    const rPr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:rtl/>${header ? '<w:b/>' : ""}${textColor}<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>`;
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
  }).join("");
  return `<w:tc><w:tcPr><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>${shade}</w:tcPr>${paragraphs}</w:tc>`;
}

function table(headers: string[], rows: string[][]) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="DCC9C1"/>`)
    .join("");
  const header = `<w:tr>${headers.map((item) => cell(item, true)).join("")}</w:tr>`;
  const body = rows.map((row) => `<w:tr>${row.map((item) => cell(item)).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr>${header}${body}</w:tbl>`;
}

function summaryTable(rows: Array<[string, string]>) {
  return table(["البيان", "القيمة"], rows.map(([label, value]) => [label, value]));
}

function buildDocumentXml(args: {
  branch: HarajAccount;
  ads: HarajAd[];
  agents: Agent[];
  publishingSettings: PublishingSettings;
  planStart: string;
  planEnd: string;
}) {
  const { branch, ads, agents, publishingSettings, planStart, planEnd } = args;
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const planDays = getPlanDays(planStart, planEnd);
  const published = ads.filter(isPublished).length;
  const parts: string[] = [];

  parts.push(paragraph("MZJ - إدارة إعلانات حراج", { bold: true, size: 34, center: true, after: 100 }));
  parts.push(paragraph(`جدول النشر - ${branch.name}`, { bold: true, size: 30, center: true, after: 80 }));
  parts.push(paragraph(`حساب حراج: ${publishingSettings.accountName || "—"}`, { center: true }));
  parts.push(paragraph(`اسم المعرض داخل الإعلان: ${getBranchAdvertiserName(branch, publishingSettings.accountName)}`, { center: true }));
  parts.push(paragraph(formatPlanRange(planStart, planEnd), { center: true, after: 160 }));
  parts.push(summaryTable([
    ["إجمالي تكليفات الفرع", String(ads.length)],
    ["تم النشر / استلام الرابط", String(published)],
    ["حد حساب حراج اليومي", String(publishingSettings.dailyLimit || 0)],
    ["عدد أيام الجدول", String(planDays.length)],
  ]));

  const daysWithAds = planDays.filter((day) => ads.some((ad) => ad.scheduledDate === day.key));
  daysWithAds.forEach((day, dayIndex) => {
    parts.push(pageBreak());
    const rows = ads
      .filter((ad) => ad.scheduledDate === day.key)
      .sort((a, b) => Number(a.scheduleOrder || 0) - Number(b.scheduleOrder || 0)
        || Number(a.agentSequence || a.periodAgentSequence || 0) - Number(b.agentSequence || b.periodAgentSequence || 0));
    parts.push(paragraph(`${day.name} - ${formatDateArabic(day.key, { day: "numeric", month: "long", year: "numeric" })}`, { bold: true, size: 28, after: 80 }));
    parts.push(paragraph(`إعلانات اليوم: ${rows.length}`, { bold: true, size: 21, after: 120 }));
    parts.push(table(
      ["#", "المندوب", "النوع", "السيارة / البيان", "الموديل", "رابط الإعلان"],
      rows.map((ad, index) => [
        String(index + 1),
        agentById.get(ad.agentId)?.name || ad.agentNameSnapshot || "—",
        ad.agentTypeSnapshot === "installment" ? "تقسيط" : "كاش",
        [ad.carName, ad.statement].filter(Boolean).join(" - "),
        ad.modelYear || "—",
        isPublished(ad) ? (ad.url || "تم استلام الرابط") : "يرسل بعد النشر",
      ]),
    ));
    if (dayIndex === daysWithAds.length - 1) parts.push(paragraph("", { after: 0 }));
  });

  parts.push(pageBreak());
  parts.push(paragraph("سياسات النشر والمتابعة", { bold: true, size: 30, center: true, after: 140 }));
  parts.push(paragraph("سياسات النشر المختصرة", { bold: true, size: 25, after: 80 }));
  POLICIES.forEach((item) => parts.push(paragraph(`✓ ${item}`, { size: 21, after: 60 })));
  parts.push(paragraph("متابعة الرسائل والتعليقات والقيود", { bold: true, size: 25, before: 120, after: 80 }));
  FOLLOW_UP.forEach((item) => parts.push(paragraph(`• ${item}`, { size: 21, after: 60 })));
  parts.push(paragraph("بعد نشر كل إعلان: يرسل المندوب رابط الإعلان لمدير الفرع ليتم تسجيله ومراجعته في النظام.", { bold: true, size: 22, before: 140, after: 80 }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${parts.join("")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="900" w:right="720" w:bottom="900" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
      <w:bidi/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function localHeader(name: Uint8Array, data: Uint8Array, crc: number, dosDate: number, dosTime: number) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function centralHeader(name: Uint8Array, data: Uint8Array, crc: number, dosDate: number, dosTime: number, localOffset: number) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  return header;
}

function zip(entries: Array<{ name: string; content: string }>) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const { dosDate, dosTime } = dosDateTime();
  let localOffset = 0;

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const local = localHeader(name, data, crc, dosDate, dosTime);
    localChunks.push(local, name, data);
    const central = centralHeader(name, data, crc, dosDate, dosTime, localOffset);
    centralChunks.push(central, name);
    localOffset += local.length + name.length + data.length;
  });

  const localPart = concat(localChunks);
  const centralPart = concat(centralChunks);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, centralPart.length, true);
  view.setUint32(16, localPart.length, true);
  view.setUint16(20, 0, true);
  return concat([localPart, centralPart, end]);
}

function buildDocxBlob(documentXml: string) {
  const now = new Date().toISOString();
  const entries = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "word/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:rtl/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    },
    { name: "word/document.xml", content: documentXml },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>MZJ Haraj Schedule</dc:title><dc:creator>MZJ Haraj Manager</dc:creator><cp:lastModifiedBy>MZJ Haraj Manager</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MZJ Haraj Manager</Application></Properties>`,
    },
  ];
  const bytes = zip(entries);
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "branch";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportBranchScheduleWord(args: {
  branch: HarajAccount;
  ads: HarajAd[];
  agents: Agent[];
  publishingSettings: PublishingSettings;
  planStart: string;
  planEnd: string;
}) {
  if (!args.ads.length) throw new Error("لا توجد إعلانات لهذا الفرع لتصديرها.");
  const documentXml = buildDocumentXml(args);
  const blob = buildDocxBlob(documentXml);
  const name = safeFileName(args.branch.name);
  downloadBlob(blob, `MZJ-Haraj-${name}-${args.planStart}-${args.planEnd}.docx`);
}
