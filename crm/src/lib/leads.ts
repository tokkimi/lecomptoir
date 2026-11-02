export const LEAD_STATUS = { nouveau: "Nouveau", en_cours: "En cours", gagne: "Gagné", perdu: "Perdu", clos: "Clos" } as const;
export const LEAD_KIND = { question: "Question", commande: "Commande groupe", partenariat: "Partenariat", franchise: "Candidature franchise", autre: "Autre" } as const;
export const LEAD_TONE: Record<string, string> = { nouveau: "gold", en_cours: "blue", gagne: "good", perdu: "bad", clos: "" };
