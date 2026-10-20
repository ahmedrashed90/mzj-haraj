import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { ADMIN_EMAIL, auth, db } from "./firebase";
import type { OpenSooqBranchId } from "./types";

export type UserRole = "admin" | "branch_manager" | null;
type AuthState = {
  user: User | null;
  role: UserRole;
  branchId: OpenSooqBranchId | null;
  managerName: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<AuthState | null>(null);
const SETTINGS_REF = doc(db, "settings", "opensooq_publishing");
const emailKey = (value: unknown) => String(value || "").trim().toLowerCase();
function isAdmin(user: User | null) { return emailKey(user?.email) === ADMIN_EMAIL.toLowerCase(); }

function managerAccess(data: Record<string, unknown> | undefined, email: string): { branchId: OpenSooqBranchId; name: string } | null {
  const managers = data?.branchManagers as Record<string, { name?: string; email?: string }> | undefined;
  for (const branchId of ["showroom", "qadisiyah"] as const) {
    const manager = managers?.[branchId];
    if (manager?.email && emailKey(manager.email) === emailKey(email)) {
      return { branchId, name: String(manager.name || (branchId === "showroom" ? "مدير الصالة" : "مدير القادسية")) };
    }
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [branchId, setBranchId] = useState<OpenSooqBranchId | null>(null);
  const [managerName, setManagerName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeManager: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (next) => {
      unsubscribeManager?.(); unsubscribeManager = undefined;
      setUser(null); setRole(null); setBranchId(null); setManagerName("");
      if (!next) { setLoading(false); return; }
      if (isAdmin(next)) { setUser(next); setRole("admin"); setLoading(false); return; }
      setLoading(true);
      // The settings listener also revokes a manager's session if the admin removes the assignment.
      unsubscribeManager = onSnapshot(SETTINGS_REF, (snap) => {
        const access = managerAccess(snap.data(), next.email || "");
        if (!access) { void signOut(auth); return; }
        setUser(next); setRole("branch_manager"); setBranchId(access.branchId);
        setManagerName(access.name); setLoading(false);
      }, () => { void signOut(auth); });
    }, () => { setLoading(false); });
    return () => { unsubscribeManager?.(); unsubscribeAuth(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    user, role, branchId, managerName, loading,
    login: async (email, password) => {
      const normalizedEmail = emailKey(email);
      if (!normalizedEmail) throw new Error("اكتب البريد الإلكتروني.");
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      if (isAdmin(result.user)) return;
      try {
        const snap = await getDoc(SETTINGS_REF);
        if (!managerAccess(snap.data(), normalizedEmail)) throw new Error("NOT_ASSIGNED");
      } catch {
        await signOut(auth);
        throw new Error("الحساب غير مخصص لإدارة السوق المفتوح أو لم تُفعّل صلاحياته بعد.");
      }
    },
    logout: async () => { await signOut(auth); },
  }), [user, role, branchId, managerName, loading]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
