import type { AgentContactSnapshot, AgentType, HarajAd, PublishingSettings, SpecsStatus, StockGroup, WebsiteCarData } from "./types";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}


export function getAdContactSnapshots(ad: Pick<HarajAd, "contactAgentsSnapshot" | "agentId" | "agentNameSnapshot" | "agentPhoneSnapshot">) {
  const rows = Array.isArray(ad.contactAgentsSnapshot) ? ad.contactAgentsSnapshot : [];
  const cleaned = rows.map((row) => ({
    agentId: clean(row?.agentId), name: clean(row?.name), phone: clean(row?.phone), branchName: clean(row?.branchName),
  })).filter((row) => row.name || row.phone);
  if (cleaned.length) return cleaned;
  const name = clean(ad.agentNameSnapshot);
  const phone = clean(ad.agentPhoneSnapshot);
  return name || phone ? [{ agentId: clean(ad.agentId), name, phone, branchName: "" }] : [];
}

export function areAdContactsReady(ad: Pick<HarajAd, "contactAgentsSnapshot" | "agentId" | "agentNameSnapshot" | "agentPhoneSnapshot">) {
  const rows = getAdContactSnapshots(ad);
  return rows.length > 0 && rows.every((row) => Boolean(row.name && row.phone))
    && Boolean(clean(ad.agentNameSnapshot) && clean(ad.agentPhoneSnapshot));
}

/** One publishing format for saved ads, preview, copy and Word export. */
export function getAssignedAgentAdText(ad: HarajAd): string {
  const source = String(ad.adText || "").trim();
  if (!source) return "";
  const contacts = getAdContactSnapshots(ad);
  const block = contactSection(contacts, ad.agentNameSnapshot, ad.agentPhoneSnapshot).join("\n");
  // The current generator already writes the correct vehicle/trim/price sections.
  if (source.includes("السعر شامل ضريبة القيمة المضافة") && source.includes("* (مواعيد العمل) *")) {
    const start = source.lastIndexOf("للتواصل:");
    const end = source.indexOf("* (مواعيد العمل) *", start);
    if (start >= 0 && end > start) return `${source.slice(0, start)}${block}\n${source.slice(end)}`.trim();
  }
  // Older saved ads retain their car specifications; reformat without inventing features.
  const rawLines = source.split(/\r?\n/).map((row) => row.trim());
  const title = clean(ad.carName) + (clean(ad.modelYear) ? ` ${clean(ad.modelYear)}` : "");
  const startSpecs = rawLines.findIndex((row) => row === "المواصفات الرئيسية:");
  const endSpecs = rawLines.findIndex((row) => row === "للتواصل:");
  const extracted = startSpecs >= 0 ? rawLines.slice(startSpecs + 1, endSpecs > startSpecs ? endSpecs : undefined)
    : rawLines.filter((row) => row.startsWith("* ") || row.startsWith("• "));
  const features = uniqueFeatures(extracted.filter((row) => row.startsWith("• ") || row.startsWith("* ")).map((row) => row.slice(2)));
  const variants = Array.isArray(ad.vehicleVariants) && ad.vehicleVariants.length
    ? ad.vehicleVariants : [{ statement: ad.statement, modelYear: ad.modelYear, websitePrice: ad.websitePrice }];
  const priceLines = variants.map((variant) => {
    const label = [goodValue(variant.statement), goodValue(variant.modelYear)].filter(Boolean).join(" - ");
    const price = formatPrice(Number(variant.websitePrice || 0));
    return `${label} ................. ( ${price ? `${price} ريال` : "السعر غير متوفر"} )`;
  });
  return [title.trim(), "", ...features.map((row) => `* ${row}`), "", RULE, ...priceLines,
    "السعر شامل ضريبة القيمة المضافة", RULE, block, ...CLOSING].join("\n").trim();
}

/** One missing variant price must prevent publishing the entire combined ad. */
export function areAdPricesReady(ad: Pick<HarajAd, "vehicleVariants" | "websitePrice">) {
  const variants = Array.isArray(ad.vehicleVariants) ? ad.vehicleVariants : [];
  if (variants.length > 1) return variants.every((variant) => Number(variant.websitePrice || 0) > 0);
  return Number(ad.websitePrice || 0) > 0;
}

function normalizeArabic(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return normalizeArabic(value).split(" ").filter((token) => token.length >= 2);
}

function overlapScore(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((token) => { if (right.has(token)) common += 1; });
  return common / Math.max(left.size, right.size);
}

function candidateScore(stock: StockGroup, car: WebsiteCarData) {
  const stockYear = normalizeArabic(stock.modelYear);
  const carYear = normalizeArabic(car.year);
  if (stockYear && carYear && stockYear !== carYear) return -1000;

  const stockCar = normalizeArabic(stock.carName);
  const stockStatement = normalizeArabic(stock.statement);
  const title = normalizeArabic(car.title);
  const model = normalizeArabic(car.model);
  const trim = normalizeArabic(car.trim);

  let score = 0;
  if (stockYear && carYear && stockYear === carYear) score += 35;
  if (stockCar && model && stockCar === model) score += 50;
  else if (stockCar && (title.includes(stockCar) || (model && stockCar.includes(model)))) score += 34;
  else score += Math.round(overlapScore(stock.carName, `${car.model} ${car.title}`) * 28);

  if (stockStatement && trim && stockStatement === trim) score += 40;
  else if (stockStatement && title.includes(stockStatement)) score += 30;
  else score += Math.round(overlapScore(stock.statement, `${car.trim} ${car.title}`) * 24);

  return score;
}

export function matchWebsiteCar(stock: StockGroup, cars: WebsiteCarData[]) {
  const scored = cars
    .map((car) => ({ car, score: candidateScore(stock, car) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.car.postId - b.car.postId);

  const best = scored[0];
  if (!best || best.score < 52) return null;
  const second = scored[1];
  if (second && second.score === best.score && second.car.postId !== best.car.postId) return null;
  return best.car;
}

function goodValue(value: unknown) {
  const text = clean(value);
  if (!text || ["—", "-", "0", "لا يوجد", "غير متوفر", "n/a"].includes(text.toLowerCase())) return "";
  return text;
}

function uniqueFeatures(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((raw) => {
    const value = goodValue(raw);
    const key = normalizeArabic(value);
    if (!value || !key || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 }).format(value);
}

const BASE_SPEC_ORDER = [
  ["سعة المحرك", "المحرك"],
  ["ناقل الحركة", "نوع الناقل"],
  ["عدد السرعات", "عدد السرعات"],
  ["الدفع", "الدفع"],
  ["نوع الوقود", "نوع الوقود"],
  ["استهلاك الوقود", "استهلاك الوقود"],
  ["الحصان", "الحصان الميكانيكي"],
  ["عزم الدوران", "عزم نيوتن"],
  ["عدد السلندرات", "عدد السلندرات"],
  ["عدد المقاعد", "عدد المقاعد"],
  ["الضمان", "الضمان"],
] as const;

function buildBaseSpecLines(car: WebsiteCarData) {
  const fallbacks: Record<string, string> = {
    "المحرك": car.engine,
    "نوع الناقل": car.transmission,
    "الدفع": car.drivetrain,
    "نوع الوقود": car.fuel,
  };
  return BASE_SPEC_ORDER.flatMap(([label, key]) => {
    const value = goodValue(car.baseSpecs?.[key] || fallbacks[key]);
    return value ? [`${label}: ${value}`] : [];
  });
}

function buildInstallmentTitle(stock: StockGroup) {
  const car = [goodValue(stock.carName), goodValue(stock.modelYear)].filter(Boolean).join(" ").replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
  return `${car} | أقوى عروض التمويل | بدون دفعة | أطول فترة سداد | أقل قسط شهري بالتأمين الشامل`;
}

function categoryBlock(title: string, values: string[], maxItems = 12) {
  const items = uniqueFeatures(values).slice(0, maxItems);
  if (!items.length) return "";
  return `${title}:\n${items.map((item) => `• ${item}`).join("\n")}`;
}

export function getCompareKeyState(car: WebsiteCarData | null) {
  if (!car) return { status: "missing" as SpecsStatus, issue: "لم يتم العثور على سيارة مطابقة مؤكدة في الموقع." };
  if (!goodValue(car.compareKey)) return { status: "missing" as SpecsStatus, issue: "CompareKey ناقص في سيارة الموقع." };
  if (!car.compareKeyFound || car.compareKeyStatus !== "found") {
    return { status: "missing" as SpecsStatus, issue: `CompareKey (${car.compareKey}) غير موجود داخل شيت المواصفات.` };
  }

  const missingSections: string[] = [];
  if (!uniqueFeatures(car.interiorSpecs).length) missingSections.push("المواصفات الداخلية");
  if (!uniqueFeatures(car.exteriorSpecs).length) missingSections.push("المواصفات الخارجية");
  if (!uniqueFeatures(car.safetySpecs).length) missingSections.push("مواصفات الأمان");
  if (missingSections.length) {
    return {
      status: "partial" as SpecsStatus,
      issue: `CompareKey مرتبط، لكن ناقص: ${missingSections.join("، ")}.`,
    };
  }
  return { status: "matched" as SpecsStatus, issue: "" };
}

const RULE = "ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ";
const CLOSING = [
  RULE, "* (مواعيد العمل) *", "________________________",
  "9:00 صباحا : 9:00 مساءا", "________________________", 
  "برجاء مراعاة أوقات الاتصال أثناء أوقات الدوام فقط.",
  "ملحوظة: الإعلان اليومي يلغي أي عرض إعلاني سابق.", RULE,
  "***(وصلى الله على نبينا محمد وعلى آله وصحبه أجمعين)***",
];

function contactSection(contacts: AgentContactSnapshot[], assignedName?: string, assignedPhone?: string) {
  const current = contacts.find((row) => clean(row.name) === clean(assignedName)) || contacts[0];
  const name = clean(assignedName) || clean(current?.name);
  const phone = clean(assignedPhone) || clean(current?.phone);
  const result = ["للتواصل:", RULE];
  if (name || phone) result.push(`${name} ـــــــــــــــ ${phone}`, RULE);
  const groups = new Map<string, AgentContactSnapshot[]>();
  contacts.forEach((contact) => {
    const branch = clean(contact.branchName) || "المناديب";
    if (!groups.has(branch)) groups.set(branch, []);
    if (!groups.get(branch)!.some((existing) => existing.agentId === contact.agentId && existing.name === contact.name)) {
      groups.get(branch)!.push(contact);
    }
  });
  groups.forEach((agents, branch) => {
    result.push(`(${branch})`);
    agents.forEach((agent) => result.push(`${clean(agent.name)} ـــــــــــــــ ${clean(agent.phone)}`));
    result.push(RULE);
  });
  return result;
}

function makeAdCopy(entries: Array<{ stock: StockGroup; websiteCar: WebsiteCarData | null }>, contacts: AgentContactSnapshot[], assignedName?: string, assignedPhone?: string) {
  const carName = goodValue(entries[0].stock.carName);
  const years = [...new Set(entries.map(({ stock }) => goodValue(stock.modelYear)).filter(Boolean))].sort();
  const title = `${carName} ${years.join(" / ")}`.trim();
  const featureSets = entries.map(({ websiteCar }) => websiteCar ? uniqueFeatures([
    ...buildBaseSpecLines(websiteCar), ...websiteCar.interiorSpecs,
    ...websiteCar.exteriorSpecs, ...websiteCar.safetySpecs,
  ]) : []);
  const commonFeatures = featureSets.length && featureSets.every((set) => set.length)
    ? featureSets[0].filter((feature) => featureSets.every((set) => set.some((other) => normalizeArabic(other) === normalizeArabic(feature)))) : [];
  const commonKeys = new Set(commonFeatures.map(normalizeArabic));
  const lines = [title, "", ...commonFeatures.map((feature) => `* ${feature}`)];
  entries.forEach(({ stock }, index) => {
    const extra = featureSets[index].filter((feature) => !commonKeys.has(normalizeArabic(feature)));
    if (extra.length) {
      lines.push("", `مواصفات ${[stock.statement, stock.modelYear].filter(Boolean).join(" - ")}:`, ...extra.map((feature) => `* ${feature}`));
    }
  });
  lines.push("", RULE);
  entries.forEach(({ stock, websiteCar }) => {
    const price = formatPrice(Number(websiteCar?.price || 0));
    const variantName = [goodValue(stock.statement), goodValue(stock.modelYear)].filter(Boolean).join(" - ");
    lines.push(`${variantName} ................. ( ${price || "السعر غير متوفر"}${price ? " ريال" : ""} )`);
  });
  lines.push("السعر شامل ضريبة القيمة المضافة", RULE, ...contactSection(contacts, assignedName, assignedPhone), ...CLOSING);
  const issues = entries.flatMap(({ stock, websiteCar }) => {
    const state = getCompareKeyState(websiteCar);
    return state.issue ? [`${stock.statement} ${stock.modelYear}: ${state.issue}`] : [];
  });
  const statuses = entries.map(({ websiteCar }) => getCompareKeyState(websiteCar).status);
  const specsStatus: SpecsStatus = statuses.includes("missing") ? "missing" : statuses.includes("partial") ? "partial" : "matched";
  const first = entries[0].websiteCar;
  const prices = entries.map(({ websiteCar }) => Number(websiteCar?.price || 0)).filter((v) => v > 0);
  return {
    adTitle: title,
    adText: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    specsStatus,
    specsIssue: issues.join(" | "),
    websitePostId: first?.postId,
    websiteVehicleId: first?.vehicleId || "",
    websiteCompareKey: first?.compareKey || "",
    websiteCompareKeyStatus: first?.compareKeyStatus || "unavailable",
    websiteCompareKeyFound: Boolean(first?.compareKeyFound),
    websiteInteriorSpecsCount: entries.reduce((n, x) => n + uniqueFeatures(x.websiteCar?.interiorSpecs || []).length, 0),
    websiteExteriorSpecsCount: entries.reduce((n, x) => n + uniqueFeatures(x.websiteCar?.exteriorSpecs || []).length, 0),
    websiteSafetySpecsCount: entries.reduce((n, x) => n + uniqueFeatures(x.websiteCar?.safetySpecs || []).length, 0),
    websitePermalink: first?.permalink || "",
    websitePrice: prices.length ? Math.min(...prices) : 0,
  };
}

export function buildAdCopy(stock: StockGroup, websiteCar: WebsiteCarData | null, settings: PublishingSettings,
  advertiserName?: string, agentName?: string, agentPhone?: string, agentType: AgentType = "cash", contactAgents?: AgentContactSnapshot[]) {
  void settings; void advertiserName; void agentType;
  const contacts = contactAgents?.length ? contactAgents : [{ agentId: "", name: clean(agentName), phone: clean(agentPhone) }];
  return makeAdCopy([{ stock, websiteCar }], contacts, agentName, agentPhone);
}

function buildCombinedAdCopy(entries: Array<{ stock: StockGroup; websiteCar: WebsiteCarData | null }>,
  agentType: AgentType, contactAgents: AgentContactSnapshot[] = [], assignedName?: string, assignedPhone?: string) {
  void agentType;
  return makeAdCopy(entries, contactAgents, assignedName, assignedPhone);
}

export function enrichAssignmentsWithAdCopy<T extends Omit<HarajAd, "id">>(
  assignments: T[],
  stock: StockGroup[],
  websiteCars: WebsiteCarData[],
  settings: PublishingSettings,
) {
  const stockByKey = new Map(stock.map((row) => [row.key, row]));
  return assignments.map((assignment) => {
    if (assignment.vehicleVariants && assignment.vehicleVariants.length > 1) {
      const entries = assignment.vehicleVariants.map((variant) => {
        const row = stockByKey.get(variant.vehicleKey) || {
          key: variant.vehicleKey,
          carName: assignment.carName,
          statement: variant.statement,
          modelYear: variant.modelYear || assignment.modelYear,
          statusName: "متاح للبيع",
          quantity: variant.stockQtySnapshot,
        };
        return { stock: row, websiteCar: matchWebsiteCar(row, websiteCars) };
      });
      return {
        ...assignment,
        ...buildCombinedAdCopy(entries, assignment.agentTypeSnapshot || "cash", getAdContactSnapshots(assignment), assignment.agentNameSnapshot, assignment.agentPhoneSnapshot),
        vehicleVariants: entries.map(({ stock: row, websiteCar }) => ({
          vehicleKey: row.key,
          statement: row.statement,
          modelYear: row.modelYear,
          stockQtySnapshot: row.quantity,
          websitePrice: websiteCar?.price || 0,
          websitePostId: websiteCar?.postId || 0,
          websiteCompareKey: websiteCar?.compareKey || "",
        })),
      };
    }
    const row = stockByKey.get(assignment.vehicleKey) || {
      key: assignment.vehicleKey,
      carName: assignment.carName,
      statement: assignment.statement,
      modelYear: assignment.modelYear,
      statusName: "متاح للبيع",
      quantity: assignment.stockQtySnapshot,
    };
    const websiteCar = matchWebsiteCar(row, websiteCars);
    return {
      ...assignment,
      ...buildAdCopy(
        row,
        websiteCar,
        settings,
        assignment.advertiserName,
        assignment.agentNameSnapshot,
        assignment.agentPhoneSnapshot,
        assignment.agentTypeSnapshot || "cash",
        getAdContactSnapshots(assignment),
      ),
    };
  });
}
