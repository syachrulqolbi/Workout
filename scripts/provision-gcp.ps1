param(
  [string]$ProjectId = 'personal-project-414620',
  [string]$Region = 'asia-southeast1',
  [string]$DatabaseId = 'form-workout',
  [string]$Repository = 'portfolio-apps',
  [string]$RuntimeServiceAccount = 'workout-runtime',
  [string]$CleanupServiceAccount = 'workout-cleanup',
  [string]$Service = 'workout',
  [string]$SiteUrl = 'https://workout.sqnsportfolio.com'
)

$ErrorActionPreference = 'Stop'
$gcloudCommand = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'

if (-not (Test-Path -LiteralPath $gcloudCommand)) {
  throw "Google Cloud CLI was not found at $gcloudCommand"
}

function Assert-GcloudSuccess([string]$Action) {
  if ($LASTEXITCODE -ne 0) { throw "Google Cloud command failed while $Action." }
}

& $gcloudCommand services enable `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  cloudscheduler.googleapis.com `
  firebase.googleapis.com `
  firestore.googleapis.com `
  iam.googleapis.com `
  iamcredentials.googleapis.com `
  identitytoolkit.googleapis.com `
  run.googleapis.com `
  secretmanager.googleapis.com `
  vision.googleapis.com `
  --project=$ProjectId
Assert-GcloudSuccess 'enabling required APIs'

& $gcloudCommand firestore databases describe --database=$DatabaseId --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  & $gcloudCommand firestore databases create `
    --database=$DatabaseId `
    --location=$Region `
    --type=firestore-native `
    --delete-protection `
    --project=$ProjectId
  Assert-GcloudSuccess 'creating Firestore'
}

& $gcloudCommand firestore fields ttls update expiresAt `
  --collection-group='workout-rate-limits' `
  --database=$DatabaseId `
  --enable-ttl `
  --project=$ProjectId `
  --quiet
Assert-GcloudSuccess 'enabling automatic cleanup for OCR rate-limit documents'

& $gcloudCommand artifacts repositories describe $Repository --location=$Region --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  & $gcloudCommand artifacts repositories create $Repository `
    --repository-format=docker `
    --location=$Region `
    --description='Portfolio application containers' `
    --project=$ProjectId
  Assert-GcloudSuccess 'creating Artifact Registry'
}

$runtimeEmail = "$RuntimeServiceAccount@$ProjectId.iam.gserviceaccount.com"
& $gcloudCommand iam service-accounts describe $runtimeEmail --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  & $gcloudCommand iam service-accounts create $RuntimeServiceAccount `
    --display-name='Workout runtime' `
    --description='Least-privilege Cloud Run identity for the Workout app' `
    --project=$ProjectId
  Assert-GcloudSuccess 'creating the runtime service account'
}

& $gcloudCommand projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$runtimeEmail" `
  --role='roles/datastore.user' `
  --condition=None `
  --quiet
Assert-GcloudSuccess 'granting Firestore access to the runtime service account'

& $gcloudCommand projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$runtimeEmail" `
  --role='roles/serviceusage.serviceUsageConsumer' `
  --condition=None `
  --quiet
Assert-GcloudSuccess 'granting Vision API quota access to the runtime service account'

$sessionSecretName = 'workout-session-secret'
& $gcloudCommand secrets describe $sessionSecretName --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  $secretBytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  $sessionSecret = [Convert]::ToBase64String($secretBytes)
  $sessionSecret | & $gcloudCommand secrets create $sessionSecretName `
    --data-file=- `
    --replication-policy=automatic `
    --project=$ProjectId
  Assert-GcloudSuccess 'creating the Workout session secret'
}

& $gcloudCommand secrets add-iam-policy-binding $sessionSecretName `
  --member="serviceAccount:$runtimeEmail" `
  --role='roles/secretmanager.secretAccessor' `
  --project=$ProjectId `
  --quiet
Assert-GcloudSuccess 'allowing the runtime to read the Workout session secret'

$cleanupEmail = "$CleanupServiceAccount@$ProjectId.iam.gserviceaccount.com"
& $gcloudCommand iam service-accounts describe $cleanupEmail --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  & $gcloudCommand iam service-accounts create $CleanupServiceAccount `
    --display-name='Workout inactive-user cleanup' `
    --description='OIDC identity used only by the Workout Cloud Scheduler job' `
    --project=$ProjectId
  Assert-GcloudSuccess 'creating the cleanup service account'
}

$buildServiceAccount = (& $gcloudCommand builds get-default-service-account --project=$ProjectId).Trim()
Assert-GcloudSuccess 'reading the Cloud Build service account'

foreach ($role in @('roles/artifactregistry.writer', 'roles/logging.logWriter', 'roles/run.admin')) {
  & $gcloudCommand projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$buildServiceAccount" `
    --role=$role `
    --condition=None `
    --quiet
  Assert-GcloudSuccess "granting $role to Cloud Build"
}

& $gcloudCommand iam service-accounts add-iam-policy-binding $runtimeEmail `
  --member="serviceAccount:$buildServiceAccount" `
  --role='roles/iam.serviceAccountUser' `
  --project=$ProjectId `
  --quiet
Assert-GcloudSuccess 'allowing Cloud Build to deploy as the runtime service account'

& $gcloudCommand run services describe $Service --region=$Region --project=$ProjectId *> $null
if ($LASTEXITCODE -eq 0) {
  & $gcloudCommand run services add-iam-policy-binding $Service `
    --region=$Region `
    --member="serviceAccount:$cleanupEmail" `
    --role='roles/run.invoker' `
    --project=$ProjectId `
    --quiet
  Assert-GcloudSuccess 'allowing the cleanup identity to invoke Cloud Run'

  $cleanupUri = "$SiteUrl/api/maintenance/cleanup"
  & $gcloudCommand scheduler jobs describe workout-inactive-user-cleanup --location=$Region --project=$ProjectId *> $null
  if ($LASTEXITCODE -eq 0) {
    & $gcloudCommand scheduler jobs update http workout-inactive-user-cleanup `
      --location=$Region `
      --schedule='0 3 * * *' `
      --time-zone='Australia/Sydney' `
      --uri=$cleanupUri `
      --http-method=POST `
      --oidc-service-account-email=$cleanupEmail `
      --oidc-token-audience=$cleanupUri `
      --project=$ProjectId
    Assert-GcloudSuccess 'updating the inactive-user cleanup schedule'
  } else {
    & $gcloudCommand scheduler jobs create http workout-inactive-user-cleanup `
      --location=$Region `
      --schedule='0 3 * * *' `
      --time-zone='Australia/Sydney' `
      --uri=$cleanupUri `
      --http-method=POST `
      --oidc-service-account-email=$cleanupEmail `
      --oidc-token-audience=$cleanupUri `
      --project=$ProjectId
    Assert-GcloudSuccess 'creating the inactive-user cleanup schedule'
  }
}

Write-Output "GCP infrastructure, authentication APIs and cleanup workflow are ready in $ProjectId/$Region."
