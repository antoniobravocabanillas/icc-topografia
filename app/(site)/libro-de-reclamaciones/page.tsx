import { LegalLayout } from "@/components/terraqo/legal-layout";
import { ComplaintForm } from "@/components/terraqo/complaint-form";
import { legalOperator as op } from "@/lib/terraqo/legal";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({
  title: "Libro de Reclamaciones",
  description:
    "Libro de Reclamaciones virtual de Terraqo, producto de VRILLA S.A.C. Registra tu hoja y conserva una copia sin iniciar sesión.",
  path: "/libro-de-reclamaciones",
});
export default function Page() {
  return (
    <LegalLayout
      title="Te escuchamos. Dejamos constancia."
      intro="Registra tu reclamo o queja y conserva el seguimiento de su atención."
    >
      <h2>Libro de Reclamaciones virtual</h2>
      <p>
        <strong>
          {op.name} · RUC {op.ruc}
        </strong>
        <br />
        {op.address}
        <br />
        Establecimiento virtual: {op.book} · terraqoglobal.com
        <br />
        {op.email} · {op.phone}
      </p>
      <ComplaintForm />
    </LegalLayout>
  );
}
