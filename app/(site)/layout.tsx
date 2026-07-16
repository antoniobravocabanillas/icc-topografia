import { TerraqoPublicFooter } from "@/components/terraqo/terraqo-public-footer";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TerraqoPublicHeader />
      <main>{children}</main>
      <TerraqoPublicFooter />
    </>
  );
}
