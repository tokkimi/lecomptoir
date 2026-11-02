import { and, eq, gte, lt, sql, desc, isNotNull } from "drizzle-orm";
import type { DB } from "@/db";
import { sales, saleItems, stores, customers } from "@/db/schema";
import { inStores } from "./scope-sql";

export type Range = { from: Date; to: Date };

export function rangeFromParam(p: string | undefined): Range & { key: string; days: number } {
  const days = p === "7" ? 7 : p === "90" ? 90 : p === "365" ? 365 : 30;
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to.getTime() - days * 864e5 + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, key: String(days), days };
}

export const previous = (r: Range): Range => {
  const span = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - span - 1), to: new Date(r.from.getTime() - 1) };
};

const completed = (r: Range, storeIds: string[] | null) =>
  and(eq(sales.status, "completed"), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to), inStores(sales.storeId, storeIds));

export async function kpis(db: DB, r: Range, storeIds: string[] | null) {
  const [row] = await db.select({
    revenue: sql<number>`coalesce(sum(${sales.totalCents}), 0)::int`,
    tickets: sql<number>`count(*)::int`,
    identified: sql<number>`count(${sales.customerId})::int`,
    customers: sql<number>`count(distinct ${sales.customerId})::int`,
  }).from(sales).where(completed(r, storeIds));
  return { ...row, avgBasket: row.tickets ? Math.round(row.revenue / row.tickets) : 0, identifiedRate: row.tickets ? row.identified / row.tickets : 0 };
}

export async function dailyRevenue(db: DB, r: Range, storeIds: string[] | null) {
  const day = sql<string>`to_char(date_trunc('day', ${sales.occurredAt} at time zone 'Europe/Paris'), 'YYYY-MM-DD')`;
  const rows = await db.select({ day, revenue: sql<number>`sum(${sales.totalCents})::int`, tickets: sql<number>`count(*)::int` })
    .from(sales).where(completed(r, storeIds)).groupBy(day).orderBy(day);
  const map = new Map(rows.map((x) => [x.day, x]));
  const out: { day: string; revenue: number; tickets: number }[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let t = r.from.getTime(); t <= r.to.getTime(); t += 864e5) {
    const k = fmt.format(new Date(t));
    if (!out.length || out[out.length - 1].day !== k) out.push(map.get(k) ?? { day: k, revenue: 0, tickets: 0 });
  }
  return out;
}

export async function revenueByStore(db: DB, r: Range, storeIds: string[] | null) {
  const rows = await db.select({
    id: stores.id, name: stores.name, code: stores.code, city: stores.city, kind: stores.kind,
    target: stores.monthlyTargetCents,
    revenue: sql<number>`coalesce(sum(${sales.totalCents}) filter (where ${sales.id} is not null), 0)::int`,
    tickets: sql<number>`count(${sales.id})::int`,
    identified: sql<number>`count(${sales.customerId})::int`,
  }).from(stores)
    .leftJoin(sales, and(eq(sales.storeId, stores.id), eq(sales.status, "completed"), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .where(and(eq(stores.active, true), inStores(stores.id, storeIds)))
    .groupBy(stores.id);
  return rows.sort((a, b) => b.revenue - a.revenue);
}

export async function topProducts(db: DB, r: Range, storeIds: string[] | null, limit = 8) {
  return db.select({
    name: saleItems.name,
    qty: sql<number>`sum(${saleItems.quantity})::int`,
    revenue: sql<number>`sum(${saleItems.totalCents})::int`,
  }).from(saleItems).innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(completed(r, storeIds)).groupBy(saleItems.name).orderBy(desc(sql`3`)).limit(limit);
}

export async function channelMix(db: DB, r: Range, storeIds: string[] | null) {
  return db.select({ channel: sales.channel, revenue: sql<number>`sum(${sales.totalCents})::int`, tickets: sql<number>`count(*)::int` })
    .from(sales).where(completed(r, storeIds)).groupBy(sales.channel).orderBy(desc(sql`2`));
}

export async function hourlyProfile(db: DB, r: Range, storeIds: string[] | null) {
  const hour = sql<number>`extract(hour from ${sales.occurredAt} at time zone 'Europe/Paris')::int`;
  const rows = await db.select({ hour, tickets: sql<number>`count(*)::int`, revenue: sql<number>`sum(${sales.totalCents})::int` })
    .from(sales).where(completed(r, storeIds)).groupBy(hour).orderBy(hour);
  const m = new Map(rows.map((x) => [x.hour, x]));
  return Array.from({ length: 16 }, (_, i) => i + 6).map((h) => m.get(h) ?? { hour: h, tickets: 0, revenue: 0 });
}

export async function newCustomersCount(db: DB, r: Range, storeIds: string[] | null) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(customers)
    .where(and(isNotNull(customers.firstSeenAt), gte(customers.firstSeenAt, r.from), lt(customers.firstSeenAt, r.to), inStores(customers.homeStoreId, storeIds)));
  return row.n;
}
