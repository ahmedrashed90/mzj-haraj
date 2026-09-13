export type HarajAccount = {
  id: string;
  /** Branch name. The collection name is kept for backward compatibility. */
  name: string;
  /** Legacy field. No longer used as publishing capacity in v1.7.0. */
  adLimit: number;
  note?: string;
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
  /** Branch record id. All active reps still share the same Haraj publishing account. */
  accountId?: string;
  branchName?: string;
  adLimit?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdStatus = "assigned" | "published" | "approved" | "needs_fix" | "closed";
export type SpecsStatus = "matched" | "partial" | "missing";

export type HarajAd = {
  id: string;
  vehicleKey: string;
  carName: string;
  statement: string;
  modelYear: string;
  stockQtySnapshot: number;
  /** Legacy branch link retained for old records. */
  accountId?: string;
  /** Canonical branch link for new records. */
  branchId?: string;
  agentId: string;
  harajAccountName?: string;
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

  /** Frozen copy prepared for the rep at assignment time. */
  adTitle?: string;
  adText?: string;
  specsStatus?: SpecsStatus;
  websitePostId?: number;
  websiteVehicleId?: string;
  websiteCompareKey?: string;
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
  permalink: string;
  baseSpecs: Record<string, string>;
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
