import { AttentionInbox } from "@/components/admin/chat/attention-inbox";
import { loadAttentionInbox } from "@/lib/server/attention-inbox";
import { recordChatOutcomeAction, linkChatOpportunityAction, createChatOpportunityAction, addChatInternalNoteAction, scheduleChatFollowupAction, completeChatFollowupAction, assignChatProfileAction, closeChatConversationAction, sendAdminChatMessageAction, takeChatConversationAction } from "@/lib/server/admin-actions";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function AdminChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await loadAttentionInbox(await searchParams);
  return <AttentionInbox data={data} actions={{ recordChatOutcomeAction, linkChatOpportunityAction, createChatOpportunityAction, addChatInternalNoteAction, scheduleChatFollowupAction, completeChatFollowupAction, assignChatProfileAction, closeChatConversationAction, sendAdminChatMessageAction, takeChatConversationAction }} />;
}
