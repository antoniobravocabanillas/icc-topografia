import { TerraqoPublicFooter } from "@/components/terraqo/terraqo-public-footer";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#contenido" className="tq-skip-link">Saltar al contenido</a>
      <TerraqoPublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"https://terraqoglobal.com/#organization",name:"Terraqo",url:"https://terraqoglobal.com"},{"@type":"WebSite","@id":"https://terraqoglobal.com/#website",name:"Terraqo",url:"https://terraqoglobal.com",inLanguage:"es-PE",publisher:{"@id":"https://terraqoglobal.com/#organization"}}]}).replace(/</g,"\\u003c")}}/>
      <main id="contenido" tabIndex={-1}>{children}</main>
      <TerraqoPublicFooter />
    </>
  );
}
