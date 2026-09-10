import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  complaintSchema,
  complaintDeadline,
  type ComplaintInput,
} from "@/lib/terraqo/complaints-validation";
import { legalOperator as op } from "@/lib/terraqo/legal";
import { sendTransactionalEmail } from "./transactional-email";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const complaintCode = (id: number) =>
  `TQ-${String(id).padStart(8, "0")}`;
export function receiptText(
  id: number,
  p: Omit<ComplaintInput, "key" | "website">,
  createdAt: Date,
  dueAt: Date,
) {
  const date = (d: Date) =>
    d.toLocaleString("es-PE", { timeZone: "America/Lima" });
  return `LIBRO DE RECLAMACIONES · HOJA ${complaintCode(id)}\nEstablecimiento ${op.book}\n${op.name} · RUC ${op.ruc}\n${op.address}\n${op.email} · ${op.phone}\nFecha: ${date(createdAt)}\nRespuesta hasta: ${date(dueAt)} (15 días hábiles)\n\n1. CONSUMIDOR\n${p.name}\n${p.documentType}: ${p.document}\nDomicilio: ${p.address}\nCorreo: ${p.email || "No proporcionado"}\nTeléfono: ${p.phone || "No proporcionado"}\nMenor de edad: ${p.minor ? "Sí" : "No"}\nRepresentante: ${p.representative || "No corresponde"}\nCanal de respuesta: ${p.channel === "EMAIL" ? "Correo electrónico" : "Domicilio postal"}\n\n2. BIEN CONTRATADO\n${p.itemType}: ${p.item}\nMonto reclamado: S/ ${Number(p.amount).toFixed(2)}\nReferencia: ${p.reference || "No indicada"}\n\n3. ${p.kind}\nDetalle: ${p.detail}\nPedido: ${p.request}\nConfirmación electrónica: ${p.signature}\n\n4. OBSERVACIONES Y ACCIONES DEL PROVEEDOR\nPendiente de respuesta. El registro no equivale a conformidad ni solución.\n\nReclamo: disconformidad relacionada a productos o servicios. Queja: disconformidad no relacionada a productos o servicios, o malestar respecto a la atención al público.\nLa formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante Indecopi.\nEl proveedor debe responder el reclamo y la queja en un plazo no mayor a quince días hábiles, sin prórroga.\n`;
}
export async function submitComplaint(raw: unknown) {
  const parsed = complaintSchema.parse(raw);
  const { key, website: _, ...payload } = parsed;
  void _;
  const keyHash = hash(key),
    payloadHash = hash(JSON.stringify(payload));
  // Unique bearer key prevents duplicate submissions after connection loss. It is never stored in plaintext.
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${keyHash}))`;
      const prior = await tx.terraqoComplaint.findUnique({
        where: { keyHash },
      });
      if (prior) {
        if (prior.payloadHash !== payloadHash) throw new Error("KEY_CONFLICT");
        return prior;
      }
      const row = await tx.terraqoComplaint.create({
        data: {
          keyHash,
          payloadHash,
          payload: { ...payload, legalVersion: op.version, provider: op },
          dueAt: complaintDeadline(new Date()),
        },
      });
      const text = receiptText(row.id, payload, row.createdAt, row.dueAt);
      const mail: {
        complaintId: number;
        kind: string;
        recipient: string;
        text: string;
      }[] = [
        {
          complaintId: row.id,
          kind: "NOTICE",
          recipient: op.email,
          text: `Nueva hoja ${complaintCode(row.id)}. Revisar https://admin.terraqoglobal.com/admin/terraqo/reclamaciones . Vence ${row.dueAt.toLocaleDateString("es-PE", { timeZone: "America/Lima" })}. No contiene datos del consumidor en esta notificación.`,
        },
      ];
      if (payload.email)
        mail.push({
          complaintId: row.id,
          kind: "COPY",
          recipient: payload.email,
          text,
        });
      await tx.terraqoComplaintMail.createMany({ data: mail });
      await tx.terraqoComplaintEvent.create({
        data: { complaintId: row.id, action: "REGISTERED" },
      });
      return row;
    },
    { maxWait: 10000, timeout: 15000 },
  );
  return result;
}
export async function complaintReceipt(key: string) {
  const row = await prisma.terraqoComplaint.findUnique({
    where: { keyHash: hash(key) },
    include: { mail: { select: { kind: true, sentAt: true } } },
  });
  if (!row) return null;
  return {
    code: complaintCode(row.id),
    text:
      receiptText(
        row.id,
        row.payload as Omit<ComplaintInput, "key" | "website">,
        row.createdAt,
        row.dueAt,
      ) +
      (row.response
        ? `\nRESPUESTA DEL PROVEEDOR\n${row.response}\n${row.respondedAt ? `Enviada: ${row.respondedAt.toLocaleString("es-PE", { timeZone: "America/Lima" })}` : "En proceso de envío"}`
        : ""),
    copySent: row.mail.some((m) => m.kind === "COPY" && m.sentAt),
    responded: !!row.respondedAt,
  };
}
export async function deliverComplaintMail() {
  const due = await prisma.terraqoComplaintMail.findMany({
    where: { sentAt: null, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 8,
  });
  await Promise.all(
    due.map(async (item) => {
      const lease = await prisma.terraqoComplaintMail.updateMany({
        where: { id: item.id, sentAt: null, nextAttemptAt: item.nextAttemptAt },
        data: {
          nextAttemptAt: new Date(Date.now() + 5 * 60000),
          attempts: { increment: 1 },
        },
      });
      if (!lease.count) return;
      try {
        const escaped = item.text.replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c]!,
        );
        const sent = await sendTransactionalEmail({
          to: item.recipient,
          subject: `Terraqo · ${item.kind === "RESPONSE" ? "Respuesta" : "Libro de Reclamaciones"} · ${complaintCode(item.complaintId)}`,
          text: item.text,
          html: `<div style="font:15px/1.7 sans-serif;white-space:pre-wrap">${escaped}</div>`,
          replyTo: op.email,
          idempotencyKey: `complaint-${item.id}`,
        });
        if (!sent.delivered) throw new Error("MAIL_UNAVAILABLE");
        await prisma.$transaction(async (tx) => {
          await tx.terraqoComplaintMail.update({
            where: { id: item.id },
            data: { sentAt: new Date(), providerId: sent.id, lastError: null },
          });
          if (item.kind === "RESPONSE")
            await tx.terraqoComplaint.update({
              where: { id: item.complaintId },
              data: { respondedAt: new Date() },
            });
          await tx.terraqoComplaintEvent.create({
            data: {
              complaintId: item.complaintId,
              action: `${item.kind}_MAIL_ACCEPTED`,
            },
          });
        });
      } catch {
        await prisma.terraqoComplaintMail.update({
          where: { id: item.id },
          data: {
            lastError: "No se confirmó el envío. Reintento pendiente.",
            nextAttemptAt: new Date(
              Date.now() + Math.min(60, 5 * (item.attempts + 1)) * 60000,
            ),
          },
        });
      }
    }),
  );
  return due.length;
}
