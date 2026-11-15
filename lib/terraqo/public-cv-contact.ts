export function publicCvContactContinuation(value?: string | null) {
  return value && /^\/cv\/[a-z0-9][a-z0-9._-]{2,29}\/contacto$/.test(value) ? value : null;
}
