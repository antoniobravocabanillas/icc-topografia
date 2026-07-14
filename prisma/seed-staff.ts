import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const staffProfiles = [
  {
    displayName: "Ing. Carlos Medina",
    email: "ventas@icctopografia.pe",
    phone: "+51 999 111 222",
    roleTitle: "Asesor de instrumentacion y venta tecnica",
    department: "SALES" as const,
    specialties: ["Estaciones totales", "GNSS", "Compra B2B", "Cotizaciones"],
    tools: {
      whatsappTemplate: "Gracias por contactar a ICC Topografia. Para cotizar correctamente necesito confirmar aplicacion, ciudad, plazo y accesorios requeridos.",
      checklist: ["Validar aplicacion del equipo", "Confirmar stock/precio", "Revisar accesorios", "Coordinar cotizacion formal"],
      nextSteps: ["Preparar cotizacion comercial", "Enviar ficha tecnica", "Agendar asesoria de configuracion"]
    }
  },
  {
    displayName: "Ing. Valeria Rojas",
    email: "soporte@icctopografia.pe",
    phone: "+51 999 333 444",
    roleTitle: "Especialista en soporte, calibracion y mantenimiento",
    department: "TECHNICAL_SUPPORT" as const,
    specialties: ["Calibracion", "Mantenimiento", "Soporte tecnico", "Garantias"],
    tools: {
      whatsappTemplate: "Para revisar tu caso tecnico necesito modelo, serie, falla observada y fecha del ultimo mantenimiento.",
      checklist: ["Solicitar modelo y serie", "Registrar falla", "Determinar urgencia", "Coordinar diagnostico"],
      nextSteps: ["Crear ticket tecnico", "Enviar requisitos de recepcion", "Programar revision"]
    }
  },
  {
    displayName: "Ing. Diego Salazar",
    email: "proyectos@icctopografia.pe",
    phone: "+51 999 555 666",
    roleTitle: "Coordinador de servicios topograficos de campo",
    department: "FIELD_ENGINEERING" as const,
    specialties: ["Levantamiento", "Replanteo", "Georreferenciacion", "Control geometrico"],
    tools: {
      whatsappTemplate: "Para dimensionar el servicio necesito ubicacion, area aproximada, entregables requeridos y fecha objetivo.",
      checklist: ["Ubicacion del proyecto", "Alcance y entregables", "Restricciones de acceso", "Fecha de campo"],
      nextSteps: ["Definir alcance tecnico", "Estimar cuadrilla/equipos", "Enviar propuesta de servicio"]
    }
  }
];

async function main() {
  const workspace = await prisma.terraqoWorkspace.upsert({
    where: { slug: "icc-topografia" },
    update: {},
    create: { name: "ICC Topografia", slug: "icc-topografia", brandName: "ICC Topografia", active: true }
  });
  for (const profile of staffProfiles) {
    await prisma.staffProfile.upsert({
      where: { terraqoWorkspaceId_email: { terraqoWorkspaceId: workspace.id, email: profile.email } },
      update: { ...profile, terraqoWorkspaceId: workspace.id },
      create: { ...profile, terraqoWorkspaceId: workspace.id }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
