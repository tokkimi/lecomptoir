import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, sales, saleItems, stores, activities, users, loyaltyTransactions, rewards, leads } from "@/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { inStores } from "@/lib/scope";
import { customerScope, customerBadge } from "@/lib/segments";
import { getLoyaltySettings } from "@/lib/settings";
import { formatEUR, formatNum } from "@/lib/money";
import { formatPhone, fullName } from "@/lib/contact";
import { PageHead, Kpi, fmtDate, fmtDateTime, ago, BADGE_TONE, CHANNEL_LABEL, Flash } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { CustomerFields } from "../CustomerFields";
import { updateCustomer, addActivity, adjustPoints, anonymizeCustomer } from "../actions";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), customerScope(u.storeIds)));
  if (!c) notFound();
  const loyalty = await getLoyaltySettings(db);

  const [purchases, favs, visited, timeline, points, rewardList, myStores, relatedLeads] = await Promise.all([
    db.select({ s: sales, store: stores.name }).from(sales).innerJoin(stores, eq(stores.id, sales.storeId))
      .where(eq(sales.customerId, id)).orderBy(desc(sales.occurredAt)).limit(15),
    db.select({ name: saleItems.name, qty: sql<number>`sum(${saleItems.quantity})::int` }).from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId)).where(and(eq(sales.customerId, id), eq(sales.status, "completed")))
      .groupBy(saleItems.name).orderBy(desc(sql`2`)).limit(5),
    db.select({ name: stores.name, n: sql<number>`count(*)::int`, spent: sql<number>`sum(${sales.totalCents})::int` }).from(sales)
      .innerJoin(stores, eq(stores.id, sales.storeId)).where(and(eq(sales.customerId, id), eq(sales.status, "completed")))
      .groupBy(stores.name).orderBy(desc(sql`2`)),
    db.select({ a: activities, by: users.name }).from(activities).leftJoin(users, eq(users.id, activities.userId))
      .where(eq(activities.customerId, id)).orderBy(desc(activities.createdAt)).limit(30),
    db.select().from(loyaltyTransactions).where(eq(loyaltyTransactions.customerId, id)).orderBy(desc(loyaltyTransactions.createdAt)).limit(12),
    db.select().from(rewards).where(eq(rewards.active, true)).orderBy(asc(rewards.pointsCost)),
    db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores).where(inStores(stores.id, u.storeIds)).orderBy(asc(stores.code)),
    db.select({ id: leads.id, kind: leads.kind, status: leads.status, createdAt: leads.createdAt }).from(leads).where(eq(leads.customerId, id)),
  ]);
  const b = customerBadge(c, loyalty);
  const home = myStores.find((s) => s.id === c.homeStoreId);
  if (c.homeStoreId && !home) {
    const [h] = await db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores).where(eq(stores.id, c.homeStoreId));
    if (h) myStores.unshift(h);
  }

  if (c.anonymizedAt) {
    return (<><PageHead title="Client anonymisé" crumbs={<Link href="/clients">← Clients</Link>} sub={`Données personnelles effacées le ${fmtDate(c.anonymizedAt)}. Les ventes restent comptabilisées.`} /></>);
  }

  return (
    <>
      <PageHead title={fullName(c)} crumbs={<Link href="/clients">← Clients</Link>}
        sub={<>
          <span className={"badge " + (BADGE_TONE[b.key] ?? "")}>{b.label}</span>{" "}
          {home ? `Rattaché à ${home.name}` : "Sans boutique de rattachement"} · client depuis {fmtDate(c.firstSeenAt ?? c.createdAt)} · dernière visite {ago(c.lastSeenAt)}
        </>}>
        <a className="btn btn-line" href={`/api/export/clients/${c.id}`}>Export RGPD (JSON)</a>
      </PageHead>
      <Flash ok={sp.ok === "cree" ? "Fiche client créée." : undefined} err={sp.err === "confirmation" ? "Tapez EFFACER pour confirmer l'anonymisation." : undefined} />

      <div className="grid g4">
        <Kpi label="Dépense cumulée" value={formatEUR(c.totalSpentCents)} />
        <Kpi label="Visites" value={formatNum(c.visits)} />
        <Kpi label="Panier moyen" value={formatEUR(c.visits ? Math.round(c.totalSpentCents / c.visits) : 0)} />
        <Kpi label="Points fidélité" value={formatNum(c.loyaltyPoints)} note={rewardList.filter((r) => r.pointsCost <= c.loyaltyPoints).length ? "récompense disponible" : undefined} />
      </div>

      <div className="grid g-side" style={{ marginTop: 16 }}>
        <div className="stack">
          <div className="card flush">
            <div className="card-h"><h2>Achats récents</h2><Link className="small" href={`/ventes?client=${c.id}`}>Tous les tickets →</Link></div>
            <div className="tbl-wrap">
              <table className="t">
                <thead><tr><th>Date</th><th>Boutique</th><th>Canal</th><th className="r">Montant</th><th className="r">Points</th></tr></thead>
                <tbody>
                  {purchases.map(({ s, store }) => (
                    <tr key={s.id}>
                      <td><Link href={`/ventes/${s.id}`}>{fmtDateTime(s.occurredAt)}</Link></td>
                      <td className="small">{store}</td>
                      <td className="small">{CHANNEL_LABEL[s.channel]}</td>
                      <td className="r">{s.status === "refunded" ? <s>{formatEUR(s.totalCents)}</s> : formatEUR(s.totalCents)}</td>
                      <td className="r">{s.pointsEarned ? `+${s.pointsEarned}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!purchases.length && <div className="empty">Aucun achat identifié pour l&apos;instant.</div>}
            </div>
          </div>

          <div className="card">
            <h2>Historique &amp; notes</h2>
            <ActionForm action={addActivity} submit="Ajouter" resetOnOk className="form" style={{ marginBottom: 16 }}>
              <input type="hidden" name="id" value={c.id} />
              <div className="row">
                <div className="field" style={{ flex: "0 0 150px" }}><label htmlFor="kind">Type</label>
                  <select id="kind" name="kind"><option value="note">Note</option><option value="appel">Appel</option><option value="email">E-mail</option><option value="sms">SMS</option><option value="visite">Visite</option></select>
                </div>
                <div className="field"><label htmlFor="body">Contenu</label><input id="body" name="body" type="text" placeholder="Ex. : a demandé une option sans lactose" /></div>
              </div>
            </ActionForm>
            <ul className="timeline">
              {timeline.map(({ a, by }) => (
                <li key={a.id} className={"k-" + a.kind}>
                  <div>{a.body}<div className="meta">{a.kind !== "systeme" && <>{a.kind} · </>}{by ?? "Système"} · {fmtDateTime(a.createdAt)}</div></div>
                </li>
              ))}
              {relatedLeads.map((l) => (
                <li key={l.id}><div><Link href={`/demandes/${l.id}`}>Demande « {l.kind} »</Link> — {l.status}<div className="meta">{fmtDateTime(l.createdAt)}</div></div></li>
              ))}
              {!timeline.length && !relatedLeads.length && <li className="k-systeme"><span className="muted">Rien pour l&apos;instant.</span></li>}
            </ul>
          </div>

          <div className="card">
            <h2>Modifier la fiche</h2>
            <ActionForm action={updateCustomer} submit="Enregistrer">
              <input type="hidden" name="id" value={c.id} />
              <CustomerFields c={c} stores={myStores} />
            </ActionForm>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Coordonnées</h2>
            <dl className="dl">
              <dt>E-mail</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</dd>
              <dt>Téléphone</dt><dd>{c.phone ? <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a> : "—"}</dd>
              {c.company && <><dt>Entreprise</dt><dd>{c.company}</dd></>}
              <dt>Anniversaire</dt><dd>{c.birthday ? new Date(c.birthday + "T12:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "—"}</dd>
              <dt>Marketing</dt><dd>
                <span className={"badge " + (c.optInEmail ? "good" : "plain")}>E-mail {c.optInEmail ? "oui" : "non"}</span>{" "}
                <span className={"badge " + (c.optInSms ? "good" : "plain")}>SMS {c.optInSms ? "oui" : "non"}</span>
                {c.consentAt && <div className="small muted">Consentement du {fmtDate(c.consentAt)}</div>}
              </dd>
              {c.tags.length > 0 && <><dt>Étiquettes</dt><dd className="tags">{c.tags.map((t) => <Link key={t} className="badge plain" href={`/clients?tag=${encodeURIComponent(t)}`}>#{t}</Link>)}</dd></>}
            </dl>
            {c.notes && <p className="small" style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{c.notes}</p>}
          </div>

          <div className="card">
            <h2>Ses habitudes</h2>
            <div className="hbar">
              {favs.map((f) => (
                <div className="it" key={f.name}><span>{f.name}</span><span className="num">× {f.qty}</span>
                  <div className="track"><div className="fill" style={{ width: `${(f.qty / (favs[0]?.qty || 1)) * 100}%` }} /></div></div>
              ))}
            </div>
            {visited.length > 0 && <p className="small muted" style={{ marginBottom: 0 }}>Boutiques fréquentées : {visited.map((v) => `${v.name} (${v.n})`).join(", ")}</p>}
            {!favs.length && <p className="muted small">Pas encore d&apos;historique produit.</p>}
          </div>

          <div className="card">
            <h2>Fidélité</h2>
            <ActionForm action={adjustPoints} submit="Utiliser la récompense">
              <input type="hidden" name="id" value={c.id} />
              <div className="field"><label htmlFor="rewardId">Récompense</label>
                <select id="rewardId" name="rewardId">
                  {rewardList.map((r) => <option key={r.id} value={r.id} disabled={r.pointsCost > c.loyaltyPoints}>{r.name} — {r.pointsCost} pts{r.pointsCost > c.loyaltyPoints ? " (solde insuffisant)" : ""}</option>)}
                </select>
              </div>
            </ActionForm>
            {hasRole(u, "manager") && (
              <details style={{ marginTop: 12 }}>
                <summary className="small">Ajustement manuel</summary>
                <ActionForm action={adjustPoints} submit="Appliquer" resetOnOk style={{ marginTop: 10 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <div className="row">
                    <div className="field" style={{ flex: "0 0 110px" }}><label htmlFor="points">Points (±)</label><input id="points" name="points" type="number" step={1} /></div>
                    <div className="field"><label htmlFor="reason">Motif</label><input id="reason" name="reason" type="text" placeholder="Geste commercial…" /></div>
                  </div>
                </ActionForm>
              </details>
            )}
            <ul className="timeline" style={{ marginTop: 14 }}>
              {points.map((p) => (
                <li key={p.id} className={p.points < 0 ? "k-appel" : ""}><div><b className="num">{p.points > 0 ? "+" : ""}{p.points}</b> {p.reason}<div className="meta">{fmtDateTime(p.createdAt)}</div></div></li>
              ))}
            </ul>
          </div>

          {hasRole(u, "manager") && (
            <div className="card">
              <h2>Effacement RGPD</h2>
              <p className="small muted" style={{ marginTop: 0 }}>Efface l&apos;identité, les coordonnées et les notes. Les tickets restent dans le chiffre d&apos;affaires, sans lien nominatif. Irréversible.</p>
              <form action={anonymizeCustomer} className="form">
                <input type="hidden" name="id" value={c.id} />
                <div className="field"><label htmlFor="confirm">Tapez EFFACER pour confirmer</label><input id="confirm" name="confirm" type="text" autoComplete="off" /></div>
                <div><button className="btn btn-danger" type="submit">Anonymiser ce client</button></div>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
