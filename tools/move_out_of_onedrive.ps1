# Moves the project out of OneDrive (which keeps rolling files back) to a plain local folder,
# then reinstalls what holds absolute paths: the approval listener task, Remotion's packages and earshot's Python.
# Run from the project root:   powershell -ExecutionPolicy Bypass -File tools\move_out_of_onedrive.ps1
# Optional destination:        ... -Destination "D:\Projects\YT Shorts"
param([string]$Destination = (Join-Path $env:USERPROFILE "Projects\YT Shorts"))
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$dst = $Destination

if ($dst -like "*OneDrive*") { throw "Pick a destination outside OneDrive." }
if (Test-Path (Join-Path $dst "scripts\produce.py")) { throw "$dst already holds the project. Remove it or pick another -Destination." }

# Don't move while an upload is running: it would be cut off half way.
$registry = Join-Path $src "output\pending_drafts.json"
if (Test-Path $registry) {
    $drafts = Get-Content $registry -Raw | ConvertFrom-Json
    $busy = $drafts.PSObject.Properties | Where-Object { $_.Value.status -eq "UPLOADING" }
    if ($busy) { throw "An upload is in progress. Wait for it to finish (check /status), then run this again." }
}

Write-Host "1/5 Stopping the approval listener in the old folder"
& (Join-Path $src "tools\install_daemon.ps1") -Remove

Write-Host "2/5 Copying the project to $dst (packages and Python environments are rebuilt, not copied)"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
robocopy $src $dst /E /XD node_modules .venv __pycache__ /XF "*.lock" /R:2 /W:2 /NFL /NDL /NP /NJH | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy code $LASTEXITCODE). The old folder is untouched; the listener is stopped, so rerun tools\install_daemon.ps1 there to restart it." }

Write-Host "3/5 Installing Remotion's packages"
Push-Location (Join-Path $dst "remotion")
npm.cmd install --no-audit --no-fund
Pop-Location

Write-Host "4/5 Rebuilding earshot's Python environment (models are already downloaded)"
& (Join-Path $dst "tools\setup_audio_tools.ps1")

Write-Host "5/5 Starting the approval listener from the new folder"
& (Join-Path $dst "tools\install_daemon.ps1")

Write-Host ""
Write-Host "Done. The project now lives in: $dst"
Write-Host "Next:"
Write-Host "  1. In the Claude desktop app, add the new folder so Claude can work in it."
Write-Host "  2. Use the new folder from now on:  cd `"$dst`""
Write-Host "  3. Once a Short has gone through from the new folder, delete the old OneDrive copy:"
Write-Host "     $src"
