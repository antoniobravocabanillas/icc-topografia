type OAuthEnvironment = Record<string, string | undefined>;

export function oauthProvidersEnabled(environment: OAuthEnvironment = process.env) {
  return environment.TERRAQO_OAUTH_ENABLED?.trim().toLowerCase() !== "false";
}

export function resolveOAuthProviderAvailability(
  environment: OAuthEnvironment = process.env,
) {
  const enabled = oauthProvidersEnabled(environment);
  const configured = (id: string, secret: string) =>
    enabled && Boolean(environment[id]?.trim() && environment[secret]?.trim());

  return {
    google: configured("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"),
    apple: configured("AUTH_APPLE_ID", "AUTH_APPLE_SECRET"),
    microsoft: configured(
      "AUTH_MICROSOFT_ENTRA_ID_ID",
      "AUTH_MICROSOFT_ENTRA_ID_SECRET",
    ),
  };
}
