import {ImageResponse} from "next/og";
import {notFound} from "next/navigation";
import {getPublicCompanySeo} from "@/lib/terraqo/public-company-seo";
export const size={width:1200,height:630};
export const contentType="image/png";
export const alt="Perfil empresarial público en Terraqo";
export const runtime="nodejs";
export const revalidate=300;
export default async function CompanyImage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const company=await getPublicCompanySeo(slug);if(!company)notFound();
 return new ImageResponse(<div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",background:"linear-gradient(120deg,#071421,#15375c)",color:"white",width:"100%",height:"100%",padding:70,fontFamily:"sans-serif"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:26,color:"#8dcef0"}}><span>TERRAQO</span><span>PERFIL EMPRESARIAL</span></div><div style={{display:"flex",flexDirection:"column",gap:24}}><div style={{fontSize:64,lineHeight:1.12,fontWeight:700}}>{(company.brandName||company.name).slice(0,100)}</div><div style={{fontSize:27,lineHeight:1.5,color:"#c3d6ec"}}>{(company.description||"Conoce su actividad, servicios y proyectos públicos.").slice(0,180)}</div></div><div style={{fontSize:22,color:"#8dcef0"}}>{[company.industry,company.locationCity,company.country].filter(Boolean).join(" · ")}</div></div>,size);
}
