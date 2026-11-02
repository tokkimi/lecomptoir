import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, sales, saleItems, loyaltyTransactions, activities, leads } from "@/db/schema";
import { getCurrentUser, audit } from "@/lib/auth";
import { customerScope } from "@/lib/segments";

/** RGPD — droit d'accès / portabilité : toutes les données d'un client au format JSON. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new Response("Non connecté", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Introuvable", { status: 404 });
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), customerScope(u.storeIds)));
  if (!c) return new Response("Introuvable", { status: 404 });
  const [purchases, items, points, notes, requests] = await Promise.all([
    db.select().from(sales).where(eq(sales.customerId, id)),
    db.select({ i: saleItems }).from(saleItems).innerJoin(sales, eq(sales.id, saleItems.saleId)).where(eq(sales.customerId, id)),
    db.select().from(loyaltyTransactions).where(eq(loyaltyTransactions.customerId, id)),
    db.select().from(activities).where(eq(activities.customerId, id)),
    db.select().from(leads).where(eq(leads.customerId, id)),
  ]);
  await audit(u.id, "export.rgpd", id);
  const body = JSON.stringify({ exporte_le: new Date().toISOString(), client: c, achats: purchases.map((p) => ({ ...p, lignes: items.filter((x) => x.i.saleId === p.id).map((x) => x.i) })), fidelite: points, historique: notes, demandes: requests }, null, 2);
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="client-${id}.json"`, "cache-control": "no-store" } });
}
