import type { Store } from "@/db/schema";

export function StoreFields({ s, admin }: { s?: Store; admin: boolean }) {
  const ro = !admin && !!s;
  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: "0 0 140px" }}><label htmlFor="code">Code</label><input id="code" name="code" type="text" defaultValue={s?.code} readOnly={ro} placeholder="PAR-03" required /></div>
        <div className="field"><label htmlFor="name">Nom</label><input id="name" name="name" type="text" defaultValue={s?.name} required /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="kind">Statut</label>
          <select id="kind" name="kind" defaultValue={s?.kind ?? "succursale"} disabled={ro}><option value="succursale">Succursale</option><option value="franchise">Franchise</option></select>
          {ro && <input type="hidden" name="kind" value={s?.kind} />}
        </div>
        <div className="field"><label htmlFor="franchisee">Franchisé (société)</label><input id="franchisee" name="franchisee" type="text" defaultValue={s?.franchisee ?? ""} readOnly={ro} /></div>
      </div>
      <div className="field"><label htmlFor="address">Adresse</label><input id="address" name="address" type="text" defaultValue={s?.address ?? ""} /></div>
      <div className="row">
        <div className="field" style={{ flex: "0 0 120px" }}><label htmlFor="postalCode">Code postal</label><input id="postalCode" name="postalCode" type="text" defaultValue={s?.postalCode ?? ""} /></div>
        <div className="field"><label htmlFor="city">Ville</label><input id="city" name="city" type="text" defaultValue={s?.city ?? ""} /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="phone">Téléphone</label><input id="phone" name="phone" type="tel" defaultValue={s?.phone ?? ""} /></div>
        <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" defaultValue={s?.email ?? ""} /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="posSystem">Logiciel de caisse</label><input id="posSystem" name="posSystem" type="text" list="pos-list" defaultValue={s?.posSystem ?? ""} placeholder="SumUp, Zelty, CSV…" />
          <datalist id="pos-list">{["SumUp", "Square", "Zettle", "Lightspeed", "Zelty", "L'Addition", "Tiller", "Innovorder", "CSV"].map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="target">Objectif CA mensuel (€)</label><input id="target" name="target" type="text" inputMode="decimal" readOnly={ro} defaultValue={s?.monthlyTargetCents ? String(s.monthlyTargetCents / 100) : ""} /></div>
        <div className="field"><label htmlFor="openedOn">Ouverture</label><input id="openedOn" name="openedOn" type="date" defaultValue={s?.openedOn ?? ""} /></div>
      </div>
      {admin && s && (
        <label className="check"><input type="hidden" name="active" value="off" /><input type="checkbox" name="active" value="on" defaultChecked={s.active} /> Boutique active</label>
      )}
    </>
  );
}
