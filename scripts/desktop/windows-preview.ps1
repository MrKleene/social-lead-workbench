# Build on a Windows 11 x64 developer machine. Does not open user databases,
# log into a platform, or invoke any real model/send capability.
param(
 [Parameter(Mandatory=$true)][string]$Go,
 [Parameter(Mandatory=$true)][string]$ModuleCache,
 [Parameter(Mandatory=$true)][string]$BrowserArchive
)
$ErrorActionPreference = 'Stop'
$hostPlatform = & node -p 'process.platform.concat(String.fromCharCode(58),process.arch)'
if ($LASTEXITCODE -ne 0 -or $hostPlatform -ne 'win32:x64') {throw 'Use a native Windows x64 Node process; cross-host results cannot certify Windows.'}
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
foreach ($entry in @($Go,$ModuleCache,$BrowserArchive)) {
 if (-not [IO.Path]::IsPathRooted($entry) -or -not (Test-Path -LiteralPath $entry)) {throw 'All build inputs must be existing absolute paths.'}
}
Set-Location -LiteralPath $project
$env:DESKTOP_GO = $Go
$env:DESKTOP_GO_MODCACHE = $ModuleCache
$pin = Get-Content -LiteralPath 'apps/desktop/src/windows-browser-source.json' -Raw | ConvertFrom-Json
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
$version = (Get-Content -LiteralPath '.local/desktop-stage/package.json' -Raw | ConvertFrom-Json).version
$installer = Join-Path $project ('.local/desktop-packages/Social-Lead-Desktop-' + $version + '-win-x64.exe')
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {throw 'Version-matched NSIS installer missing; no artifact receipt recorded.'}
$signature = Get-AuthenticodeSignature -LiteralPath $installer
$receipt = [ordered]@{file=$installer;version=$version;platform='win32';arch='x64';sha256=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $installer).Length;signatureStatus=[string]$signature.Status;nativeOfflineValidated=$true;packagedOfflineValidated=$true;cleanMachineInstallValidated=$false;upgradeValidated=$false;realPlatformValidated=$false}
New-Item -ItemType Directory -Path '.local/desktop-qa' -Force | Out-Null
$receipt | ConvertTo-Json | Set-Content -LiteralPath '.local/desktop-qa/windows-artifact.json' -Encoding UTF8
Write-Output 'Native components and packaged offline self-test passed. Clean-machine installation, upgrade, signing and real platform acceptance remain separate.'
