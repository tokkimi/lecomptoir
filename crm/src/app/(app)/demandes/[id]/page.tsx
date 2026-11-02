import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { activities, stores, users, customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { inStores } from "@/lib/scope";
import { formatPhone, fullName } from "@/lib/contact";
import { LEAD_KIND, LEAD_STATUS, LEAD_TONE } from "@/lib/leads";
import { PageHead, fmtDateTime } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { loadLead, updateLead, addLeadNote } from "../actions";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const l = await loadLead(u, id);
  if (!l) notFound();
  const [notes, storeList, team, match] = await Promise.all([
    db.select({ a: activities, by: users.name }).from(activities).leftJoin(users, eq(users.id, activities.userId)).where(eq(activities.leadId, id)).orderBy(desc(activities.createdAt)),
    db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores).where(inStores(stores.id, u.storeIds)).orderBy(asc(stores.code)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    l.customerId ? db.select().from(customers).where(eq(customers.id, l.customerId))
      : db.select().from(customers).where(or(eq(customers.email, l.email), l.phone ? eq(customers.phone, l.phone) : eq(customers.email, l.email))).limit(1),
  ]);
  const client = match[0];
  const newClientHref = `/clients/nouveau?lead=${l.id}&name=${encodeURIComponent(l.name)}&email=${encodeURIComponent(l.email)}${l.phone ? `&phone=${encodeURIComponent(l.phone)}` : ""}${l.company ? `&company=${encodeURIComponent(l.company)}` : ""}`;

  return (
    <>
      <PageHead title={l.company ? `${l.company} — ${l.name}` : l.name} crumbs={<Link href="/demandes">← Demandes</Link>}
        sub={<><span className={"badge " + LEAD_TONE[l.status]}>{LEAD_STATUS[l.status]}</span> {LEAD_KIND[l.kind]} · reçue le {fmtDateTime(l.createdAt)} · {l.source === "site" ? "via le site" : "saisie manuelle"}</>}>
        <a className="btn btn-line" href={`mailto:${l.email}?subject=${encodeURIComponent("Le Comptoir — votre demande")}`}>Répondre par e-mail</a>
        {client ? <Link className="btn btn-line" href={`/clients/${client.id}`}>Fiche client : {fullName(client)}</Link> : <Link className="btn btn-gold" href={newClientHref}>Créer la fiche client</Link>}
      </PageHead>
      <div className="grid g-side">
        <div className="stack">
          <div className="card">
            <h2>Message</h2>
            <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{l.message}</p>
            <dl className="dl">
              <dt>E-mail</dt><dd><a href={`mailto:${l.email}`}>{l.email}</a></dd>
              {l.phone && <><dt>Téléphone</dt><dd><a href={`tel:${l.phone}`}>{formatPhone(l.phone)}</a></dd></>}
            </dl>
          </div>
          <div className="card">
            <h2>Suivi</h2>
            <ActionForm action={addLeadNote} submit="Ajouter" resetOnOk style={{ marginBottom: 16 }}>
              <input type="hidden" name="id" value={l.id} />
              <div className="row">
                <div className="field" style={{ flex: "0 0 140px" }}><label htmlFor="kind">Type</label><select id="kind" name="kind"><option value="note">Note</option><option value="appel">Appel</option><option value="email">E-mail</option><option value="visite">Rendez-vous</option></select></div>
                <div className="field"><label htmlFor="body">Contenu</label><input id="body" name="body" type="text" placeholder="Devis envoyé, rappel prévu jeudi…" /></div>
              </div>
            </ActionForm>
            <ul className="timeline">
              {notes.map(({ a, by }) => <li key={a.id} className={"k-" + a.kind}><div>{a.body}<div className="meta">{by ?? "Système"} · {fmtDateTime(a.createdAt)}</div></div></li>)}
              {!notes.length && <li className="k-systeme"><span className="muted">Aucun suivi pour l&apos;instant.</span></li>}
            </ul>
          </div>
        </div>
        <div className="card">
          <h2>Qualification</h2>
          <ActionForm action={updateLead} submit="Enregistrer">
            <input type="hidden" name="id" value={l.id} />
            <div className="field"><label htmlFor="status">Statut</label><select id="status" name="status" defaultValue={l.status}>{Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="assigneeId">Responsable</label><select id="assigneeId" name="assigneeId" defaultValue={l.assigneeId ?? ""}><option value="">— Non attribuée —</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="field"><label htmlFor="storeId">Boutique</label><select id="storeId" name="storeId" defaultValue={l.storeId ?? ""}>{u.storeIds === null && <option value="">— Siège / réseau —</option>}{storeList.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></div>
            <div className="field"><label htmlFor="value">Montant estimé (€)</label><input id="value" name="value" type="text" inputMode="decimal" defaultValue={l.estimatedValueCents ? String(l.estimatedValueCents / 100) : ""} /></div>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
