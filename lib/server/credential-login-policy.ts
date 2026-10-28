/** Password and passkey credentials are valid only after Terraqo has proven
 * ownership of the account email. OAuth providers keep their own verified
 * identity lifecycle and do not pass through this policy. */
export function canUseTerraqoCredentials(emailVerified: Date | null | undefined) {
  return emailVerified instanceof Date;
}
