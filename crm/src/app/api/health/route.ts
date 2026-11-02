import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json } from "@/lib/http";

export async function GET() {
  try { await db.execute(sql`select 1`); return json({ ok: true }); }
  catch { return json({ ok: false }, 503); }
}
