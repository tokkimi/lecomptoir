export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export const unauthorized = () => json({ error: "unauthorized", message: "Clé API absente, invalide ou révoquée (en-tête Authorization: Bearer lc_live_…)." }, 401);

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("Corps de requête trop volumineux.");
  return JSON.parse(text);
}

export function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise les formules à l'ouverture dans Excel (injection CSV).
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const csvResponse = (rows: unknown[][], filename: string) =>
  new Response("﻿" + rows.map((r) => r.map(csvEscape).join(";")).join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
  });
