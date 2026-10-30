type ScheduledJobEnvironment = {
  URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  PLATFORM_STAGING_CONFIRM?: string;
  PROFESSIONAL_DOCUMENT_CLEANUP_SECRET?: string;
  BILLING_RECONCILE_SECRET?: string;
  TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET?: string;
  TERRAQO_STAGING_BILLING_RECONCILE_SECRET?: string;
};

export type ScheduledJobTargets = {
  educationCleanupApi: string;
  educationCleanupWorker: string;
  professionalDocumentCleanupApi: string;
  billingReconcileApi: string;
  complaintsMailApi: string;
};

const productionDeploymentHosts = new Set([
  "terraqoglobal.com",
  "www.terraqoglobal.com",
  "iridescent-fenglisu-d6595c.netlify.app",
]);
const productionPublicHosts = new Set([
  "terraqoglobal.com",
  "www.terraqoglobal.com",
]);
const productionApiHosts = new Set(["api.terraqoglobal.com"]);

function stagingEnvironment(environment: ScheduledJobEnvironment) {
  return environment.PLATFORM_STAGING_CONFIRM?.trim().toLowerCase() === "staging";
}

function productionDeployment(environment: ScheduledJobEnvironment) {
  const candidate = environment.URL || environment.NEXT_PUBLIC_SITE_URL;
  if (!candidate?.trim()) return false;

  try {
    return productionDeploymentHosts.has(new URL(candidate.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function resolveDeploymentSecret(
  environment: ScheduledJobEnvironment,
  stagingSecret: string | undefined,
  productionSecret: string | undefined,
) {
  if (stagingEnvironment(environment)) {
    return productionDeployment(environment) ? undefined : stagingSecret?.trim();
  }

  return productionDeployment(environment) ? productionSecret?.trim() : undefined;
}

export function resolveDocumentCleanupSecret(
  environment: ScheduledJobEnvironment = process.env as ScheduledJobEnvironment,
) {
  return resolveDeploymentSecret(
    environment,
    environment.TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET,
    environment.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET,
  );
}

export function resolveBillingReconcileSecret(
  environment: ScheduledJobEnvironment = process.env as ScheduledJobEnvironment,
) {
  return resolveDeploymentSecret(
    environment,
    environment.TERRAQO_STAGING_BILLING_RECONCILE_SECRET,
    environment.BILLING_RECONCILE_SECRET,
  );
}

function httpsOrigin(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name}_MISSING`);

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name}_INVALID`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(`${name}_INVALID`);
  }

  return url.origin;
}

/**
 * Scheduled functions must never inherit Terraqo production destinations from
 * source code. Every target is derived from the current deployment and staging
 * additionally requires one isolated origin for public, API and function work.
 */
export function resolveScheduledJobTargets(
  environment: ScheduledJobEnvironment = process.env as ScheduledJobEnvironment,
): ScheduledJobTargets {
  const siteOrigin = httpsOrigin(
    environment.URL || environment.NEXT_PUBLIC_SITE_URL,
    "SCHEDULED_SITE_URL",
  );
  const apiOrigin = httpsOrigin(
    environment.NEXT_PUBLIC_API_URL,
    "SCHEDULED_API_URL",
  );
  const configuredSiteOrigin = httpsOrigin(
    environment.NEXT_PUBLIC_SITE_URL,
    "SCHEDULED_PUBLIC_URL",
  );
  const deploymentHost = new URL(siteOrigin).hostname.toLowerCase();
  const configuredSiteHost = new URL(configuredSiteOrigin).hostname.toLowerCase();
  const apiHost = new URL(apiOrigin).hostname.toLowerCase();
  const productionDeployment = productionDeploymentHosts.has(deploymentHost);
  const productionConfiguration =
    productionPublicHosts.has(configuredSiteHost) &&
    productionApiHosts.has(apiHost);

  if (productionDeployment !== productionConfiguration) {
    throw new Error("SCHEDULED_DEPLOYMENT_ORIGIN_MISMATCH");
  }

  if (productionDeployment) {
    if (stagingEnvironment(environment)) {
      throw new Error("SCHEDULED_STAGING_ORIGIN_MISMATCH");
    }
  } else {
    if (!stagingEnvironment(environment)) {
      throw new Error("SCHEDULED_STAGING_CONFIRM_REQUIRED");
    }
    if (siteOrigin !== configuredSiteOrigin || apiOrigin !== configuredSiteOrigin) {
      throw new Error("SCHEDULED_STAGING_ORIGIN_MISMATCH");
    }
  }

  return {
    educationCleanupApi: new URL(
      "/api/internal/education-evidence-cleanup",
      apiOrigin,
    ).toString(),
    educationCleanupWorker: new URL(
      "/.netlify/functions/education-evidence-cleanup-background",
      siteOrigin,
    ).toString(),
    professionalDocumentCleanupApi: new URL(
      "/api/internal/professional-document-cleanup",
      apiOrigin,
    ).toString(),
    billingReconcileApi: new URL(
      "/api/internal/billing-reconcile",
      siteOrigin,
    ).toString(),
    complaintsMailApi: new URL(
      "/api/internal/complaints-mail",
      siteOrigin,
    ).toString(),
  };
}
