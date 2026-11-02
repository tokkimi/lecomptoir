/** Normalise un numéro (français par défaut) au format E.164. Renvoie null si invalide. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.replace(/[\s.\-()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0[1-9]\d{8}$/.test(s)) s = "+33" + s.slice(1);
  if (/^\+33 ?0/.test(s)) s = "+33" + s.slice(4);
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("+33") && e164.length === 12) {
    const n = "0" + e164.slice(3);
    return n.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return e164;
}

export function fullName(c: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null }) {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return n || c.email || formatPhone(c.phone) || "Client anonyme";
}
