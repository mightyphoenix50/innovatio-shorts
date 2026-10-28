# Produces the daily episode: runs scripts\produce_queue.py every morning and whenever you log in.
# The daily scheduled task (in Claude) writes new episodes to remotion\episodes\queue\; this renders them
# and sends them to Telegram for approval. If the computer was off at the set time, it runs as soon as it's back.
#
# Install (from the project root):   powershell -ExecutionPolicy Bypass -File tools\install_producer.ps1
# Different time:                    powershell -ExecutionPolicy Bypass -File tools\install_producer.ps1 -At 08:30
# Remove:                            powershell -ExecutionPolicy Bypass -File tools\install_producer.ps1 -Remove
# Logs:                              output\logs\producer.log
param([switch]$Remove, [string]$At = "07:30")
$ErrorActionPreference = "Stop"
$taskName = "YT Shorts daily producer"
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root "scripts\produce_queue.py"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
if ($Remove) { Write-Host "Removed."; exit 0 }

$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = $python }

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$script`"" -WorkingDirectory $root
$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At $At),
    (New-ScheduledTaskTrigger -AtLogOn -User $user)
)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
    -Description "Renders queued YT Shorts episodes and sends them to Telegram for approval." | Out-Null

New-Item -ItemType Directory -Force -Path (Join-Path $root "remotion\episodes\queue") | Out-Null
Write-Host "Installed: '$taskName' runs daily at $At and when you log in."
Write-Host "Test it now with:  Start-ScheduledTask -TaskName '$taskName'   (then see output\logs\producer.log)"
