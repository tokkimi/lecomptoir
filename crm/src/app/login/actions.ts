"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, audit } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export type LoginState = { error?: string };

const attempts = new Map<string, { n: number; until: number }>();

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) return { error: "Trop de tentatives. Réessayez dans quelques minutes." };

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ok = u && u.active && (await verifyPassword(password, u.passwordHash));
  if (!ok) {
    const cur = a && a.until > Date.now() ? a.n + 1 : 1;
    attempts.set(email, { n: cur, until: Date.now() + 10 * 60_000 });
    return { error: "E-mail ou mot de passe incorrect." };
  }
  attempts.delete(email);
  await createSession(u.id);
  await audit(u.id, "connexion");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
