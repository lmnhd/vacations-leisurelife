param(
    [string]$Region = 'us-east-1',
    [string]$TableName = 'lll-app-cache'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

if ([string]::IsNullOrWhiteSpace($Region)) {
    $Region = 'us-east-1'
}

if ([string]::IsNullOrWhiteSpace($TableName)) {
    $TableName = 'lll-app-cache'
}

$args = @(
    'dynamodb',
    'create-table',
    '--table-name', $TableName,
    '--attribute-definitions',
    'AttributeName=PK,AttributeType=S',
    'AttributeName=SK,AttributeType=S',
    '--key-schema',
    'AttributeName=PK,KeyType=HASH',
    'AttributeName=SK,KeyType=RANGE',
    '--billing-mode', 'PAY_PER_REQUEST',
    '--region', $Region
)

$outputLines = & aws @args 2>&1
$exitCode = $LASTEXITCODE
$outputText = ($outputLines | Out-String)

if ($exitCode -eq 0) {
    Write-Host "Created table: $TableName"
    exit 0
}

if ($outputText -match 'ResourceInUseException') {
    Write-Host "Table already exists: $TableName"
    exit 0
}

throw "Failed to create table $TableName. AWS output: $outputText"
