import type { ReactNode } from "react";

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>{actions ? <div className="page-actions">{actions}</div> : null}</div>;
}

export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint?: string; tone?: "default" | "good" | "warn" | "danger" | "info" }) {
  return <div className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{text}</span></div>;
}

export function Progress({ value, max }: { value: number; max: number }) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="progress-wrap"><div className="progress-line"><span>{value.toLocaleString("ar-SA-u-nu-latn")} / {max.toLocaleString("ar-SA-u-nu-latn")}</span><b>{percentage}%</b></div><div className="progress-track"><i style={{ width: `${percentage}%` }} /></div></div>;
}

export function ConfirmButton({ children, confirmText, onConfirm, className = "danger-button" }: { children: ReactNode; confirmText: string; onConfirm: () => void | Promise<void>; className?: string }) {
  return <button className={className} onClick={() => { if (window.confirm(confirmText)) void onConfirm(); }}>{children}</button>;
}
