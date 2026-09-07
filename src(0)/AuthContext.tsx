import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { ADMIN_EMAIL, auth } from "./firebase";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Context = createContext<AuthState | null>(null);

function isAdmin(user: User | null) {
  return Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    if (next && !isAdmin(next)) {
      void signOut(auth).finally(() => { setUser(null); setLoading(false); });
      return;
    }
    setUser(next);
    setLoading(false);
  }), []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    login: async (email, password) => {
      if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) throw new Error("ADMIN_ONLY");
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!isAdmin(result.user)) {
        await signOut(auth);
        throw new Error("ADMIN_ONLY");
      }
    },
    logout: async () => { await signOut(auth); },
  }), [user, loading]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
