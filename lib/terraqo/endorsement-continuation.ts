export function endorsementContinuation(value?: string | null) {
  return value && /^\/portal\/respaldos\?solicitud=c[a-z0-9]{8,40}$/.test(value) ? value : null;
}
