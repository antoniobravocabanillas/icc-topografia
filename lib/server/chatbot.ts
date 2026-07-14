import { prisma } from "@/lib/prisma";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

type BotAnswer = {
  answer: string;
  source: string;
  confidence: number;
  shouldEscalate: boolean;
};

const humanIntent = ["asesor", "humano", "persona", "vendedor", "cotizar", "llamar", "whatsapp", "comprar", "precio"];

export async function answerWithLocalKnowledge(question: string): Promise<BotAnswer> {
  const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();
  const normalized = normalize(question);
  const wantsHuman = humanIntent.some((word) => normalized.includes(word));
  if (wantsHuman) {
    return {
      answer: "Puedo derivarte con un asesor para ayudarte mejor. Iniciaremos una conversacion humana para que el equipo ICC tome tu caso.",
      source: "human-handoff",
      confidence: 1,
      shouldEscalate: true
    };
  }

  const [faqs, services, products, projects] = await Promise.all([
    prisma.faq.findMany({ where: { active: true, approved: true, terraqoWorkspaceId }, orderBy: [{ usageCount: "desc" }, { position: "asc" }], take: 80 }),
    prisma.service.findMany({ where: { isPublished: true, terraqoWorkspaceId }, take: 80 }),
    prisma.product.findMany({ where: { isActive: true, isVisible: true, terraqoWorkspaceId }, include: { category: true }, take: 80 }),
    prisma.project.findMany({ where: { isPublic: true, terraqoWorkspaceId }, take: 40 })
  ]);

  const candidates = [
    ...faqs.map((faq) => ({ id: faq.id, type: "faq", title: faq.question, text: `${faq.question} ${faq.answer} ${faq.category || ""}`, answer: faq.answer })),
    ...services.map((service) => ({ id: service.id, type: "service", title: service.title, text: `${service.title} ${service.summary}`, answer: `${service.title}: ${service.summary}. Podemos dimensionar el alcance tecnico y prepararte una cotizacion.` })),
    ...products.map((product) => ({ id: product.id, type: "product", title: product.name, text: `${product.name} ${product.brand} ${product.model || ""} ${product.summary} ${product.category.name}`, answer: `${product.name} de ${product.brand}: ${product.summary}. ${product.requiresQuote ? "Este producto se cotiza con asesor." : `Precio referencial publicado: ${product.currency} ${Number(product.price || 0).toLocaleString("en-US")}.`}` })),
    ...projects.map((project) => ({ id: project.id, type: "project", title: project.title, text: `${project.title} ${project.summary} ${project.servicesApplied.join(" ")}`, answer: `Tenemos experiencia en ${project.title}. ${project.summary}. Podemos cotizar un proyecto similar si nos compartes ubicacion y alcance.` }))
  ];

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreText(normalized, normalize(candidate.text)) }))
    .sort((a, b) => b.score - a.score)[0];

  if (scored && scored.score >= 0.2) {
    if (scored.candidate.type === "faq") {
      await prisma.faq.update({ where: { id: scored.candidate.id }, data: { usageCount: { increment: 1 } } });
    }
    return {
      answer: scored.candidate.answer,
      source: `${scored.candidate.type}:${scored.candidate.title}`,
      confidence: scored.score,
      shouldEscalate: false
    };
  }

  const existingQuestion = await prisma.botUnansweredQuestion.findFirst({ where: { question, terraqoWorkspaceId } });
  if (existingQuestion) {
    await prisma.botUnansweredQuestion.update({ where: { id: existingQuestion.id }, data: { frequency: { increment: 1 } } });
  } else {
    await prisma.botUnansweredQuestion.create({ data: { question, source: "web-chatbot", terraqoWorkspaceId } });
  }
  await prisma.notification.create({
    data: {
      type: "FAQ",
      title: "Pregunta sin respuesta del chatbot",
      body: question,
      href: "/admin/chatbot",
      terraqoWorkspaceId
    }
  });

  return {
    answer: "No quiero darte una respuesta imprecisa. Puedo derivarte con un asesor ICC para revisar tu consulta con contexto tecnico.",
    source: "unanswered",
    confidence: scored?.score || 0,
    shouldEscalate: true
  };
}

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreText(question: string, text: string) {
  const words = new Set(question.split(" ").filter((word) => word.length > 3));
  if (!words.size) return 0;
  let hits = 0;
  words.forEach((word) => {
    if (text.includes(word)) hits += 1;
  });
  return hits / words.size;
}
