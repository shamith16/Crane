<#
.SYNOPSIS
    Register the Crane native messaging host for Chrome on Windows.
.PARAMETER BinaryPath
    Absolute path to crane-native-host.exe
.PARAMETER ExtensionId
    Chrome extension ID (from chrome://extensions)
.EXAMPLE
    .\install.ps1 -BinaryPath "C:\Program Files\Crane\crane-native-host.exe" -ExtensionId "abcdef..."
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$BinaryPath,

    [Parameter(Mandatory=$true)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

# Resolve to absolute path
$BinaryPath = (Resolve-Path $BinaryPath).Path

if (-not (Test-Path $BinaryPath)) {
    Write-Error "Binary not found: $BinaryPath"
    exit 1
}

# Determine manifest install location
$ManifestDir = Join-Path $env:LOCALAPPDATA "Crane"
if (-not (Test-Path $ManifestDir)) {
    New-Item -ItemType Directory -Path $ManifestDir -Force | Out-Null
}
$ManifestPath = Join-Path $ManifestDir "com.crane.dl.json"

# Read template and substitute placeholders
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Template = Get-Content (Join-Path $ScriptDir "com.crane.dl.json.windows") -Raw
$Manifest = $Template `
    -replace "CRANE_NATIVE_HOST_PATH", ($BinaryPath -replace '\\', '\\\\') `
    -replace "EXTENSION_ID", $ExtensionId

Set-Content -Path $ManifestPath -Value $Manifest -Encoding UTF8

# Create registry key pointing to manifest
$RegKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.crane.dl"
$ParentKey = Split-Path $RegKey
if (-not (Test-Path $ParentKey)) {
    New-Item -Path $ParentKey -Force | Out-Null
}
New-Item -Path $RegKey -Force | Out-Null
Set-ItemProperty -Path $RegKey -Name "(Default)" -Value $ManifestPath

Write-Host "Crane native messaging host registered."
Write-Host "  Manifest: $ManifestPath"
Write-Host "  Registry: $RegKey"
Write-Host "  Binary:   $BinaryPath"
