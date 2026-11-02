"use client";
import { useActionState, useEffect, useRef } from "react";

type State = { error?: string; ok?: string };

/** Formulaire branché sur une server action renvoyant { error | ok } ; message affiché sous les champs. */
export function ActionForm({ action, children, submit, className = "form", resetOnOk, style }: {
  action: (s: State, f: FormData) => Promise<State>; children: React.ReactNode; submit: string; className?: string; resetOnOk?: boolean; style?: React.CSSProperties;
}) {
  const [state, run, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form ref={ref} action={run} className={className} style={style}>
      {children}
      {state.error && <div className="alert err" role="alert">{state.error}</div>}
      {state.ok && <div className="alert ok" role="status">{state.ok}</div>}
      <div><button className="btn btn-blue" type="submit" disabled={pending}>{pending ? "Enregistrement…" : submit}</button></div>
    </form>
  );
}
