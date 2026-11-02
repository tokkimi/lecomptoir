import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="login">
      <div className="box">
        <h1>Le Comptoir <small>CRM du réseau</small></h1>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
