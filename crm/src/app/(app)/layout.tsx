import { asc, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { stores, leads } from "@/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { getScope, inStores } from "@/lib/scope";
import { Shell, AutoSubmitSelect } from "@/components/Nav";
import { selectStore } from "../actions";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const scope = await getScope(u);
  const myStores = await db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores)
    .where(and(eq(stores.active, true), inStores(stores.id, u.storeIds))).orderBy(asc(stores.code));
  const [{ n: newLeads }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads)
    .where(and(eq(leads.status, "nouveau"), u.storeIds === null ? undefined : sql`(${inStores(leads.storeId, u.storeIds)} or ${leads.storeId} is null)`));

  const groups = [
    { title: "Pilotage", items: [{ href: "/", label: "Tableau de bord" }, { href: "/boutiques", label: "Points de vente" }, { href: "/ventes", label: "Ventes" }] },
    { title: "Relation client", items: [
      { href: "/clients", label: "Clients" }, { href: "/demandes", label: "Demandes & devis", count: newLeads },
      { href: "/fidelite", label: "Fidélité" }, ...(hasRole(u, "manager") ? [{ href: "/campagnes", label: "Campagnes" }] : []),
    ] },
    { title: "Réseau", items: [
      { href: "/produits", label: "Catalogue" },
      ...(hasRole(u, "manager") ? [{ href: "/connecteurs", label: "Caisses connectées" }] : []),
      ...(hasRole(u, "admin") ? [{ href: "/equipe", label: "Équipe & accès" }, { href: "/journal", label: "Journal" }] : []),
    ] },
  ];
  const roleLabel = { admin: "Siège", manager: "Gérant", staff: "Équipier" }[u.role];

  const side = (
    <>
      {myStores.length > 1 || u.storeIds === null ? (
        <form action={selectStore} className="store-pick">
          <label htmlFor="store-sel">Vue</label>
          <AutoSubmitSelect id="store-sel" name="store" defaultValue={scope.selected}>
            <option value="all">{u.storeIds === null ? "Tout le réseau" : "Toutes mes boutiques"} ({myStores.length})</option>
            {myStores.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </AutoSubmitSelect>
          <noscript><button className="btn btn-sm btn-line" type="submit">OK</button></noscript>
        </form>
      ) : myStores[0] ? <div className="store-pick small" style={{ padding: "0 10px", opacity: .8 }}>{myStores[0].code} · {myStores[0].name}</div> : null}
    </>
  );

  const footer = (
    <form action={logout} className="me">
      <span><b>{u.name}</b><br />{roleLabel} · {u.email}</span>
      <button type="submit">Se déconnecter</button>
    </form>
  );

  return <Shell groups={groups} side={side} footer={footer}>{children}</Shell>;
}
