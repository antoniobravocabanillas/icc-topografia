"use client";
import {useActionState, useEffect, useRef, useState, type ReactNode} from "react";
import {useFormStatus} from "react-dom";
import {initialStaffPolicyState, type StaffPolicyState} from "@/lib/staff-policy-state";
export function StaffPolicyForm({action,profileId,version,children}: {
  action:(previous:StaffPolicyState,data:FormData)=>Promise<StaffPolicyState>;profileId?:string;version?:string;children:ReactNode;
}) {
  const [state,submit,pending]=useActionState(action,initialStaffPolicyState);
  const [dirty,setDirty]=useState(false);
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(state.status==="saved"){setDirty(false);if(!profileId)form.current?.reset();}},[state.submissionId,state.status,profileId]);
  return <form ref={form} action={submit} data-policy-profile={profileId} className="grid gap-3 md:grid-cols-2" onChange={()=>setDirty(true)}>
    {profileId ? <input type="hidden" name="version" value={state.version || version || ""} /> : null}
    <fieldset disabled={pending || state.status==="conflict"} className="contents">{children}</fieldset>
    <SaveState dirty={dirty} state={state} />
    {state.status==="conflict" ? <button type="button" onClick={()=>window.location.reload()} className="min-h-11 rounded-lg border px-4 text-sm font-semibold md:col-span-2">Recargar perfil</button> : null}
  </form>;
}
function SaveState({dirty,state}: {dirty:boolean;state:StaffPolicyState}) {
  const {pending}=useFormStatus();
  const error=state.status==="review" || state.status==="conflict";
  const message=pending ? "Guardando cambios…" : error ? state.message : dirty ? "Cambios sin guardar." : state.status==="saved" ? state.message : "Los cambios se aplican al guardar.";
  return <p role={error ? "alert" : "status"} aria-live="polite" className={`text-sm md:col-span-2 ${error ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>;
}
