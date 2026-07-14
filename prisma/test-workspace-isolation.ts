import { prisma } from "../lib/prisma";
import { setWorkspaceModuleState } from "../lib/terraqo/workspace-modules";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createWorkspaceFixtures(workspaceId: string, nonce: string) {
  const category = await prisma.category.create({
    data: { terraqoWorkspaceId: workspaceId, name: "Equipos", slug: `catalogo-${nonce}` }
  });
  const [client, service, lead, product] = await Promise.all([
    prisma.client.create({
      data: { terraqoWorkspaceId: workspaceId, name: "Cliente de prueba", email: `cliente-${nonce}@example.test` }
    }),
    prisma.service.create({
      data: {
        terraqoWorkspaceId: workspaceId,
        title: "Servicio de prueba",
        slug: `servicio-${nonce}`,
        summary: "Servicio privado del workspace.",
        content: {}
      }
    }),
    prisma.lead.create({
      data: {
        terraqoWorkspaceId: workspaceId,
        name: "Lead de prueba",
        email: `lead-${nonce}@example.test`,
        message: "Solicitud privada del workspace."
      }
    }),
    prisma.product.create({
      data: {
        terraqoWorkspaceId: workspaceId,
        categoryId: category.id,
        name: "Producto de prueba",
        slug: `producto-${nonce}`,
        sku: `SKU-${nonce}`,
        brand: "Terraqo",
        summary: "Producto privado del workspace.",
        description: "Producto temporal para validar aislamiento.",
        availability: "Disponible",
        images: [],
        tags: [],
        specifications: {}
      }
    })
  ]);
  return { category, client, service, lead, product };
}

async function main() {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const blankSlug = `isolation-blank-${nonce}`;
  const templateSlug = `isolation-template-${nonce}`;
  const workspaceIds: string[] = [];

  try {
    const [blankWorkspace, templateWorkspace] = await Promise.all([
      prisma.terraqoWorkspace.create({
        data: { name: "Isolation Blank", slug: blankSlug, type: "CLIENT_COMPANY" }
      }),
      prisma.terraqoWorkspace.create({
        data: { name: "Isolation Template", slug: templateSlug, type: "CLIENT_COMPANY" }
      })
    ]);
    workspaceIds.push(blankWorkspace.id, templateWorkspace.id);

    await setWorkspaceModuleState({
      workspaceId: blankWorkspace.id,
      code: "PROJECTS",
      active: true,
      mode: "blank"
    });
    await setWorkspaceModuleState({
      workspaceId: templateWorkspace.id,
      code: "PROJECTS",
      active: true,
      mode: "template"
    });

    const [blankProjects, templateProjects] = await Promise.all([
      prisma.project.findMany({ where: { terraqoWorkspaceId: blankWorkspace.id } }),
      prisma.project.findMany({ where: { terraqoWorkspaceId: templateWorkspace.id } })
    ]);

    assert(blankProjects.length === 0, "El workspace en blanco recibio proyectos inesperados.");
    assert(templateProjects.length === 1, "El workspace con plantilla no recibio exactamente un proyecto.");
    assert(templateProjects[0].isPublic === false, "El proyecto de plantilla debe ser privado.");

    const [blankFixtures, templateFixtures] = await Promise.all([
      createWorkspaceFixtures(blankWorkspace.id, nonce),
      createWorkspaceFixtures(templateWorkspace.id, nonce)
    ]);

    const crossRead = await prisma.project.findFirst({
      where: {
        id: templateProjects[0].id,
        terraqoWorkspaceId: blankWorkspace.id
      }
    });
    assert(crossRead === null, "Un workspace pudo leer el proyecto de otro workspace.");

    const crossUpdate = await prisma.project.updateMany({
      where: {
        id: templateProjects[0].id,
        terraqoWorkspaceId: blankWorkspace.id
      },
      data: { title: "Cambio cruzado no permitido" }
    });
    assert(crossUpdate.count === 0, "Un workspace pudo modificar el proyecto de otro workspace.");

    const unchanged = await prisma.project.findUnique({ where: { id: templateProjects[0].id } });
    assert(unchanged?.title === "Proyecto de ejemplo", "La prueba altero datos del workspace propietario.");

    const crossRecords = await Promise.all([
      prisma.client.findFirst({ where: { id: templateFixtures.client.id, terraqoWorkspaceId: blankWorkspace.id } }),
      prisma.service.findFirst({ where: { id: templateFixtures.service.id, terraqoWorkspaceId: blankWorkspace.id } }),
      prisma.lead.findFirst({ where: { id: templateFixtures.lead.id, terraqoWorkspaceId: blankWorkspace.id } }),
      prisma.product.findFirst({ where: { id: templateFixtures.product.id, terraqoWorkspaceId: blankWorkspace.id } })
    ]);
    assert(crossRecords.every((record) => record === null), "Un workspace pudo leer datos comerciales de otro workspace.");

    const crossProductUpdate = await prisma.product.updateMany({
      where: { id: templateFixtures.product.id, terraqoWorkspaceId: blankWorkspace.id },
      data: { name: "Cambio cruzado no permitido" }
    });
    assert(crossProductUpdate.count === 0, "Un workspace pudo modificar el catalogo de otro workspace.");
    assert(blankFixtures.client.email === templateFixtures.client.email, "La identidad comercial no se pudo repetir por workspace.");
    assert(blankFixtures.service.slug === templateFixtures.service.slug, "El slug de servicio no se pudo repetir por workspace.");
    assert(blankFixtures.product.sku === templateFixtures.product.sku, "El SKU no se pudo repetir por workspace.");

    console.log("Workspace isolation test passed", {
      blankProjects: blankProjects.length,
      templateProjects: templateProjects.length,
      crossRead: Boolean(crossRead),
      crossUpdates: crossUpdate.count + crossProductUpdate.count,
      isolatedCommercialModels: crossRecords.length
    });
  } finally {
    if (workspaceIds.length) {
      await prisma.product.deleteMany({ where: { terraqoWorkspaceId: { in: workspaceIds } } });
      await prisma.category.deleteMany({ where: { terraqoWorkspaceId: { in: workspaceIds } } });
      await prisma.service.deleteMany({ where: { terraqoWorkspaceId: { in: workspaceIds } } });
      await prisma.lead.deleteMany({ where: { terraqoWorkspaceId: { in: workspaceIds } } });
      await prisma.client.deleteMany({ where: { terraqoWorkspaceId: { in: workspaceIds } } });
      await prisma.project.deleteMany({ where: { terraqoWorkspaceId: { in: workspaceIds } } });
      await prisma.terraqoWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
