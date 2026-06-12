param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectNextPath = Join-Path $projectRoot '.next'
$devPath = Join-Path $projectNextPath 'dev'
$localCacheRoot = Join-Path $env:LOCALAPPDATA 'LeisureLifeInteractive\next-cache'
$localNextPath = Join-Path $localCacheRoot '.next'

function Ensure-InsideProject {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $resolvedProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
    if (-not $resolvedPath.StartsWith($resolvedProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify '$resolvedPath' because it is outside the project root '$resolvedProjectRoot'."
    }
}

Ensure-InsideProject -Path $projectNextPath -ProjectRoot $projectRoot
Ensure-InsideProject -Path $devPath -ProjectRoot $projectRoot

if (-not (Test-Path -LiteralPath $projectNextPath)) {
    Write-Host "No .next directory exists yet. Nothing to repair."
    exit 0
}

if (-not (Test-Path -LiteralPath $devPath)) {
    Write-Host "No .next\\dev directory exists yet. Nothing to repair."
    exit 0
}

try {
    Remove-Item -LiteralPath $devPath -Recurse -Force
}
catch {
    throw "Unable to clear '$devPath'. Stop the running Next.js dev server first, then re-run this script. Original error: $($_.Exception.Message)"
}

Write-Host "Cleared generated Next.js dev artifacts at $devPath"

$nextItem = Get-Item -LiteralPath $projectNextPath -Force
$isJunction = ($nextItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
if (-not $isJunction) {
    Write-Host "Note: .next is still inside the Dropbox-backed repo."
    Write-Host "To reduce future EPERM rename failures, run: npm run next:prepare-local-cache"
}
elseif ($nextItem.Target -and (($nextItem.Target -join ',') -like "*$localNextPath*")) {
    Write-Host ".next already points at the local cache junction: $localNextPath"
}

Write-Host "You can now restart local dev. Recommended command: npm run dev:webpack"
