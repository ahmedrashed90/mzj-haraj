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
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { OpenSooqPage } from "./pages/OpenSooqPage";
import { OpenSooqManagerPage } from "./pages/OpenSooqManagerPage";

export default function App() {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="boot-screen"><div className="boot-mark">MZJ</div><span>جارٍ تحميل النظام...</span></div>;
  if (!user || !role) return <LoginPage />;
  if (role === "branch_manager") return <Routes><Route element={<Layout />}>
    <Route path="opensooq" element={<OpenSooqManagerPage />} />
    <Route path="*" element={<Navigate to="/opensooq" replace />} />
  </Route></Routes>;
  return <AppDataProvider><Routes><Route element={<Layout />}>
    <Route index element={<DashboardPage />} />
    <Route path="inventory" element={<InventoryPage />} />
    <Route path="schedule" element={<SchedulePage />} />
    <Route path="ads" element={<AdsPage />} />
    <Route path="distribution" element={<DistributionPage />} />
    <Route path="accounts" element={<AccountsPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="opensooq" element={<OpenSooqPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></AppDataProvider>;
}
