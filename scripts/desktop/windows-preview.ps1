# Build on a Windows 11 x64 developer machine. Does not open user databases,
# log into a platform, or invoke any real model/send capability.
param(
 [Parameter(Mandatory=$true)][string]$Go,
 [Parameter(Mandatory=$true)][string]$ModuleCache,
 [Parameter(Mandatory=$true)][string]$BrowserArchive
)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
foreach ($entry in @($Go,$ModuleCache,$BrowserArchive)) {
 if (-not [IO.Path]::IsPathRooted($entry) -or -not (Test-Path -LiteralPath $entry)) {throw 'All build inputs must be existing absolute paths.'}
}
Set-Location -LiteralPath $project
$env:DESKTOP_GO = $Go
$env:DESKTOP_GO_MODCACHE = $ModuleCache
$pin = Get-Content -LiteralPath 'apps/desktop/windows-browser-source.json' -Raw | ConvertFrom-Json
$hash = (Get-FileHash -LiteralPath $BrowserArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $pin.archiveSha256) {throw 'Windows browser archive differs from the fixed source manifest.'}
if (-not (Test-Path -LiteralPath 'apps/desktop/dist/native/win32-x64/browser')) {
 & node scripts/desktop/prepare-windows-browser.mjs $BrowserArchive $hash
 if ($LASTEXITCODE -ne 0) {throw 'Browser preparation failed.'}
}
& npm.cmd run desktop:package:win:preview
if ($LASTEXITCODE -ne 0) {throw 'Native Windows validation/build failed; no acceptance recorded.'}
$exe = Join-Path $project '.local/desktop-packages/win-unpacked/Social Lead Desktop.exe'
if (-not (Test-Path -LiteralPath $exe)) {throw 'Packaged executable missing.'}
& node scripts/desktop/verify-package.cjs $exe
if ($LASTEXITCODE -ne 0) {throw 'Package manifest, resources or fuse verification failed.'}
& node scripts/desktop/test-package.cjs $exe
if ($LASTEXITCODE -ne 0) {throw 'Packaged offline self-test failed.'}
Write-Output 'Native components and packaged offline self-test passed. Clean-machine installation, upgrade, signing and real platform acceptance remain separate.'
