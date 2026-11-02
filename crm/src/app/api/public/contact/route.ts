import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, stores } from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/lib/contact";
import { json } from "@/lib/http";

/* Reçoit les messages de la bulle de contact du site vitrine et crée une « demande » dans le CRM. */

const allowed = () => (process.env.PUBLIC_SITE_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !allowed().includes(origin)) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

const KIND_MAP: Record<string, "question" | "commande" | "partenariat" | "franchise" | "autre"> = {
  question: "question", commande: "commande", partenariat: "partenariat", franchise: "franchise", autre: "autre",
};

const body = z.object({
  type: z.string().max(30).optional(),
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().max(254),
  phone: z.string().trim().max(32).optional(),
  msg: z.string().trim().min(5).max(5000),
  store: z.string().trim().max(12).optional(),
  website: z.string().max(0).optional(), // pot de miel anti-robots : doit rester vide
});

export async function POST(req: Request) {
  const headers = cors(req);
  const origin = req.headers.get("origin");
  if (origin && !headers["access-control-allow-origin"]) return json({ error: "origin_not_allowed" }, 403);
  let data: z.infer<typeof body>;
  try {
    const raw = req.headers.get("content-type")?.includes("application/json") ? await req.json() : Object.fromEntries(await req.formData());
    const p = body.safeParse(raw);
    if (!p.success) return json({ error: "invalid", message: "Champs manquants ou invalides." }, 400, headers);
    data = p.data;
  } catch { return json({ error: "invalid" }, 400, headers); }

  const email = normalizeEmail(data.email);
  if (!email) return json({ error: "invalid_email", message: "Adresse e-mail invalide." }, 400, headers);

  // Limite simple : 5 demandes par e-mail et par heure.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads)
    .where(and(eq(leads.email, email), gt(leads.createdAt, new Date(Date.now() - 3600_000))));
  if (n >= 5) return json({ error: "rate_limited" }, 429, headers);

  let storeId: string | null = null;
  if (data.store) {
    const [s] = await db.select({ id: stores.id }).from(stores).where(eq(stores.code, data.store.toUpperCase()));
    storeId = s?.id ?? null;
  }
  await db.insert(leads).values({
    kind: KIND_MAP[data.type ?? ""] ?? "question", name: data.name, company: data.company || null, email,
    phone: normalizePhone(data.phone) ?? data.phone ?? null, message: data.msg, storeId, source: "site",
  });
  return json({ ok: true }, 201, headers);
}
