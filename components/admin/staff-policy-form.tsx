"use client";
import {useState, type ReactNode} from "react";
import {useFormStatus} from "react-dom";
export function StaffPolicyForm({action,profileId,children}: {action:(data:FormData)=>Promise<void>;profileId?:string;children:ReactNode}) {
  const [dirty,setDirty]=useState(false);
  return <form action={action} data-policy-profile={profileId} className="grid gap-3 md:grid-cols-2" onChange={()=>setDirty(true)}>
    {children}<SaveState dirty={dirty} />
  </form>;
}
function SaveState({dirty}: {dirty:boolean}) {
  const {pending}=useFormStatus();
  return <p role="status" aria-live="polite" className="text-sm text-muted-foreground md:col-span-2">{pending ? "Guardando cambios…" : dirty ? "Cambios sin guardar." : "Los cambios se aplican al guardar."}</p>;
}
