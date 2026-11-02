import "server-only";
import { cookies } from "next/headers";
import type { CurrentUser } from "./auth";

export const STORE_COOKIE = "lc_store";

/**
 * Boutiques actuellement affichées : sélection du sélecteur (cookie) ∩ droits de l'utilisateur.
 * null = toutes les boutiques (siège, vue consolidée).
 */
export async function getScope(u: CurrentUser): Promise<{ storeIds: string[] | null; selected: string }> {
  const sel = (await cookies()).get(STORE_COOKIE)?.value ?? "all";
  if (sel !== "all" && (u.storeIds === null || u.storeIds.includes(sel))) return { storeIds: [sel], selected: sel };
  return { storeIds: u.storeIds, selected: "all" };
}

export { inStores } from "./scope-sql";
