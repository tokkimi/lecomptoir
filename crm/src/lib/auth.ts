import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, userStores, stores, auditLog, type Role } from "@/db/schema";
import { randomToken, sha256 } from "./password";

export const SESSION_COOKIE = "lc_session";
const SESSION_DAYS = 14;

export type CurrentUser = {
  id: string; email: string; name: string; role: Role;
  /** null = toutes les boutiques (siège) */
  storeIds: string[] | null;
};

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row || !row.active) return null;
  let storeIds: string[] | null = null;
  if (row.role !== "admin") {
    const links = await db.select({ id: userStores.storeId }).from(userStores)
      .innerJoin(stores, eq(stores.id, userStores.storeId)).where(eq(userStores.userId, row.id));
    storeIds = links.map((l) => l.id);
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, storeIds };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

const RANK: Record<Role, number> = { staff: 1, manager: 2, admin: 3 };
export const hasRole = (u: CurrentUser, min: Role) => RANK[u.role] >= RANK[min];

export async function requireRole(min: Role): Promise<CurrentUser> {
  const u = await requireUser();
  if (!hasRole(u, min)) redirect("/?refus=1");
  return u;
}

export function canAccessStore(u: CurrentUser, storeId: string | null | undefined) {
  if (u.storeIds === null) return true;
  return !!storeId && u.storeIds.includes(storeId);
}

export async function audit(userId: string | null, action: string, target?: string, meta?: unknown) {
  await db.insert(auditLog).values({ userId, action, target, meta: meta ?? null });
}
