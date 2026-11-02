"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { stores, storeApiKeys } from "@/db/schema";
import { requireRole, canAccessStore, audit } from "@/lib/auth";
import { generateApiKey } from "@/lib/apikeys";
import { parseEuroToCents } from "@/lib/money";

export type State = { error?: string; ok?: string; key?: string };
const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };

function readStore(f: FormData) {
  const code = (str(f, "code") ?? "").toUpperCase();
  const name = str(f, "name");
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) return { error: "Code boutique : 2 à 12 caractères (lettres, chiffres, tirets), ex. PAR-03." };
  if (!name) return { error: "Indiquez le nom de la boutique." };
  const target = str(f, "target");
  const targetCents = target ? parseEuroToCents(target) : null;
  if (target && targetCents === null) return { error: "Objectif mensuel illisible." };
  const kind = f.get("kind") === "franchise" ? "franchise" as const : "succursale" as const;
  return {
    data: {
      code, name, kind, franchisee: kind === "franchise" ? str(f, "franchisee") : null,
      address: str(f, "address"), postalCode: str(f, "postalCode"), city: str(f, "city"), phone: str(f, "phone"), email: str(f, "email"),
      posSystem: str(f, "posSystem"), monthlyTargetCents: targetCents, openedOn: str(f, "openedOn"), active: !f.has("active") || f.getAll("active").includes("on"),
    },
  };
}

export async function createStore(_: State, f: FormData): Promise<State> {
  const u = await requireRole("admin");
  const r = readStore(f);
  if ("error" in r) return { error: r.error };
  const [exists] = await db.select({ id: stores.id }).from(stores).where(eq(stores.code, r.data.code));
  if (exists) return { error: "Ce code boutique est déjà utilisé." };
  const [s] = await db.insert(stores).values(r.data).returning({ id: stores.id });
  await audit(u.id, "boutique.creation", s.id, { code: r.data.code });
  redirect(`/boutiques/${s.id}?ok=cree`);
}

export async function updateStore(_: State, f: FormData): Promise<State> {
  const u = await requireRole("manager");
  const id = String(f.get("id"));
  if (!canAccessStore(u, id)) return { error: "Accès refusé." };
  const r = readStore(f);
  if ("error" in r) return { error: r.error };
  const [cur] = await db.select().from(stores).where(eq(stores.id, id));
  if (!cur) return { error: "Boutique introuvable." };
  // Les gérants ne modifient que les infos pratiques ; code, statut et objectif restent au siège.
  const data = u.role === "admin" ? r.data : { ...r.data, code: cur.code, kind: cur.kind, franchisee: cur.franchisee, monthlyTargetCents: cur.monthlyTargetCents, active: cur.active };
  if (data.code !== cur.code) {
    const [exists] = await db.select({ id: stores.id }).from(stores).where(eq(stores.code, data.code));
    if (exists) return { error: "Ce code boutique est déjà utilisé." };
  }
  await db.update(stores).set(data).where(eq(stores.id, id));
  await audit(u.id, "boutique.modification", id);
  revalidatePath(`/boutiques/${id}`);
  return { ok: "Boutique enregistrée." };
}

export async function createKey(_: State, f: FormData): Promise<State> {
  const u = await requireRole("manager");
  const storeId = String(f.get("storeId"));
  if (!canAccessStore(u, storeId)) return { error: "Accès refusé." };
  const label = str(f, "label") ?? "Caisse";
  const k = generateApiKey();
  await db.insert(storeApiKeys).values({ storeId, label, prefix: k.prefix, keyHash: k.hash });
  await audit(u.id, "cle_api.creation", storeId, { label, prefix: k.prefix });
  revalidatePath(`/boutiques/${storeId}`);
  return { ok: "Clé créée. Copiez-la maintenant : elle ne sera plus affichée.", key: k.key };
}

export async function revokeKey(f: FormData) {
  const u = await requireRole("manager");
  const id = String(f.get("keyId"));
  const [k] = await db.select().from(storeApiKeys).where(eq(storeApiKeys.id, id));
  if (!k || !canAccessStore(u, k.storeId)) redirect("/boutiques");
  await db.update(storeApiKeys).set({ revokedAt: new Date() }).where(and(eq(storeApiKeys.id, id), isNull(storeApiKeys.revokedAt)));
  await audit(u.id, "cle_api.revocation", k.storeId, { prefix: k.prefix });
  revalidatePath(`/boutiques/${k.storeId}`);
}
