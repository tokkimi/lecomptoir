import Link from "next/link";
import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, syncEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getScope, inStores } from "@/lib/scope";
import { kpis, dailyRevenue, revenueByStore, topProducts, channelMix, hourlyProfile, rangeFromParam, previous, newCustomersCount } from "@/lib/stats";
import { formatEUR, formatEURShort, formatNum } from "@/lib/money";
import { getLoyaltySettings } from "@/lib/settings";
import { segmentWhere, customerScope } from "@/lib/segments";
import { BarChart } from "@/components/BarChart";
import { Kpi, PageHead, Seg, ratio, CHANNEL_LABEL, ago } from "@/components/ui";

export const metadata = { title: "Tableau de bord" };

const RANGES = [{ key: "7", label: "7 j" }, { key: "30", label: "30 j" }, { key: "90", label: "90 j" }, { key: "365", label: "12 mois" }];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string; refus?: string }> }) {
  const u = await requireUser();
  const { storeIds } = await getScope(u);
  const sp = await searchParams;
  const r = rangeFromParam(sp.p);
  const prev = previous(r);
  const loyalty = await getLoyaltySettings(db);

  const [cur, old, days, byStore, top, channels, hours, newCust, prevNewCust, atRisk, lastSync] = await Promise.all([
    kpis(db, r, storeIds), kpis(db, prev, storeIds), dailyRevenue(db, r, storeIds), revenueByStore(db, r, storeIds),
    topProducts(db, r, storeIds), channelMix(db, r, storeIds), hourlyProfile(db, r, storeIds),
    newCustomersCount(db, r, storeIds), newCustomersCount(db, prev, storeIds),
    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(and(customerScope(storeIds), segmentWhere("a_risque", loyalty))),
    db.select({ storeId: syncEvents.storeId, at: sql<Date>`max(${syncEvents.createdAt})`, errors: sql<number>`count(*) filter (where ${syncEvents.status} = 'erreur' and ${syncEvents.createdAt} > now() - interval '24 hours')::int` })
      .from(syncEvents).where(inStores(syncEvents.storeId, storeIds)).groupBy(syncEvents.storeId),
  ]);
  const syncMap = new Map(lastSync.map((s) => [s.storeId, s]));
  const syncErrors = lastSync.reduce((a, s) => a + s.errors, 0);

  // Agrégation hebdomadaire au-delà de 90 jours pour garder un graphique lisible.
  const bars = r.days > 90 ? weekly(days) : days.map((d) => ({
    key: d.day, label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), value: d.revenue,
    display: formatEUR(d.revenue), sub: `${new Date(d.day + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${d.tickets} tickets`,
  }));
  const maxStore = Math.max(1, ...byStore.map((s) => s.revenue));
  const monthFactor = r.days / 30;
  const totalCh = channels.reduce((a, c) => a + c.revenue, 0) || 1;
  const [{ n: atRiskN }] = atRisk;

  return (
    <>
      <PageHead title="Tableau de bord" sub={storeIds?.length === 1 ? `Boutique sélectionnée · ${r.days} derniers jours` : `${storeIds === null ? "Tout le réseau" : "Mes boutiques"} · ${r.days} derniers jours, comparés à la période précédente`}>
        <Seg options={RANGES} current={r.key} hrefFor={(k) => `/?p=${k}`} />
      </PageHead>
      {sp.refus && <div className="alert err" style={{ marginBottom: 14 }}>Cette page est réservée à un autre niveau d&apos;accès.</div>}

      <div className="grid g4">
        <Kpi label="Chiffre d'affaires TTC" value={formatEURShort(cur.revenue)} delta={ratio(cur.revenue, old.revenue)} />
        <Kpi label="Tickets" value={formatNum(cur.tickets)} delta={ratio(cur.tickets, old.tickets)} />
        <Kpi label="Panier moyen" value={formatEUR(cur.avgBasket)} delta={ratio(cur.avgBasket, old.avgBasket)} />
        <Kpi label="Tickets identifiés" value={`${Math.round(cur.identifiedRate * 100)} %`} note={`${formatNum(cur.customers)} clients · ${newCust} nouveaux (${prevNewCust} avant)`} />
      </div>

      <div className="grid g-side" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h"><h2>Chiffre d&apos;affaires par {r.days > 90 ? "semaine" : "jour"}</h2><span className="small muted">TTC, tickets remboursés exclus</span></div>
          <BarChart data={bars} ariaLabel={`Chiffre d'affaires par ${r.days > 90 ? "semaine" : "jour"}`} />
        </div>
        <div className="stack">
          <div className="card">
            <h2>À traiter</h2>
            <ul className="timeline">
              <li><span><Link href="/clients?seg=a_risque"><b>{atRiskN}</b> clients à risque</Link><br /><span className="meta">Habitués absents depuis plus de {loyalty.atRiskDays} jours</span></span></li>
              <li className={syncErrors ? "k-appel" : "k-systeme"}><span><Link href="/connecteurs">{syncErrors ? <><b>{syncErrors}</b> erreurs de synchro caisse (24 h)</> : "Aucune erreur de synchro caisse (24 h)"}</Link></span></li>
              <li><span><Link href="/demandes">Demandes entrantes</Link><br /><span className="meta">Commandes de groupe, partenariats, franchise</span></span></li>
            </ul>
          </div>
          <div className="card">
            <h2>Canaux</h2>
            <div className="hbar">
              {channels.map((c) => (
                <div className="it" key={c.channel}>
                  <span>{CHANNEL_LABEL[c.channel]}</span><span className="num">{formatEURShort(c.revenue)} · {Math.round((c.revenue / totalCh) * 100)} %</span>
                  <div className="track"><div className="fill" style={{ width: `${(c.revenue / totalCh) * 100}%` }} /></div>
                </div>
              ))}
              {!channels.length && <p className="muted">Aucune vente sur la période.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid g-side" style={{ marginTop: 16 }}>
        <div className="card flush">
          <div className="card-h"><h2>Points de vente</h2><Link className="small" href="/boutiques">Tout voir →</Link></div>
          <div className="tbl-wrap">
            <table className="t">
              <thead><tr><th>Boutique</th><th className="r">CA</th><th className="r">Tickets</th><th className="r">Panier</th><th style={{ width: "26%" }}>Objectif période</th><th>Caisse</th></tr></thead>
              <tbody>
                {byStore.map((s) => {
                  const target = s.target ? s.target * monthFactor : null;
                  const sync = syncMap.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td><Link className="row-link" href={`/boutiques/${s.id}`}>{s.name}</Link><div className="small muted">{s.code} · {s.kind === "franchise" ? "Franchise" : "Succursale"}</div></td>
                      <td className="r">{formatEURShort(s.revenue)}</td>
                      <td className="r">{formatNum(s.tickets)}</td>
                      <td className="r">{formatEUR(s.tickets ? Math.round(s.revenue / s.tickets) : 0)}</td>
                      <td>
                        {target ? (<>
                          <div className="meter" title={`${Math.round((s.revenue / target) * 100)} % de l'objectif`}><i style={{ width: `${Math.min(100, (s.revenue / target) * 100)}%` }} /></div>
                          <span className="small muted">{Math.round((s.revenue / target) * 100)} % de {formatEURShort(target)}</span>
                        </>) : <div className="meter"><i style={{ width: `${(s.revenue / maxStore) * 100}%`, background: "var(--blue)" }} /></div>}
                      </td>
                      <td className="small">{sync ? <span className={"badge " + (sync.errors ? "warn" : "good")}>{ago(sync.at)}</span> : <span className="badge plain">Aucune synchro</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Meilleures ventes</h2>
            <div className="hbar">
              {top.map((p) => (
                <div className="it" key={p.name}>
                  <span>{p.name}</span><span className="num">{formatEURShort(p.revenue)} · {formatNum(p.qty)}</span>
                  <div className="track"><div className="fill" style={{ width: `${(p.revenue / (top[0]?.revenue || 1)) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Affluence par heure</h2>
            <BarChart height={150} tickEvery={2} unit="count" ariaLabel="Nombre de tickets par heure de la journée"
              data={hours.map((h) => ({ key: String(h.hour), label: `${h.hour}h`, value: h.tickets, display: `${formatNum(h.tickets)} tickets`, sub: `${h.hour}h–${h.hour + 1}h · ${formatEURShort(h.revenue)}` }))} />
          </div>
        </div>
      </div>
    </>
  );
}

function weekly(days: { day: string; revenue: number; tickets: number }[]) {
  const out: { key: string; label: string; value: number; display: string; sub: string; tickets: number }[] = [];
  days.forEach((d, i) => {
    if (i % 7 === 0) out.push({ key: d.day, label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), value: 0, display: "", sub: "", tickets: 0 });
    const w = out[out.length - 1];
    w.value += d.revenue; w.tickets += d.tickets;
  });
  return out.map((w) => ({ ...w, display: formatEUR(w.value), sub: `Semaine du ${w.label} · ${w.tickets} tickets` }));
}
