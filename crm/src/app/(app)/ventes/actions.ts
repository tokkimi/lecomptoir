"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { requireRole, canAccessStore, audit } from "@/lib/auth";
import { refundSale } from "@/lib/pos/ingest";

export async function refund(f: FormData) {
  const u = await requireRole("manager");
  const id = String(f.get("id"));
  const [s] = await db.select().from(sales).where(eq(sales.id, id));
  if (!s || !canAccessStore(u, s.storeId)) redirect("/ventes");
  await refundSale(db, s.storeId, s.externalId, "manual");
  await audit(u.id, "vente.remboursement", s.id);
  redirect(`/ventes/${id}?ok=1`);
}
