import {ImageResponse} from "next/og";
import {publicSections} from "@/lib/terraqo/public-sections";
export const runtime="nodejs";
export async function GET(request:Request){
  const path=new URL(request.url).searchParams.get("path")||"/";
  const content=publicSections[path];
  if(!content)return new Response("Not found",{status:404});
  return new ImageResponse(<div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",width:"100%",height:"100%",padding:"64px 72px",background:"linear-gradient(120deg,#071421,#15375c)",color:"#fff",fontFamily:"sans-serif"}}><div style={{display:"flex",fontSize:30,letterSpacing:5}}>TERRAQO</div><div style={{display:"flex",flexDirection:"column",gap:25}}><div style={{fontSize:65,fontWeight:700,lineHeight:1.1,letterSpacing:-2,maxWidth:1010}}>{content.title}</div><div style={{fontSize:27,color:"#bdd1e9",maxWidth:960,lineHeight:1.4}}>{content.description}</div></div><div style={{display:"flex",justifyContent:"space-between",fontSize:20,color:"#83c8ec"}}><span>LA RED DEL TRABAJO REAL</span><span>terraqoglobal.com{path==="/"?"":path}</span></div></div>,{width:1200,height:630,headers:{"Cache-Control":"public, max-age=3600, s-maxage=86400"}});
}
