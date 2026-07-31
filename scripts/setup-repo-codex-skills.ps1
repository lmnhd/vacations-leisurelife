$ErrorActionPreference = "Stop"

$projectRootPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$canonicalSkillsPath = Join-Path $projectRootPath ".github\skills"
$discoverySkillsPath = Join-Path $projectRootPath ".agents\skills"

if (-not (Test-Path -LiteralPath $canonicalSkillsPath)) {
    throw "Canonical skill directory not found: $canonicalSkillsPath"
}

if (-not (Test-Path -LiteralPath $discoverySkillsPath)) {
    New-Item -ItemType Directory -Path $discoverySkillsPath -Force | Out-Null
}

$skillDirectories = Get-ChildItem -Directory -LiteralPath $canonicalSkillsPath |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") }

if ($skillDirectories.Count -eq 0) {
    throw "No canonical skills with SKILL.md were found in $canonicalSkillsPath"
}

$createdCount = 0
$existingCount = 0

foreach ($skillDirectory in $skillDirectories) {
    $junctionPath = Join-Path $discoverySkillsPath $skillDirectory.Name
    $expectedTarget = [IO.Path]::GetFullPath($skillDirectory.FullName).TrimEnd("\")

    if (Test-Path -LiteralPath $junctionPath) {
        $junctionItem = Get-Item -Force -LiteralPath $junctionPath
        $isReparsePoint =
            ($junctionItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
        if (-not $isReparsePoint) {
            throw "Discovery path exists but is not a junction: $junctionPath"
        }

        $currentTargetValue = $junctionItem.Target | Select-Object -First 1
        $currentTarget = [IO.Path]::GetFullPath([string]$currentTargetValue).TrimEnd("\")
        if ($currentTarget -ne $expectedTarget) {
            throw "Discovery junction points to '$currentTarget', expected '$expectedTarget'."
        }

        Write-Host "Already linked: $junctionPath -> $expectedTarget"
        $existingCount++
        continue
    }

    New-Item -ItemType Junction -Path $junctionPath -Target $expectedTarget | Out-Null
    Write-Host "Created: $junctionPath -> $expectedTarget"
    $createdCount++
}

Write-Host "Repo skill discovery ready. created=$createdCount existing=$existingCount"
