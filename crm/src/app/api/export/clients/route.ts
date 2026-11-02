import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, stores } from "@/db/schema";
import { getCurrentUser, hasRole, audit } from "@/lib/auth";
import { getScope } from "@/lib/scope";
import { getLoyaltySettings } from "@/lib/settings";
import { isSegment, segmentWhere, customerScope } from "@/lib/segments";
import { csvResponse } from "@/lib/http";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || !hasRole(u, "manager")) return new Response("Accès refusé", { status: 403 });
  const { storeIds } = await getScope(u);
  const seg = new URL(req.url).searchParams.get("seg");
  const loyalty = await getLoyaltySettings(db);
  const rows = await db.select({ c: customers, store: stores.code }).from(customers).leftJoin(stores, eq(stores.id, customers.homeStoreId))
    .where(and(customerScope(storeIds), isSegment(seg) ? segmentWhere(seg, loyalty) : undefined)).orderBy(desc(customers.lastSeenAt));
  await audit(u.id, "export.clients", seg ?? "tous", { lignes: rows.length });
  return csvResponse([
    ["id", "prenom", "nom", "email", "telephone", "entreprise", "boutique", "visites", "depense_eur", "points", "premiere_visite", "derniere_visite", "optin_email", "optin_sms", "etiquettes"],
    ...rows.map(({ c, store }) => [c.id, c.firstName, c.lastName, c.email, c.phone, c.company, store, c.visits, (c.totalSpentCents / 100).toFixed(2).replace(".", ","),
      c.loyaltyPoints, c.firstSeenAt?.toISOString().slice(0, 10), c.lastSeenAt?.toISOString().slice(0, 10), c.optInEmail ? "oui" : "non", c.optInSms ? "oui" : "non", c.tags.join(", ")]),
  ], `clients-${seg ?? "tous"}-${new Date().toISOString().slice(0, 10)}.csv`);
}
