import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { customers, rewards } from "@/db/schema";
import { authenticateStore } from "@/lib/apikeys";
import { normalizeEmail, normalizePhone } from "@/lib/contact";
import { json, unauthorized } from "@/lib/http";

/** Recherche d'un client en caisse (e-mail ou téléphone) : solde de points et récompenses disponibles. */
export async function GET(req: Request) {
  if (!(await authenticateStore(db, req.headers.get("authorization")))) return unauthorized();
  const url = new URL(req.url);
  const email = normalizeEmail(url.searchParams.get("email"));
  const phone = normalizePhone(url.searchParams.get("phone"));
  if (!email && !phone) return json({ error: "missing_query", message: "Paramètre email ou phone requis." }, 400);
  const [c] = await db.select().from(customers)
    .where(and(isNull(customers.anonymizedAt), email ? eq(customers.email, email) : eq(customers.phone, phone!)));
  if (!c) return json({ found: false }, 404);
  const available = await db.select({ id: rewards.id, name: rewards.name, points_cost: rewards.pointsCost }).from(rewards)
    .where(and(eq(rewards.active, true), lte(rewards.pointsCost, c.loyaltyPoints))).orderBy(asc(rewards.pointsCost));
  return json({
    found: true,
    customer: { id: c.id, first_name: c.firstName, loyalty_points: c.loyaltyPoints, visits: c.visits },
    rewards_available: available,
  });
}
