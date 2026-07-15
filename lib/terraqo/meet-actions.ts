"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createOrGetMeeting, endMeeting, safeMeetReturnPath } from "@/lib/terraqo/meet";

export async function createMeetingAction(returnPath: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");
  const meeting = await createOrGetMeeting(session.user.id, String(formData.get("conversationId") || ""));
  redirect(`/reuniones/${meeting.id}?volver=${encodeURIComponent(safeMeetReturnPath(returnPath))}`);
}

export async function endMeetingAction(returnPath: string, meetingId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");
  await endMeeting(meetingId, session.user.id);
  redirect(safeMeetReturnPath(returnPath));
}
