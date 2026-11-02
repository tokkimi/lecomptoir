import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sales, saleItems, stores, customers } from "@/db/schema";
import { requireUser, canAccessStore, hasRole } from "@/lib/auth";
import { formatEUR } from "@/lib/money";
import { fullName } from "@/lib/contact";
import { PageHead, fmtDateTime, CHANNEL_LABEL, Flash } from "@/components/ui";
import { refund } from "../actions";

const SRC: Record<string, string> = { api: "API caisse", csv: "Import CSV", manual: "Saisie manuelle", seed: "Démo", site: "Site" };

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [row] = await db.select({ s: sales, store: stores, c: customers }).from(sales)
    .innerJoin(stores, eq(stores.id, sales.storeId)).leftJoin(customers, eq(customers.id, sales.customerId)).where(eq(sales.id, id));
  if (!row || !canAccessStore(u, row.s.storeId)) notFound();
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, id));
  const { s, store, c } = row;
  return (
    <>
      <PageHead title={`Ticket ${s.externalId}`} crumbs={<Link href="/ventes">← Ventes</Link>} sub={`${store.name} · ${fmtDateTime(s.occurredAt)} · ${CHANNEL_LABEL[s.channel]}`}>
        {s.status === "refunded" ? <span className="badge bad">Remboursé</span> : hasRole(u, "manager") && (
          <form action={refund}><input type="hidden" name="id" value={s.id} /><button className="btn btn-danger" type="submit">Marquer remboursé</button></form>
        )}
      </PageHead>
      <Flash ok={(await searchParams).ok ? "Ticket marqué remboursé : CA client et points annulés." : undefined} />
      <div className="grid g-side">
        <div className="card flush">
          <div className="tbl-wrap"><table className="t">
            <thead><tr><th>Article</th><th>Réf.</th><th className="r">Qté</th><th className="r">P.U.</th><th className="r">Total</th></tr></thead>
            <tbody>
              {items.map((i) => <tr key={i.id}><td>{i.name}</td><td className="small muted">{i.sku ?? "—"}</td><td className="r">{i.quantity}</td><td className="r">{formatEUR(i.unitPriceCents)}</td><td className="r">{formatEUR(i.totalCents)}</td></tr>)}
              {s.discountCents > 0 && <tr><td colSpan={4}>Remise</td><td className="r">−{formatEUR(s.discountCents)}</td></tr>}
              <tr><td colSpan={4}><b>Total TTC</b></td><td className="r"><b>{formatEUR(s.totalCents)}</b></td></tr>
            </tbody>
          </table></div>
          {!items.length && <div className="empty">Ticket transmis sans détail des lignes.</div>}
        </div>
        <div className="card">
          <dl className="dl">
            <dt>Client</dt><dd>{c ? <Link href={`/clients/${c.id}`}>{fullName(c)}</Link> : "Non identifié"}</dd>
            <dt>Paiement</dt><dd>{s.paymentMethod ?? "—"}</dd>
            <dt>Points</dt><dd>{s.pointsEarned ? `+${s.pointsEarned}` : "—"}{s.pointsRedeemed ? ` / −${s.pointsRedeemed} utilisés` : ""}</dd>
            <dt>Origine</dt><dd>{SRC[s.source]}</dd>
            <dt>Reçu le</dt><dd>{fmtDateTime(s.createdAt)}</dd>
          </dl>
        </div>
      </div>
    </>
  );
}
