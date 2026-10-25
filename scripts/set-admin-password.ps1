# Run from the repository root. The prompt does not echo the password.
$ErrorActionPreference = 'Stop'
$securePassword = Read-Host 'Admin password' -AsSecureString
$plainPassword = [pscredential]::new('admin', $securePassword).GetNetworkCredential().Password
if ($plainPassword.Length -lt 10) { throw 'Use at least 10 characters.' }

try {
  $env:ITKAN_SETUP_PASSWORD = $plainPassword
  $verifier = bun -e 'import {hashAdminPassword} from "./server/password-auth.ts"; console.log(await hashAdminPassword(process.env.ITKAN_SETUP_PASSWORD ?? ""))'
  if ($LASTEXITCODE -ne 0 -or $verifier -notmatch '^scrypt\$') { throw 'Could not create password verifier.' }
} finally {
  Remove-Item Env:\ITKAN_SETUP_PASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
  $securePassword.Dispose()
}

$verifier.Trim() | vercel env add ITKAN_ADMIN_PASSWORD_HASH production --sensitive --force --yes
if ($LASTEXITCODE -ne 0) { throw 'Could not save password verifier in Vercel.' }
Write-Output 'Password verifier saved. Redeploy the site to use it.'
