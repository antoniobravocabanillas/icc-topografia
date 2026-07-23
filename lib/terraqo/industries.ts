export const terraqoIndustries = [
  { value: "agricultura", label: "Agricultura" },
  { value: "ganaderia-pecuaria", label: "Ganaderia y pecuaria" },
  { value: "silvicultura-explotacion-forestal", label: "Silvicultura y explotacion forestal" },
  { value: "pesca-acuicultura", label: "Pesca y acuicultura" },
  { value: "mineria-canteras", label: "Mineria y canteras" },
  { value: "petroleo-gas", label: "Extraccion de petroleo y gas" },
  { value: "automotriz", label: "Industria automotriz" },
  { value: "aeroespacial-defensa", label: "Aeroespacial y defensa" },
  { value: "electronica-semiconductores", label: "Electronica y semiconductores" },
  { value: "quimica-petroquimica", label: "Quimica y petroquimica" },
  { value: "farmaceutica-biotecnologia", label: "Farmaceutica y biotecnologia" },
  { value: "alimentos-bebidas", label: "Alimentos y bebidas" },
  { value: "textil-calzado-confeccion", label: "Textil, calzado y confeccion" },
  { value: "metalurgia-siderurgia", label: "Metalurgia y siderurgia" },
  { value: "construccion-infraestructura", label: "Construccion e infraestructura" },
  { value: "energia-servicios-publicos", label: "Energia electrica y servicios publicos" },
  { value: "retail-ecommerce", label: "Comercio minorista y mayorista (e-commerce)" },
  { value: "finanzas-banca-seguros", label: "Finanzas, banca y seguros" },
  { value: "logistica-transporte-almacenamiento", label: "Logistica, transporte y almacenamiento" },
  { value: "turismo-hoteleria-gastronomia", label: "Turismo, hoteleria y gastronomia" },
  { value: "salud-cuidado-personal", label: "Salud y cuidado personal" },
  { value: "educacion-formacion", label: "Educacion y formacion" },
  { value: "entretenimiento-medios-deporte", label: "Entretenimiento, medios y deporte" },
  { value: "real-estate", label: "Bienes raices (real estate)" },
  { value: "servicios-profesionales", label: "Servicios profesionales (leyes, contabilidad, consultoria)" },
  { value: "software-nube", label: "Tecnologias de la informacion (software y nube)" },
  { value: "telecomunicaciones-internet", label: "Telecomunicaciones e internet" },
  { value: "investigacion-desarrollo", label: "Investigacion y desarrollo (I+D)" },
  { value: "robotica-ia", label: "Robotica e inteligencia artificial" }
] as const;

export function getTerraqoIndustryLabel(value?: string | null) {
  return terraqoIndustries.find((industry) => industry.value === value)?.label ?? value ?? "Sin industria definida";
}
