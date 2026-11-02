import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { inStores } from "@/lib/scope";
import { PageHead } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { CustomerFields } from "../CustomerFields";
import { createCustomer } from "../actions";

export const metadata = { title: "Nouveau client" };

export default async function NewCustomer({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const list = await db.select({ id: stores.id, name: stores.name, code: stores.code }).from(stores)
    .where(and(eq(stores.active, true), inStores(stores.id, u.storeIds))).orderBy(asc(stores.code));
  const [firstName, ...rest] = (sp.name ?? "").split(" ");
  return (
    <>
      <PageHead title="Nouveau client" crumbs={<Link href="/clients">← Clients</Link>} />
      <div className="card" style={{ maxWidth: 760 }}>
        <ActionForm action={createCustomer} submit="Créer la fiche">
          {sp.lead && <input type="hidden" name="leadId" value={sp.lead} />}
          <CustomerFields stores={list} defaults={{ firstName, lastName: rest.join(" "), email: sp.email, phone: sp.phone, company: sp.company }} />
        </ActionForm>
      </div>
    </>
  );
}
