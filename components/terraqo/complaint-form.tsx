"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import s from "./legal.module.css";
type Receipt = {
  code: string;
  text: string;
  copySent: boolean;
  responded: boolean;
};
export function ComplaintForm() {
  const [key, setKey] = useState("");
  const [minor, setMinor] = useState(false);
  const [channel, setChannel] = useState("EMAIL");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState("");
  async function send(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/terraqo/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          data.error +
            (data.fields
              ? " " +
                Object.entries(data.fields)
                  .map(([k, v]) => `${k}: ${(v as string[]).join(" ")}`)
                  .join("; ")
              : ""),
        );
      setReceipt(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se confirmó el registro. Reintenta.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const id = key || crypto.randomUUID();
    setKey(id);
    await send({ ...data, key: id, minor, channel, confirmed: true });
  }
  function download() {
    if (!receipt) return;
    const blob = new Blob(
      [
        receipt.text +
          `\nClave privada de consulta: ${key || lookup}\nConsultar en https://terraqoglobal.com/libro-de-reclamaciones\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${receipt.code}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const field = (
    name: string,
    label: string,
    required = true,
    type = "text",
    maxLength = 180,
  ) => (
    <label className={s.field}>
      {label}
      <input
        name={name}
        required={required}
        type={type}
        maxLength={maxLength}
      />
    </label>
  );
  return (
    <>
      <div className={s.notice}>
        <strong>LIBRO DE RECLAMACIONES</strong>
        <p>
          Conforme al Código de Protección y Defensa del Consumidor, este
          establecimiento cuenta con un Libro de Reclamaciones a tu disposición.
          Solicítalo para registrar una queja o reclamo. No necesitas iniciar
          sesión.
        </p>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {receipt ? (
        <section aria-label="Constancia del reclamo">
          <h2>Hoja registrada: {receipt.code}</h2>
          <p>
            Guarda tu copia y esta clave privada:{" "}
            <strong>{key || lookup}</strong>. No la compartas públicamente.
          </p>
          <p>
            {receipt.copySent
              ? "La copia fue aceptada por el servicio de correo; revisa también spam."
              : "Puedes descargar o imprimir tu copia ahora. Si indicaste correo, el envío se procesa en segundo plano; no afecta la fecha del registro."}
          </p>
          <pre className={s.receipt}>{receipt.text}</pre>
          <div className={s.actions}>
            <button className={s.button} onClick={download}>
              Descargar constancia
            </button>
            <button className={s.button} onClick={() => window.print()}>
              Imprimir / guardar PDF
            </button>
            <button
              className={s.button}
              disabled={busy}
              onClick={() => send({ action: "lookup", key: key || lookup })}
            >
              Actualizar seguimiento
            </button>
            <button
              className={s.button}
              onClick={() => {
                setReceipt(null);
                setKey("");
                setLookup("");
              }}
            >
              Nueva hoja
            </button>
          </div>
        </section>
      ) : (
        <>
          <details>
            <summary>Consultar una hoja ya registrada</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send({ action: "lookup", key: lookup });
              }}
            >
              <label className={s.field}>
                Clave privada de la constancia
                <input
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                  required
                  maxLength={36}
                />
              </label>
              <button className={s.button} disabled={busy}>
                Consultar
              </button>
            </form>
          </details>
          <form onSubmit={submit}>
            <h2>1. Identificación del consumidor</h2>
            <div className={s.grid}>
              {field("name", "Nombre completo")}
              <label className={s.field}>
                Tipo de documento
                <select name="documentType">
                  <option>DNI</option>
                  <option>CE</option>
                  <option>PASAPORTE</option>
                  <option>OTRO</option>
                </select>
              </label>
              {field("document", "Número de documento", true, "text", 30)}
              {field(
                "address",
                "Domicilio para comunicaciones",
                true,
                "text",
                350,
              )}
              {field("phone", "Teléfono (opcional)", false, "tel", 30)}
              <label className={s.field}>
                Medio de respuesta
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="EMAIL">Correo electrónico</option>
                  <option value="POSTAL">Domicilio postal</option>
                </select>
              </label>
              {field(
                "email",
                channel === "EMAIL"
                  ? "Correo para copia y respuesta"
                  : "Correo para copia (opcional)",
                channel === "EMAIL",
                "email",
                200,
              )}
            </div>
            <label className={s.check}>
              <input
                type="checkbox"
                checked={minor}
                onChange={(e) => setMinor(e.target.checked)}
              />
              El consumidor es menor de edad
            </label>
            <label className={s.field}>
              Padre, madre o representante: nombre, documento y contacto{" "}
              {minor ? "(obligatorio)" : "(si corresponde)"}
              <input name="representative" maxLength={350} required={minor} />
            </label>
            <h2>2. Identificación del bien contratado</h2>
            <div className={s.grid}>
              <label className={s.field}>
                Tipo
                <select name="itemType">
                  <option value="SERVICIO">Servicio</option>
                  <option value="PRODUCTO">Producto</option>
                </select>
              </label>
              {field("item", "Plan, producto o servicio", true, "text", 500)}
              <label className={s.field}>
                Monto reclamado en soles (0 si no aplica)
                <input
                  name="amount"
                  type="number"
                  min="0"
                  max="999999999"
                  step="0.01"
                  defaultValue="0"
                  required
                />
              </label>
              {field(
                "reference",
                "Referencia de compra (opcional)",
                false,
                "text",
                100,
              )}
            </div>
            <h2>3. Detalle y pedido</h2>
            <label className={s.field}>
              Tipo de hoja
              <select name="kind">
                <option value="RECLAMO">
                  Reclamo · relacionado con producto o servicio
                </option>
                <option value="QUEJA">Queja · atención u otro malestar</option>
              </select>
            </label>
            <p>
              Un reclamo expresa disconformidad con el producto o servicio. Una
              queja expresa malestar con la atención u otro aspecto no
              relacionado directamente con estos.
            </p>
            <label className={s.field}>
              ¿Qué ocurrió?
              <textarea
                name="detail"
                required
                minLength={10}
                maxLength={5000}
              />
            </label>
            <label className={s.field}>
              ¿Qué solución solicitas?
              <textarea
                name="request"
                required
                minLength={3}
                maxLength={3000}
              />
            </label>
            <p>
              No incluyas contraseñas, números completos de tarjeta ni CVV. Si
              necesitas aportar evidencia adicional, cita tu código al contactar
              con atención.
            </p>
            {field(
              "signature",
              "Nombre de quien presenta la hoja (confirmación electrónica)",
            )}
            <label className={s.check}>
              <input type="checkbox" required />
              Confirmo que los datos y el pedido consignados corresponden a esta
              hoja y solicito su registro. He leído el aviso de privacidad del
              libro.
            </label>
            <p>
              VRILLA S.A.C. trata estos datos para atender y acreditar tu
              solicitud, no para publicidad. Conservación mínima de la hoja: dos
              años, sin perjuicio de obligaciones o procedimientos pendientes.
              Derechos y contacto en <Link href="/privacidad">Privacidad</Link>.
            </p>
            <label className={s.honeypot} aria-hidden="true">
              Sitio web
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            {key && (
              <p>
                Clave de este intento: <strong>{key}</strong>. Si se interrumpe
                la conexión, consérvala para consultar la hoja.
              </p>
            )}
            <button className={s.button} disabled={busy}>
              {busy ? "Registrando…" : "Registrar hoja de reclamación"}
            </button>
          </form>
        </>
      )}
      <p>
        La formulación del reclamo no impide acudir a otras vías de solución de
        controversias ni es requisito previo para interponer una denuncia ante
        Indecopi. El plazo de respuesta es de 15 días hábiles, sin prórroga.
      </p>
      <p>
        Si no puedes usar este libro, solicita asistencia y el respaldo
        correspondiente a hola@vrilla.solutions o al +51 925 912 607.
      </p>
    </>
  );
}
