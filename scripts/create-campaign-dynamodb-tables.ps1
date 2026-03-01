param(
    [string]$Region = 'us-east-1'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

if ([string]::IsNullOrWhiteSpace($Region)) {
    $Region = 'us-east-1'
}

function Invoke-CreateTable {
    param(
        [Parameter(Mandatory = $true)][string]$TableName,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    $outputLines = & aws @Arguments 2>&1
    $exitCode = $LASTEXITCODE

    $ErrorActionPreference = $previousErrorActionPreference

    $outputText = ($outputLines | Out-String)

    if ($exitCode -eq 0) {
        Write-Host "Created table: $TableName"
        return
    }

    if ($outputText -match 'ResourceInUseException') {
        Write-Host "Table already exists: $TableName"
        return
    }

    throw "Failed to create table $TableName. AWS output: $outputText"
}

function New-CampaignsTable {
    param([Parameter(Mandatory = $true)][string]$AwsRegion)

    # Uses a Single-Table Design pattern. 
    # Items include Campaign metadata (SK='METADATA') and 
    # Waitlist Submissions (SK='USER#<Email>')
    $tableName = 'lll-shadow-campaigns'
    
    $arguments = @(
        'dynamodb',
        'create-table',
        '--table-name', $tableName,
        '--attribute-definitions', 
            'AttributeName=PK,AttributeType=S', 
            'AttributeName=SK,AttributeType=S',
        '--key-schema', 
            'AttributeName=PK,KeyType=HASH', 
            'AttributeName=SK,KeyType=RANGE',
        '--billing-mode', 'PAY_PER_REQUEST',
        '--region', $AwsRegion
    )

    Invoke-CreateTable -TableName $tableName -Arguments $arguments
}

New-CampaignsTable -AwsRegion $Region

Write-Host 'Campaign DynamoDB table setup complete.'
