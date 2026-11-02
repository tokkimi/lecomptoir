import { eq } from "drizzle-orm";
import type { DB, Tx } from "@/db";
import { settings } from "@/db/schema";

export type LoyaltySettings = {
  /** points gagnés par euro dépensé */
  pointsPerEuro: number;
  /** points offerts à la première visite identifiée */
  welcomePoints: number;
  /** jours sans visite avant de passer « à risque » */
  atRiskDays: number;
  /** jours sans visite avant de passer « perdu » */
  lostDays: number;
  /** dépense cumulée (centimes) pour être VIP */
  vipSpendCents: number;
};

export const DEFAULT_LOYALTY: LoyaltySettings = {
  pointsPerEuro: 1, welcomePoints: 10, atRiskDays: 30, lostDays: 90, vipSpendCents: 30000,
};

export async function getLoyaltySettings(conn: DB | Tx): Promise<LoyaltySettings> {
  const [row] = await conn.select().from(settings).where(eq(settings.key, "loyalty"));
  return { ...DEFAULT_LOYALTY, ...((row?.value as Partial<LoyaltySettings>) ?? {}) };
}

export async function saveLoyaltySettings(conn: DB | Tx, value: LoyaltySettings) {
  await conn.insert(settings).values({ key: "loyalty", value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export function pointsFor(totalCents: number, s: LoyaltySettings) {
  return Math.max(0, Math.floor((totalCents / 100) * s.pointsPerEuro));
}
