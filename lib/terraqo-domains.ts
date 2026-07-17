function withoutTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

export const terraqoDomains = {
  public: withoutTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL || "https://terraqoglobal.com"),
  portal: withoutTrailingSlash(process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.terraqoglobal.com"),
  admin: withoutTrailingSlash(process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.terraqoglobal.com"),
  api: withoutTrailingSlash(process.env.NEXT_PUBLIC_API_URL || "https://api.terraqoglobal.com")
} as const;
