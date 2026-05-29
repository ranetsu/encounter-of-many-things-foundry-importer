$ErrorActionPreference = "Stop"

$moduleId = "encounter-of-many-things-importer"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDir = Join-Path $repoRoot "dist"
$packageDir = Join-Path $distDir $moduleId
$zipPath = Join-Path $distDir "$moduleId.zip"

if (Test-Path $distDir) {
  Remove-Item -LiteralPath $distDir -Recurse -Force
}

New-Item -ItemType Directory -Force $packageDir | Out-Null
New-Item -ItemType Directory -Force (Join-Path $packageDir "scripts") | Out-Null

$items = @(
  "module.json",
  "README.md",
  "styles",
  "templates"
)

foreach ($item in $items) {
  Copy-Item -LiteralPath (Join-Path $repoRoot $item) -Destination $packageDir -Recurse
}

$importerEntry = Join-Path $repoRoot "scripts/importer.js"
$importerOut = Join-Path $packageDir "scripts/importer.js"

npx esbuild $importerEntry `
  --bundle `
  --format=esm `
  --platform=browser `
  --target=es2022 `
  "--outfile=$importerOut" `
  --log-level=warning

Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Write-Host "Packaged $zipPath"
