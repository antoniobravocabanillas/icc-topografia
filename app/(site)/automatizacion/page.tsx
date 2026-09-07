import { AutomationSimulator } from "@/components/terraqo/automation-simulator";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({title:"Automatización",description:"Prueba cómo un evento activa una condición, una acción y un registro. Diseña el seguimiento de tu operación con Terraqo.",path:"/automatizacion"});
export default function AutomatizacionPage(){return <AutomationSimulator/>;}
