param(
  [string]$OutputRoot = "local-release-import",
  [string]$FolderName = "claw-in-chrome"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$srcRoot = Join-Path $repoRoot "src"
$releasePackageCheckScriptPath = Join-Path $repoRoot "scripts\check-release-package.js"
$packageListPath = Join-Path $repoRoot ".github\release-package-items.txt"
$manifestPath = Join-Path $srcRoot "manifest.json"
$outputRootPath = Join-Path $repoRoot $OutputRoot
$outputPath = Join-Path $outputRootPath $FolderName

if (-not (Test-Path -LiteralPath $releasePackageCheckScriptPath)) {
  throw "Missing release package check script: $releasePackageCheckScriptPath"
}

Push-Location $repoRoot
try {
  & node $releasePackageCheckScriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "Release package check failed with exit code: $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $packageListPath)) {
  throw "Missing package list: $packageListPath"
}

$packageItems = Get-Content -LiteralPath $packageListPath | ForEach-Object { $_.Trim() } | Where-Object {
  $_ -and -not $_.StartsWith("#")
}

if ($packageItems.Count -eq 0) {
  throw "Package list is empty: $packageListPath"
}

$missingItems = @()
foreach ($item in $packageItems) {
  $sourcePath = Join-Path $srcRoot $item
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $missingItems += $item
  }
}

if ($missingItems.Count -gt 0) {
  throw ("Missing package item(s): " + ($missingItems -join ", "))
}

$resolvedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot)
$resolvedOutputPath = [System.IO.Path]::GetFullPath($outputPath)
if (-not $resolvedOutputPath.StartsWith($resolvedRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Output path must stay inside repository: $resolvedOutputPath"
}

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

foreach ($item in $packageItems) {
  $sourcePath = Join-Path $srcRoot $item
  $destinationPath = Join-Path $outputPath $item
  $sourceItem = Get-Item -LiteralPath $sourcePath

  if ($sourceItem.PSIsContainer) {
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
    continue
  }

  $destinationParent = Split-Path -Parent $destinationPath
  if ($destinationParent) {
    New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
  }
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

$version = ""
if (Test-Path -LiteralPath $manifestPath) {
  $version = (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).version
}

Write-Host ("Release import folder ready: " + $outputPath)
if ($version) {
  Write-Host ("Manifest version: " + $version)
}
Write-Host ("Copied items: " + $packageItems.Count)
