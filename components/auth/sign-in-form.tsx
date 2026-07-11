"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = explicitCallbackUrl || "/admin";
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await signIn("credentials", {
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
        redirect: false
      });

      if (response?.error) {
        setError("Credenciales invalidas. Revisa el correo y la contrasena.");
        return;
      }

      const session = await fetch("/api/auth/session").then((res) => res.json()).catch(() => null);
      const role = session?.user?.role;
      router.push(!explicitCallbackUrl && role === "CUSTOMER" ? "/portal" : callbackUrl);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="relative overflow-hidden rounded-lg border bg-card p-6 text-foreground shadow-2xl md:p-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[#24C8EE] to-primary" />
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Acceso seguro</p>
          <h2 className="mt-1 font-display text-2xl font-bold">Ingresar al Portal Terraqo</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Usa tus credenciales para acceder segun tu perfil: cliente, profesional o equipo operativo.</p>
        </div>
      </div>

      <div className="grid gap-4">
      <div>
        <label className="text-sm font-semibold" htmlFor="email">Correo</label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="correo@empresa.com" className="mt-2 bg-muted/40 text-foreground" />
      </div>
      <div>
        <label className="text-sm font-semibold" htmlFor="password">Contrasena</label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="********" className="mt-2 bg-muted/40 text-foreground" />
      </div>
      <Button type="submit" size="lg" disabled={isPending} className="mt-2 w-full">
        {isPending ? "Validando acceso..." : "Ingresar"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
