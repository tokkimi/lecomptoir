"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, activities, loyaltyTransactions, rewards, leads } from "@/db/schema";
import { requireUser, requireRole, canAccessStore, audit, type CurrentUser } from "@/lib/auth";
import { customerScope } from "@/lib/segments";
import { normalizeEmail, normalizePhone } from "@/lib/contact";

export type FormState = { error?: string; ok?: string };

async function loadCustomer(u: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), customerScope(u.storeIds)));
  return c ?? null;
}

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };

type CustomerData = {
  firstName: string | null; lastName: string | null; email: string | null; phone: string | null; company: string | null;
  birthday: string | null; homeStoreId: string | null; notes: string | null; tags: string[]; optInEmail: boolean; optInSms: boolean;
};

function readCustomerForm(f: FormData): { error: string } | { data: CustomerData } {
  const emailRaw = str(f, "email"), phoneRaw = str(f, "phone");
  const email = normalizeEmail(emailRaw), phone = normalizePhone(phoneRaw);
  if (emailRaw && !email) return { error: "Adresse e-mail invalide." };
  if (phoneRaw && !phone) return { error: "Numéro de téléphone invalide (ex. 06 12 34 56 78 ou +33…)." };
  if (!email && !phone && !str(f, "lastName") && !str(f, "firstName")) return { error: "Indiquez au moins un nom, un e-mail ou un téléphone." };
  const birthday = str(f, "birthday");
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return { error: "Date de naissance invalide." };
  const tags = (str(f, "tags") ?? "").split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  return {
    data: {
      firstName: str(f, "firstName"), lastName: str(f, "lastName"), email, phone, company: str(f, "company"),
      birthday, homeStoreId: str(f, "homeStoreId"), notes: str(f, "notes"), tags: [...new Set(tags)],
      optInEmail: f.get("optInEmail") === "on" && !!email, optInSms: f.get("optInSms") === "on" && !!phone,
    },
  };
}

async function uniqueConflict(email: string | null, phone: string | null, exceptId?: string) {
  if (!email && !phone) return null;
  const rows = await db.select({ id: customers.id, email: customers.email, phone: customers.phone }).from(customers)
    .where(sql`(${email ? sql`${customers.email} = ${email}` : sql`false`} or ${phone ? sql`${customers.phone} = ${phone}` : sql`false`})`);
  const other = rows.find((r) => r.id !== exceptId);
  if (!other) return null;
  return other.email === email ? "Un client avec cet e-mail existe déjà." : "Un client avec ce téléphone existe déjà.";
}

export async function createCustomer(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const r = readCustomerForm(f);
  if ("error" in r) return { error: r.error };
  if (!r.data.homeStoreId || !canAccessStore(u, r.data.homeStoreId)) return { error: "Choisissez une boutique de rattachement parmi les vôtres." };
  const dup = await uniqueConflict(r.data.email, r.data.phone);
  if (dup) return { error: dup };
  const consent = r.data.optInEmail || r.data.optInSms;
  const leadId = str(f, "leadId");
  const [c] = await db.insert(customers).values({ ...r.data, consentAt: consent ? new Date() : null, source: "manual" }).returning({ id: customers.id });
  await db.insert(activities).values({ customerId: c.id, userId: u.id, kind: "systeme", body: `Fiche créée par ${u.name}` });
  if (leadId) await db.update(leads).set({ customerId: c.id, updatedAt: new Date() }).where(eq(leads.id, leadId));
  await audit(u.id, "client.creation", c.id);
  redirect(`/clients/${c.id}?ok=cree`);
}

export async function updateCustomer(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadCustomer(u, id);
  if (!c) return { error: "Client introuvable." };
  const r = readCustomerForm(f);
  if ("error" in r) return { error: r.error };
  if (r.data.homeStoreId && r.data.homeStoreId !== c.homeStoreId && !canAccessStore(u, r.data.homeStoreId)) return { error: "Boutique non autorisée." };
  const dup = await uniqueConflict(r.data.email, r.data.phone, id);
  if (dup) return { error: dup };
  const newConsent = (r.data.optInEmail && !c.optInEmail) || (r.data.optInSms && !c.optInSms);
  await db.update(customers).set({ ...r.data, consentAt: newConsent ? new Date() : c.consentAt }).where(eq(customers.id, id));
  const changes: string[] = [];
  if (c.optInEmail !== r.data.optInEmail) changes.push(`e-mail ${r.data.optInEmail ? "accepté" : "retiré"}`);
  if (c.optInSms !== r.data.optInSms) changes.push(`SMS ${r.data.optInSms ? "accepté" : "retiré"}`);
  if (changes.length) await db.insert(activities).values({ customerId: id, userId: u.id, kind: "systeme", body: `Consentement marketing : ${changes.join(", ")}` });
  await audit(u.id, "client.modification", id);
  revalidatePath(`/clients/${id}`);
  return { ok: "Fiche enregistrée." };
}

export async function addActivity(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const id = String(f.get("id"));
  if (!(await loadCustomer(u, id))) return { error: "Client introuvable." };
  const body = str(f, "body");
  const kind = z.enum(["note", "appel", "email", "sms", "visite"]).catch("note").parse(f.get("kind"));
  if (!body) return { error: "Écrivez la note." };
  await db.insert(activities).values({ customerId: id, userId: u.id, kind, body: body.slice(0, 4000) });
  revalidatePath(`/clients/${id}`);
  return { ok: "Ajouté à l'historique." };
}

export async function adjustPoints(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadCustomer(u, id);
  if (!c) return { error: "Client introuvable." };
  const rewardId = str(f, "rewardId");
  let points: number, reason: string, rid: string | null = null;
  if (rewardId) {
    const [rw] = await db.select().from(rewards).where(and(eq(rewards.id, rewardId), eq(rewards.active, true)));
    if (!rw) return { error: "Récompense introuvable." };
    points = -rw.pointsCost; reason = `Récompense : ${rw.name}`; rid = rw.id;
  } else {
    if (u.role === "staff") return { error: "Seuls les gérants peuvent ajuster les points à la main." };
    points = parseInt(String(f.get("points") ?? ""), 10);
    reason = str(f, "reason") ?? "";
    if (!Number.isFinite(points) || points === 0 || Math.abs(points) > 5000) return { error: "Indiquez un nombre de points (entre −5000 et 5000)." };
    if (!reason) return { error: "Indiquez le motif de l'ajustement." };
  }
  const storeId = (u.storeIds?.length === 1 ? u.storeIds[0] : null) ?? c.homeStoreId;
  const res = await db.transaction(async (tx) => {
    const [cur] = await tx.select({ p: customers.loyaltyPoints }).from(customers).where(eq(customers.id, id)).for("update");
    if (cur.p + points < 0) return { error: `Solde insuffisant : ${cur.p} points disponibles.` };
    await tx.update(customers).set({ loyaltyPoints: sql`${customers.loyaltyPoints} + ${points}` }).where(eq(customers.id, id));
    await tx.insert(loyaltyTransactions).values({ customerId: id, storeId, userId: u.id, rewardId: rid, points, reason });
    return { ok: rid ? `${reason} — ${-points} points débités.` : `Ajustement de ${points > 0 ? "+" : ""}${points} points enregistré.` };
  });
  await audit(u.id, "client.points", id, { points, reason });
  revalidatePath(`/clients/${id}`);
  return res;
}

/** RGPD — droit à l'effacement : on garde les ventes (comptabilité) mais on efface l'identité. */
export async function anonymizeCustomer(f: FormData) {
  const u = await requireRole("manager");
  const id = String(f.get("id"));
  const c = await loadCustomer(u, id);
  if (!c) redirect("/clients");
  if (String(f.get("confirm") ?? "") !== "EFFACER") redirect(`/clients/${id}?err=confirmation`);
  await db.transaction(async (tx) => {
    await tx.update(customers).set({
      firstName: null, lastName: null, email: null, phone: null, company: null, birthday: null, notes: null, tags: [],
      optInEmail: false, optInSms: false, consentAt: null, anonymizedAt: new Date(),
    }).where(eq(customers.id, id));
    await tx.delete(activities).where(eq(activities.customerId, id));
  });
  await audit(u.id, "client.anonymisation", id);
  redirect("/clients?ok=anonymise");
}
