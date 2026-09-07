import {
  CalendarDots,
  CarProfile,
  ChartPieSlice,
  ClipboardText,
  GearSix,
  ListChecks,
  SignOut,
  UsersThree,
} from "@phosphor-icons/react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext";
import logo from "../assets/mzj-logo.png";

const APP_VERSION = "v1.6.1";

const links = [
  { to: "/", label: "لوحة التحكم", icon: ChartPieSlice },
  { to: "/inventory", label: "مخزون السيارات", icon: CarProfile },
  { to: "/schedule", label: "جدول النشر", icon: CalendarDots },
  { to: "/distribution", label: "توزيع الفروع", icon: ListChecks },
  { to: "/ads", label: "الإعلانات", icon: ClipboardText },
  { to: "/accounts", label: "الفروع والمناديب", icon: UsersThree },
  { to: "/settings", label: "الإعدادات", icon: GearSix },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo-wrap"><img src={logo} alt="MZJ" /></div>
          <div><strong>إدارة إعلانات حراج</strong><span>إدارة النشر للفروع</span></div>
        </div>

        <nav className="side-nav">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => isActive ? "active" : ""}>
              <Icon size={21} weight="duotone" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="admin-mini">
            <div className="avatar">A</div>
            <div><strong>Admin</strong><span>{user?.email || ""}</span></div>
          </div>
          <button className="logout-button" onClick={() => void logout()}><SignOut size={18} />تسجيل الخروج</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-title-line"><strong>{import.meta.env.VITE_APP_NAME || "MZJ Haraj Manager"}</strong><span className="version-pill">{APP_VERSION}</span></div>
            <span>جدولة الفروع · تغطية الاستوك · متابعة روابط الإعلانات</span>
          </div>
          <div className="topbar-badge">MZJ</div>
        </header>
        <div className="content"><Outlet /></div>
      </main>
    </div>
  );
}
