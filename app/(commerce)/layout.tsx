import { CommerceShell } from "@/components/commerce-shell";
import { TerraqoPublicFooter } from "@/components/terraqo/terraqo-public-footer";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";

export default function CommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommerceShell
      header={<TerraqoPublicHeader />}
      footer={<TerraqoPublicFooter />}
    >
      {children}
    </CommerceShell>
  );
}
