"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { STORE_COOKIE } from "@/lib/scope";

export async function selectStore(form: FormData) {
  const u = await requireUser();
  const v = String(form.get("store") ?? "all");
  const allowed = v === "all" || u.storeIds === null || u.storeIds.includes(v);
  (await cookies()).set(STORE_COOKIE, allowed ? v : "all", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 180 });
  revalidatePath("/", "layout");
}
