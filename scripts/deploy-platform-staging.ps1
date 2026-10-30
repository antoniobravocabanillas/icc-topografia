param(
  [string]$SiteId = "6b8c43fb-6083-450a-9b85-46a820fb6358",
  [string]$Message = "Terraqo platform staging candidate"
)

$ErrorActionPreference = "Stop"

$expectedSiteId = "6b8c43fb-6083-450a-9b85-46a820fb6358"
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$statePath = Join-Path $repo ".netlify\state.json"
$envPath = Join-Path $repo ".env"
$envLocalPath = Join-Path $repo ".env.local"
$envExamplePath = Join-Path $repo ".env.example"
$envHoldPath = Join-Path $repo ".env.codex-staging-hold"
$envLocalHoldPath = Join-Path $repo ".env.local.codex-staging-hold"
$preflightVariableNames = @(
  "PLATFORM_STAGING_CONFIRM",
  "PLATFORM_STAGING_ALLOW_REMOTE",
  "PLATFORM_STAGING_DATABASE_PROVIDER",
  "PLATFORM_STAGING_RESOURCE_NAME",
  "PLATFORM_STAGING_SUPABASE_PROJECT_REF",
  "PLATFORM_STAGING_DATABASE_ROLE",
  "PLATFORM_STAGING_ENABLED_FLAGS",
  "PLATFORM_STAGING_PILOT_WORKSPACE_IDS",
  "PLATFORM_STAGING_ACTIVATION_CONFIRM",
  "PLATFORM_STAGING_PROVIDER_CONFIRM",
  "B5_GATE_DATABASE_URL",
  "B5_GATE_EXPECTED_DATABASE",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_PORTAL_URL",
  "NEXT_PUBLIC_ADMIN_URL",
  "NEXT_PUBLIC_API_URL",
  "AUTH_URL",
  "AUTH_SECRET",
  "EVIDENCE_ANALYSIS_DISPATCH_SECRET",
  "TERRAQO_STAGING_DOCUMENT_CLEANUP_SECRET",
  "TERRAQO_STAGING_BILLING_RECONCILE_SECRET",
  "TERRAQO_WORKLOG_FTS_V1",
  "TERRAQO_WORK_CASES_V1",
  "TERRAQO_SCOPED_SHARING_V1",
  "TERRAQO_SCOPED_ENDORSEMENTS_V1",
  "TERRAQO_DISCOVERY_NEEDS_V1",
  "TERRAQO_CONTEXTUAL_MESSAGING_V1",
  "TERRAQO_COLLABORATION_V1",
  "TERRAQO_CLOSURE_V1",
  "TERRAQO_EVIDENCE_ANALYSIS_V1",
  "TERRAQO_B5_PILOT_WORKSPACE_IDS",
  "TERRAQO_EVIDENCE_ANALYSIS_PROVIDER",
  "TERRAQO_OAUTH_ENABLED",
  "TERRAQO_TRANSACTIONAL_EMAIL_ENABLED"
)
$runtimeIsolationVariableNames = @(
  "DATABASE_URL",
  "DIRECT_URL",
  "SHADOW_DATABASE_URL",
  "AI_PROVIDER",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "OLLAMA_BASE_URL"
)

function Get-DotEnvVariableNames {
  param([string[]]$Paths)

  $names = @()
  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    foreach ($line in Get-Content -LiteralPath $path) {
      if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=') {
        $names += $Matches[1]
      }
    }
  }

  return @($names | Sort-Object -Unique)
}

# Netlify necesita su propia credencial para resolver el Site ID, pero ninguna
# variable de aplicacion del checkout debe alcanzar el proceso de build. La
# lista se deriva de las plantillas y archivos locales, sin leer ni imprimir
# valores, para cubrir tambien DATABASE_URL, proveedores IA y futuras claves.
$netlifyCredentialVariableNames = @("NETLIFY_AUTH_TOKEN")
$dotenvVariableNames = Get-DotEnvVariableNames -Paths @(
  $envExamplePath,
  $envPath,
  $envLocalPath
)
$deploymentVariableNames = @(
  $preflightVariableNames + $runtimeIsolationVariableNames + $dotenvVariableNames |
    Where-Object { $_ -notin $netlifyCredentialVariableNames } |
    Sort-Object -Unique
)
$deploymentEnvironment = @{}
foreach ($name in $deploymentVariableNames) {
  $deploymentEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

if ($SiteId -ne $expectedSiteId) {
  throw "SiteId no autorizado para este gate de staging."
}

if (-not (Test-Path -LiteralPath $statePath)) {
  throw "El checkout no esta enlazado a un sitio Netlify."
}

$linkedSiteId = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).siteId
if ($linkedSiteId -ne $expectedSiteId) {
  throw "El checkout debe estar enlazado exclusivamente a terraqo-platform-staging antes del deploy."
}

$dirty = git -C $repo status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo verificar el estado Git."
}
if ($dirty) {
  throw "El deploy de staging exige un arbol Git limpio e identificable."
}

if ((Test-Path -LiteralPath $envHoldPath) -or (Test-Path -LiteralPath $envLocalHoldPath)) {
  throw "Existe un archivo hold previo; restaurelo antes de continuar."
}

Push-Location $repo
try {
  npm run check:platform-staging
  if ($LASTEXITCODE -ne 0) {
    throw "El preflight de staging fallo."
  }

  # El preflight usa confirmaciones y credenciales efimeras del operador. No
  # deben heredarse al build: Netlify debe resolver exclusivamente las variables
  # guardadas en el Site ID aislado.
  foreach ($name in $deploymentVariableNames) {
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }

  $movedEnv = $false
  $movedEnvLocal = $false
  try {
    # Netlify CLI carga .env locales antes que las variables del sitio. Se
    # apartan temporalmente para impedir que un build de staging herede
    # credenciales o URLs productivas. El bloque finally siempre los restaura.
    if (Test-Path -LiteralPath $envPath) {
      Move-Item -LiteralPath $envPath -Destination $envHoldPath
      $movedEnv = $true
    }
    if (Test-Path -LiteralPath $envLocalPath) {
      Move-Item -LiteralPath $envLocalPath -Destination $envLocalHoldPath
      $movedEnvLocal = $true
    }

    npx netlify deploy --build --prod --site $SiteId --message $Message --json
    if ($LASTEXITCODE -ne 0) {
      throw "Netlify no completo el deploy de staging."
    }
  }
  finally {
    if ($movedEnvLocal -and (Test-Path -LiteralPath $envLocalHoldPath)) {
      Move-Item -LiteralPath $envLocalHoldPath -Destination $envLocalPath
    }
    if ($movedEnv -and (Test-Path -LiteralPath $envHoldPath)) {
      Move-Item -LiteralPath $envHoldPath -Destination $envPath
    }
  }
}
finally {
  foreach ($name in $deploymentVariableNames) {
    [Environment]::SetEnvironmentVariable(
      $name,
      $deploymentEnvironment[$name],
      "Process"
    )
  }
  Pop-Location
}
