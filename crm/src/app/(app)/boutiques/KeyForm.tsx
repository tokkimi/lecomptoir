"use client";
import { useActionState, useState } from "react";
import type { State } from "./actions";

export function KeyForm({ storeId, action }: { storeId: string; action: (s: State, f: FormData) => Promise<State> }) {
  const [state, run, pending] = useActionState(action, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={run} className="form">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="row">
        <div className="field"><label htmlFor="label">Nom de la clé</label><input id="label" name="label" type="text" placeholder="Caisse principale" /></div>
        <div><button className="btn btn-blue" type="submit" disabled={pending}>Générer une clé</button></div>
      </div>
      {state.error && <div className="alert err">{state.error}</div>}
      {state.key && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="alert ok">{state.ok}</div>
          <code className="secret">{state.key}</code>
          <div><button type="button" className="btn btn-line btn-sm" onClick={() => navigator.clipboard.writeText(state.key!).then(() => setCopied(true))}>{copied ? "Copiée" : "Copier la clé"}</button></div>
        </div>
      )}
    </form>
  );
}
