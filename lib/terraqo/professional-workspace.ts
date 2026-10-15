type ProfessionalWorkspaceMembership = {
  role: string;
  workRelationship?: { status: string } | null;
};

/**
 * Keeps every professional surface on the same workspace.
 * A labor relationship is stronger evidence than the member role because a
 * workspace owner or administrator can also be an employee of that company.
 */
export function selectProfessionalWorkspaceMembership<T extends ProfessionalWorkspaceMembership>(memberships: readonly T[]) {
  return memberships.find((membership) => membership.workRelationship?.status === "ACTIVE")
    || memberships.find((membership) => membership.role === "PROFESSIONAL")
    || memberships.find((membership) => membership.workRelationship?.status === "DRAFT")
    || memberships[0]
    || null;
}
