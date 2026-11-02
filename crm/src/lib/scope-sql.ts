import { inArray, sql, type SQL, type AnyColumn } from "drizzle-orm";

export function inStores(col: AnyColumn, storeIds: string[] | null): SQL | undefined {
  if (storeIds === null) return undefined;
  if (storeIds.length === 0) return sql`false`;
  return inArray(col, storeIds);
}
