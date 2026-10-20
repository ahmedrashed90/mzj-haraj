import { useState, type FormEvent } from "react";
import { LockKey, SignIn } from "@phosphor-icons/react";
import { useAuth } from "../AuthContext";
import { ADMIN_EMAIL } from "../firebase";
import logo from "../assets/mzj-logo.png";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try { await login(email, password); }
    catch (e) { setError(e instanceof Error && e.message.includes("غير مخصص") ? e.message : "تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور وصلاحيات الحساب."); }
    finally { setLoading(false); }
  }
  return <div className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><img src={logo} alt="MZJ" /></div>
      <div className="login-lock"><LockKey size={28} weight="duotone" /></div>
      <h1>تسجيل الدخول</h1><p>إدارة إعلانات حراج والسوق المفتوح</p>
      {error ? <div className="alert error">{error}</div> : null}
      <label>البريد الإلكتروني<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
      <label>كلمة المرور<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus /></label>
      <button className="primary-button full" disabled={loading}><SignIn size={20} />{loading ? "جارٍ الدخول..." : "دخول المنصة"}</button>
    </form>
  </div>;
}
