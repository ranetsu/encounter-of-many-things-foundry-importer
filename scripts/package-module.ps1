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

$items = @(
  "module.json",
  "README.md",
  "scripts",
  "styles",
  "templates"
)

foreach ($item in $items) {
  Copy-Item -LiteralPath (Join-Path $repoRoot $item) -Destination $packageDir -Recurse
}

Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Write-Host "Packaged $zipPath"
