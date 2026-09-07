import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchStock, subscribeAccounts, subscribeAds, subscribeAgents } from "./data";
import type { Agent, HarajAccount, HarajAd, StockGroup } from "./types";

type AppDataState = {
  accounts: HarajAccount[];
  agents: Agent[];
  ads: HarajAd[];
  stock: StockGroup[];
  stockTotalVehicles: number;
  stockFetchedAt: string;
  stockLoading: boolean;
  stockError: string;
  dataError: string;
  refreshStock: () => Promise<void>;
};

const Context = createContext<AppDataState | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<HarajAccount[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ads, setAds] = useState<HarajAd[]>([]);
  const [stock, setStock] = useState<StockGroup[]>([]);
  const [stockTotalVehicles, setStockTotalVehicles] = useState(0);
  const [stockFetchedAt, setStockFetchedAt] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    const onError = (error: Error) => setDataError(error.message || "تعذر قراءة بيانات Firebase");
    const unsubAccounts = subscribeAccounts(setAccounts, onError);
    const unsubAgents = subscribeAgents(setAgents, onError);
    const unsubAds = subscribeAds(setAds, onError);
    return () => { unsubAccounts(); unsubAgents(); unsubAds(); };
  }, []);

  async function refreshStock() {
    setStockLoading(true);
    setStockError("");
    try {
      const payload = await fetchStock();
      setStock(payload.rows || []);
      setStockTotalVehicles(payload.totalVehicles || 0);
      setStockFetchedAt(payload.fetchedAt || new Date().toISOString());
    } catch (error) {
      setStockError(error instanceof Error ? error.message : "تعذر قراءة الاستوك");
      setStock([]);
      setStockTotalVehicles(0);
    } finally {
      setStockLoading(false);
    }
  }

  useEffect(() => { void refreshStock(); }, []);

  const value = useMemo(() => ({
    accounts,
    agents,
    ads,
    stock,
    stockTotalVehicles,
    stockFetchedAt,
    stockLoading,
    stockError,
    dataError,
    refreshStock,
  }), [accounts, agents, ads, stock, stockTotalVehicles, stockFetchedAt, stockLoading, stockError, dataError]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppData() {
  const value = useContext(Context);
  if (!value) throw new Error("AppDataProvider is missing");
  return value;
}
