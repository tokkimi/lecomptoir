import Link from "next/link";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads, stores, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getScope, inStores } from "@/lib/scope";
import { formatEURShort } from "@/lib/money";
import { LEAD_KIND, LEAD_STATUS } from "@/lib/leads";
import { PageHead, ago } from "@/components/ui";

export const metadata = { title: "Demandes & devis" };

export default async function Leads({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const u = await requireUser();
  const { storeIds } = await getScope(u);
  const sp = await searchParams;
  const conds: (SQL | undefined)[] = [];
  if (storeIds !== null) conds.push(u.role === "staff" ? inStores(leads.storeId, storeIds) : or(inStores(leads.storeId, storeIds), isNull(leads.storeId)));
  if (sp.type && sp.type in LEAD_KIND) conds.push(eq(leads.kind, sp.type as "question"));
  const rows = await db.select({ l: leads, store: stores.code, owner: users.name }).from(leads)
    .leftJoin(stores, eq(stores.id, leads.storeId)).leftJoin(users, eq(users.id, leads.assigneeId))
    .where(and(...conds, sql`(${leads.status} not in ('clos','perdu','gagne') or ${leads.updatedAt} > now() - interval '60 days')`))
    .orderBy(desc(leads.createdAt)).limit(300);
  const pipeline = rows.filter((r) => r.l.status === "nouveau" || r.l.status === "en_cours").reduce((a, r) => a + (r.l.estimatedValueCents ?? 0), 0);

  return (
    <>
      <PageHead title="Demandes & devis" sub={<>Messages du site, commandes de groupe, partenariats et candidatures franchise. Pipeline ouvert : <b>{formatEURShort(pipeline)}</b>.</>}>
        <Link className="btn btn-blue" href="/demandes/nouvelle">+ Nouvelle demande</Link>
      </PageHead>
      <div className="filters">
        <Link className={"badge " + (!sp.type ? "blue" : "plain")} href="/demandes">Toutes</Link>
        {Object.entries(LEAD_KIND).map(([k, v]) => <Link key={k} className={"badge " + (sp.type === k ? "blue" : "plain")} href={`/demandes?type=${k}`}>{v}</Link>)}
      </div>
      <div className="kanban">
        {(Object.keys(LEAD_STATUS) as (keyof typeof LEAD_STATUS)[]).map((st) => {
          const lane = rows.filter((r) => r.l.status === st);
          return (
            <section className="lane" key={st} aria-label={LEAD_STATUS[st]}>
              <h2><span>{LEAD_STATUS[st]}</span><span>{lane.length}</span></h2>
              {lane.map(({ l, store, owner }) => (
                <Link key={l.id} className="lead" href={`/demandes/${l.id}`}>
                  <span className="small muted">{LEAD_KIND[l.kind]}{store ? ` · ${store}` : ""} · {ago(l.createdAt)}</span>
                  <b>{l.company ? `${l.company} — ${l.name}` : l.name}</b>
                  <p>{l.message}</p>
                  <span className="small">{l.estimatedValueCents ? <b>{formatEURShort(l.estimatedValueCents)}</b> : null}{owner ? <span className="muted"> · {owner}</span> : <span className="muted"> · non attribuée</span>}</span>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
