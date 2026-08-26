import { headers } from "next/headers";
import { CommerceShell } from "@/components/commerce-shell";
import { TerraqoPublicFooter } from "@/components/terraqo/terraqo-public-footer";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";

export default async function CommerceLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const forceBare = requestHeaders.get("x-terraqo-surface") === "portal";

  return (
    <CommerceShell
      header={<TerraqoPublicHeader />}
      darkHeader={<TerraqoPublicHeader tone="dark" />}
      footer={<TerraqoPublicFooter />}
      forceBare={forceBare}
    >
      {children}
    </CommerceShell>
  );
}
