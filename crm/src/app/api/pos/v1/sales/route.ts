import { db } from "@/db";
import { authenticateStore } from "@/lib/apikeys";
import { ingestSale, type IngestResult } from "@/lib/pos/ingest";
import { json, readJson, unauthorized } from "@/lib/http";

/**
 * Réception des tickets d'une caisse.
 * Corps : un ticket, ou { "sales": [ ...jusqu'à 500 tickets ] }. Rejouable sans risque (idempotent sur external_id).
 */
export async function POST(req: Request) {
  const auth = await authenticateStore(db, req.headers.get("authorization"));
  if (!auth) return unauthorized();
  let body: unknown;
  try { body = await readJson(req, 5_000_000); } catch { return json({ error: "invalid_json", message: "JSON invalide." }, 400); }

  const batch = typeof body === "object" && body !== null && Array.isArray((body as { sales?: unknown }).sales);
  const list: unknown[] = batch ? (body as { sales: unknown[] }).sales : [body];
  if (list.length > 500) return json({ error: "too_many", message: "500 tickets maximum par envoi." }, 413);

  const results: (IngestResult & { external_id?: string })[] = [];
  for (const s of list) {
    const r = await ingestSale(db, auth.storeId, s, "api");
    results.push({ ...r, external_id: typeof s === "object" && s && "external_id" in s ? String((s as { external_id: unknown }).external_id) : undefined });
  }
  if (!batch) {
    const r = results[0];
    return json(r, r.status === "ok" ? 201 : r.status === "doublon" ? 200 : 422);
  }
  const count = (st: string) => results.filter((r) => r.status === st).length;
  return json({ received: list.length, ok: count("ok"), doublons: count("doublon"), erreurs: count("erreur"), results }, count("erreur") === list.length ? 422 : 207);
}
