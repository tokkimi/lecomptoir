import Link from "next/link";
import { and, desc, eq, gte, lt, sql, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sales, stores, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getScope, inStores } from "@/lib/scope";
import { formatEUR, formatNum } from "@/lib/money";
import { fullName } from "@/lib/contact";
import { PageHead, Pager, fmtDateTime, CHANNEL_LABEL } from "@/components/ui";

export const metadata = { title: "Ventes" };
const PER = 50;

export default async function Ventes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const { storeIds } = await getScope(u);
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const conds: (SQL | undefined)[] = [inStores(sales.storeId, storeIds)];
  if (sp.du && /^\d{4}-\d{2}-\d{2}$/.test(sp.du)) conds.push(gte(sales.occurredAt, new Date(sp.du + "T00:00:00")));
  if (sp.au && /^\d{4}-\d{2}-\d{2}$/.test(sp.au)) conds.push(lt(sales.occurredAt, new Date(new Date(sp.au + "T00:00:00").getTime() + 864e5)));
  if (sp.canal && sp.canal in CHANNEL_LABEL) conds.push(eq(sales.channel, sp.canal as "comptoir"));
  if (sp.statut === "rembourse") conds.push(eq(sales.status, "refunded"));
  if (sp.identifie === "1") conds.push(sql`${sales.customerId} is not null`);
  if (sp.client && z.uuid().safeParse(sp.client).success) conds.push(eq(sales.customerId, sp.client));
  if (sp.q) conds.push(ilike(sales.externalId, `%${sp.q.replace(/[%_]/g, "")}%`));
  const where = and(...conds);

  const [rows, [agg]] = await Promise.all([
    db.select({ s: sales, store: stores.name, code: stores.code, c: { firstName: customers.firstName, lastName: customers.lastName, email: customers.email, phone: customers.phone, id: customers.id } })
      .from(sales).innerJoin(stores, eq(stores.id, sales.storeId)).leftJoin(customers, eq(customers.id, sales.customerId))
      .where(where).orderBy(desc(sales.occurredAt)).limit(PER).offset((page - 1) * PER),
    db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${sales.totalCents}) filter (where ${sales.status} = 'completed'), 0)::int` }).from(sales).where(where),
  ]);
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...o })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/ventes?${p}`;
  };

  return (
    <>
      <PageHead title="Ventes" sub="Tous les tickets remontés par les caisses (API ou import CSV) pour les boutiques affichées." />
      <form className="filters" action="/ventes">
        <input type="search" name="q" defaultValue={sp.q} placeholder="N° de ticket" aria-label="Numéro de ticket" style={{ maxWidth: 180 }} />
        <label className="small muted">Du <input type="date" name="du" defaultValue={sp.du} style={{ width: "auto" }} /></label>
        <label className="small muted">au <input type="date" name="au" defaultValue={sp.au} style={{ width: "auto" }} /></label>
        <select name="canal" defaultValue={sp.canal ?? ""} aria-label="Canal"><option value="">Tous canaux</option>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="statut" defaultValue={sp.statut ?? ""} aria-label="Statut"><option value="">Tous statuts</option><option value="rembourse">Remboursés</option></select>
        <label className="check"><input type="checkbox" name="identifie" value="1" defaultChecked={sp.identifie === "1"} /> Clients identifiés</label>
        {sp.client && <input type="hidden" name="client" value={sp.client} />}
        <button className="btn btn-line" type="submit">Filtrer</button>
        <span className="small muted" style={{ marginLeft: "auto" }}><b className="num">{formatEUR(agg.total)}</b> sur {formatNum(agg.n)} tickets</span>
      </form>
      <div className="card flush">
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>Date</th><th>Ticket</th><th>Boutique</th><th>Client</th><th>Canal</th><th>Paiement</th><th className="r">Montant</th></tr></thead>
            <tbody>
              {rows.map(({ s, store, code, c }) => (
                <tr key={s.id}>
                  <td className="small">{fmtDateTime(s.occurredAt)}</td>
                  <td><Link className="row-link" href={`/ventes/${s.id}`}>{s.externalId}</Link></td>
                  <td className="small">{code} · {store}</td>
                  <td className="small">{c?.id ? <Link href={`/clients/${c.id}`}>{fullName(c)}</Link> : <span className="muted">Anonyme</span>}</td>
                  <td className="small">{CHANNEL_LABEL[s.channel]}</td>
                  <td className="small">{s.paymentMethod ?? "—"}</td>
                  <td className="r">{s.status === "refunded" ? <><span className="badge bad">Remboursé</span> <s>{formatEUR(s.totalCents)}</s></> : formatEUR(s.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">Aucun ticket sur ces critères.</div>}
        </div>
        <Pager page={page} pages={Math.ceil(agg.n / PER)} total={agg.n} unit="tickets" hrefFor={(p) => qs({ page: p })} />
      </div>
    </>
  );
}
