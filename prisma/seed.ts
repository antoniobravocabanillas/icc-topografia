import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { categories, products } from "../lib/content/products";
import { faqs, posts, testimonials } from "../lib/content/site";
import { services } from "../lib/content/services";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin12345!", 12);
  const clientPasswordHash = await bcrypt.hash("Cliente12345!", 12);
  const tenant = await prisma.terraqoWorkspace.upsert({
    where: { slug: "icc-topografia" },
    update: {},
    create: { name: "ICC Topografia", slug: "icc-topografia", brandName: "ICC Topografia", active: true }
  });
  const terraqoWorkspaceId = tenant.id;
  await prisma.user.upsert({
    where: { email: "admin@icctopografia.pe" },
    update: {},
    create: {
      name: "Administrador ICC Topografia",
      email: "admin@icctopografia.pe",
      passwordHash,
      role: "ADMIN"
    }
  });

  const staffProfiles = [
    {
      displayName: "Ing. Carlos Medina",
      email: "ventas@icctopografia.pe",
      phone: "+51 999 111 222",
      roleTitle: "Asesor de instrumentacion y venta tecnica",
      department: "SALES" as const,
      commissionType: "SALE_PERCENTAGE" as const,
      commissionRate: 5,
      monthlyGoal: 60000,
      territory: "Lima Metropolitana y cuentas B2B",
      availability: "AVAILABLE" as const,
      workZone: "Lima y provincias",
      experience: "12 años en venta técnica B2B",
      certifications: ["Instrumentacion topografica", "Asesoria GNSS"],
      documents: [],
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
      commissionType: "FIXED_AMOUNT" as const,
      commissionRate: 0,
      fixedCommission: 0,
      monthlyGoal: 0,
      territory: "Soporte nacional",
      availability: "AVAILABLE" as const,
      workZone: "Laboratorio y soporte remoto",
      experience: "8 años en mantenimiento y calibración",
      certifications: ["Calibracion de niveles", "Diagnostico de estaciones totales"],
      documents: [],
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
      commissionType: "SALE_PERCENTAGE" as const,
      commissionRate: 3,
      monthlyGoal: 45000,
      territory: "Servicios de campo",
      availability: "FIELD" as const,
      workZone: "Costa central",
      experience: "10 años en control y replanteo de obra",
      certifications: ["Geodesia aplicada", "Control geometrico QA/QC"],
      documents: [],
      specialties: ["Levantamiento", "Replanteo", "Georreferenciacion", "Control geometrico"],
      tools: {
        whatsappTemplate: "Para dimensionar el servicio necesito ubicacion, area aproximada, entregables requeridos y fecha objetivo.",
        checklist: ["Ubicacion del proyecto", "Alcance y entregables", "Restricciones de acceso", "Fecha de campo"],
        nextSteps: ["Definir alcance tecnico", "Estimar cuadrilla/equipos", "Enviar propuesta de servicio"]
      }
    }
  ];

  for (const profile of staffProfiles) {
    await prisma.staffProfile.upsert({
      where: { terraqoWorkspaceId_email: { terraqoWorkspaceId, email: profile.email } },
      update: { ...profile, terraqoWorkspaceId },
      create: { ...profile, terraqoWorkspaceId }
    });
  }

  for (const name of categories) {
    await prisma.category.upsert({
      where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: slugify(name) } },
      update: {},
      create: {
        name,
        terraqoWorkspaceId,
        slug: slugify(name),
        description: `Categoria tecnica para ${name.toLowerCase()}.`
      }
    });
  }

  for (const product of products) {
    const category = await prisma.category.findUniqueOrThrow({ where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: slugify(product.category) } } });
    await prisma.product.upsert({
      where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: product.slug } },
      update: {},
      create: {
        name: product.name,
        terraqoWorkspaceId,
        slug: product.slug,
        sku: product.slug.toUpperCase().replaceAll("-", "_"),
        brand: product.brand,
        model: product.model,
        summary: product.summary,
        description: product.description,
        price: product.price,
        stock: product.price ? 3 : 0,
        requiresQuote: !product.price,
        availability: product.availability,
        badge: product.badge,
        images: [],
        specifications: product.specs,
        categoryId: category.id
      }
    });
  }

  for (const service of services) {
    await prisma.service.upsert({
      where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: service.slug } },
      update: {},
      create: {
        title: service.title,
        terraqoWorkspaceId,
        slug: service.slug,
        summary: service.summary,
        content: service
      }
    });
  }

  for (const testimonial of testimonials) {
    await prisma.testimonial.create({ data: { ...testimonial, terraqoWorkspaceId } });
  }

  for (const [position, faq] of faqs.entries()) {
    await prisma.faq.create({ data: { ...faq, position, terraqoWorkspaceId } });
  }

  const internalChannels = [
    { name: "General", slug: "general", description: "Coordinacion transversal del equipo ICC." },
    { name: "Ventas", slug: "ventas", description: "Leads, cotizaciones, seguimiento y cierres." },
    { name: "Operaciones", slug: "operaciones", description: "Campo, gabinete y proyectos." },
    { name: "Soporte", slug: "soporte", description: "Tickets, calibracion, reparacion y garantias." },
    { name: "Proyectos", slug: "proyectos", description: "Avances, entregables y coordinacion tecnica." }
  ];

  for (const channel of internalChannels) {
    await prisma.internalChatChannel.upsert({
      where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: channel.slug } },
      update: { ...channel, terraqoWorkspaceId },
      create: { ...channel, terraqoWorkspaceId }
    });
  }

  for (const post of posts) {
    await prisma.blogPost.upsert({
      where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: post.slug } },
      update: {},
      create: {
        title: post.title,
        terraqoWorkspaceId,
        slug: post.slug,
        excerpt: post.excerpt,
        category: post.category,
        content: { blocks: [{ type: "paragraph", text: post.excerpt }] },
        publishedAt: new Date()
      }
    });
  }

  const clientUser = await prisma.user.upsert({
    where: { email: "operaciones@urbania-demo.pe" },
    update: {
      passwordHash: clientPasswordHash,
      role: "CUSTOMER"
    },
    create: {
      name: "Mariana Torres",
      email: "operaciones@urbania-demo.pe",
      passwordHash: clientPasswordHash,
      role: "CUSTOMER"
    }
  });

  const company = await prisma.company.upsert({
    where: { id: "seed-company-urbania" },
    update: {
      terraqoWorkspaceId,
      legalName: "Urbania Capital Demo S.A.C.",
      tradeName: "Urbania Capital",
      email: "operaciones@urbania-demo.pe",
      phone: "+51 988 220 440",
      city: "Lima",
      industry: "Construccion e inmobiliaria",
      status: "cliente activo"
    },
    create: {
      id: "seed-company-urbania",
      terraqoWorkspaceId,
      legalName: "Urbania Capital Demo S.A.C.",
      tradeName: "Urbania Capital",
      document: "20600000001",
      email: "operaciones@urbania-demo.pe",
      phone: "+51 988 220 440",
      address: "Av. Republica de Panama 4500",
      city: "Lima",
      industry: "Construccion e inmobiliaria",
      status: "cliente activo"
    }
  });

  const contact = await prisma.contact.upsert({
    where: { companyId_email: { companyId: company.id, email: "operaciones@urbania-demo.pe" } },
    update: {
      terraqoWorkspaceId,
      name: "Mariana Torres",
      roleTitle: "Jefa de operaciones",
      phone: "+51 988 220 440",
      whatsapp: "+51 988 220 440",
      isPrimary: true
    },
    create: {
      companyId: company.id,
      terraqoWorkspaceId,
      name: "Mariana Torres",
      roleTitle: "Jefa de operaciones",
      email: "operaciones@urbania-demo.pe",
      phone: "+51 988 220 440",
      whatsapp: "+51 988 220 440",
      isPrimary: true
    }
  });

  const client = await prisma.client.upsert({
    where: { terraqoWorkspaceId_email: { terraqoWorkspaceId, email: "operaciones@urbania-demo.pe" } },
    update: { userId: clientUser.id, companyId: company.id, terraqoWorkspaceId },
    create: {
      terraqoWorkspaceId,
      userId: clientUser.id,
      companyId: company.id,
      name: "Mariana Torres",
      company: "Urbania Capital Demo",
      email: "operaciones@urbania-demo.pe",
      phone: "+51 988 220 440",
      status: "cliente activo",
      contactName: "Mariana Torres"
    }
  });

  await prisma.clientAccount.upsert({
    where: { clientId: client.id },
    update: {
      terraqoWorkspaceId,
      userId: clientUser.id,
      companyId: company.id,
      contactId: contact.id,
      status: "active"
    },
    create: {
      terraqoWorkspaceId,
      userId: clientUser.id,
      companyId: company.id,
      contactId: contact.id,
      clientId: client.id,
      status: "active",
      invitedAt: new Date()
    }
  });

  const seller = await prisma.staffProfile.findFirst({ where: { email: "ventas@icctopografia.pe", terraqoWorkspaceId } });
  const lead = await prisma.lead.upsert({
    where: { id: "seed-lead-urbania" },
    update: {
      terraqoWorkspaceId,
      companyId: company.id,
      contactId: contact.id,
      clientId: client.id,
      assignedProfileId: seller?.id
    },
    create: {
      id: "seed-lead-urbania",
      terraqoWorkspaceId,
      clientId: client.id,
      companyId: company.id,
      contactId: contact.id,
      assignedProfileId: seller?.id,
      name: "Mariana Torres",
      email: "operaciones@urbania-demo.pe",
      phone: "+51 988 220 440",
      company: "Urbania Capital Demo",
      message: "Necesitamos replanteo, control semanal y entregables para avance de obra.",
      source: "web",
      interest: "Servicio de control topografico",
      priority: "HIGH",
      estimatedValue: 18500,
      status: "NEGOTIATION"
    }
  });

  const opportunity = await prisma.opportunity.upsert({
    where: { code: "OPP-2026-0001" },
    update: {
      terraqoWorkspaceId,
      companyId: company.id,
      contactId: contact.id,
      leadId: lead.id,
      sellerProfileId: seller?.id,
      status: "PROPOSAL"
    },
    create: {
      code: "OPP-2026-0001",
      terraqoWorkspaceId,
      title: "Control topografico semanal para corredor vial",
      companyId: company.id,
      contactId: contact.id,
      leadId: lead.id,
      sellerProfileId: seller?.id,
      status: "PROPOSAL",
      source: "web",
      interest: "Servicio de control topografico",
      estimatedValue: 18500,
      probability: 70,
      nextStep: "Enviar propuesta final y validar orden de servicio",
      notes: "Proyecto demo para portal cliente y pipeline comercial."
    }
  });

  const quote = await prisma.quote.upsert({
    where: { number: "COT-2026-0001" },
    update: {
      terraqoWorkspaceId,
      publicToken: "cot-demo-urbania-2026",
      companyId: company.id,
      contactId: contact.id,
      opportunityId: opportunity.id,
      clientId: client.id
    },
    create: {
      number: "COT-2026-0001",
      terraqoWorkspaceId,
      publicToken: "cot-demo-urbania-2026",
      clientId: client.id,
      companyId: company.id,
      contactId: contact.id,
      opportunityId: opportunity.id,
      leadId: lead.id,
      sellerProfileId: seller?.id,
      customerName: client.name,
      customerEmail: client.email,
      company: client.company,
      status: "SENT",
      subtotal: 18500,
      total: 18500,
      terms: "50% al inicio, saldo contra entrega de informe tecnico.",
      deliveryTime: "Inicio en 72 horas despues de orden de servicio.",
      items: {
        create: {
          type: "service",
          description: "Control topografico semanal y reportes de avance",
          quantity: 1,
          unitPrice: 18500,
          subtotal: 18500
        }
      }
    }
  });

  const sale = await prisma.sale.upsert({
    where: { number: "SALE-2026-0001" },
    update: {
      terraqoWorkspaceId,
      quoteId: quote.id,
      opportunityId: opportunity.id,
      clientId: client.id,
      companyId: company.id,
      contactId: contact.id,
      sellerProfileId: seller?.id,
      status: "CONFIRMED"
    },
    create: {
      number: "SALE-2026-0001",
      terraqoWorkspaceId,
      quoteId: quote.id,
      opportunityId: opportunity.id,
      clientId: client.id,
      companyId: company.id,
      contactId: contact.id,
      sellerProfileId: seller?.id,
      status: "CONFIRMED",
      currency: "USD",
      amount: 18500,
      commissionAmount: 925
    }
  });

  const project = await prisma.project.upsert({
    where: { terraqoWorkspaceId_slug: { terraqoWorkspaceId, slug: "control-topografico-corredor-vial-demo" } },
    update: {
      clientId: client.id,
      companyId: company.id,
      opportunityId: opportunity.id,
      saleId: sale.id,
      terraqoWorkspaceId
    },
    create: {
      title: "Control topografico para corredor vial demo",
      terraqoWorkspaceId,
      slug: "control-topografico-corredor-vial-demo",
      clientId: client.id,
      companyId: company.id,
      opportunityId: opportunity.id,
      saleId: sale.id,
      clientName: client.company,
      location: "Lima, Peru",
      category: "Infraestructura vial",
      servicesApplied: ["Control geometrico", "Replanteo", "Reportes QA/QC"],
      summary: "Red de control, replanteo de ejes y reportes semanales para avance de obra.",
      description: "Implementacion de puntos de control, verificacion de ejes, niveles y comparativos contra expediente tecnico para reducir retrabajos.",
      challenge: "Coordinar mediciones con ventanas operativas cortas y mantener trazabilidad entre campo y gabinete.",
      solution: "Se definio una red de control, protocolo de levantamiento y entregables semanales con evidencia fotografica y cuadros de desviacion.",
      results: "42 km controlados",
      status: "PUBLISHED",
      isPublic: true,
      isFeatured: true
    }
  });

  const kickoffMilestone = await prisma.milestone.upsert({
    where: { id: "seed-milestone-urbania-kickoff" },
    update: {
      projectId: project.id,
      status: "IN_PROGRESS"
    },
    create: {
      id: "seed-milestone-urbania-kickoff",
      projectId: project.id,
      title: "Inicio y red de control",
      description: "Validacion de informacion base, puntos geodesicos y protocolo de medicion.",
      status: "IN_PROGRESS",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
    }
  });

  await prisma.task.upsert({
    where: { id: "seed-task-urbania-red-control" },
    update: {
      projectId: project.id,
      milestoneId: kickoffMilestone.id,
      assignedProfileId: seller?.id,
      status: "IN_PROGRESS"
    },
    create: {
      id: "seed-task-urbania-red-control",
      projectId: project.id,
      milestoneId: kickoffMilestone.id,
      assignedProfileId: seller?.id,
      title: "Revisar expediente y puntos base",
      description: "Cruzar planos, coordenadas y restricciones de campo antes de iniciar replanteo.",
      status: "IN_PROGRESS",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3)
    }
  });

  await prisma.document.upsert({
    where: { id: "seed-document-urbania-propuesta" },
    update: {
      companyId: company.id,
      contactId: contact.id,
      projectId: project.id
    },
    create: {
      id: "seed-document-urbania-propuesta",
      terraqoWorkspaceId,
      companyId: company.id,
      contactId: contact.id,
      projectId: project.id,
      title: "Propuesta tecnica y comercial",
      type: "cotizacion",
      url: "/brochure-ayb-topografia.pdf",
      visibility: "cliente"
    }
  });

  await prisma.clientDocument.upsert({
    where: { id: "seed-client-document-urbania" },
    update: {},
    create: {
      id: "seed-client-document-urbania",
      clientId: client.id,
      title: "Propuesta tecnica de control topografico",
      type: "cotizacion",
      url: "/brochure-ayb-topografia.pdf"
    }
  });

  const support = await prisma.staffProfile.findFirst({ where: { email: "soporte@icctopografia.pe", terraqoWorkspaceId } });
  await prisma.ticket.upsert({
    where: { code: "TK-2026-0001" },
    update: {
      terraqoWorkspaceId,
      clientId: client.id,
      companyId: company.id,
      contactId: contact.id,
      assignedProfileId: support?.id
    },
    create: {
      code: "TK-2026-0001",
      terraqoWorkspaceId,
      clientId: client.id,
      companyId: company.id,
      contactId: contact.id,
      assignedProfileId: support?.id,
      customerName: client.name,
      customerEmail: client.email,
      company: client.company,
      subject: "Revision preventiva de estacion total",
      category: "CALIBRATION",
      priority: "HIGH",
      status: "REVIEWING",
      description: "Solicitamos agenda para calibracion y verificacion antes de iniciar obra.",
      attachments: [],
      messages: {
        create: [
          {
            sender: "customer",
            body: "Necesitamos confirmar disponibilidad para calibracion esta semana.",
            files: []
          },
          {
            sender: "staff",
            body: "Recibido. Validaremos agenda de laboratorio y requisitos de recepcion del equipo.",
            files: []
          }
        ]
      }
    }
  });

  await Promise.all([
    prisma.activityLog.upsert({
      where: { id: "seed-activity-urbania-lead" },
      update: {},
      create: {
        id: "seed-activity-urbania-lead",
        terraqoWorkspaceId,
        action: "CREATED",
        entityType: "Lead",
        entityId: lead.id,
        title: "Lead web creado",
        body: "Solicitud de control topografico desde formulario publico.",
        companyId: company.id,
        contactId: contact.id,
        leadId: lead.id
      }
    }),
    prisma.activityLog.upsert({
      where: { id: "seed-activity-urbania-opportunity" },
      update: {},
      create: {
        id: "seed-activity-urbania-opportunity",
        terraqoWorkspaceId,
        action: "CONVERTED",
        entityType: "Opportunity",
        entityId: opportunity.id,
        title: "Lead convertido a oportunidad",
        body: "Se consolido la cuenta, contacto y oportunidad comercial.",
        companyId: company.id,
        contactId: contact.id,
        leadId: lead.id,
        opportunityId: opportunity.id
      }
    }),
    prisma.activityLog.upsert({
      where: { id: "seed-activity-urbania-sale" },
      update: {},
      create: {
        id: "seed-activity-urbania-sale",
        terraqoWorkspaceId,
        action: "CONVERTED",
        entityType: "Sale",
        entityId: sale.id,
        title: "Cotizacion aceptada y venta creada",
        body: "La venta queda lista para apertura operativa de proyecto.",
        companyId: company.id,
        contactId: contact.id,
        opportunityId: opportunity.id,
        quoteId: quote.id,
        saleId: sale.id,
        projectId: project.id
      }
    })
  ]);

  await prisma.botUnansweredQuestion.upsert({
    where: { terraqoWorkspaceId_question: { terraqoWorkspaceId, question: "Que incluye una calibracion de estacion total?" } },
    update: {},
    create: {
      question: "Que incluye una calibracion de estacion total?",
      terraqoWorkspaceId,
      answer: "Incluye revision funcional, verificacion de precision, diagnostico, ajustes necesarios y recomendaciones de uso.",
      category: "calibracion",
      source: "demo",
      frequency: 3
    }
  });

  await prisma.notification.create({
    data: {
      terraqoWorkspaceId,
      type: "SYSTEM",
      title: "Fase 3 activa",
      body: "Chat interno, chatbot local, FAQ dinamica, reportes y notificaciones estan disponibles.",
      href: "/admin/reportes"
    }
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
