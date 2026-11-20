import { certificateDisclosureFields, certificateDisclosureLabels } from "@/lib/terraqo/certificate-disclosure-fields";

export function CertificateDisclosureFields({ fields }: { fields: Record<string, string | readonly string[] | null | undefined> }) {
  return <dl>{certificateDisclosureFields.filter(field => Object.prototype.hasOwnProperty.call(fields, field)).map(field =>
    <div key={field}><dt>{certificateDisclosureLabels[field]}</dt><dd>{Array.isArray(fields[field])
      ? <ul>{(fields[field] as readonly string[]).map((item, i) => <li key={i}>{item}</li>)}</ul>
      : fields[field] === null || fields[field] === "" ? "Sin contenido registrado" : field === "issuedAt"
        ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" }).format(new Date(fields[field] as string))
        : fields[field]}</dd></div>)}</dl>;
}
