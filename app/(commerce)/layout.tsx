import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ChatWidget } from "@/components/chat/chat-widget";
import { safeDb } from "@/lib/server/safe-db";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

export default async function CommerceLayout({ children }: { children: React.ReactNode }) {
  const chatEnabled = await safeDb("commerce customer chat entitlement", hasWorkspaceModule("CUSTOMER_CHAT"), false);

  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      {chatEnabled ? <ChatWidget /> : null}
    </>
  );
}
