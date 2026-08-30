import { UserAvatar } from "@/components/terraqo/user-avatar";
import { FriendButton } from "@/components/terraqo/friend-button";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { friendshipList } from "@/lib/terraqo/friendships";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const { session } = await requireProfessionalPortal();
  const friendships = await friendshipList(session.user.id);
  return (
    <div className="space-y-6 py-6 lg:py-8">
      <PortalPageHeading
        eyebrow="Red personal"
        title="Amigos"
        description="Administra solicitudes y conexiones personales. Solo una amistad aceptada habilita la mensajería personal fuera de un workspace."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {friendships.map((friendship) => {
          const person =
            friendship.requesterId === session.user.id
              ? friendship.recipient
              : friendship.requester;
          const status =
            friendship.status === "ACCEPTED"
              ? "ACCEPTED"
              : friendship.status === "PENDING"
                ? friendship.requesterId === session.user.id
                  ? "PENDING_SENT"
                  : "PENDING_RECEIVED"
                : "NONE";
          return (
            <article
              key={friendship.id}
              className="rounded-2xl border bg-white p-5 shadow-technical"
            >
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={person.name || person.email}
                  image={person.image}
                  size="lg"
                />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-bold">
                    {person.name || person.email}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {person.terraqoProfessionalProfile?.headline ||
                      "Profesional Terraqo"}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <a
                  href={
                    person.terraqoProfessionalProfile
                      ? `/portal/profesionales/${person.terraqoProfessionalProfile.id}`
                      : "/portal/red"
                  }
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold"
                >
                  Ver perfil
                </a>
                {status === "ACCEPTED" ? (
                  <a
                    href={`/portal/mensajes?recipient=${person.id}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#4374ba] px-3 text-xs font-bold text-white"
                  >
                    Mensaje
                  </a>
                ) : null}
                <FriendButton
                  recipientId={person.id}
                  initial={{ id: friendship.id, status }}
                />
              </div>
            </article>
          );
        })}
      </div>
      {!friendships.length ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          Todavía no tienes solicitudes. Descubre profesionales desde la Red
          profesional.
        </div>
      ) : null}
    </div>
  );
}
