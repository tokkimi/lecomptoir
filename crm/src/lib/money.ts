const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("fr-FR");

export const formatEUR = (cents: number | null | undefined) => eur.format((cents ?? 0) / 100);
export const formatEURShort = (cents: number | null | undefined) => eur0.format(Math.round((cents ?? 0) / 100));
export const formatNum = (n: number | null | undefined) => num.format(n ?? 0);
export const formatPct = (ratio: number) => `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(1).replace(".", ",")} %`;

/** "9,90" | "9.90" | "9,90 €" | 9.9 → 990. Renvoie null si illisible. */
export function parseEuroToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[€\s ]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
