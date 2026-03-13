param(
    [switch]$ForceRepair
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectNextPath = Join-Path $projectRoot '.next'
$localCacheRoot = Join-Path $env:LOCALAPPDATA 'LeisureLifeInteractive\next-cache'
$targetNextPath = Join-Path $localCacheRoot '.next'

function Get-IsJunction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    $item = Get-Item -LiteralPath $Path -Force
    return ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

Ensure-Directory -Path $localCacheRoot
Ensure-Directory -Path $targetNextPath

if (Get-IsJunction -Path $projectNextPath) {
    $currentTarget = (Get-Item -LiteralPath $projectNextPath -Force).Target
    if ($currentTarget -eq $targetNextPath) {
        Write-Host ".next already points to $targetNextPath"
        exit 0
    }

    if (-not $ForceRepair) {
        throw ".next is already a junction to '$currentTarget'. Re-run with -ForceRepair to replace it."
    }

    Remove-Item -LiteralPath $projectNextPath -Force
}
elseif (Test-Path -LiteralPath $projectNextPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = Join-Path $projectRoot ".next.dropbox-backup.$timestamp"

    try {
        Move-Item -LiteralPath $projectNextPath -Destination $backupPath
        Write-Host "Moved existing .next to $backupPath"
    }
    catch {
        throw "Unable to move the existing .next directory. Stop any running Next.js process, then re-run this script. Original error: $($_.Exception.Message)"
    }
}

New-Item -ItemType Junction -Path $projectNextPath -Target $targetNextPath | Out-Null

Write-Host "Created junction: $projectNextPath -> $targetNextPath"
Write-Host "Recommended dev command from this repo: npm run dev:webpack"
Write-Host "If Dropbox still interferes, pause syncing for this folder while the dev server is running."