import type { HarajAd, PublishingSettings, SpecsStatus, StockGroup, WebsiteCarData } from "./types";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function categoryBlock(title: string, values: string[], maxItems = 12) {
  const items = uniqueFeatures(values).slice(0, maxItems);
  if (!items.length) return "";
  return `${title}:\n${items.map((item) => `• ${item}`).join("\n")}`;
}

function compareKeyStatus(car: WebsiteCarData | null) {
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

export function buildAdCopy(stock: StockGroup, websiteCar: WebsiteCarData | null, settings: PublishingSettings) {
  const accountName = clean(settings.accountName) || "حساب حراج";
  const title = goodValue(websiteCar?.title) || [stock.carName, stock.statement, stock.modelYear].filter(goodValue).join(" - ");
  const lines: string[] = [title, "", `متوفرة الآن لدى ${accountName}.`];

  if (websiteCar) {
    const price = formatPrice(websiteCar.price);
    if (price) lines.push("", `السعر: ${price} ريال`);
    if (goodValue(stock.modelYear)) lines.push(`الموديل: ${stock.modelYear}`);
    if (goodValue(websiteCar.trim || stock.statement)) lines.push(`الفئة: ${goodValue(websiteCar.trim || stock.statement)}`);

    const baseSpecs = buildBaseSpecLines(websiteCar);
    if (baseSpecs.length) lines.push("", "المواصفات الرئيسية:", ...baseSpecs.map((item) => `• ${item}`));

    // The three feature sections below are intentionally sourced only from the
    // CompareKey row returned by the WordPress bridge.
    const blocks = [
      categoryBlock("المواصفات الداخلية", websiteCar.interiorSpecs),
      categoryBlock("المواصفات الخارجية", websiteCar.exteriorSpecs),
      categoryBlock("مواصفات الأمان", websiteCar.safetySpecs),
    ].filter(Boolean);
    if (blocks.length) lines.push("", ...blocks.flatMap((block, index) => index ? ["", block] : [block]));
  } else {
    if (goodValue(stock.modelYear)) lines.push("", `الموديل: ${stock.modelYear}`);
    if (goodValue(stock.statement)) lines.push(`الفئة: ${stock.statement}`);
  }

  const specState = compareKeyStatus(websiteCar);
  return {
    adTitle: title,
    adText: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    specsStatus: specState.status,
    specsIssue: specState.issue,
    websitePostId: websiteCar?.postId,
    websiteVehicleId: websiteCar?.vehicleId || "",
    websiteCompareKey: websiteCar?.compareKey || "",
    websiteCompareKeyStatus: websiteCar?.compareKeyStatus || "unavailable",
    websiteCompareKeyFound: Boolean(websiteCar?.compareKeyFound),
    websiteInteriorSpecsCount: websiteCar ? uniqueFeatures(websiteCar.interiorSpecs).length : 0,
    websiteExteriorSpecsCount: websiteCar ? uniqueFeatures(websiteCar.exteriorSpecs).length : 0,
    websiteSafetySpecsCount: websiteCar ? uniqueFeatures(websiteCar.safetySpecs).length : 0,
    websitePermalink: websiteCar?.permalink || "",
    websitePrice: websiteCar?.price || 0,
  };
}

export function enrichAssignmentsWithAdCopy<T extends Omit<HarajAd, "id">>(
  assignments: T[],
  stock: StockGroup[],
  websiteCars: WebsiteCarData[],
  settings: PublishingSettings,
) {
  const stockByKey = new Map(stock.map((row) => [row.key, row]));
  return assignments.map((assignment) => {
    const row = stockByKey.get(assignment.vehicleKey) || {
      key: assignment.vehicleKey,
      carName: assignment.carName,
      statement: assignment.statement,
      modelYear: assignment.modelYear,
      statusName: "متاح للبيع",
      quantity: assignment.stockQtySnapshot,
    };
    const websiteCar = matchWebsiteCar(row, websiteCars);
    return { ...assignment, ...buildAdCopy(row, websiteCar, settings) };
  });
}
