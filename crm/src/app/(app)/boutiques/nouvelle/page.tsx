import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHead } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { StoreFields } from "../StoreFields";
import { createStore } from "../actions";

export const metadata = { title: "Nouvelle boutique" };

export default async function NewStore() {
  await requireRole("admin");
  return (
    <>
      <PageHead title="Nouveau point de vente" crumbs={<Link href="/boutiques">← Points de vente</Link>} sub="Une fois créée, générez une clé API pour connecter sa caisse." />
      <div className="card" style={{ maxWidth: 760 }}>
        <ActionForm action={createStore} submit="Créer la boutique"><StoreFields admin /></ActionForm>
      </div>
    </>
  );
}
