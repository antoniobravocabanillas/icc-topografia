"use client";
import Script from "next/script";
import Link from "next/link";
import { PortalPlanCatalog } from "./portal-plan-catalog";
import { LocationSelect } from "@/components/location/location-select";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BILLING_PLANS,
  getBillingPlan,
  money,
  planAmount,
  supportsBillingCycle,
  type BillingCycle,
} from "@/lib/terraqo/billing/catalog";
import s from "./public-experience.module.css";
type Account = {
  id: string;
  workspaceId: string | null;
  planCode: string;
  cycle: string;
  status: string;
  paidThrough: string | null;
  cancelAtPeriodEnd: boolean;
  pending: boolean;
  canAbandon: boolean;
  payments: {
    id: string;
    amountMinor: number;
    paidAt: string;
    refundedMinor: number;
  }[];
};
type State = {
  mode: "test" | "live";
  publicKey: string | null;
  termsVersion: string;
  email: string;
  emailVerified: boolean;
  accounts: Account[];
  workspaces: { id: string; name: string }[];
  mappings: { code: string; cycle: string }[];
};
type CheckoutSdk = {
  token?: { id: string };
  error?: unknown;
  culqi: () => void;
  open: () => void;
  close: () => void;
};
type ThreeDS = {
  publicKey: string;
  settings: unknown;
  options: unknown;
  initAuthentication: (token: string) => void;
  reset: () => void;
};
declare global {
  interface Window {
    CulqiCheckout?: new (key: string, config: unknown) => CheckoutSdk;
    Culqi3DS?: ThreeDS;
  }
}
const messages: Record<string, string> = {
  BILLING_NOT_CONFIGURED: "Los pagos todavía no están configurados. Puedes comparar los planes; no se realizará ningún cargo.",
  VERIFY_EMAIL_FIRST: "Verifica tu correo antes de contratar.",
  PLAN_NOT_READY:
    "Este plan todavía no está habilitado para cobro en este entorno.",
  EXISTING_SUBSCRIPTION_OR_PENDING_PAYMENT:
    "Ya hay una suscripción o un pago pendiente. Actualiza su estado antes de continuar.",
  PROVIDER_REJECTED:
    "Culqi rechazó la operación. Revisa los datos o utiliza otra tarjeta.",
  PROVIDER_ACCESS_DENIED:
    "Culqi no autorizó la operación. El administrador debe revisar la integración.",
  LIVE_BILLING_DISABLED: "Los cobros reales aún no están habilitados.",
  BILLING_UNAVAILABLE:
    "No pudimos cargar la facturación. Puedes reintentar sin perder tu cuenta.",
  PERSONAL_PROFILE_REQUIRED:
    "Este usuario no tiene perfil profesional. Selecciona el plan de tu empresa.",
  WORKSPACE_OWNER_REQUIRED:
    "Solo el propietario puede contratar para esta empresa.",
};
export function BillingConsole({
  initialPlan,
  initialCycle,
}: {
  initialPlan: string;
  initialCycle: BillingCycle;
}) {
  const [data, setData] = useState<State | null>(null);
  const [code, setCode] = useState(
    BILLING_PLANS.some((p) => p.code === initialPlan)
      ? initialPlan
      : "personal-pro",
  );
  const [cycle, setCycle] = useState(initialCycle);
  const [workspaceId, setWorkspaceId] = useState("");
  const [companyName,setCompanyName]=useState("");
  const companyKey=useRef<string|null>(null);
  const [creatingCompany,setCreatingCompany]=useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [scripts, setScripts] = useState({ checkout: false, three: false });
  const request = useRef<Record<string, unknown> | null>(null);
  const sdk = useRef<CheckoutSdk | null>(null);
  const posting = useRef(false);
  const threeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plan = getBillingPlan(code);
  const amount = planAmount(plan, cycle);
  const account = data?.accounts.find((a) =>
    plan.audience === "WORKSPACE"
      ? a.workspaceId === workspaceId
      : !a.workspaceId,
  );
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/terraqo/billing", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setData(body);
      setNotice("");
      setWorkspaceId((current) => current || body.workspaces[0]?.id || "");
    } catch (e) {
      setNotice(
        messages[e instanceof Error ? e.message : ""] ||
          "No se pudo cargar tu membresía.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      if (threeTimer.current) clearTimeout(threeTimer.current);
      sdk.current?.close();
    };
  }, [load]);
  useEffect(()=>{
    if(!account?.pending||account.canAbandon)return;
    let count=0;let running=false;
    const timer=setInterval(async()=>{
      if(running||document.hidden||count>=12)return;
      count++;running=true;
      try{await fetch("/api/terraqo/billing",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:account.id,action:"refresh"})});await load();}finally{running=false;}
    },15000);
    return()=>clearInterval(timer);
  },[account?.id,account?.pending,account?.canAbandon,load]);
  async function submit(payload: Record<string, unknown>) {
    if (posting.current) return;
    posting.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/terraqo/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (!r.ok) {
        setNotice(
          result.uncertain
            ? "Confirmación pendiente. No vuelvas a pagar; actualiza el estado. Terraqo conciliará la operación con Culqi."
            : messages[result.error] ||
                "No se completó la operación. Consulta el estado antes de reintentar.",
        );
        return;
      }
      if (result.status === "NEEDS_3DS") {
        if (!window.Culqi3DS || !data) {
          setNotice(
            "La autenticación bancaria no pudo iniciarse. Tu operación no está confirmada.",
          );
          return;
        }
        window.Culqi3DS.reset();
        window.Culqi3DS.publicKey = data.publicKey!;
        window.Culqi3DS.settings = {
          charge: {
            totalAmount: 300,
            currency: "PEN",
            returnUrl: window.location.origin + window.location.pathname,
          },
          card: { email: data.email },
        };
        window.Culqi3DS.options = {
          showModal: true,
          showLoading: true,
          closeModalAction: () => {
            setBusy(false);
            setNotice(
              "Autenticación cancelada. No se ha confirmado tu suscripción.",
            );
          },
        };
        window.Culqi3DS.initAuthentication(String(payload.tokenId));
        setNotice("Completa la autenticación de tu banco.");
        threeTimer.current = setTimeout(() => {
          setBusy(false);
          setNotice(
            "La autenticación venció. Revisa el estado antes de intentar de nuevo.",
          );
        }, 120000);
        return;
      }
      setNotice(
        result.status === "ACTIVE"
          ? data?.mode === "test"
            ? "Pago de prueba confirmado. No se han modificado los permisos de producción."
            : "Pago confirmado: tu plan ya está activo."
          : "La suscripción está en proceso. Actualiza el estado para confirmar su activación.",
      );
    } catch {
      setNotice(
        "Se interrumpió la conexión. No repitas el pago: primero actualiza su estado.",
      );
    } finally {
      posting.current = false;
      setBusy(false);
      await load();
    }
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !request.current) return;
      if (event.data?.parameters3DS) {
        if (threeTimer.current) clearTimeout(threeTimer.current);
        void submitRef.current({
          ...request.current,
          authentication3DS: event.data.parameters3DS,
        });
      } else if (event.data?.error) {
        setBusy(false);
        setNotice(
          "El banco no pudo autenticar la tarjeta. No se confirmó la suscripción.",
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  async function action(action: "cancel" | "refresh" | "abandon") {
    if (!account) return;
    setBusy(true);
    try {
      const r = await fetch("/api/terraqo/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, action }),
      });
      const result = await r.json();
      setNotice(
        r.ok
          ? action === "cancel"
            ? "Renovación cancelada. Conservas el período ya pagado."
            : "Estado actualizado."
          : messages[result.error] ||
              "La operación requiere conciliación. No vuelvas a pagar.",
      );
      await load();
    } catch {
      setNotice("No pudimos confirmar el resultado. Actualiza el estado.");
    } finally {
      setBusy(false);
    }
  }
  function openCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.publicKey || !window.CulqiCheckout || !consent) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    const payload = {
      planCode: code,
      cycle,
      ...(plan.audience === "WORKSPACE" ? { workspaceId } : {}),
      idempotencyKey: crypto.randomUUID(),
      termsVersion: data.termsVersion,
      consent: true,
      customer: {
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        address: form.get("address"),
        city: form.get("city"),
        country: form.get("country"),
        phone: form.get("phone"),
      },
    };
    const instance = new window.CulqiCheckout(data.publicKey, {
      settings: { title: `Terraqo · ${plan.name}`, currency: "PEN", amount },
      client: { email: data.email },
      options: {
        lang: "es",
        installments: false,
        modal: true,
        paymentMethods: {
          tarjeta: true,
          yape: false,
          billetera: false,
          bancaMovil: false,
          agente: false,
          cuotealo: false,
        },
      },
      appearance: {
        theme: "default",
        menuType: "select",
        defaultStyle: {
          buttonBackground: "#245db7",
          buttonTextColor: "#ffffff",
        },
      },
    });
    instance.culqi = () => {
      if (instance.token?.id) {
        instance.close();
        request.current = { ...payload, tokenId: instance.token.id };
        void submitRef.current(request.current);
      } else {
        setBusy(false);
        setNotice(
          "No se generó la autorización de la tarjeta. Puedes cerrar el formulario y reintentar.",
        );
      }
    };
    sdk.current = instance;
    instance.open();
    setBusy(false);
  }
  const ready =
    data?.publicKey &&
    scripts.checkout &&
    scripts.three &&
    data.emailVerified &&
    data.mappings.some((p) => p.code === code && p.cycle === cycle);
  return (
    <div className={s.experience} style={{ paddingTop: 32 }}>
      <Script
        src="https://js.culqi.com/checkout-js"
        onReady={() => setScripts((x) => ({ ...x, checkout: true }))}
        onError={() =>
          setNotice("No se pudo cargar el formulario seguro de Culqi.")
        }
      />
      <Script
        src="https://3ds.culqi.com"
        onReady={() => setScripts((x) => ({ ...x, three: true }))}
        onError={() =>
          setNotice("No se pudo cargar la autenticación bancaria.")
        }
      />
      <header className={s.intro} style={{padding:"24px 0 32px"}}>
        <p className={s.eyebrow}>Mi membresía</p>
        <h1 style={{fontSize:"clamp(28px,4vw,42px)"}}>Tu membresía, bajo tu control.</h1>
        <p>
          Elige, paga y gestiona tu plan desde Terraqo. Tu cuenta gratuita sigue
          disponible.
        </p>
      </header>
      {data?.mode === "test" && (
        <p role="note" className={s.disclaimer}>
          ENTORNO DE PRUEBA · Utiliza solo tarjetas de prueba. No hay cargos
          reales ni activación de permisos en producción.
        </p>
      )}
      <p role="status" style={{ padding: "16px 0", lineHeight: 1.6 }}>
        {notice}
      </p>
      <PortalPlanCatalog cycle={cycle} busy={busy} onCycle={(value)=>{setCycle(value);setConsent(false);}} onSelect={(value)=>{setCode(value);setConsent(false);}} />
      <div id="facturacion" className="scroll-mt-24" />
      {!data ? (
        <button className={s.primary} onClick={() => void load()}>
          Volver a cargar
        </button>
      ) : (
        <>
          <section className={s.simulator} aria-label="Confirmar plan y facturación">
            <div className={s.config}>
              <h2>Plan y facturación</h2>
              <label>
                Plan
                <select
                  value={code}
                  disabled={busy}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setConsent(false);
                  }}
                >
                  {BILLING_PLANS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.audience === "PERSONAL" ? "Personal" : "Empresa"} ·{" "}
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Periodicidad
                <select
                  value={cycle}
                  disabled={busy}
                  onChange={(e) => {
                    setCycle(e.target.value as BillingCycle);
                    setConsent(false);
                  }}
                >
                  <option value="MONTHLY">Mensual</option>
                  <option value="ANNUAL">Anual · ahorra 16,67%</option>
                </select>
              </label>
              {plan.audience === "WORKSPACE" && (
                <div>
                <label>
                  Empresa a facturar
                  <select
                    value={workspaceId}
                    onChange={(e) => {
                      setWorkspaceId(e.target.value);
                      setConsent(false);
                    }}
                  >
                    <option value="">{data.workspaces.length ? "Seleccionar empresa" : "No tienes empresas propias registradas"}</option>
                    {data.workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={s.disclaimer}>Selecciona la empresa que recibirá el plan. Solo su propietario puede contratar. No necesitas empresa para una membresía personal.</p>
                <details open={data.workspaces.length===0}>
                  <summary>Registrar una empresa nueva</summary>
                  <label>Nombre o razón social<input value={companyName} maxLength={120} disabled={creatingCompany||busy} onChange={e=>setCompanyName(e.target.value)}/></label>
                  <p className={s.disclaimer}>Se creará un espacio gratuito independiente. Este paso no cobra ni activa una suscripción de pago.</p>
                  <button type="button" className={s.primary} disabled={creatingCompany||busy||companyName.trim().length<2} onClick={async()=>{
                    setCreatingCompany(true);companyKey.current ||= crypto.randomUUID();
                    try{const response=await fetch("/api/terraqo/billing/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:companyName.trim(),key:companyKey.current})});const result=await response.json();if(!response.ok)throw new Error(result.error);await load();setWorkspaceId(result.id);setCompanyName("");companyKey.current=null;setNotice("Empresa registrada y seleccionada. Revisa los datos antes de pagar.");}
                    catch(error){setNotice(messages[error instanceof Error?error.message:""]||"No se pudo registrar la empresa. Puedes reintentar sin duplicarla.");}finally{setCreatingCompany(false);}
                  }}>{creatingCompany?"Registrando…":"Crear y seleccionar empresa"}</button>
                </details>
                </div>
              )}
              <p>{plan.description}</p>
              <div className={s.price}>
                {money(amount)}{" "}
                <small>/{cycle === "ANNUAL" ? "año" : "mes"}</small>
              </div>
              <p className={s.disclaimer}>
                Total en soles, IGV incluido cuando corresponda. Renovación
                automática por el mismo período hasta cancelar. Sin cobros de
                excedentes automáticos.
              </p>
              <p className={s.disclaimer}>
                {plan.seats} usuario(s) · {plan.storageMb} MB · {plan.aiActions}{" "}
                acciones IA al mes.
              </p>
            </div>
            <div className={s.config}>
              {account?.paidThrough && (new Date(account.paidThrough)>new Date()||account.pending) ? (
                <>
                  <h2>
                    {account.status === "ACTIVE"
                      ? "Tu período está activo"
                      : "Estado de la suscripción"}
                  </h2>
                  <p>
                    {getBillingPlan(account.planCode).name} · {account.status}
                  </p>
                  <p>
                    Acceso pagado hasta{" "}
                    {new Date(account.paidThrough).toLocaleDateString("es-PE")}
                  </p>
                  <p className={s.disclaimer}>
                    Los cambios de plan se contratan al terminar el período
                    actual: cancela la renovación y conserva tu acceso hasta esa
                    fecha. No cobramos dos planes simultáneamente.
                  </p>
                  <button
                    className={s.primary}
                    disabled={busy}
                    onClick={() => void action("refresh")}
                  >
                    Actualizar estado
                  </button>
                  {!account.cancelAtPeriodEnd && (
                    <details className={s.comparison}>
                      <summary>Cancelar renovación</summary>
                      <p>
                        No elimina tu cuenta ni tus documentos. El acceso pagado
                        termina en la fecha indicada.
                      </p>
                      <button
                        className={s.primary}
                        disabled={busy}
                        onClick={() => void action("cancel")}
                      >
                        Confirmar cancelación
                      </button>
                    </details>
                  )}
                </>
              ) : account?.pending ? (
                <>
                  <h2>Confirmación pendiente</h2>
                  <p>
                    No vuelvas a pagar. Estamos comprobando la operación para
                    evitar duplicados.
                  </p>
                  <button
                    className={s.primary}
                    disabled={busy}
                    onClick={() => void action("refresh")}
                  >
                    Actualizar estado
                  </button>
                  {account.canAbandon&&<><p>La autenticación bancaria no terminó. Puedes descartarla y volver a introducir una tarjeta; no se ha creado una suscripción.</p><button className={s.primary} disabled={busy} onClick={()=>void action("abandon")}>Descartar autenticación y reintentar</button></>}
                </>
              ) : !amount ? (
                <>
                  <h2>Sin tarjeta. Sin vencimiento.</h2>
                  <p>
                    El plan gratuito no requiere pago. Si ya tienes una
                    suscripción, cancela su renovación para volver a Gratis al
                    finalizar el período.
                  </p>
                  <Link className={s.primary} href="/perfil">
                    Ir a mi perfil
                  </Link>
                </>
              ) : (
                !supportsBillingCycle(plan,cycle)?<><h2>Este periodo supera el límite de Culqi</h2><p>La pasarela de esta cuenta admite hasta S/5.000 por plan. Puedes continuar con facturación mensual.</p><button className={s.primary} onClick={()=>{setCycle("MONTHLY");setConsent(false);}}>Cambiar a mensual</button></>:<form onSubmit={openCheckout}>
                  <h2>Datos de facturación</h2>
                  <div style={{ display: "grid", gap: 14 }}>
                    {[
                      { name: "firstName", label: "Nombres", max: 50 },
                      { name: "lastName", label: "Apellidos", max: 50 },
                      { name: "address", label: "Dirección", max: 100 },
                      { name: "phone", label: "Teléfono", max: 15 },
                    ].map((field) => (
                      <label key={field.name}>
                        {field.label}
                        <input
                          name={field.name}
                          required
                          minLength={field.name === "address" ? 5 : 2}
                          maxLength={field.max}
                          style={{
                            display: "block",
                            width: "100%",
                            border: "1px solid #acbdd1",
                            borderRadius: 8,
                            padding: 12,
                            color: "#102238",
                            background: "#fff",
                          }}
                        />
                      </label>
                    ))}
                    <LocationSelect required cityMaxLength={30} />
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      required
                    />
                    Acepto el cobro de {money(amount)} cada{" "}
                    {cycle === "ANNUAL" ? "año" : "mes"}, la renovación
                    automática y las{" "}
                    <Link
                      href="https://terraqoglobal.com/terminos"
                      target="_blank"
                    >
                      condiciones
                    </Link>
                    .
                  </label>
                  <p className={s.disclaimer}>
                    Proveedor: VRILLA S.A.C. · RUC 20616279841. Consulta{" "}
                    <Link href="https://terraqoglobal.com/devoluciones" target="_blank">cambios y devoluciones</Link>,{" "}
                    <Link href="https://terraqoglobal.com/privacidad" target="_blank">privacidad</Link> y el{" "}
                    <Link href="https://terraqoglobal.com/libro-de-reclamaciones" target="_blank">Libro de Reclamaciones</Link>.
                  </p>
                  <p className={s.disclaimer}>
                    Culqi puede validar la tarjeta con S/3 y devolverlos.
                    Terraqo no recibe ni almacena el número de tarjeta o CVV.
                  </p>
                  <button
                    type="submit"
                    className={s.primary}
                    disabled={
                      busy ||
                      !ready ||
                      !consent ||
                      (plan.audience === "WORKSPACE" && !workspaceId)
                    }
                  >
                    {busy
                      ? "Procesando…"
                      : `Pagar · ${money(amount)}`}
                  </button>
                  {!ready && (
                    <p className={s.disclaimer}>
                      {!data.emailVerified
                        ? "Verifica tu correo para continuar."
                        : "El checkout aún no está habilitado para este plan en este entorno."}
                    </p>
                  )}
                </form>
              )}
            </div>
          </section>
          {account && (
            <section className={s.comparison}>
              <h2>Historial de pagos</h2>
              {account.payments.length ? (
                <ul>
                  {account.payments.map((p) => (
                    <li key={p.id}>
                      {new Date(p.paidAt).toLocaleDateString("es-PE")} ·{" "}
                      {money(p.amountMinor)}
                      {p.refundedMinor > 0
                        ? ` · Devuelto ${money(p.refundedMinor)}`
                        : ""}{" "}
                      · Registro {p.id}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay pagos confirmados.</p>
              )}
              <p className={s.disclaimer}>
                Este historial es una constancia de transacción, no reemplaza el
                comprobante tributario.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
