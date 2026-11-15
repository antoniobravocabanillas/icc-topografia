export function WorklogMediaPreview({ type, src, label, className }: {
  type?: string; src: string; label: string; className?: string;
}) {
  if (type?.startsWith("audio/")) return <audio controls preload="metadata" src={src} aria-label={label} className={className} />;
  if (type?.startsWith("video/")) return <video controls playsInline preload="metadata" src={src} aria-label={label} className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} className={className} />;
}
