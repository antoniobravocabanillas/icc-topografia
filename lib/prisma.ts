import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrlWithConnectionLimit(databaseUrl: string) {
  if (!databaseUrl || !databaseUrl.startsWith("postgres")) return databaseUrl;

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "20");
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl?.startsWith("prisma+postgres://")) {
    // Netlify Functions uses Accelerate over HTTPS instead of opening a
    // PostgreSQL TCP connection, which is unreliable in this runtime.
    return new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  return new PrismaClient({
    ...(databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrlWithConnectionLimit(databaseUrl)
            }
          }
        }
      : {}),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

globalForPrisma.prisma = prisma;
