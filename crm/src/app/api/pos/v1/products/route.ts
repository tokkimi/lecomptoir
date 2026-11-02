import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { authenticateStore } from "@/lib/apikeys";
import { json, unauthorized } from "@/lib/http";

/** Catalogue commun du réseau, pour aligner les références (sku) des caisses. */
export async function GET(req: Request) {
  if (!(await authenticateStore(db, req.headers.get("authorization")))) return unauthorized();
  const rows = await db.select({ sku: products.sku, name: products.name, category: products.category, price_cents: products.priceCents })
    .from(products).where(eq(products.active, true)).orderBy(asc(products.category), asc(products.name));
  return json({ products: rows });
}
