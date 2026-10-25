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
$envHoldPath = Join-Path $repo ".env.codex-staging-hold"
$envLocalHoldPath = Join-Path $repo ".env.local.codex-staging-hold"

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
  Pop-Location
}
