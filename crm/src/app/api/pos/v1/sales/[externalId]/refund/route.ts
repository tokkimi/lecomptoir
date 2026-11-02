import { db } from "@/db";
import { authenticateStore } from "@/lib/apikeys";
import { refundSale } from "@/lib/pos/ingest";
import { json, unauthorized } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ externalId: string }> }) {
  const auth = await authenticateStore(db, req.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { externalId } = await ctx.params;
  const r = await refundSale(db, auth.storeId, decodeURIComponent(externalId), "api");
  return json(r, r.status === "introuvable" ? 404 : 200);
}
