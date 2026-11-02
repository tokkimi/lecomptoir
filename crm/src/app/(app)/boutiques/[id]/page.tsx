import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { stores, storeApiKeys, syncEvents, users, userStores, customers } from "@/db/schema";
import { requireUser, canAccessStore, hasRole } from "@/lib/auth";
import { kpis, dailyRevenue, topProducts, rangeFromParam, previous } from "@/lib/stats";
import { formatEUR, formatEURShort, formatNum } from "@/lib/money";
import { PageHead, Kpi, ratio, fmtDateTime, fmtDate, Flash, Seg } from "@/components/ui";
import { BarChart } from "@/components/BarChart";
import { ActionForm } from "@/components/ActionForm";
import { StoreFields } from "../StoreFields";
import { KeyForm } from "../KeyForm";
import { updateStore, createKey, revokeKey } from "../actions";

const ROLE: Record<string, string> = { admin: "Siège", manager: "Gérant", staff: "Équipier" };

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string; ok?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success || !canAccessStore(u, id)) notFound();
  const [s] = await db.select().from(stores).where(eq(stores.id, id));
  if (!s) notFound();
  const r = rangeFromParam(sp.p);
  const ids = [id];

  const [cur, old, days, top, keys, events, team, [{ n: nCustomers }]] = await Promise.all([
    kpis(db, r, ids), kpis(db, previous(r), ids), dailyRevenue(db, r, ids), topProducts(db, r, ids, 6),
    db.select().from(storeApiKeys).where(eq(storeApiKeys.storeId, id)).orderBy(desc(storeApiKeys.createdAt)),
    db.select().from(syncEvents).where(eq(syncEvents.storeId, id)).orderBy(desc(syncEvents.createdAt)).limit(12),
    db.select({ id: users.id, name: users.name, role: users.role, email: users.email }).from(userStores).innerJoin(users, eq(users.id, userStores.userId)).where(and(eq(userStores.storeId, id), eq(users.active, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(and(eq(customers.homeStoreId, id), sql`${customers.anonymizedAt} is null`)),
  ]);
  const manager = hasRole(u, "manager");

  return (
    <>
      <PageHead title={s.name} crumbs={<Link href="/boutiques">← Points de vente</Link>}
        sub={<><span className={"badge " + (s.kind === "franchise" ? "gold" : "blue")}>{s.kind === "franchise" ? `Franchise${s.franchisee ? " · " + s.franchisee : ""}` : "Succursale"}</span> {s.code} · {[s.address, s.postalCode, s.city].filter(Boolean).join(", ")} · caisse {s.posSystem ?? "non renseignée"}</>}>
        <Seg options={[{ key: "7", label: "7 j" }, { key: "30", label: "30 j" }, { key: "90", label: "90 j" }]} current={r.key} hrefFor={(k) => `/boutiques/${id}?p=${k}`} />
      </PageHead>
      <Flash ok={sp.ok === "cree" ? "Boutique créée. Générez maintenant une clé API pour sa caisse." : undefined} />

      <div className="grid g4">
        <Kpi label="CA TTC" value={formatEURShort(cur.revenue)} delta={ratio(cur.revenue, old.revenue)} note={s.monthlyTargetCents ? `objectif ${formatEURShort(s.monthlyTargetCents * r.days / 30)}` : undefined} />
        <Kpi label="Tickets" value={formatNum(cur.tickets)} delta={ratio(cur.tickets, old.tickets)} />
        <Kpi label="Panier moyen" value={formatEUR(cur.avgBasket)} delta={ratio(cur.avgBasket, old.avgBasket)} />
        <Kpi label="Clients rattachés" value={formatNum(nCustomers)} note={`${Math.round(cur.identifiedRate * 100)} % des tickets identifiés`} />
      </div>

      <div className="grid g-side" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h"><h2>Chiffre d&apos;affaires par jour</h2><Link className="small" href="/ventes">Tickets →</Link></div>
          <BarChart ariaLabel={`Chiffre d'affaires par jour, ${s.name}`} data={days.map((d) => ({ key: d.day, label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), value: d.revenue, display: formatEUR(d.revenue), sub: `${new Date(d.day + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${d.tickets} tickets` }))} />
        </div>
        <div className="card">
          <h2>Meilleures ventes</h2>
          <div className="hbar">
            {top.map((p) => (
              <div className="it" key={p.name}><span>{p.name}</span><span className="num">{formatEURShort(p.revenue)}</span>
                <div className="track"><div className="fill" style={{ width: `${(p.revenue / (top[0]?.revenue || 1)) * 100}%` }} /></div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        {manager && (
          <div className="card">
            <h2>Connexion caisse</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              La caisse envoie chaque ticket à <code>POST /api/pos/v1/sales</code> avec la clé ci-dessous. Sans caisse compatible, utilisez l&apos;<Link href="/connecteurs">import CSV</Link>.
            </p>
            <KeyForm storeId={id} action={createKey} />
            <div className="tbl-wrap" style={{ marginTop: 12 }}>
              <table className="t">
                <thead><tr><th>Clé</th><th>Créée</th><th>Dernier usage</th><th /></tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} style={k.revokedAt ? { opacity: .5 } : undefined}>
                      <td><b>{k.label}</b><div className="small muted"><code>{k.prefix}…</code></div></td>
                      <td className="small">{fmtDate(k.createdAt)}</td>
                      <td className="small">{k.revokedAt ? `Révoquée le ${fmtDate(k.revokedAt)}` : fmtDateTime(k.lastUsedAt)}</td>
                      <td className="r">{!k.revokedAt && <form action={revokeKey}><input type="hidden" name="keyId" value={k.id} /><button className="btn btn-danger btn-sm" type="submit">Révoquer</button></form>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!keys.length && <div className="empty small">Aucune clé : la caisse n&apos;est pas encore connectée.</div>}
            </div>
          </div>
        )}
        <div className="card">
          <h2>Journal de synchronisation</h2>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id} className={e.status === "erreur" ? "k-appel" : e.status === "doublon" ? "k-systeme" : ""}>
                <div><span className={"badge " + (e.status === "ok" ? "good" : e.status === "erreur" ? "bad" : "plain")}>{e.status}</span> {e.externalId ?? ""} <span className="small muted">· {e.channel.toUpperCase()}</span>
                  {e.message && <div className="small">{e.message}</div>}<div className="meta">{fmtDateTime(e.createdAt)}</div></div>
              </li>
            ))}
            {!events.length && <li className="k-systeme"><span className="muted">Aucun échange avec la caisse pour l&apos;instant.</span></li>}
          </ul>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        {manager && (
          <div className="card">
            <h2>Informations</h2>
            <ActionForm action={updateStore} submit="Enregistrer">
              <input type="hidden" name="id" value={s.id} />
              <StoreFields s={s} admin={hasRole(u, "admin")} />
            </ActionForm>
          </div>
        )}
        <div className="card">
          <div className="card-h"><h2>Équipe</h2>{hasRole(u, "admin") && <Link className="small" href="/equipe">Gérer les accès →</Link>}</div>
          <ul className="timeline">
            {team.map((m) => <li key={m.id}><div><b>{m.name}</b> · {ROLE[m.role]}<div className="meta">{m.email}</div></div></li>)}
            {!team.length && <li className="k-systeme"><span className="muted">Aucun membre affecté (le siège y a accès).</span></li>}
          </ul>
        </div>
      </div>
    </>
  );
}
