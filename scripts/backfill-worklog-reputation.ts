import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { syncWorklogReputation } from "../lib/terraqo/builders";

async function main() {
  const worklogs = await prisma.terraqoWorklogEntry.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true, summary: true, projectId: true, contentFingerprint: true },
    orderBy: { createdAt: "asc" }
  });

  let processed = 0;
  for (const worklog of worklogs) {
    if (!worklog.contentFingerprint) {
      const source = `${worklog.title}|${worklog.summary}|${worklog.projectId || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { contentFingerprint: createHash("sha256").update(source).digest("hex") } });
    }
    await syncWorklogReputation(worklog.id);
    processed += 1;
  }
  console.log(JSON.stringify({ processed }));
}

main().finally(() => prisma.$disconnect());
