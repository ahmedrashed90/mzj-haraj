import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchStock, fetchWebsiteCars, subscribeAccounts, subscribeAds, subscribeAgents, subscribePublishingPeriods, subscribePublishingSettings } from "./data";
import type { Agent, HarajAccount, HarajAd, PublishingPeriod, PublishingSettings, StockGroup, WebsiteCarData } from "./types";

type AppDataState = {
  accounts: HarajAccount[];
  agents: Agent[];
  ads: HarajAd[];
  publishingSettings: PublishingSettings;
  publishingPeriods: PublishingPeriod[];
  stock: StockGroup[];
  stockTotalVehicles: number;
  stockExcludedAgencyVehicles: number;
  stockFetchedAt: string;
  stockLoading: boolean;
  stockError: string;
  websiteCars: WebsiteCarData[];
  websiteCarsFetchedAt: string;
  websiteCarsLoading: boolean;
  websiteCarsError: string;
  dataError: string;
  refreshStock: () => Promise<void>;
  refreshWebsiteCars: () => Promise<void>;
};
const Context = createContext<AppDataState | null>(null);
const EMPTY_SETTINGS: PublishingSettings = { accountName: "", dailyLimit: 0 };

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<HarajAccount[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ads, setAds] = useState<HarajAd[]>([]);
  const [publishingSettings, setPublishingSettings] = useState<PublishingSettings>(EMPTY_SETTINGS);
  const [publishingPeriods, setPublishingPeriods] = useState<PublishingPeriod[]>([]);
  const [stock, setStock] = useState<StockGroup[]>([]);
  const [stockTotalVehicles, setStockTotalVehicles] = useState(0);
  const [stockExcludedAgencyVehicles, setStockExcludedAgencyVehicles] = useState(0);
  const [stockFetchedAt, setStockFetchedAt] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [websiteCars, setWebsiteCars] = useState<WebsiteCarData[]>([]);
  const [websiteCarsFetchedAt, setWebsiteCarsFetchedAt] = useState("");
  const [websiteCarsLoading, setWebsiteCarsLoading] = useState(false);
  const [websiteCarsError, setWebsiteCarsError] = useState("");
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    const onError = (error: Error) => setDataError(error.message || "تعذر قراءة بيانات Firebase");
    const unsubAccounts = subscribeAccounts(setAccounts, onError);
    const unsubAgents = subscribeAgents(setAgents, onError);
    const unsubAds = subscribeAds(setAds, onError);
    const unsubSettings = subscribePublishingSettings(setPublishingSettings, onError);
    const unsubPeriods = subscribePublishingPeriods(setPublishingPeriods, onError);
    return () => { unsubAccounts(); unsubAgents(); unsubAds(); unsubSettings(); unsubPeriods(); };
  }, []);

  async function refreshStock() {
    setStockLoading(true); setStockError("");
    try {
      const payload = await fetchStock();
      setStock(payload.rows || []); setStockTotalVehicles(payload.totalVehicles || 0); setStockExcludedAgencyVehicles(payload.excludedAgencyVehicles || 0); setStockFetchedAt(payload.fetchedAt || new Date().toISOString());
    } catch (error) {
      setStockError(error instanceof Error ? error.message : "تعذر قراءة الاستوك");
    } finally { setStockLoading(false); }
  }
  async function refreshWebsiteCars() {
    setWebsiteCarsLoading(true); setWebsiteCarsError("");
    try {
      const payload = await fetchWebsiteCars();
      setWebsiteCars(payload.items || []); setWebsiteCarsFetchedAt(payload.fetchedAt || new Date().toISOString());
    } catch (error) {
      setWebsiteCarsError(error instanceof Error ? error.message : "تعذر قراءة مواصفات الموقع");
    } finally { setWebsiteCarsLoading(false); }
  }
  useEffect(() => { void refreshStock(); void refreshWebsiteCars(); }, []);

  const value = useMemo(() => ({
    accounts, agents, ads, publishingSettings, publishingPeriods,
    stock, stockTotalVehicles, stockExcludedAgencyVehicles, stockFetchedAt, stockLoading, stockError,
    websiteCars, websiteCarsFetchedAt, websiteCarsLoading, websiteCarsError,
    dataError, refreshStock, refreshWebsiteCars,
  }), [accounts, agents, ads, publishingSettings, publishingPeriods, stock, stockTotalVehicles, stockExcludedAgencyVehicles, stockFetchedAt, stockLoading, stockError, websiteCars, websiteCarsFetchedAt, websiteCarsLoading, websiteCarsError, dataError]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppData() { const value = useContext(Context); if (!value) throw new Error("AppDataProvider is missing"); return value; }
