param(
  [string]$Owner,
  [string]$Repo,
  [string]$Branch = "main",
  [string[]]$RequiredChecks = @("lint", "test-e2e"),
  [string]$RequiredCheck,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-GitHubRepoFromOrigin {
  $originUrl = git config --get remote.origin.url 2>$null
  if (-not $originUrl) {
    return $null
  }

  $patterns = @(
    "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$",
    "github\.com/(?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$"
  )

  foreach ($pattern in $patterns) {
    if ($originUrl -match $pattern) {
      return @{
        owner = $Matches.owner
        repo  = $Matches.repo
      }
    }
  }

  return $null
}

if (-not $Owner -or -not $Repo) {
  $resolved = Resolve-GitHubRepoFromOrigin
  if ($resolved) {
    if (-not $Owner) { $Owner = $resolved.owner }
    if (-not $Repo) { $Repo = $resolved.repo }
  }
}

if (-not $Owner -or -not $Repo) {
  throw "Unable to resolve repository owner/name. Provide -Owner and -Repo, or set a GitHub origin remote."
}

$normalizedChecks = New-Object System.Collections.Generic.List[string]
if ($RequiredChecks) {
  foreach ($entry in $RequiredChecks) {
    if (-not $entry) {
      continue
    }
    foreach ($item in ($entry -split ",")) {
      $value = $item.Trim()
      if (-not $value) {
        continue
      }
      if (-not $normalizedChecks.Contains($value)) {
        [void]$normalizedChecks.Add($value)
      }
    }
  }
}

if ($RequiredCheck) {
  $legacy = $RequiredCheck.Trim()
  if ($legacy -and -not $normalizedChecks.Contains($legacy)) {
    [void]$normalizedChecks.Add($legacy)
  }
}

if ($normalizedChecks.Count -eq 0) {
  throw "At least one required status check must be provided."
}

$checkSpecs = @()
foreach ($context in $normalizedChecks) {
  $checkSpecs += @{
    context = $context
    app_id  = $null
  }
}

$payload = @{
  required_status_checks = @{
    strict = $true
    checks = $checkSpecs
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews           = $true
    require_code_owner_reviews      = $false
    required_approving_review_count = 1
    require_last_push_approval      = $false
  }
  restrictions                   = $null
  required_linear_history        = $true
  allow_force_pushes             = $false
  allow_deletions                = $false
  block_creations                = $false
  required_conversation_resolution = $true
  lock_branch                    = $false
  allow_fork_syncing             = $true
}

$payloadJson = $payload | ConvertTo-Json -Depth 8
$url = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection"

Write-Host "Target: $Owner/$Repo branch '$Branch'"
Write-Host "Required status checks: $($normalizedChecks -join ', ')"

if ($DryRun) {
  Write-Host "Dry run payload:"
  Write-Output $payloadJson
  exit 0
}

$token = $env:GITHUB_TOKEN
if (-not $token) {
  $token = $env:GH_TOKEN
}
if (-not $token) {
  throw "Set GITHUB_TOKEN or GH_TOKEN with repository administration permission."
}

$headers = @{
  Authorization          = "Bearer $token"
  Accept                 = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

Invoke-RestMethod -Method Put -Uri $url -Headers $headers -Body $payloadJson -ContentType "application/json" | Out-Null

$verifyUrl = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection/required_status_checks"
$requiredChecks = Invoke-RestMethod -Method Get -Uri $verifyUrl -Headers $headers
$contexts = @($requiredChecks.contexts)
$missingChecks = @()
foreach ($required in $normalizedChecks) {
  if ($contexts -notcontains $required) {
    $missingChecks += $required
  }
}
if ($missingChecks.Count -gt 0) {
  throw "Branch protection update applied but required checks were missing: $($missingChecks -join ', ')"
}

Write-Host "Branch protection updated successfully. Required checks: $($contexts -join ', ')"
