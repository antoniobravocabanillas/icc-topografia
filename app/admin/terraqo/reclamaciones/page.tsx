import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformBillingAdmin } from "@/lib/terraqo/billing/authorization";
import {
  complaintCode,
  receiptText,
  deliverComplaintMail,
} from "@/lib/server/complaints";
import type { ComplaintInput } from "@/lib/terraqo/complaints-validation";
import s from "@/components/terraqo/legal.module.css";
import { sendTransactionalEmail } from "@/lib/server/transactional-email";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Libro de Reclamaciones · Administración Terraqo",
  robots: { index: false, follow: false },
};
async function respond(form: FormData) {
  "use server";
  const actor = await requirePlatformBillingAdmin();
  const id = Number(form.get("id"));
  const response = String(form.get("response") || "").trim();
  const postalEvidence = String(form.get("postalEvidence") || "").trim();
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    response.length < 10 ||
    response.length > 10000
  )
    redirect("/admin/terraqo/reclamaciones?error=invalid");
  let failure = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        const row = await tx.terraqoComplaint.findUniqueOrThrow({
          where: { id },
        });
        const p = row.payload as Omit<ComplaintInput, "key" | "website">;
        if (
          p.channel === "POSTAL" &&
          (postalEvidence.length < 10 ||
            postalEvidence.length > 1000 ||
            form.get("dispatched") !== "on")
        )
          throw new Error("POSTAL_EVIDENCE_REQUIRED");
        const changed = await tx.terraqoComplaint.updateMany({
          where: { id, response: null },
          data: {
            response,
            responseActor: actor.id,
            ...(p.channel === "POSTAL"
              ? { postalEvidence, respondedAt: new Date() }
              : {}),
          },
        });
        if (!changed.count) return;
        if (p.channel === "EMAIL")
          await tx.terraqoComplaintMail.create({
            data: {
              complaintId: id,
              kind: "RESPONSE",
              recipient: p.email,
              text: `Respuesta de VRILLA S.A.C. a la hoja ${complaintCode(id)}\n\n${response}\n\n${receiptText(id, p, row.createdAt, row.dueAt)}`,
            },
          });
        await tx.terraqoComplaintEvent.create({
          data: {
            complaintId: id,
            actor: actor.id,
            action:
              p.channel === "POSTAL"
                ? "POSTAL_DISPATCH_RECORDED"
                : "RESPONSE_QUEUED",
          },
        });
      },
      { timeout: 15000 },
    );
  } catch {
    failure = true;
  }
  redirect(
    `/admin/terraqo/reclamaciones?id=${id}${failure ? "&error=invalid" : "&saved=1"}`,
  );
}
async function retry() {
  "use server";
  await requirePlatformBillingAdmin();
  await deliverComplaintMail();
  redirect("/admin/terraqo/reclamaciones?mail=processed");
}
async function testMail() {
  "use server";
  await requirePlatformBillingAdmin();
  let accepted = false;
  try {
    const text =
      "Prueba operativa del Libro de Reclamaciones de Terraqo, producto de VRILLA S.A.C. No corresponde a una hoja real. Verifica recepción y carpeta de spam.";
    accepted = (
      await sendTransactionalEmail({
        to: "hola@vrilla.solutions",
        replyTo: "hola@vrilla.solutions",
        subject: "Terraqo · Prueba del canal legal",
        text,
        html: `<p>${text}</p>`,
        idempotencyKey: `legal-channel-${new Date().toISOString().slice(0, 10)}`,
      })
    ).delivered;
  } catch {}
  redirect(
    `/admin/terraqo/reclamaciones?channel=${accepted ? "accepted" : "failed"}`,
  );
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    page?: string;
    pending?: string;
    error?: string;
    saved?: string;
    channel?: string;
  }>;
}) {
  await requirePlatformBillingAdmin();
  const q = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(q.page) || 1));
  const rows = await prisma.terraqoComplaint.findMany({
    where: q.pending === "1" ? { respondedAt: null } : {},
    orderBy: { id: "desc" },
    take: 25,
    skip: (page - 1) * 25,
  });
  const selected =
    q.id && /^\d+$/.test(q.id)
      ? await prisma.terraqoComplaint.findUnique({
          where: { id: Number(q.id) },
          include: { events: { orderBy: { createdAt: "asc" } }, mail: true },
        })
      : null;
  const late = await prisma.terraqoComplaint.count({
    where: { respondedAt: null, dueAt: { lt: new Date() } },
  });
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 text-slate-900">
      <h1 className="text-3xl font-bold">Libro de Reclamaciones</h1>
      {q.channel && (
        <p role="status">
          {q.channel === "accepted"
            ? "Prueba aceptada por el proveedor. Confirmar recepción en hola@vrilla.solutions."
            : "No se pudo enviar. Verificar remitente, dominio y configuración del proveedor."}
        </p>
      )}
      <p className="my-4">
        VRILLA S.A.C. · Terraqo · {late} hojas sin respuesta fuera de plazo. Un
        correo aceptado por el proveedor no garantiza recepción: revisar rebotes
        y evidencias de entrega.
      </p>
      {q.error && (
        <p role="alert">
          No se guardó. Revisa la respuesta y, si es postal, la constancia de
          envío.
        </p>
      )}
      {q.saved && (
        <p role="status">
          Actuación registrada. El correo se procesa en segundo plano.
        </p>
      )}
      <form action={testMail}>
        <button className={s.button}>Probar canal de correo</button>
      </form>
      <div className={s.actions}>
        <Link href="/admin/terraqo/reclamaciones">Todas</Link>
        <Link href="/admin/terraqo/reclamaciones?pending=1">
          Sin respuesta enviada
        </Link>
        <form action={retry}>
          <button className={s.button}>Procesar correos pendientes</button>
        </form>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li className="rounded-lg border bg-white p-4" key={r.id}>
                <Link
                  href={`/admin/terraqo/reclamaciones?id=${r.id}`}
                  className="font-bold text-blue-800"
                >
                  {complaintCode(r.id)}
                </Link>
                <p>
                  {r.createdAt.toLocaleDateString("es-PE", {
                    timeZone: "America/Lima",
                  })}{" "}
                  ·{" "}
                  {r.respondedAt
                    ? "Respuesta enviada"
                    : r.response
                      ? "Envío pendiente"
                      : "Pendiente de respuesta"}
                </p>
                <p>
                  Vence:{" "}
                  {r.dueAt.toLocaleDateString("es-PE", {
                    timeZone: "America/Lima",
                  })}
                </p>
              </li>
            ))}
          </ul>
          {!rows.length && <p>No hay hojas en esta vista.</p>}
          <div className={s.actions}>
            {page > 1 && (
              <Link href={`?page=${page - 1}&pending=${q.pending || ""}`}>
                Anterior
              </Link>
            )}
            {rows.length === 25 && (
              <Link href={`?page=${page + 1}&pending=${q.pending || ""}`}>
                Siguiente
              </Link>
            )}
          </div>
        </aside>
        <section className="min-w-0 rounded-xl border bg-white p-6">
          {selected ? (
            <>
              <pre className={s.receipt}>
                {receiptText(
                  selected.id,
                  selected.payload as Omit<ComplaintInput, "key" | "website">,
                  selected.createdAt,
                  selected.dueAt,
                )}
              </pre>
              {selected.response ? (
                <>
                  <h2 className="mt-6 text-xl font-bold">
                    Respuesta registrada
                  </h2>
                  <p className="whitespace-pre-wrap">{selected.response}</p>
                  {selected.postalEvidence && (
                    <p>Constancia postal: {selected.postalEvidence}</p>
                  )}
                </>
              ) : (
                <form action={respond} className="mt-6">
                  <input name="id" type="hidden" value={selected.id} />
                  <label className={s.field}>
                    Respuesta y acciones adoptadas
                    <textarea
                      name="response"
                      minLength={10}
                      maxLength={10000}
                      required
                    />
                  </label>
                  {(selected.payload as ComplaintInput).channel ===
                    "POSTAL" && (
                    <>
                      <label className={s.field}>
                        Fecha, operador y referencia de constancia de despacho
                        <input
                          name="postalEvidence"
                          required
                          minLength={10}
                          maxLength={1000}
                        />
                      </label>
                      <label className={s.check}>
                        <input name="dispatched" type="checkbox" required />
                        Confirmo que la respuesta escrita ya fue despachada al
                        domicilio indicado y que se conserva su evidencia.
                      </label>
                    </>
                  )}
                  <button className={s.button}>
                    Registrar respuesta definitiva
                  </button>
                  <p>
                    No se modificará el texto original del consumidor. Verifica
                    la respuesta antes de enviarla.
                  </p>
                </form>
              )}
              <h2 className="mt-6 text-xl font-bold">Correo y trazabilidad</h2>
              {selected.mail.map((m) => (
                <p key={m.id}>
                  {m.kind}: {m.sentAt ? "Aceptado por proveedor" : "Pendiente"}{" "}
                  · Intentos {m.attempts} · {m.lastError || m.providerId || ""}
                </p>
              ))}
              {selected.events.map((e) => (
                <p key={e.id}>
                  {e.createdAt.toLocaleString("es-PE", {
                    timeZone: "America/Lima",
                  })}{" "}
                  · {e.action}
                </p>
              ))}
            </>
          ) : (
            <p>
              Selecciona una hoja. Solo la administración de la plataforma
              accede a esta información.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
