export type HarajAccount = {
  id: string;
  /** Internal branch. The Firestore collection name is retained for compatibility. */
  name: string;
  /** Legacy field only; publishing capacity comes from settings/haraj_publishing. */
  adLimit: number;
  note?: string;
  /** Name written inside the generated Haraj ad for this branch. */
  advertiserName?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type PublishingSettings = {
  accountName: string;
  dailyLimit: number;
  updatedAt?: string;
};

export type Agent = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  /** Internal branch id. Daily publishing is split by branch, then by its reps. */
  accountId?: string;
  branchName?: string;
  adLimit?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdStatus = "assigned" | "published" | "approved" | "needs_fix" | "closed";
export type SpecsStatus = "matched" | "partial" | "missing";
export type CompareKeyStatus = "found" | "missing_key" | "not_found" | "unavailable";

export type HarajAd = {
  id: string;
  vehicleKey: string;
  carName: string;
  statement: string;
  modelYear: string;
  stockQtySnapshot: number;
  /** Internal branch link retained in both fields for old records. */
  accountId?: string;
  branchId?: string;
  agentId: string;
  /** Frozen rep identity used in the prepared Haraj ad. */
  agentNameSnapshot?: string;
  agentPhoneSnapshot?: string;
  /** Actual Haraj account used for publishing/capacity. */
  harajAccountName?: string;
  /** Branch-specific showroom/company name written inside the ad copy. */
  advertiserName?: string;
  status: AdStatus;
  url?: string;
  notes?: string;
  weekStart?: string;
  planStart?: string;
  planEnd?: string;
  scheduledDate?: string;
  coverageCycle?: number;
  planId?: string;
  scheduleOrder?: number;
  assignedAt?: string;
  publishedAt?: string;
  updatedAt?: string;

  /** Frozen ad-copy snapshot prepared at assignment time. */
  adTitle?: string;
  adText?: string;
  specsStatus?: SpecsStatus;
  specsIssue?: string;
  websitePostId?: number;
  websiteVehicleId?: string;
  websiteCompareKey?: string;
  websiteCompareKeyStatus?: CompareKeyStatus;
  websiteCompareKeyFound?: boolean;
  websiteInteriorSpecsCount?: number;
  websiteExteriorSpecsCount?: number;
  websiteSafetySpecsCount?: number;
  websitePermalink?: string;
  websitePrice?: number;
};

export type StockGroup = {
  key: string;
  carName: string;
  statement: string;
  modelYear: string;
  statusName: string;
  quantity: number;
};

export type StockResponse = {
  ok: boolean;
  rows: StockGroup[];
  totalVehicles: number;
  totalGroups: number;
  excludedAgencyVehicles?: number;
  fetchedAt: string;
  source: string;
  error?: string;
};

export type WebsiteCarData = {
  postId: number;
  vehicleId: string;
  title: string;
  price: number;
  make: string;
  model: string;
  trim: string;
  year: string;
  body: string;
  transmission: string;
  drivetrain: string;
  engine: string;
  fuel: string;
  compareKey: string;
  compareKeyStatus: CompareKeyStatus;
  compareKeyFound: boolean;
  permalink: string;
  baseSpecs: Record<string, string>;
  /** These three arrays come only from the CompareKey specification row. */
  interiorSpecs: string[];
  exteriorSpecs: string[];
  safetySpecs: string[];
};

export type WebsiteCarsResponse = {
  ok: boolean;
  items: WebsiteCarData[];
  fetchedAt: string;
  source: string;
  error?: string;
};

export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  assigned: "مجدول",
  published: "تم النشر",
  approved: "معتمد",
  needs_fix: "يحتاج تعديل",
  closed: "منتهي",
};
