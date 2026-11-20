export const certificateDisclosureFields = ["workspaceName", "professionalName", "roleTitle", "scope",
  "contribution", "deliverables", "result", "authorizedExcerpt", "issuedAt"] as const;
export type CertificateDisclosureField = typeof certificateDisclosureFields[number];
export const certificateDisclosureLabels: Record<CertificateDisclosureField, string> = {
  workspaceName: "Empresa", professionalName: "Profesional", roleTitle: "Rol acordado", scope: "Alcance",
  contribution: "Contribución", deliverables: "Entregables", result: "Resultado", authorizedExcerpt: "Extracto", issuedAt: "Fecha de emisión",
};
