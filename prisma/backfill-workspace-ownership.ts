import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const workspaceSlug = process.argv.find((argument) => argument.startsWith("--workspace="))?.split("=")[1];
const apply = process.argv.includes("--apply");

if (!workspaceSlug) {
  throw new Error("Indica el workspace: --workspace=icc-topografia");
}

async function main() {
  const workspace = await prisma.terraqoWorkspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, name: true, slug: true }
  });
  if (!workspace) throw new Error(`Workspace no encontrado: ${workspaceSlug}`);

  const operations = [
    "Category", "Sector", "CmsPage", "Banner", "Testimonial", "Faq", "BlogPost",
    "Commission", "InternalChatChannel", "BotConversation", "BotUnansweredQuestion",
    "Notification", "StaffProfile", "Company", "Contact", "ClientAccount", "Client",
    "Product", "Order", "Service", "ServiceCategory", "ClientLogo", "Lead", "Quote",
    "Opportunity", "Sale", "ContactMessage", "ChatConversation", "Project", "Ticket",
    "Document", "ActivityLog"
  ] as const;

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${workspace.name} (${workspace.slug})`);
  let total = 0;
  for (const label of operations) {
    const table = Prisma.raw(`"${label}"`);
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${table} WHERE "terraqoWorkspaceId" IS NULL`
    );
    const count = Number(rows[0]?.count ?? 0);
    total += count;
    console.log(`${label}: ${count}`);
    if (apply && count > 0) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE ${table} SET "terraqoWorkspaceId" = ${workspace.id} WHERE "terraqoWorkspaceId" IS NULL`
      );
    }
  }

  console.log(`${apply ? "Asignados" : "Pendientes"}: ${total}`);
  if (!apply && total > 0) {
    console.log(`Para aplicar: npm run workspace:backfill -- --workspace=${workspace.slug} --apply`);
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
