/*
 * Import CSV des tickets de caisse. Une ligne = un article ; les lignes
 * partageant le même « ticket » sont regroupées en une vente.
 * Les en-têtes sont reconnus en français ou en anglais, séparateur « ; » ou « , ».
 */
import { parseEuroToCents } from "@/lib/money";
import type { SaleInput } from "./ingest";

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? undefined : src.indexOf("\n"));
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  ticket: ["ticket", "ticket_id", "id_ticket", "numero", "numero_ticket", "receipt", "receipt_id", "transaction_id", "external_id", "id"],
  date: ["date", "date_heure", "datetime", "occurred_at", "created_at", "horodatage"],
  heure: ["heure", "time"],
  total: ["total", "total_ticket", "montant_total", "total_ttc", "amount", "total_amount"],
  remise: ["remise", "discount", "reduction"],
  sku: ["sku", "code", "code_article", "ref", "reference", "product_id"],
  produit: ["produit", "article", "libelle", "designation", "product", "item", "name"],
  quantite: ["quantite", "qte", "qty", "quantity"],
  prix: ["prix", "prix_unitaire", "pu", "unit_price", "price"],
  paiement: ["paiement", "moyen_paiement", "payment", "payment_method", "reglement"],
  canal: ["canal", "channel", "mode"],
  email: ["email", "e-mail", "mail", "client_email", "customer_email"],
  telephone: ["telephone", "tel", "phone", "mobile", "client_telephone", "customer_phone"],
  prenom: ["prenom", "first_name", "client_prenom"],
  nom: ["nom", "last_name", "client_nom"],
  optin: ["optin", "opt_in", "consentement", "newsletter"],
};

const norm = (h: string) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.]+/g, "_");

export function mapHeaders(header: string[]) {
  const idx: Partial<Record<keyof typeof ALIASES, number>> = {};
  header.map(norm).forEach((h, i) => {
    for (const [key, list] of Object.entries(ALIASES)) {
      if (idx[key] === undefined && list.includes(h)) idx[key] = i;
    }
  });
  return idx;
}

/** "31/10/2026 12:15" | "2026-10-31T12:15:00Z" | "31/10/2026" + heure → Date */
export function parseDate(d: string, t?: string): Date | null {
  const s = d.trim();
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (fr) {
    const [, dd, mm, yyyy, hh, mi, ss] = fr;
    const [th, tm] = (t ?? "").split(":");
    const dt = new Date(+yyyy, +mm - 1, +dd, +(hh ?? th ?? 0) || 0, +(mi ?? tm ?? 0) || 0, +(ss ?? 0) || 0);
    return isNaN(dt.getTime()) || dt.getMonth() !== +mm - 1 ? null : dt;
  }
  const iso = new Date(t ? `${s}T${t}` : s);
  return isNaN(iso.getTime()) ? null : iso;
}

export type CsvParseResult = { sales: SaleInput[]; errors: { line: number; message: string }[]; missing: string[] };

export function csvToSales(text: string): CsvParseResult {
  const rows = parseCsv(text);
  const errors: CsvParseResult["errors"] = [];
  if (rows.length < 2) return { sales: [], errors: [{ line: 1, message: "Fichier vide ou sans ligne de données." }], missing: [] };
  const h = mapHeaders(rows[0]);
  const missing = (["ticket", "date"] as const).filter((k) => h[k] === undefined);
  if (h.total === undefined && h.prix === undefined) missing.push("total" as never);
  if (missing.length) return { sales: [], errors: [], missing };

  const get = (r: string[], k: keyof typeof ALIASES) => (h[k] === undefined ? "" : (r[h[k]!] ?? "").trim());
  const groups = new Map<string, { sale: SaleInput & { items: NonNullable<SaleInput["items"]> }; explicitTotal: number | null; line: number }>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const id = get(r, "ticket");
    if (!id) { errors.push({ line, message: "Numéro de ticket manquant." }); return; }
    let g = groups.get(id);
    if (!g) {
      const date = parseDate(get(r, "date"), get(r, "heure") || undefined);
      if (!date) { errors.push({ line, message: `Date illisible : « ${get(r, "date")} ».` }); return; }
      const optin = /^(1|oui|yes|true|x)$/i.test(get(r, "optin"));
      const email = get(r, "email"), phone = get(r, "telephone");
      const canal = norm(get(r, "canal"));
      const channel = (["comptoir", "click_collect", "livraison", "evenement"] as const).find((c) => c === canal || (c === "click_collect" && canal.startsWith("click")));
      g = {
        line,
        explicitTotal: h.total !== undefined ? parseEuroToCents(get(r, "total")) : null,
        sale: {
          external_id: id, occurred_at: date, total_cents: 0, items: [],
          discount_cents: parseEuroToCents(get(r, "remise")) ?? undefined,
          payment_method: get(r, "paiement") || undefined,
          channel,
          customer: email || phone ? {
            email: email || undefined, phone: phone || undefined,
            first_name: get(r, "prenom") || undefined, last_name: get(r, "nom") || undefined,
            opt_in_email: optin && !!email, opt_in_sms: optin && !!phone,
          } : undefined,
        },
      };
      groups.set(id, g);
    }
    const name = get(r, "produit");
    if (name) {
      const qty = parseInt(get(r, "quantite") || "1", 10);
      const price = parseEuroToCents(get(r, "prix"));
      if (!Number.isFinite(qty) || qty < 1 || price === null) {
        errors.push({ line, message: `Article « ${name} » : quantité ou prix illisible.` });
        return;
      }
      g.sale.items.push({ sku: get(r, "sku") || undefined, name, quantity: qty, unit_price_cents: price });
    }
  });

  const sales: SaleInput[] = [];
  for (const g of groups.values()) {
    const itemsSum = g.sale.items.reduce((a, i) => a + i.quantity * i.unit_price_cents, 0);
    const total = g.explicitTotal ?? itemsSum - (g.sale.discount_cents ?? 0);
    if (total === null || total < 0) { errors.push({ line: g.line, message: `Ticket ${g.sale.external_id} : total illisible.` }); continue; }
    // Si le total diffère des lignes sans remise déclarée, on déduit la remise.
    if (g.sale.items.length && g.sale.discount_cents === undefined && itemsSum > total) g.sale.discount_cents = itemsSum - total;
    sales.push({ ...g.sale, total_cents: total });
  }
  return { sales, errors, missing };
}
