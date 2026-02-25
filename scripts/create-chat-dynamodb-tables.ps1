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

function New-ChatSessionsTable {
    param([Parameter(Mandatory = $true)][string]$AwsRegion)

    $tableName = 'lll-chat-sessions'
    $arguments = @(
        'dynamodb',
        'create-table',
        '--table-name', $tableName,
        '--attribute-definitions', 'AttributeName=PK,AttributeType=S', 'AttributeName=SK,AttributeType=S',
        '--key-schema', 'AttributeName=PK,KeyType=HASH', 'AttributeName=SK,KeyType=RANGE',
        '--billing-mode', 'PAY_PER_REQUEST',
        '--region', $AwsRegion
    )

    Invoke-CreateTable -TableName $tableName -Arguments $arguments
}

function New-GuestProfilesTable {
    param([Parameter(Mandatory = $true)][string]$AwsRegion)

    $tableName = 'lll-guest-profiles'
    $arguments = @(
        'dynamodb',
        'create-table',
        '--table-name', $tableName,
        '--attribute-definitions', 'AttributeName=PK,AttributeType=S',
        '--key-schema', 'AttributeName=PK,KeyType=HASH',
        '--billing-mode', 'PAY_PER_REQUEST',
        '--region', $AwsRegion
    )

    Invoke-CreateTable -TableName $tableName -Arguments $arguments
}

function New-ConversationsTable {
    param([Parameter(Mandatory = $true)][string]$AwsRegion)

    $tableName = 'lll-conversations'
    $arguments = @(
        'dynamodb',
        'create-table',
        '--table-name', $tableName,
        '--attribute-definitions', 'AttributeName=PK,AttributeType=S', 'AttributeName=SK,AttributeType=S', 'AttributeName=sessionId,AttributeType=S',
        '--key-schema', 'AttributeName=PK,KeyType=HASH', 'AttributeName=SK,KeyType=RANGE',
        '--global-secondary-indexes', 'IndexName=sessionId-index,KeySchema=[{AttributeName=sessionId,KeyType=HASH},{AttributeName=SK,KeyType=RANGE}],Projection={ProjectionType=ALL}',
        '--billing-mode', 'PAY_PER_REQUEST',
        '--region', $AwsRegion
    )

    Invoke-CreateTable -TableName $tableName -Arguments $arguments
}

New-ChatSessionsTable -AwsRegion $Region
New-GuestProfilesTable -AwsRegion $Region
New-ConversationsTable -AwsRegion $Region

Write-Host 'Chat DynamoDB table setup complete.'
