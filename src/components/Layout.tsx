import { CalendarDots, CarProfile, ChartPieSlice, ClipboardText, GearSix, ListChecks, SignOut, UsersThree, Storefront } from "@phosphor-icons/react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { openSooqBranchName } from "../opensooq";
import logo from "../assets/mzj-logo.png";

const APP_VERSION = "v1.21.0";
const adminLinks = [
  { to: "/", label: "لوحة التحكم", icon: ChartPieSlice },
  { to: "/inventory", label: "مخزون السيارات", icon: CarProfile },
  { to: "/opensooq", label: "السوق المفتوح", icon: Storefront },
  { to: "/schedule", label: "جدول النشر", icon: CalendarDots },
  { to: "/distribution", label: "توزيع المناديب", icon: ListChecks },
  { to: "/ads", label: "الإعلانات", icon: ClipboardText },
  { to: "/accounts", label: "إعداد النشر والمناديب", icon: UsersThree },
  { to: "/settings", label: "الإعدادات", icon: GearSix },
];

export function Layout() {
  const { user, role, branchId, managerName, logout } = useAuth();
  const isManager = role === "branch_manager";
  const branchName = branchId ? openSooqBranchName(branchId) : "";
  const links = isManager ? [{ to: "/opensooq", label: "إعلانات فرعي", icon: Storefront }] : adminLinks;
  return <div className="app-shell"><aside className="sidebar">
    <div className="brand"><div className="brand-logo-wrap"><img src={logo} alt="MZJ" /></div>
      <div><strong>{isManager ? "إعلانات السوق المفتوح" : "إدارة إعلانات حراج"}</strong>
        <span>{isManager ? `فرع ${branchName} · مهام النشر` : "حساب واحد · توزيع تلقائي على المناديب"}</span></div></div>
    <nav className="side-nav">{links.map(({ to, label, icon: Icon }) =>
      <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}>
        <Icon size={21} weight="duotone" /><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="admin-mini"><div className="avatar">{isManager ? "M" : "A"}</div>
      <div><strong>{isManager ? managerName : "Admin"}</strong><span>{user?.email || ""}</span></div></div>
      <button className="logout-button" onClick={() => void logout()}><SignOut size={18} />تسجيل الخروج</button></div>
  </aside><main className="main-area"><header className="topbar"><div>
    <div className="topbar-title-line"><strong>{isManager ? `السوق المفتوح – ${branchName}` : import.meta.env.VITE_APP_NAME || "MZJ Haraj Manager"}</strong><span className="version-pill">{APP_VERSION}</span></div>
    <span>{isManager ? "عرض إعلانات فرعك فقط · متابعة النشر والأسعار" : "حساب حراج واحد · توزيع متتابع على المناديب · CompareKey للمواصفات"}</span></div>
    <div className="topbar-badge">MZJ</div></header><div className="content"><Outlet /></div></main></div>;
}
