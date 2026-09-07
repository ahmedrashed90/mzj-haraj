import { useState, type FormEvent } from "react";
import { LockKey, SignIn } from "@phosphor-icons/react";
import { useAuth } from "../AuthContext";
import { ADMIN_EMAIL } from "../firebase";
import logo from "../assets/mzj-logo.png";

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try { await login(ADMIN_EMAIL, password); }
    catch { setError("كلمة المرور غير صحيحة أو الحساب غير مفعّل."); }
    finally { setLoading(false); }
  }
  return <div className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><img src={logo} alt="MZJ" /></div>
      <div className="login-lock"><LockKey size={28} weight="duotone" /></div>
      <h1>تسجيل الدخول</h1><p>إدارة إعلانات حراج - دخول المدير فقط</p>
      {error ? <div className="alert error">{error}</div> : null}
      <label>البريد الإلكتروني<input type="email" value={ADMIN_EMAIL} readOnly /></label>
      <label>كلمة المرور<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus /></label>
      <button className="primary-button full" disabled={loading}><SignIn size={20} />{loading ? "جارٍ الدخول..." : "دخول المنصة"}</button>
    </form>
  </div>;
}
