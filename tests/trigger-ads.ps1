$ErrorActionPreference = "Stop"
$slug = "wellness-and-nature-cruise"
$out = "tests\trigger-ads-ps-output.json"

try {
    $body = @{ assetTypes = @('designed_ad_artifact', 'documentary_detail_image'); forceRegenerateAssetTypes = @('designed_ad_artifact', 'documentary_detail_image') } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/$slug/media/generate" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
    $payload = @{ status = 200; data = $res; time = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($out, $payload, [System.Text.Encoding]::UTF8)
    Write-Host "Triggered. JobId: $($res.jobId)"
} catch {
    $payload = @{ error = $_.Exception.Message; time = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($out, $payload, [System.Text.Encoding]::UTF8)
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}
