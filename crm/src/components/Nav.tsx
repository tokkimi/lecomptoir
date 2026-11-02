"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; count?: number };
type Group = { title: string; items: Item[] };

export function Shell({ groups, side, footer, children }: { groups: Group[]; side: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <div className={"shell" + (open ? " open" : "")}>
      <aside className="side" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="brand">Le Comptoir<small>CRM réseau</small></div>
        {side}
        <nav aria-label="Navigation">
          {groups.map((g) => (
            <div key={g.title} style={{ display: "contents" }}>
              <div className="grp">{g.title}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined}>
                  {it.label}{it.count ? <span className="count">{it.count}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {footer}
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <button type="button" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">☰ Menu</button>
          <span className="brand">Le Comptoir</span>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
