/*
 * Données de démonstration : 8 boutiques, équipe, carte, ~900 clients, ~75 jours de ventes.
 *   npm run db:seed            (refuse si la base contient déjà des ventes)
 *   npm run db:seed -- --reset (vide tout et recommence — jamais en production)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { CATALOG } from "../src/lib/catalog";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_LOYALTY, pointsFor } from "../src/lib/settings";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL manquant"); process.exit(1); }
const reset = process.argv.includes("--reset");
if (reset && process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusé : --reset en production. Ajoutez --force si c'est vraiment voulu."); process.exit(1);
}
const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });
const { stores, users, userStores, products, customers, sales, saleItems, rewards, loyaltyTransactions, leads, activities, settings, storeApiKeys, syncEvents, campaigns } = schema;

let seed = 20261101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(sales);
if (n > 0 && !reset) { console.log("La base contient déjà des ventes : seed ignoré (utilisez --reset)."); await client.end(); process.exit(0); }
if (reset) {
  await db.execute(sql`truncate table audit_log, campaigns, activities, leads, sync_events, store_api_keys, settings, loyalty_transactions, rewards, sale_items, sales, products, customers, sessions, user_stores, users, stores restart identity cascade`);
}

const STORES = [
  { code: "PAR-01", name: "Paris Bastille", city: "Paris", postalCode: "75011", kind: "succursale", traffic: 1.3, pos: "SumUp" },
  { code: "PAR-02", name: "La Défense", city: "Puteaux", postalCode: "92800", kind: "succursale", traffic: 1.5, pos: "Zelty" },
  { code: "LYO-01", name: "Lyon Part-Dieu", city: "Lyon", postalCode: "69003", kind: "succursale", traffic: 1.2, pos: "SumUp" },
  { code: "LIL-01", name: "Lille Centre", city: "Lille", postalCode: "59000", kind: "franchise", traffic: 0.9, pos: "Lightspeed", franchisee: "SARL Nord Gourmand" },
  { code: "BDX-01", name: "Bordeaux Chartrons", city: "Bordeaux", postalCode: "33300", kind: "franchise", traffic: 0.8, pos: "L'Addition", franchisee: "Comptoir Aquitaine SAS" },
  { code: "NAN-01", name: "Nantes Commerce", city: "Nantes", postalCode: "44000", kind: "franchise", traffic: 0.85, pos: "CSV", franchisee: "SARL Loire & Pain" },
  { code: "MRS-01", name: "Marseille Vieux-Port", city: "Marseille", postalCode: "13001", kind: "franchise", traffic: 1.0, pos: "Square", franchisee: "Massilia Snacking" },
  { code: "TLS-01", name: "Toulouse Capitole", city: "Toulouse", postalCode: "31000", kind: "succursale", traffic: 0.95, pos: "SumUp" },
] as const;

const storeRows = await db.insert(stores).values(STORES.map((s) => ({
  code: s.code, name: s.name, city: s.city, postalCode: s.postalCode, kind: s.kind, posSystem: s.pos,
  franchisee: "franchisee" in s ? s.franchisee : null, address: "[Adresse à renseigner]",
  monthlyTargetCents: Math.round(s.traffic * 38000) * 100, openedOn: `20${int(19, 25)}-0${int(1, 9)}-01`,
}))).returning();

const pw = await hashPassword(process.env.SEED_PASSWORD ?? "comptoir2026");
const [admin] = await db.insert(users).values({ email: "siege@lecomptoir.fr", name: "Direction réseau", role: "admin", passwordHash: pw }).returning();
const team = await db.insert(users).values([
  { email: "gerant.bastille@lecomptoir.fr", name: "Camille Martin", role: "manager" as const, passwordHash: pw },
  { email: "gerant.lyon@lecomptoir.fr", name: "Yanis Bernard", role: "manager" as const, passwordHash: pw },
  { email: "franchise.nord@lecomptoir.fr", name: "Inès Lefebvre", role: "manager" as const, passwordHash: pw },
  { email: "equipier.bastille@lecomptoir.fr", name: "Lucas Petit", role: "staff" as const, passwordHash: pw },
]).returning();
const sid = (code: string) => storeRows.find((s) => s.code === code)!.id;
await db.insert(userStores).values([
  { userId: team[0].id, storeId: sid("PAR-01") }, { userId: team[0].id, storeId: sid("PAR-02") },
  { userId: team[1].id, storeId: sid("LYO-01") },
  { userId: team[2].id, storeId: sid("LIL-01") },
  { userId: team[3].id, storeId: sid("PAR-01") },
]);

const productRows = await db.insert(products).values(CATALOG.map((p) => ({ sku: p.sku, name: p.name, category: p.category, priceCents: p.price }))).returning();
const P = (sku: string) => productRows.find((p) => p.sku === sku)!;
await db.insert(rewards).values([
  { name: "Expresso offert", pointsCost: 40, description: "Un expresso ou un noisette" },
  { name: "Viennoiserie offerte", pointsCost: 50, description: "Croissant ou pain au chocolat" },
  { name: "Bubble tea offert", pointsCost: 150, description: "Toutes combinaisons" },
  { name: "Menu Sandwich offert", pointsCost: 250, description: "Sandwich + boisson + dessert" },
]);
await db.insert(settings).values({ key: "loyalty", value: DEFAULT_LOYALTY });

const FIRST = ["Léa", "Hugo", "Chloé", "Louis", "Emma", "Gabriel", "Manon", "Raphaël", "Inès", "Arthur", "Jade", "Jules", "Sarah", "Adam", "Lina", "Nathan", "Zoé", "Noah", "Camille", "Tom", "Alice", "Sacha", "Nina", "Ethan", "Lou", "Paul", "Mila", "Victor", "Rose", "Malo", "Yasmine", "Karim", "Anaïs", "Mehdi", "Clara", "Théo"];
const LAST = ["Martin", "Bernard", "Thomas", "Petit", "Robert", "Richard", "Durand", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy", "Roux", "David", "Bertrand", "Morel", "Fournier", "Girard", "Bonnet", "Dupont", "Lambert", "Fontaine", "Rousseau", "Vincent", "Muller", "Faure", "Benali", "Nguyen", "Garcia", "Haddad"];
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type C = { id?: string; store: number; freq: number; churnDay: number; startDay: number; email: string | null; phone: string | null };
const NC = 900;
const custSpec: C[] = [];
const custValues: (typeof customers.$inferInsert)[] = [];
for (let i = 0; i < NC; i++) {
  const f = pick(FIRST), l = pick(LAST);
  const store = int(0, STORES.length - 1);
  const hasEmail = rnd() < 0.8;
  const email = hasEmail ? `${strip(f)}.${strip(l)}${i}@exemple.fr` : null;
  const phone = !hasEmail || rnd() < 0.5 ? `+336${String(10000000 + i * 7919).slice(-8)}` : null;
  const optE = !!email && rnd() < 0.55, optS = !!phone && rnd() < 0.4;
  const profile = rnd();
  custSpec.push({
    store, email, phone,
    freq: profile < 0.12 ? 0.55 : profile < 0.4 ? 0.18 : 0.05,
    startDay: rnd() < 0.15 ? int(50, 74) : 0,
    churnDay: rnd() < 0.2 ? int(5, 60) : 999,
  });
  custValues.push({
    firstName: f, lastName: l, email, phone, homeStoreId: storeRows[store].id,
    optInEmail: optE, optInSms: optS, consentAt: optE || optS ? new Date() : null, source: "seed",
    birthday: rnd() < 0.45 ? `19${int(70, 99)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}` : null,
    tags: rnd() < 0.1 ? ["entreprise"] : rnd() < 0.15 ? ["étudiant"] : [],
  });
}
const custRows = await db.insert(customers).values(custValues).returning({ id: customers.id });
custRows.forEach((r, i) => (custSpec[i].id = r.id));

const BASKETS: { w: number; items: string[]; hours: [number, number]; ch?: "click_collect" | "livraison" }[] = [
  { w: 14, items: ["F-SAND"], hours: [11, 14] },
  { w: 6, items: ["F-SAL"], hours: [11, 14] },
  { w: 10, items: ["F-PDJ"], hours: [7, 10] },
  { w: 8, items: ["C-EXP"], hours: [7, 17] },
  { w: 5, items: ["C-LATTE-M", "V-CROI"], hours: [7, 11] },
  { w: 6, items: ["BT"], hours: [14, 19] },
  { w: 5, items: ["M-M"], hours: [13, 19] },
  { w: 3, items: ["M-L", "D-COOKIE"], hours: [14, 19] },
  { w: 4, items: ["S-ROSBIF", "B-CAN"], hours: [11, 14] },
  { w: 3, items: ["S-VEGE", "J-ORANGE"], hours: [11, 14] },
  { w: 3, items: ["G-LCARA"], hours: [9, 18] },
  { w: 3, items: ["V-PAC", "V-PAC", "V-CROI", "BAG"], hours: [7, 10] },
  { w: 2, items: ["F-SAND", "F-SAND", "F-SAL"], hours: [11, 13], ch: "click_collect" },
  { w: 1, items: ["F-SAND", "F-SAND", "F-SAND", "F-SAND", "F-SAL", "F-SAL"], hours: [11, 12], ch: "livraison" },
];
const totalW = BASKETS.reduce((a, b) => a + b.w, 0);
const pickBasket = () => { let x = rnd() * totalW; for (const b of BASKETS) { if ((x -= b.w) < 0) return b; } return BASKETS[0]; };
const PAY = ["CB", "CB", "CB", "Sans contact", "Sans contact", "Espèces", "Titre-restaurant", "Apple Pay"];

const DAYS = 75;
const today = new Date(); today.setHours(0, 0, 0, 0);
const saleVals: (typeof sales.$inferInsert & { _items: string[] })[] = [];
let ticketNo = 0;
for (let d = DAYS - 1; d >= 0; d--) {
  const date = new Date(today.getTime() - d * 864e5);
  const dow = date.getDay();
  const dayFactor = dow === 0 ? 0 : dow === 6 ? 0.7 : 1;
  const growth = 1 + (DAYS - d) / DAYS * 0.15;
  STORES.forEach((s, si) => {
    if (dayFactor === 0 && si !== 0) return;
    const count = Math.round(int(28, 42) * s.traffic * (dayFactor || 0.5) * growth);
    for (let k = 0; k < count; k++) {
      const b = pickBasket();
      const at = new Date(date); at.setHours(int(b.hours[0], b.hours[1]), int(0, 59), int(0, 59));
      if (at > new Date()) continue;
      const total = b.items.reduce((a, sku) => a + P(sku).priceCents, 0);
      saleVals.push({
        storeId: storeRows[si].id, externalId: `${s.code}-${String(++ticketNo).padStart(7, "0")}`, occurredAt: at,
        totalCents: total, paymentMethod: pick(PAY), channel: b.ch ?? "comptoir", source: "seed", _items: b.items,
      });
    }
  });
}
// Attribution des tickets aux clients identifiés selon leur fréquence de visite.
const byStore = new Map<number, C[]>();
custSpec.forEach((c) => byStore.set(c.store, [...(byStore.get(c.store) ?? []), c]));
for (const sv of saleVals) {
  const si = storeRows.findIndex((s) => s.id === sv.storeId);
  const pool = byStore.get(si) ?? [];
  const dayIdx = DAYS - 1 - Math.floor((today.getTime() - new Date(sv.occurredAt as Date).setHours(0, 0, 0, 0)) / 864e5);
  if (rnd() < 0.42) {
    for (let tries = 0; tries < 4; tries++) {
      const c = pick(pool);
      if (dayIdx >= c.startDay && dayIdx <= DAYS - 1 - (DAYS - c.churnDay) && rnd() < c.freq * 3) { sv.customerId = c.id; break; }
    }
  }
  if (sv.customerId) sv.pointsEarned = pointsFor(sv.totalCents as number, DEFAULT_LOYALTY);
}

const CHUNK = 1000;
for (let i = 0; i < saleVals.length; i += CHUNK) {
  const chunk = saleVals.slice(i, i + CHUNK);
  const inserted = await db.insert(sales).values(chunk.map(({ _items, ...v }) => v)).returning({ id: sales.id });
  const items: (typeof saleItems.$inferInsert)[] = [];
  inserted.forEach((r, j) => {
    const counts = new Map<string, number>();
    chunk[j]._items.forEach((sku) => counts.set(sku, (counts.get(sku) ?? 0) + 1));
    for (const [sku, q] of counts) {
      const p = P(sku);
      items.push({ saleId: r.id, productId: p.id, sku, name: p.name, quantity: q, unitPriceCents: p.priceCents, totalCents: q * p.priceCents });
    }
  });
  await db.insert(saleItems).values(items);
}

// Agrégats clients + historique de points, calculés en SQL depuis les ventes.
await db.execute(sql`
  update customers c set
    visits = a.visits, total_spent_cents = a.spent, first_seen_at = a.first, last_seen_at = a.last,
    loyalty_points = a.points + ${DEFAULT_LOYALTY.welcomePoints}
  from (select customer_id, count(*)::int visits, sum(total_cents)::int spent, min(occurred_at) first, max(occurred_at) last, sum(points_earned)::int points
        from sales where customer_id is not null group by customer_id) a
  where a.customer_id = c.id`);
await db.execute(sql`
  insert into loyalty_transactions (customer_id, store_id, sale_id, points, reason, created_at)
  select customer_id, store_id, id, points_earned, 'Achat ' || external_id, occurred_at from sales where customer_id is not null and points_earned > 0`);
await db.execute(sql`
  insert into loyalty_transactions (customer_id, store_id, points, reason, created_at)
  select id, home_store_id, ${DEFAULT_LOYALTY.welcomePoints}, 'Bienvenue au programme', first_seen_at from customers where first_seen_at is not null`);

const leadRows = await db.insert(leads).values([
  { kind: "commande", name: "Sophie Garnier", company: "Agence Lumen", email: "sophie@agence-lumen.fr", phone: "+33612345678", message: "Bonjour, nous aimerions 25 menus sandwich pour un séminaire jeudi prochain, livrés à 12h.", storeId: sid("PAR-02"), estimatedValueCents: 24750, status: "nouveau" },
  { kind: "partenariat", name: "Marc Olivier", company: "Brûlerie des Monts", email: "contact@bruleriedesmonts.fr", message: "Torréfacteur local, nous souhaiterions vous présenter nos cafés de spécialité.", status: "en_cours", assigneeId: admin.id },
  { kind: "franchise", name: "Nadia Benkirane", email: "nadia.b@exemple.fr", phone: "+33698765432", message: "Je suis intéressée par l'ouverture d'un Comptoir à Montpellier. Quelles sont les conditions ?", status: "nouveau", estimatedValueCents: 3500000 },
  { kind: "question", name: "Jean Rey", email: "jean.rey@exemple.fr", message: "Avez-vous des options sans gluten ?", storeId: sid("LYO-01"), status: "clos" },
  { kind: "commande", name: "BDE Sciences Po", company: "BDE", email: "bde@exemple.fr", message: "Petits-déjeuners pour 60 étudiants le 15, possible ?", storeId: sid("LIL-01"), estimatedValueCents: 27000, status: "gagne", assigneeId: team[2].id },
]).returning();
await db.insert(activities).values([
  { leadId: leadRows[1].id, userId: admin.id, kind: "appel", body: "Appel de découverte, échantillons à recevoir semaine prochaine." },
  { leadId: leadRows[4].id, userId: team[2].id, kind: "email", body: "Devis envoyé : 60 formules petit déj à 4,50 €. Accepté." },
]);
await db.insert(campaigns).values({ name: "Relance clients à risque — automne", channel: "sms", segment: "a_risque", message: "Le Comptoir vous manque ? Votre café est offert cette semaine sur présentation de ce SMS. STOP au 36111", createdById: admin.id });

console.log(`Seed terminé : ${storeRows.length} boutiques, ${NC} clients, ${saleVals.length} tickets.`);
console.log(`Connexion : siege@lecomptoir.fr / ${process.env.SEED_PASSWORD ? "(SEED_PASSWORD)" : "comptoir2026"}`);
await client.end();
