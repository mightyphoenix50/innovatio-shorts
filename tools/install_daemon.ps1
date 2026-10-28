# Runs the Telegram approval listener in the background: starts when you log in, restarts if it stops.
# Install (from the project root):   powershell -ExecutionPolicy Bypass -File tools\install_daemon.ps1
# Remove:                            powershell -ExecutionPolicy Bypass -File tools\install_daemon.ps1 -Remove
# Logs:                              output\logs\daemon.log
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$taskName = "YT Shorts approval daemon"
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root "scripts\telegram_daemon.py"

# Stop any copy already running (an old terminal window, or the previous task): two copies conflict on Telegram.
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*telegram_daemon.py*" } |
    ForEach-Object { Write-Host "Stopping running daemon (PID $($_.ProcessId))"; Stop-Process -Id $_.ProcessId -Force }
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
if ($Remove) { Write-Host "Removed."; exit 0 }

$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = $python }   # pythonw runs without a console window

# The account name exactly as Windows knows it (COMPUTER\user or DOMAIN\user); a bare name is rejected.
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Listens for Telegram approvals and uploads approved Shorts to YouTube." | Out-Null
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 5

$log = Join-Path $root "output\logs\daemon.log"
if (Test-Path $log) { Get-Content $log -Tail 3 }
Write-Host ""
Write-Host "Installed and running. Send /status to your bot to check it's listening."
