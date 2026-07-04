# Operator-run: create the DynamoDB spend guardrails for the lll- tables.
#
# What it does (idempotent — safe to re-run):
#   1. SNS topic `lll-dynamo-spend-alerts` + email subscription (you must click
#      the confirmation link AWS emails you).
#   2. CloudWatch alarm: lll-deals-system consumed reads > 3M RCU/day.
#      Post read-cache fix the expected baseline is <100K/day, so this only
#      fires if scan traffic regresses or ad traffic explodes.
#   3. CloudWatch alarm: lll-shadow-campaigns consumed reads > 3M RCU/day.
#
# Usage (PowerShell, AWS creds via env or profile):
#   .\scripts\setup-dynamo-spend-alerts.ps1 -Email you@example.com
#
# Context: 2026-07-04 audit found lll-deals-system consuming ~2M RCU/day from
# full-table Scans on the public read path. Fixed with a read-through cache in
# lib/cb/deals-system/deals-dynamo-store.ts; these alarms catch regressions.

param(
    [Parameter(Mandatory = $true)]
    [string]$Email
)

$ErrorActionPreference = "Stop"

Write-Host "Creating SNS topic lll-dynamo-spend-alerts..."
$topicArn = aws sns create-topic --name lll-dynamo-spend-alerts --query TopicArn --output text
Write-Host "  topic: $topicArn"

Write-Host "Subscribing $Email (check your inbox for the AWS confirmation link)..."
aws sns subscribe --topic-arn $topicArn --protocol email --notification-endpoint $Email --output text

$tables = @("lll-deals-system", "lll-shadow-campaigns")
foreach ($table in $tables) {
    Write-Host "Creating read-spike alarm for $table..."
    aws cloudwatch put-metric-alarm `
        --alarm-name "$table-read-spike" `
        --alarm-description "$table consumed >3M RCU in 24h - Scan traffic is spiking (expected <100K/day after the 2026-07-04 read-cache fix)" `
        --namespace AWS/DynamoDB --metric-name ConsumedReadCapacityUnits `
        --dimensions Name=TableName,Value=$table `
        --statistic Sum --period 86400 --evaluation-periods 1 `
        --threshold 3000000 --comparison-operator GreaterThanThreshold `
        --alarm-actions $topicArn
}

Write-Host ""
Write-Host "Done. Click the confirmation link AWS emailed to $Email or the alarms stay silent."
Write-Host "Recommended extra (needs billing permissions): an AWS Budget with a monthly cap:"
Write-Host '  aws budgets create-budget --account-id <ACCOUNT_ID> --budget file://budget.json --notifications-with-subscribers file://notifications.json'
