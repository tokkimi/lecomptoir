import type { Customer } from "@/db/schema";
import { formatPhone } from "@/lib/contact";

export function CustomerFields({ c, stores, defaults }: { c?: Customer; stores: { id: string; name: string; code: string }[]; defaults?: Partial<Record<string, string>> }) {
  const v = (k: keyof Customer) => (c?.[k] as string | null | undefined) ?? defaults?.[k as string] ?? "";
  return (
    <>
      <div className="row">
        <div className="field"><label htmlFor="firstName">Prénom</label><input id="firstName" name="firstName" type="text" defaultValue={v("firstName")} autoComplete="off" /></div>
        <div className="field"><label htmlFor="lastName">Nom</label><input id="lastName" name="lastName" type="text" defaultValue={v("lastName")} autoComplete="off" /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" defaultValue={v("email")} autoComplete="off" /></div>
        <div className="field"><label htmlFor="phone">Téléphone</label><input id="phone" name="phone" type="tel" defaultValue={c ? formatPhone(c.phone) : defaults?.phone ?? ""} autoComplete="off" /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="company">Entreprise</label><input id="company" name="company" type="text" defaultValue={v("company")} /></div>
        <div className="field"><label htmlFor="birthday">Date de naissance</label><input id="birthday" name="birthday" type="date" defaultValue={v("birthday")} /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="homeStoreId">Boutique de rattachement</label>
          <select id="homeStoreId" name="homeStoreId" defaultValue={v("homeStoreId") || stores[0]?.id}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="tags">Étiquettes</label><input id="tags" name="tags" type="text" defaultValue={c?.tags.join(", ") ?? ""} placeholder="entreprise, étudiant, sans gluten…" /><span className="hint">Séparées par des virgules</span></div>
      </div>
      <div className="field"><label htmlFor="notes">Notes internes</label><textarea id="notes" name="notes" defaultValue={v("notes")} placeholder="Préférences, allergies, habitudes…" /></div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl" style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>Consentement marketing (RGPD)</legend>
        <label className="check"><input type="checkbox" name="optInEmail" defaultChecked={c?.optInEmail} /> Accepte de recevoir des e-mails</label>
        <label className="check"><input type="checkbox" name="optInSms" defaultChecked={c?.optInSms} /> Accepte de recevoir des SMS</label>
        <span className="hint">À cocher uniquement si le client a donné son accord explicite.</span>
      </fieldset>
    </>
  );
}
