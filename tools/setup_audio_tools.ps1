# One-time setup for the audio tools: earshot (listening, checks, sound bank) and the real-sound skill.
# Run from the project root in PowerShell:
#     powershell -ExecutionPolicy Bypass -File tools\setup_audio_tools.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$repo = Join-Path $root "tools\earshot"
$venv = Join-Path $repo ".venv"
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "1/4 Creating the earshot environment in tools\earshot\.venv"
if (-not (Test-Path $py)) { py -3.12 -m venv $venv }

Write-Host "2/4 Installing CPU-only PyTorch (about 200 MB)"
& $py -m pip install --upgrade pip --quiet
& $py -m pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet

Write-Host "3/4 Installing earshot with its MCP server"
& $py -m pip install -e "$repo[mcp,llm]" --quiet

Write-Host "4/4 Downloading the listening models (about 1.1 GB, first time only)"
$test = Join-Path $root "remotion\public\audio\mariana_bed.mp3"
if (Test-Path $test) { & $py -m earshot describe $test } else { & $py -m earshot --help | Out-Null }

Write-Host ""
Write-Host "Done. earshot runs with:  tools\earshot\.venv\Scripts\earshot.exe"
Write-Host "To give Claude Code the earshot MCP server, run once:"
Write-Host "  claude mcp add earshot --scope user -- `"$py`" -m earshot mcp"
