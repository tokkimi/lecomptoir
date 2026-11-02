"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leads, activities, users } from "@/db/schema";
import { requireUser, canAccessStore, audit, type CurrentUser } from "@/lib/auth";
import { normalizeEmail, normalizePhone } from "@/lib/contact";
import { parseEuroToCents } from "@/lib/money";
import { LEAD_STATUS, LEAD_KIND } from "@/lib/leads";

export type State = { error?: string; ok?: string };
const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };

/** Demandes sans boutique (site, franchise) : visibles par le siège et les gérants. */
export async function loadLead(u: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [l] = await db.select().from(leads).where(eq(leads.id, id));
  if (!l) return null;
  if (l.storeId ? !canAccessStore(u, l.storeId) : u.role === "staff") return null;
  return l;
}

export async function updateLead(_: State, f: FormData): Promise<State> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const l = await loadLead(u, id);
  if (!l) return { error: "Demande introuvable." };
  const status = z.enum(Object.keys(LEAD_STATUS) as [keyof typeof LEAD_STATUS]).safeParse(f.get("status"));
  if (!status.success) return { error: "Statut invalide." };
  const storeId = str(f, "storeId");
  if (storeId && !canAccessStore(u, storeId)) return { error: "Boutique non autorisée." };
  const assigneeId = str(f, "assigneeId");
  if (assigneeId) {
    const [a] = await db.select({ id: users.id }).from(users).where(eq(users.id, assigneeId));
    if (!a) return { error: "Responsable introuvable." };
  }
  const value = str(f, "value");
  const cents = value ? parseEuroToCents(value) : null;
  if (value && cents === null) return { error: "Montant estimé illisible." };
  await db.update(leads).set({ status: status.data, storeId, assigneeId, estimatedValueCents: cents, updatedAt: new Date() }).where(eq(leads.id, id));
  if (status.data !== l.status) {
    await db.insert(activities).values({ leadId: id, userId: u.id, kind: "systeme", body: `Statut : ${LEAD_STATUS[l.status]} → ${LEAD_STATUS[status.data]}` });
  }
  revalidatePath(`/demandes/${id}`);
  return { ok: "Demande mise à jour." };
}

export async function addLeadNote(_: State, f: FormData): Promise<State> {
  const u = await requireUser();
  const id = String(f.get("id"));
  if (!(await loadLead(u, id))) return { error: "Demande introuvable." };
  const body = str(f, "body");
  if (!body) return { error: "Écrivez la note." };
  const kind = z.enum(["note", "appel", "email", "sms", "visite"]).catch("note").parse(f.get("kind"));
  await db.insert(activities).values({ leadId: id, userId: u.id, kind, body: body.slice(0, 4000) });
  await db.update(leads).set({ updatedAt: sql`now()` }).where(eq(leads.id, id));
  revalidatePath(`/demandes/${id}`);
  return { ok: "Ajouté." };
}

export async function createLead(_: State, f: FormData): Promise<State> {
  const u = await requireUser();
  const name = str(f, "name"), email = normalizeEmail(str(f, "email")), message = str(f, "message");
  if (!name || !message) return { error: "Nom et message sont obligatoires." };
  if (!email) return { error: "E-mail invalide." };
  const kind = z.enum(Object.keys(LEAD_KIND) as [keyof typeof LEAD_KIND]).catch("question").parse(f.get("kind"));
  const storeId = str(f, "storeId");
  if (storeId && !canAccessStore(u, storeId)) return { error: "Boutique non autorisée." };
  if (!storeId && u.storeIds !== null && u.storeIds.length) return { error: "Choisissez la boutique concernée." };
  const value = str(f, "value");
  const [l] = await db.insert(leads).values({
    kind, name, email, message, company: str(f, "company"), phone: normalizePhone(str(f, "phone")) ?? str(f, "phone"),
    storeId, assigneeId: u.id, estimatedValueCents: value ? parseEuroToCents(value) : null, source: "manual",
  }).returning({ id: leads.id });
  await audit(u.id, "demande.creation", l.id);
  redirect(`/demandes/${l.id}`);
}
