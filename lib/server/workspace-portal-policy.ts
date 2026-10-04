export type WorkspacePortalRole = "CLIENT" | "PROFESSIONAL" | "ADMIN" | "MEMBER" | "VIEWER";

/** Workspace membership, never a global user role, controls portal privileges. */
export function toWorkspacePortalRole(role: string): WorkspacePortalRole | null {
  switch (role) {
    case "OWNER":
    case "ADMIN":
    case "MANAGER":
      return "ADMIN";
    case "CLIENT":
    case "PROFESSIONAL":
    case "MEMBER":
    case "VIEWER":
      return role;
    default:
      return null;
  }
}
