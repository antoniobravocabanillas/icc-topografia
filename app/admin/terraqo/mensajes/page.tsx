import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LegacyMessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const { conversation } = await searchParams;
  redirect("/admin/mensajes" + (conversation ? "?conversation=" + encodeURIComponent(conversation) : ""));
}
