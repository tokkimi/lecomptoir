"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="form" style={{ marginTop: 22 }}>
      <input type="hidden" name="next" value={next} />
      <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="field"><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {state.error && <div className="alert err" role="alert">{state.error}</div>}
      <button className="btn btn-blue" type="submit" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</button>
    </form>
  );
}
