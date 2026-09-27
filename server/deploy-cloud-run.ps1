[CmdletBinding()]
param(
    [string]$ProjectId = 'repnetfacturas',
    [string]$Region = 'us-central1',
    [string]$ServiceName = 'repnet-facturas-api',
    [ValidatePattern('^[1-9][0-9]*$')]
    [string]$SecretVersion = '1'
)

$ErrorActionPreference = 'Stop'

$gcloudCommand = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloudCommand) {
    $repnetGcloud = $gcloudCommand.Source
} else {
    $repnetCandidates = @(
        'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd',
        'C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd',
        (Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd')
    )
    $repnetGcloud = $repnetCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $repnetGcloud) {
    throw 'Instala Google Cloud CLI e inicia sesion con gcloud auth login.'
}

Push-Location $PSScriptRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion del backend.' }

    $repnetUploadFiles = @(& $repnetGcloud meta list-files-for-upload)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la lista de archivos a subir.' }
    if ($repnetUploadFiles | Where-Object { $_ -notmatch '^(package(-lock)?\.json|tsconfig\.json|src[/\\].+\.ts)$' }) {
        throw 'La subida contiene archivos inesperados. Revisa server/.gcloudignore.'
    }

    # Service accounts and the versioned secret must already exist in this project.
    $repnetDeployArgs = @(
        'run', 'deploy', $ServiceName,
        '--source=.',
        "--project=$ProjectId",
        "--region=$Region",
        '--no-invoker-iam-check',
        "--service-account=repnet-api-runtime@$ProjectId.iam.gserviceaccount.com",
        "--build-service-account=projects/$ProjectId/serviceAccounts/repnet-api-builder@$ProjectId.iam.gserviceaccount.com",
        "--update-secrets=OPENAI_API_KEY=openai-api-key:$SecretVersion",
        '--update-env-vars=NODE_ENV=production',
        '--set-build-env-vars=GOOGLE_NODE_RUN_SCRIPTS=build',
        '--memory=512Mi',
        '--cpu=1',
        '--cpu-throttling',
        '--concurrency=4',
        '--timeout=120s',
        '--min=0',
        '--max=2',
        '--quiet'
    )
    & $repnetGcloud @repnetDeployArgs
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el despliegue en Cloud Run.' }
} finally {
    Pop-Location
}
