import { and, eq, gte, isNull, lt, sql, type SQL, inArray, isNotNull } from "drizzle-orm";
import { customers } from "@/db/schema";
import type { LoyaltySettings } from "./settings";

export const SEGMENTS = {
  tous: { label: "Tous les clients", hint: "Toutes les fiches actives" },
  nouveaux: { label: "Nouveaux", hint: "Première visite il y a moins de 30 jours" },
  fideles: { label: "Fidèles", hint: "10 visites ou plus, venus récemment" },
  vip: { label: "VIP", hint: "Dépense cumulée au-dessus du seuil VIP" },
  a_risque: { label: "À risque", hint: "Habitués (3 visites et +) absents depuis le seuil « à risque »" },
  perdus: { label: "Perdus", hint: "Aucune visite depuis le seuil « perdu »" },
  anniversaire: { label: "Anniversaire ce mois-ci", hint: "Date de naissance dans le mois en cours" },
  optin_email: { label: "Abonnés e-mail", hint: "Consentement e-mail donné" },
  optin_sms: { label: "Abonnés SMS", hint: "Consentement SMS donné" },
} as const;

export type SegmentKey = keyof typeof SEGMENTS;
export const isSegment = (k: string | undefined | null): k is SegmentKey => !!k && k in SEGMENTS;

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5);

export function segmentWhere(key: SegmentKey, s: LoyaltySettings): SQL | undefined {
  switch (key) {
    case "tous": return undefined;
    case "nouveaux": return gte(customers.firstSeenAt, daysAgo(30));
    case "fideles": return and(gte(customers.visits, 10), gte(customers.lastSeenAt, daysAgo(s.atRiskDays)));
    case "vip": return gte(customers.totalSpentCents, s.vipSpendCents);
    case "a_risque": return and(gte(customers.visits, 3), lt(customers.lastSeenAt, daysAgo(s.atRiskDays)), gte(customers.lastSeenAt, daysAgo(s.lostDays)));
    case "perdus": return lt(customers.lastSeenAt, daysAgo(s.lostDays));
    case "anniversaire": return and(isNotNull(customers.birthday), sql`extract(month from ${customers.birthday}) = extract(month from now())`);
    case "optin_email": return and(eq(customers.optInEmail, true), isNotNull(customers.email));
    case "optin_sms": return and(eq(customers.optInSms, true), isNotNull(customers.phone));
  }
}

/** Clauses communes : fiches non anonymisées, limitées aux boutiques de l'utilisateur. */
export function customerScope(storeIds: string[] | null): SQL | undefined {
  const base = isNull(customers.anonymizedAt);
  if (storeIds === null) return base;
  if (storeIds.length === 0) return sql`false`;
  // Visible si rattaché à une de ses boutiques OU s'il y a déjà acheté.
  const ids = sql.join(storeIds.map((id) => sql`${id}::uuid`), sql`, `);
  return and(base, sql`(${inArray(customers.homeStoreId, storeIds)} or exists (select 1 from sales s where s.customer_id = ${customers.id} and s.store_id in (${ids})))`);
}

/** Badge principal d'un client (affichage liste/fiche). */
export function customerBadge(c: { visits: number; totalSpentCents: number; firstSeenAt: Date | null; lastSeenAt: Date | null }, s: LoyaltySettings) {
  const now = Date.now();
  const since = (d: Date | null) => (d ? (now - d.getTime()) / 864e5 : Infinity);
  if (!c.lastSeenAt) return { key: "prospect", label: "Prospect" };
  if (since(c.lastSeenAt) > s.lostDays) return { key: "perdus", label: "Perdu" };
  if (c.visits >= 3 && since(c.lastSeenAt) > s.atRiskDays) return { key: "a_risque", label: "À risque" };
  if (c.totalSpentCents >= s.vipSpendCents) return { key: "vip", label: "VIP" };
  if (c.visits >= 10) return { key: "fideles", label: "Fidèle" };
  if (since(c.firstSeenAt) <= 30) return { key: "nouveaux", label: "Nouveau" };
  return { key: "regulier", label: "Régulier" };
}
