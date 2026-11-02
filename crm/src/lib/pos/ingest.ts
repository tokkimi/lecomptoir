/*
 * Connecteur caisse générique : toute caisse (SumUp, Zelty, Lightspeed, export CSV…)
 * est ramenée à ce format de ticket, puis ingérée ici de façon idempotente
 * (un ticket = boutique + identifiant externe, rejouable sans doublon).
 */
import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import { customers, loyaltyTransactions, products, saleItems, sales, syncEvents } from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/lib/contact";
import { getLoyaltySettings, pointsFor } from "@/lib/settings";

const cents = z.number().int().min(0).max(10_000_000);

export const saleItemInput = z.object({
  sku: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1000),
  unit_price_cents: cents,
});

export const customerInput = z.object({
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(32).optional(),
  first_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  opt_in_email: z.boolean().optional(),
  opt_in_sms: z.boolean().optional(),
});

export const saleInput = z.object({
  external_id: z.string().trim().min(1).max(128),
  occurred_at: z.coerce.date(),
  total_cents: cents,
  discount_cents: cents.optional(),
  payment_method: z.string().trim().max(40).optional(),
  channel: z.enum(["comptoir", "click_collect", "livraison", "evenement"]).optional(),
  items: z.array(saleItemInput).max(200).default([]),
  customer: customerInput.optional(),
  points_redeemed: z.number().int().min(0).optional(),
});

export type SaleInput = z.input<typeof saleInput>;
export type IngestResult =
  | { status: "ok"; saleId: string; customerId: string | null; pointsEarned: number }
  | { status: "doublon"; saleId: string }
  | { status: "erreur"; message: string };

type Source = "api" | "csv" | "manual" | "seed";

/** Retrouve ou crée le client à partir de l'e-mail ou du téléphone. */
export async function upsertCustomer(
  tx: Tx, storeId: string, c: z.infer<typeof customerInput>, source: Source, at: Date,
): Promise<string | null> {
  const email = normalizeEmail(c.email);
  const phone = normalizePhone(c.phone);
  if (!email && !phone) return null;

  const conds = [email ? eq(customers.email, email) : undefined, phone ? eq(customers.phone, phone) : undefined]
    .filter((x): x is NonNullable<typeof x> => !!x);
  const found = await tx.select().from(customers).where(or(...conds)).limit(2);
  // Si e-mail et téléphone pointent vers deux fiches, on privilégie celle de l'e-mail.
  const existing = found.find((f) => email && f.email === email) ?? found[0];

  const consent = c.opt_in_email || c.opt_in_sms;
  if (existing) {
    await tx.update(customers).set({
      firstName: existing.firstName ?? c.first_name ?? null,
      lastName: existing.lastName ?? c.last_name ?? null,
      email: existing.email ?? (email && !found.some((f) => f.id !== existing.id && f.email === email) ? email : existing.email),
      phone: existing.phone ?? (phone && !found.some((f) => f.id !== existing.id && f.phone === phone) ? phone : existing.phone),
      optInEmail: existing.optInEmail || !!c.opt_in_email,
      optInSms: existing.optInSms || !!c.opt_in_sms,
      consentAt: consent && !existing.consentAt ? at : existing.consentAt,
    }).where(eq(customers.id, existing.id));
    return existing.id;
  }
  const [created] = await tx.insert(customers).values({
    email, phone, firstName: c.first_name ?? null, lastName: c.last_name ?? null,
    homeStoreId: storeId, optInEmail: !!c.opt_in_email, optInSms: !!c.opt_in_sms,
    consentAt: consent ? at : null, source: source === "seed" ? "seed" : source,
  }).returning({ id: customers.id });
  return created.id;
}

export async function ingestSale(db: DB, storeId: string, raw: unknown, source: Source = "api"): Promise<IngestResult> {
  const parsed = saleInput.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "ticket"} : ${i.message}`).join(" ; ");
    const externalId = typeof raw === "object" && raw && "external_id" in raw ? String((raw as { external_id: unknown }).external_id).slice(0, 128) : null;
    await db.insert(syncEvents).values({ storeId, channel: source, status: "erreur", externalId, message });
    return { status: "erreur", message };
  }
  const s = parsed.data;

  const itemsSum = s.items.reduce((a, i) => a + i.quantity * i.unit_price_cents, 0);
  if (s.items.length && Math.abs(itemsSum - (s.discount_cents ?? 0) - s.total_cents) > 1) {
    const message = `Total incohérent : lignes ${itemsSum} − remise ${s.discount_cents ?? 0} ≠ total ${s.total_cents} (centimes)`;
    await db.insert(syncEvents).values({ storeId, channel: source, status: "erreur", externalId: s.external_id, message });
    return { status: "erreur", message };
  }

  const result = await db.transaction(async (tx): Promise<IngestResult> => {
    const [dup] = await tx.select({ id: sales.id }).from(sales)
      .where(and(eq(sales.storeId, storeId), eq(sales.externalId, s.external_id)));
    if (dup) return { status: "doublon", saleId: dup.id };

    const loyalty = await getLoyaltySettings(tx);
    const customerId = s.customer ? await upsertCustomer(tx, storeId, s.customer, source, s.occurred_at) : null;

    let redeemed = 0;
    let welcome = 0;
    if (customerId) {
      const [c] = await tx.select({ points: customers.loyaltyPoints, visits: customers.visits })
        .from(customers).where(eq(customers.id, customerId)).for("update");
      redeemed = Math.min(s.points_redeemed ?? 0, c.points);
      if (c.visits === 0) welcome = loyalty.welcomePoints;
    }
    const earned = customerId ? pointsFor(s.total_cents, loyalty) : 0;

    const [sale] = await tx.insert(sales).values({
      storeId, externalId: s.external_id, customerId, occurredAt: s.occurred_at,
      totalCents: s.total_cents, discountCents: s.discount_cents ?? 0, paymentMethod: s.payment_method ?? null,
      channel: s.channel ?? "comptoir", pointsEarned: earned, pointsRedeemed: redeemed, source,
    }).returning({ id: sales.id });

    if (s.items.length) {
      const skus = [...new Set(s.items.map((i) => i.sku).filter((x): x is string => !!x))];
      const known = skus.length
        ? await tx.select({ id: products.id, sku: products.sku }).from(products).where(inArray(products.sku, skus))
        : [];
      const bySku = new Map(known.map((p) => [p.sku, p.id]));
      await tx.insert(saleItems).values(s.items.map((i) => ({
        saleId: sale.id, productId: i.sku ? bySku.get(i.sku) ?? null : null, sku: i.sku ?? null, name: i.name,
        quantity: i.quantity, unitPriceCents: i.unit_price_cents, totalCents: i.quantity * i.unit_price_cents,
      })));
    }

    if (customerId) {
      const delta = earned + welcome - redeemed;
      await tx.update(customers).set({
        loyaltyPoints: sql`${customers.loyaltyPoints} + ${delta}`,
        totalSpentCents: sql`${customers.totalSpentCents} + ${s.total_cents}`,
        visits: sql`${customers.visits} + 1`,
        firstSeenAt: sql`least(coalesce(${customers.firstSeenAt}, ${s.occurred_at}), ${s.occurred_at})`,
        lastSeenAt: sql`greatest(coalesce(${customers.lastSeenAt}, ${s.occurred_at}), ${s.occurred_at})`,
      }).where(eq(customers.id, customerId));
      const ltx = [
        welcome ? { points: welcome, reason: "Bienvenue au programme" } : null,
        earned ? { points: earned, reason: `Achat ${s.external_id}` } : null,
        redeemed ? { points: -redeemed, reason: `Points utilisés en caisse (${s.external_id})` } : null,
      ].filter((x): x is { points: number; reason: string } => !!x);
      if (ltx.length) {
        await tx.insert(loyaltyTransactions).values(ltx.map((l) => ({ ...l, customerId, storeId, saleId: sale.id })));
      }
    }
    return { status: "ok", saleId: sale.id, customerId, pointsEarned: earned };
  }).catch(async (e: unknown) => {
    // Course entre deux envois simultanés du même ticket : la contrainte unique tranche.
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23505") {
      const [dup] = await db.select({ id: sales.id }).from(sales)
        .where(and(eq(sales.storeId, storeId), eq(sales.externalId, s.external_id)));
      if (dup) return { status: "doublon", saleId: dup.id } as IngestResult;
    }
    throw e;
  });

  if (source !== "seed") {
    await db.insert(syncEvents).values({
      storeId, channel: source, status: result.status, externalId: s.external_id,
      message: result.status === "doublon" ? "Ticket déjà reçu, ignoré" : null,
    });
  }
  return result;
}

/** Remboursement d'un ticket : annule le CA client et les points gagnés. Idempotent. */
export async function refundSale(db: DB, storeId: string, externalId: string, source: Source = "api") {
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales)
      .where(and(eq(sales.storeId, storeId), eq(sales.externalId, externalId))).for("update");
    if (!sale) return { status: "introuvable" as const };
    if (sale.status === "refunded") return { status: "deja_rembourse" as const, saleId: sale.id };
    await tx.update(sales).set({ status: "refunded" }).where(eq(sales.id, sale.id));
    if (sale.customerId) {
      const delta = sale.pointsRedeemed - sale.pointsEarned;
      await tx.update(customers).set({
        loyaltyPoints: sql`greatest(0, ${customers.loyaltyPoints} + ${delta})`,
        totalSpentCents: sql`greatest(0, ${customers.totalSpentCents} - ${sale.totalCents})`,
        visits: sql`greatest(0, ${customers.visits} - 1)`,
      }).where(eq(customers.id, sale.customerId));
      if (delta) {
        await tx.insert(loyaltyTransactions).values({
          customerId: sale.customerId, storeId, saleId: sale.id, points: delta, reason: `Remboursement ${externalId}`,
        });
      }
    }
    await tx.insert(syncEvents).values({ storeId, channel: source, status: "ok", externalId, message: "Remboursement" });
    return { status: "ok" as const, saleId: sale.id };
  });
}
