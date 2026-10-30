import type { TerraqoMemberRole } from "@prisma/client";

/** Roles capaces de administrar un workspace. Este módulo debe permanecer
 * libre de dependencias HTTP/Next para poder reutilizarse en workers. */
export const workspaceAdminMemberRoles: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER"];
