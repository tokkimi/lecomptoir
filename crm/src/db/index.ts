import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __crmSql?: ReturnType<typeof postgres> };

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : copiez .env.example vers .env.local et renseignez la base Postgres.");
  return postgres(url, { max: process.env.NODE_ENV === "production" ? 5 : 10, prepare: false });
}

export const sqlClient = globalForDb.__crmSql ?? (globalForDb.__crmSql = connect());
export const db: DB = drizzle(sqlClient, { schema });
export { schema };
