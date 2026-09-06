export type HarajAccount = {
  id: string;
  name: string;
  adLimit: number;
  note?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Agent = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  // Legacy fields are kept optional so old Firestore records remain readable.
  accountId?: string;
  adLimit?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type AdStatus = "assigned" | "published" | "approved" | "needs_fix" | "closed";

export type HarajAd = {
  id: string;
  vehicleKey: string;
  carName: string;
  statement: string;
  modelYear: string;
  stockQtySnapshot: number;
  accountId: string;
  agentId: string;
  status: AdStatus;
  url?: string;
  notes?: string;
  weekStart?: string;
  scheduledDate?: string;
  coverageCycle?: number;
  planId?: string;
  scheduleOrder?: number;
  assignedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
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
