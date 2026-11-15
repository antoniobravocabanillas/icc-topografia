import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { publishedCvProfileWhere } from "@/lib/terraqo/public-cv";
import { startConversation, TerraqoMessagingError } from "@/lib/terraqo/messaging";

export const dynamic = "force-dynamic";

async function contactTarget(username: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: publishedCvProfileWhere(username),
    select: { userId: true, messagePrivacy: true, user: { select: { name: true } } },
  });
  if (!profile || profile.messagePrivacy === "NOBODY") notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta?callbackUrl=" + encodeURIComponent(`/cv/${username}/contacto`));
  if (profile.userId === session.user.id) redirect(`/cv/${username}`);
  return { profile, actorUserId: session.user.id };
}

export default async function ContactPage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ acceso?: string }>;
}) {
  const { username } = await params;
  const { profile } = await contactTarget(username);
  const restricted = (await searchParams).acceso === "restringido";
  async function openConversation() {
    "use server";
    const target = await contactTarget(username);
    let id: string;
    try {
      const conversation = await startConversation({ actorUserId: target.actorUserId, recipientUserId: target.profile.userId });
      id = conversation.id;
    } catch (error) {
      if (!(error instanceof TerraqoMessagingError) || error.status !== 403) throw error;
      redirect(`/cv/${username}/contacto?acceso=restringido`);
    }
    redirect(`/portal/mensajes?conversation=${encodeURIComponent(id)}`);
  }
  return <main className="mx-auto grid max-w-xl gap-5 px-5 py-14">
    <Link href={`/cv/${username}`}>← Volver al CV</Link>
    <h1 className="text-3xl font-bold">Contactar a {profile.user.name || username}</h1>
    {restricted ? <p role="status">Tu cuenta necesita una conexión habilitada con este profesional para enviarle un mensaje.</p>
      : <form action={openConversation}><button className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">Abrir conversación</button></form>}
  </main>;
}
