# Profilissimo NMH Installer for Windows
$ErrorActionPreference = "Stop"

# --- Configuration (update these before publishing) ---
$GithubRepo = "OWNER/profilissimo"
$ExtensionId = "EXTENSION_ID_HERE"
$NmhName = "com.profilissimo.nmh"
$BinaryName = "profilissimo-nmh.exe"
$AssetName = "profilissimo-nmh-windows-x64.exe"

$InstallDir = Join-Path $env:LOCALAPPDATA "Profilissimo\bin"
$ManifestDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\NativeMessagingHosts"
$DownloadUrl = "https://github.com/$GithubRepo/releases/latest/download/$AssetName"

# --- Download binary ---
Write-Host "Downloading $AssetName..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$BinaryPath = Join-Path $InstallDir $BinaryName
Invoke-WebRequest -Uri $DownloadUrl -OutFile $BinaryPath -UseBasicParsing
Write-Host "Installed binary to $BinaryPath"

# --- Write NMH manifest ---
New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
$ManifestPath = Join-Path $ManifestDir "$NmhName.json"
$Manifest = @{
    name = $NmhName
    description = "Profilissimo Native Messaging Host"
    path = $BinaryPath
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 3
Set-Content -Path $ManifestPath -Value $Manifest -Encoding UTF8
Write-Host "Wrote NMH manifest to $ManifestPath"

# --- Write registry key ---
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$NmhName"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath
Write-Host "Registered NMH in Windows Registry"

Write-Host ""
Write-Host "Installation complete!"
Write-Host "Restart Chrome for changes to take effect."
