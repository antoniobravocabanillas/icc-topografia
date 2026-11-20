"use client";

import { useEffect, useRef, useState } from "react";

type PendingMessage = {
  operationKey: string;
  body: string;
  attachment: { name: string; contentType: string; digest: string; durationMs: number } | null;
};
type Draft = { body: string; pending: PendingMessage | null };

/** An unresolved operation keeps its exact payload and key across reloads. */
export function useMessageDraft(userId: string, conversationId?: string) {
  const key = `terraqo:message-draft:v2:${encodeURIComponent(userId)}:${encodeURIComponent(conversationId || "")}`;
  const [draft, setDraft] = useState<Draft>({ body: "", pending: null });
  const current = useRef(draft);
  const activeKey = useRef(key);
  activeKey.current = key;
  const [ready, setReady] = useState(false);
  const loadedKey = useRef("");
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    setReady(false);
    let restored: Draft = { body: "", pending: null };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw) as Draft;
        if (typeof value.body !== "string" || (value.pending &&
          (typeof value.pending.operationKey !== "string" || typeof value.pending.body !== "string" ||
            (value.pending.attachment && (typeof value.pending.attachment.name !== "string" ||
              typeof value.pending.attachment.digest !== "string" || typeof value.pending.attachment.durationMs !== "number"))))) {
          throw new Error("Invalid draft");
        }
        restored = { body: value.body, pending: value.pending || null };
      }
      setStorageError("");
    } catch {
      setStorageError("No pudimos recuperar el borrador. Habilita el almacenamiento del navegador y vuelve a abrir la conversación.");
      return;
    }
    current.current = restored;
    loadedKey.current = key;
    setDraft(restored);
    setReady(true);
  }, [key]);

  function save(next: Draft) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      if (activeKey.current === key) setStorageError("");
    } catch {
      if (activeKey.current === key) setStorageError("No pudimos guardar el borrador en este dispositivo. El envío requiere almacenamiento disponible para poder reintentarlo con seguridad.");
      return false;
    }
    if (activeKey.current === key) {
      current.current = next;
      setDraft(next);
    }
    return true;
  }

  function setBody(body: string) {
    if (current.current.pending) return;
    if (!save({ body, pending: null })) {
      current.current = { body, pending: null };
      setDraft(current.current);
    }
  }

  async function prepare(body: string, file: File | null, durationMs = 0) {
    const digest = file ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
      .map(value => value.toString(16).padStart(2, "0")).join("") : null;
    if (activeKey.current !== key) throw new Error("La conversación cambió. Revisa el destinatario antes de enviar.");
    const pending = current.current.pending;
    if (pending) {
      if (pending.body !== body || Boolean(pending.attachment) !== Boolean(file) ||
        (pending.attachment && (pending.attachment.digest !== digest || pending.attachment.name !== file?.name || pending.attachment.contentType !== file?.type))) {
        throw new Error("Reintenta el mensaje original. Si tenía un adjunto, selecciona nuevamente el mismo archivo sin modificarlo.");
      }
      return pending;
    }
    const next: PendingMessage = {
      operationKey: crypto.randomUUID(), body,
      attachment: file && digest ? { name: file.name, contentType: file.type, digest, durationMs } : null,
    };
    // Persist before dispatch: a lost response must never produce a fresh key.
    if (!save({ body, pending: next })) throw new Error("No se envió: no fue posible guardar la operación para un reintento seguro.");
    return next;
  }

  function settle(operationKey: string, clearBody: boolean) {
    // Async completions belong to their original storage scope, even when the
    // component has since selected another conversation or begun another draft.
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "null") as Draft | null;
      if (stored?.pending?.operationKey !== operationKey) return false;
      return save({ body: clearBody ? "" : stored.body, pending: null });
    } catch {
      setStorageError("No pudimos actualizar el borrador local. Conserva la conversación abierta y reintenta con el mismo identificador.");
      return false;
    }
  }

  return { body: draft.body, pending: draft.pending, ready: ready && loadedKey.current === key, storageError, setBody, prepare,
    complete: (operationKey: string) => settle(operationKey, true),
    reject: (operationKey: string) => settle(operationKey, false) };
}
