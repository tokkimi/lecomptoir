import Link from "next/link";
import { and, asc, desc, ilike, or, sql, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, stores } from "@/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { getScope } from "@/lib/scope";
import { getLoyaltySettings } from "@/lib/settings";
import { SEGMENTS, isSegment, segmentWhere, customerScope, customerBadge } from "@/lib/segments";
import { formatEUR, formatNum } from "@/lib/money";
import { formatPhone, fullName, normalizePhone } from "@/lib/contact";
import { PageHead, Pager, ago, BADGE_TONE } from "@/components/ui";

export const metadata = { title: "Clients" };
const PER = 50;
const SORTS = { recent: desc(customers.lastSeenAt), depense: desc(customers.totalSpentCents), visites: desc(customers.visits), points: desc(customers.loyaltyPoints), nom: asc(customers.lastName) } as const;

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const { storeIds } = await getScope(u);
  const sp = await searchParams;
  const seg = isSegment(sp.seg) ? sp.seg : "tous";
  const sort = (sp.tri && sp.tri in SORTS ? sp.tri : "recent") as keyof typeof SORTS;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim();
  const loyalty = await getLoyaltySettings(db);

  const conds: (SQL | undefined)[] = [customerScope(storeIds), segmentWhere(seg, loyalty)];
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const phone = normalizePhone(q);
    conds.push(or(ilike(customers.firstName, like), ilike(customers.lastName, like), ilike(customers.email, like), ilike(customers.company, like),
      ilike(sql`coalesce(${customers.firstName},'') || ' ' || coalesce(${customers.lastName},'')`, like),
      phone ? eq(customers.phone, phone) : ilike(customers.phone, like)));
  }
  if (sp.tag) conds.push(sql`${sp.tag} = any(${customers.tags})`);
  const where = and(...conds);

  const [rows, [{ n }]] = await Promise.all([
    db.select({ c: customers, store: stores.name }).from(customers).leftJoin(stores, eq(stores.id, customers.homeStoreId))
      .where(where).orderBy(sql`${SORTS[sort]} nulls last`, asc(customers.id)).limit(PER).offset((page - 1) * PER),
    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { seg, tri: sort, q: q || undefined, tag: sp.tag, ...o };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "" && !(k === "seg" && v === "tous") && !(k === "tri" && v === "recent") && !(k === "page" && String(v) === "1")) p.set(k, String(v));
    const s = p.toString();
    return s ? `/clients?${s}` : "/clients";
  };

  return (
    <>
      <PageHead title="Clients" sub="Fiches uniques pour tout le réseau : un client reconnu par e-mail ou téléphone, quelle que soit la boutique.">
        {hasRole(u, "manager") && <a className="btn btn-line" href={`/api/export/clients?seg=${seg}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>Exporter CSV</a>}
        <Link className="btn btn-blue" href="/clients/nouveau">+ Nouveau client</Link>
      </PageHead>

      <form className="filters" action="/clients">
        <input type="search" name="q" defaultValue={q} placeholder="Nom, e-mail, téléphone, entreprise…" aria-label="Rechercher un client" />
        <select name="seg" defaultValue={seg} aria-label="Segment">
          {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="tri" defaultValue={sort} aria-label="Trier par">
          <option value="recent">Dernière visite</option><option value="depense">Dépense cumulée</option>
          <option value="visites">Nombre de visites</option><option value="points">Points fidélité</option><option value="nom">Nom</option>
        </select>
        {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
        <button className="btn btn-line" type="submit">Filtrer</button>
        {sp.tag && <Link className="badge blue" href={qs({ tag: undefined })}>#{sp.tag} ✕</Link>}
        <span className="small muted" style={{ marginLeft: "auto" }}>{SEGMENTS[seg].hint}</span>
      </form>

      <div className="card flush">
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>Client</th><th>Contact</th><th>Boutique</th><th>Statut</th><th className="r">Visites</th><th className="r">Dépense</th><th className="r">Points</th><th>Dernière visite</th></tr></thead>
            <tbody>
              {rows.map(({ c, store }) => {
                const b = customerBadge(c, loyalty);
                return (
                  <tr key={c.id}>
                    <td><Link className="row-link" href={`/clients/${c.id}`}>{fullName(c)}</Link>
                      {c.tags.length > 0 && <div className="tags" style={{ marginTop: 3 }}>{c.tags.map((t) => <Link key={t} className="badge plain small" href={qs({ tag: t, page: 1 })}>#{t}</Link>)}</div>}
                    </td>
                    <td className="small">{c.email && <div>{c.email}</div>}{c.phone && <div className="muted">{formatPhone(c.phone)}</div>}</td>
                    <td className="small">{store ?? "—"}</td>
                    <td><span className={"badge " + (BADGE_TONE[b.key] ?? "")}>{b.label}</span></td>
                    <td className="r">{formatNum(c.visits)}</td>
                    <td className="r">{formatEUR(c.totalSpentCents)}</td>
                    <td className="r">{formatNum(c.loyaltyPoints)}</td>
                    <td className="small">{ago(c.lastSeenAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="empty">Aucun client ne correspond. <Link href="/clients">Réinitialiser les filtres</Link></div>}
        </div>
        <Pager page={page} pages={Math.ceil(n / PER)} total={n} unit="clients" hrefFor={(p) => qs({ page: p })} />
      </div>
    </>
  );
}
