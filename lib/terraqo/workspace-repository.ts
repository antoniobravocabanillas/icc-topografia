import type { TerraqoPlanTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultModulesForTier } from "@/lib/workspace";

export async function createTerraqoWorkspace(input: {
  name: string;
  slug: string;
  type?: "CLIENT_COMPANY" | "INTERNAL_UNIT" | "PRODUCT_ADMIN";
  industry?: string;
  description?: string;
  companyId?: string;
  ownerUserId?: string;
  brandName?: string;
  domain?: string;
  logoUrl?: string;
  plan?: TerraqoPlanTier;
}) {
  const plan = input.plan ?? "BASIC";
  const moduleCodes = getDefaultModulesForTier(plan);

  return prisma.terraqoWorkspace.create({
    data: {
      name: input.name,
      slug: input.slug,
      type: input.type ?? "CLIENT_COMPANY",
      industry: input.industry,
      description: input.description,
      company: input.companyId ? { connect: { id: input.companyId } } : undefined,
      owner: input.ownerUserId ? { connect: { id: input.ownerUserId } } : undefined,
      brandName: input.brandName,
      domain: input.domain,
      logoUrl: input.logoUrl,
      subscriptions: {
        create: {
          tier: plan,
          status: "TRIALING",
          seats: plan === "ENTERPRISE" ? 50 : plan === "PREMIUM" ? 20 : 5
        }
      },
      modules: {
        create: moduleCodes.map((code) => ({
          code,
          active: true,
          enabledAt: new Date(),
          config: {
            provisioning: {
              mode: "blank",
              version: 1,
              provisionedAt: new Date().toISOString()
            }
          }
        }))
      },
      ...(input.ownerUserId
        ? {
            members: {
              create: {
                user: { connect: { id: input.ownerUserId } },
                role: "OWNER",
                active: true,
                joinedAt: new Date()
              }
            }
          }
        : {})
    }
  });
}

export async function getWorkspaceWithEntitlements(slug: string) {
  return prisma.terraqoWorkspace.findUnique({
    where: { slug },
    include: {
      company: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      modules: { orderBy: { code: "asc" } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}
