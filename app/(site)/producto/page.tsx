import { ProductJourney } from "@/components/terraqo/product-journey";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({title:"Producto",description:"Conecta identidad profesional, bitácoras, evidencia y oportunidades. Explora cómo funciona Terraqo paso a paso.",path:"/producto"});
export default function ProductoPage(){return <ProductJourney/>;}
