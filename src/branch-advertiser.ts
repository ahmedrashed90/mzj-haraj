import type { HarajAccount } from "./types";

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

const DEFAULT_NAMES = new Map<string, string>([
  [normalize("الملتقى"), "شركة الملتقى للسيارات"],
  [normalize("الصالة"), "معرض محمد ذعار العجمي للسيارات"],
  [normalize("القادسية"), "معرض محمد العجمى للسيارات"],
]);

export function defaultBranchAdvertiserName(branchName: string) {
  return DEFAULT_NAMES.get(normalize(branchName)) || String(branchName || "").trim();
}

export function getBranchAdvertiserName(branch: HarajAccount | null | undefined, fallback = "") {
  const saved = String(branch?.advertiserName || "").trim();
  if (saved) return saved;
  const seeded = defaultBranchAdvertiserName(String(branch?.name || ""));
  return seeded || String(fallback || "").trim();
}
