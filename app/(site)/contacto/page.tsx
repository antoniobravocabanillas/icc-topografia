import {PublicInquiry} from "@/components/terraqo/public-inquiry";
import {ExperienceShell} from "@/components/terraqo/public-experience";
import {createMetadata} from "@/lib/seo";
export const metadata=createMetadata({title:"Contacto",description:"Consulta con Terraqo el alcance de tu membresía, workspace y automatizaciones.",path:"/contacto"});
export default async function ContactPage({searchParams}:{searchParams:Promise<{asunto?:string}>}){
 const params=await searchParams;const subject=(params.asunto||"Consulta Terraqo").slice(0,100).replace(/-/g," ");
 return <ExperienceShell eyebrow="Contacto Terraqo" title="Hablemos de lo que necesitas construir." intro="Cuéntanos tu objetivo y el contexto de tu equipo. Revisaremos contigo el alcance de la membresía, el workspace o la automatización."><PublicInquiry subject={subject}/></ExperienceShell>;
}
