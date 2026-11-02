import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { inStores } from "@/lib/scope";
import { LEAD_KIND } from "@/lib/leads";
import { PageHead } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { createLead } from "../actions";

export const metadata = { title: "Nouvelle demande" };

export default async function NewLead() {
  const u = await requireUser();
  const list = await db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores).where(inStores(stores.id, u.storeIds)).orderBy(asc(stores.code));
  return (
    <>
      <PageHead title="Nouvelle demande" crumbs={<Link href="/demandes">← Demandes</Link>} sub="Une demande reçue par téléphone ou au comptoir : commande de groupe, devis, partenariat…" />
      <div className="card" style={{ maxWidth: 760 }}>
        <ActionForm action={createLead} submit="Créer la demande">
          <div className="row">
            <div className="field"><label htmlFor="kind">Type</label><select id="kind" name="kind">{Object.entries(LEAD_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="storeId">Boutique</label><select id="storeId" name="storeId">{u.storeIds === null && <option value="">— Siège / réseau —</option>}{list.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></div>
          </div>
          <div className="row">
            <div className="field"><label htmlFor="name">Nom</label><input id="name" name="name" type="text" required /></div>
            <div className="field"><label htmlFor="company">Entreprise</label><input id="company" name="company" type="text" /></div>
          </div>
          <div className="row">
            <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="phone">Téléphone</label><input id="phone" name="phone" type="tel" /></div>
            <div className="field"><label htmlFor="value">Montant estimé (€)</label><input id="value" name="value" type="text" inputMode="decimal" /></div>
          </div>
          <div className="field"><label htmlFor="message">Demande</label><textarea id="message" name="message" required /></div>
        </ActionForm>
      </div>
    </>
  );
}
