import Link from "next/link";
import { and, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { stores, syncEvents, customers } from "@/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { inStores } from "@/lib/scope";
import { revenueByStore, rangeFromParam } from "@/lib/stats";
import { formatEUR, formatEURShort, formatNum } from "@/lib/money";
import { PageHead, ago } from "@/components/ui";

export const metadata = { title: "Points de vente" };

export default async function Stores() {
  const u = await requireUser();
  const r = rangeFromParam("30");
  const [list, perf, sync, clients] = await Promise.all([
    db.select().from(stores).where(inStores(stores.id, u.storeIds)).orderBy(asc(stores.code)),
    revenueByStore(db, r, u.storeIds),
    db.select({ storeId: syncEvents.storeId, at: sql<Date>`max(${syncEvents.createdAt})`, errors: sql<number>`count(*) filter (where ${syncEvents.status} = 'erreur' and ${syncEvents.createdAt} > now() - interval '24 hours')::int` }).from(syncEvents).groupBy(syncEvents.storeId),
    db.select({ storeId: customers.homeStoreId, n: sql<number>`count(*)::int` }).from(customers).where(and(sql`${customers.anonymizedAt} is null`)).groupBy(customers.homeStoreId),
  ]);
  const P = new Map(perf.map((p) => [p.id, p]));
  const S = new Map(sync.map((s) => [s.storeId, s]));
  const C = new Map(clients.map((c) => [c.storeId, c.n]));
  const total = perf.reduce((a, p) => a + p.revenue, 0);

  return (
    <>
      <PageHead title="Points de vente" sub={`${list.filter((s) => s.active).length} boutiques actives · ${formatEURShort(total)} de CA sur 30 jours`}>
        {hasRole(u, "admin") && <Link className="btn btn-blue" href="/boutiques/nouvelle">+ Nouvelle boutique</Link>}
      </PageHead>
      <div className="card flush">
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>Boutique</th><th>Statut</th><th>Ville</th><th>Caisse</th><th className="r">CA 30 j</th><th className="r">Panier</th><th className="r">Part identifiée</th><th className="r">Clients</th><th>Dernière synchro</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const p = P.get(s.id), y = S.get(s.id);
                return (
                  <tr key={s.id} style={s.active ? undefined : { opacity: .55 }}>
                    <td><Link className="row-link" href={`/boutiques/${s.id}`}>{s.name}</Link><div className="small muted">{s.code}{!s.active && " · inactive"}</div></td>
                    <td><span className={"badge " + (s.kind === "franchise" ? "gold" : "blue")}>{s.kind === "franchise" ? "Franchise" : "Succursale"}</span>{s.franchisee && <div className="small muted">{s.franchisee}</div>}</td>
                    <td className="small">{s.city ?? "—"}</td>
                    <td className="small">{s.posSystem ?? "—"}</td>
                    <td className="r">{formatEURShort(p?.revenue)}</td>
                    <td className="r">{formatEUR(p?.tickets ? Math.round(p.revenue / p.tickets) : 0)}</td>
                    <td className="r">{p?.tickets ? `${Math.round((p.identified / p.tickets) * 100)} %` : "—"}</td>
                    <td className="r">{formatNum(C.get(s.id) ?? 0)}</td>
                    <td className="small">{y ? <span className={"badge " + (y.errors ? "warn" : "good")}>{ago(y.at)}{y.errors ? ` · ${y.errors} erreurs` : ""}</span> : <span className="badge plain">Jamais</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
