import { TerraqoMemberships } from "@/components/terraqo/terraqo-memberships";

export const metadata = { title: "Membresías | Terraqo", description: "Planes Terraqo para profesionales, empresas y operaciones complejas." };

export default function MembresiasPage() { return <div className="tq-memberships-page"><section className="tq-detail-hero"><div className="tq-public-wrap"><p className="tq-kicker">Planes Terraqo</p><h1>Una suscripción clara para cada etapa.</h1><p>Comienza con las capacidades esenciales y amplía automatización, colaboración, red e integraciones sin migrar tu información a otro sistema.</p></div></section><TerraqoMemberships /></div>; }
