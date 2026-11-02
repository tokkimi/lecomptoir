import Link from "next/link";
import { formatPct } from "@/lib/money";

export function PageHead({ title, sub, crumbs, children }: { title: string; sub?: React.ReactNode; crumbs?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="acts">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, delta, note }: { label: string; value: string; delta?: number | null; note?: string }) {
  return (
    <div className="card kpi">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      <span className="d">
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span className={"delta " + (delta >= 0 ? "up" : "down")}>{delta >= 0 ? "▲" : "▼"} {formatPct(delta)}</span>
        )}
        {note && <> {note}</>}
      </span>
    </div>
  );
}

export const ratio = (cur: number, prev: number) => (prev ? (cur - prev) / prev : null);

export function Seg({ options, current, hrefFor }: { options: { key: string; label: string }[]; current: string; hrefFor: (k: string) => string }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => <Link key={o.key} href={hrefFor(o.key)} aria-current={o.key === current ? "true" : undefined}>{o.label}</Link>)}
    </div>
  );
}

export function Pager({ page, pages, total, hrefFor, unit = "résultats" }: { page: number; pages: number; total: number; hrefFor: (p: number) => string; unit?: string }) {
  return (
    <div className="pager">
      <span>{total.toLocaleString("fr-FR")} {unit} · page {page} / {Math.max(1, pages)}</span>
      <span style={{ display: "flex", gap: 8 }}>
        {page > 1 ? <Link className="btn btn-line btn-sm" href={hrefFor(page - 1)}>← Précédent</Link> : null}
        {page < pages ? <Link className="btn btn-line btn-sm" href={hrefFor(page + 1)}>Suivant →</Link> : null}
      </span>
    </div>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="alert err" role="alert" style={{ marginBottom: 14 }}>{err}</div>;
  if (ok) return <div className="alert ok" role="status" style={{ marginBottom: 14 }}>{ok}</div>;
  return null;
}

const dt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
const d = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
export const fmtDateTime = (x: Date | string | null | undefined) => (x ? dt.format(new Date(x)) : "—");
export const fmtDate = (x: Date | string | null | undefined) => (x ? d.format(new Date(x)) : "—");
export function ago(x: Date | null | undefined) {
  if (!x) return "jamais";
  const days = Math.floor((Date.now() - new Date(x).getTime()) / 864e5);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 60) return `il y a ${days} j`;
  return `il y a ${Math.round(days / 30)} mois`;
}

export const CHANNEL_LABEL: Record<string, string> = { comptoir: "Comptoir", click_collect: "Click & collect", livraison: "Livraison", evenement: "Événement" };
export const BADGE_TONE: Record<string, string> = { vip: "gold", fideles: "blue", nouveaux: "good", a_risque: "warn", perdus: "bad", prospect: "", regulier: "" };
