import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { storeApiKeys, stores } from "@/db/schema";
import { randomToken, sha256 } from "./password";

export function generateApiKey() {
  const key = `lc_live_${randomToken(24)}`;
  return { key, prefix: key.slice(0, 14), hash: sha256(key) };
}

/** Vérifie un en-tête « Authorization: Bearer lc_live_… » et renvoie la boutique. */
export async function authenticateStore(db: DB, header: string | null) {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const [row] = await db.select({ keyId: storeApiKeys.id, storeId: stores.id, active: stores.active })
    .from(storeApiKeys).innerJoin(stores, eq(stores.id, storeApiKeys.storeId))
    .where(and(eq(storeApiKeys.keyHash, sha256(token)), isNull(storeApiKeys.revokedAt)));
  if (!row || !row.active) return null;
  await db.update(storeApiKeys).set({ lastUsedAt: new Date() }).where(eq(storeApiKeys.id, row.keyId));
  return { storeId: row.storeId };
}
