import { auth } from "@/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CertificateDisclosureFields } from "@/components/terraqo/certificate-disclosure-fields";
import { certificateDisclosureEnabled, readCertificateDisclosure } from "@/lib/terraqo/certificate-disclosure";
import styles from "./page.module.css";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Constancia compartida | Terraqo", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SharedCertificate({ params }: { params: Promise<{ id: string }> }) {
  if (!certificateDisclosureEnabled()) notFound();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const session = await auth();
  const result = await readCertificateDisclosure({ disclosureId: id, userId: session?.user?.id });
  return <main className={styles.page}><p className={styles.eyebrow}>Constancia de colaboración</p>
    <h1>{result ? "Trabajo documentado, contenido autorizado." : "Esta constancia no está disponible."}</h1>
    {result ? <><CertificateDisclosureFields fields={result.fields} /><p className={styles.note}>Se muestra únicamente la selección autorizada por ambas partes. Los archivos y evidencias conservan sus propios permisos.</p></>
      : <><p>El enlace puede estar pendiente de autorización, vencido o revocado. Si fue compartido contigo, accede con la cuenta autorizada.</p><Link href={`/cuenta?callbackUrl=${encodeURIComponent(`/constancias/${id}`)}`} prefetch={false}>Iniciar sesión</Link></>}
  </main>;
}
