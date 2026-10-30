type DefaultWorkspaceIdResolver = () => Promise<string>;

/**
 * The professional cockpit belongs to the user, not to the public commerce
 * workspace. Only the legacy client portal requires that tenant.
 */
export async function resolvePortalHomeWorkspaceId(
  hasProfessionalProfile: boolean,
  getDefaultWorkspaceId: DefaultWorkspaceIdResolver,
) {
  if (hasProfessionalProfile) return null;
  return getDefaultWorkspaceId();
}
