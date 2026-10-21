import { createHash } from "node:crypto";

export type WorklogRevisionContent = {
  title: string;
  summary: string;
  outcome?: string | null;
  contributionRole?: string | null;
  responsibilities?: string[];
  methods?: string[];
  tools?: string[];
};

const normalizeList = (items: string[] | undefined) =>
  [...new Set((items || []).map((item) => item.trim()).filter(Boolean))].sort();

export function worklogRevisionHash(content: WorklogRevisionContent) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: content.title.trim(),
      summary: content.summary.trim(),
      outcome: content.outcome?.trim() || null,
      contributionRole: content.contributionRole?.trim() || null,
      responsibilities: normalizeList(content.responsibilities),
      methods: normalizeList(content.methods),
      tools: normalizeList(content.tools),
    }))
    .digest("hex");
}
