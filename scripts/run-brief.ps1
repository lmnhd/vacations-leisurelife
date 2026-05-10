$ErrorActionPreference = "Stop"
$slug = "wellness-and-nature-cruise"
$out = "scripts\brief-ps-output.json"

function Write-Status($step, $data) {
    $payload = @{ step = $step; data = $data; time = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($out, $payload, [System.Text.Encoding]::UTF8)
}

try {
    # Trigger brief generation
    Write-Host "Triggering brief for $slug..."
    $body = @{ } | ConvertTo-Json
    $post = Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/$slug/brief" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 60
    Write-Status "triggered" $post
    Write-Host "JobId: $($post.jobId)"

    if (-not $post.jobId) {
        Write-Host "NO_JOB_ID"
        exit 1
    }

    # Poll for completion
    $jobId = $post.jobId
    for ($i = 1; $i -le 60; $i++) {
        Start-Sleep -Seconds 5
        $poll = Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/$slug/brief?jobId=$jobId" -Method GET -TimeoutSec 30
        Write-Status "poll_$i" $poll
        Write-Host "Poll $i`: status=$($poll.status)"

        if ($poll.status -eq "completed" -or $poll.status -eq "failed") {
            Write-Status "done" $poll
            Write-Host "DONE: $($poll.status)"
            exit 0
        }
    }

    Write-Status "timeout" @{ lastStatus = $poll.status }
    Write-Host "TIMEOUT"
    exit 1
} catch {
    Write-Status "error" @{ message = $_.Exception.Message }
    Write-Host "ERROR: $($_.Exception.Message)"
    exit 1
}
