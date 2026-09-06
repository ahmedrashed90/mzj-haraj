import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AppDataProvider } from "./AppDataContext";
import { Layout } from "./components/Layout";
import { AccountsPage } from "./pages/AccountsPage";
import { AdsPage } from "./pages/AdsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DistributionPage } from "./pages/DistributionPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot-screen"><div className="boot-mark">MZJ</div><span>جارٍ تحميل النظام...</span></div>;
  if (!user) return <LoginPage />;
  return <AppDataProvider><Routes><Route element={<Layout />}><Route index element={<DashboardPage />} /><Route path="inventory" element={<InventoryPage />} /><Route path="ads" element={<AdsPage />} /><Route path="distribution" element={<DistributionPage />} /><Route path="accounts" element={<AccountsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes></AppDataProvider>;
}
