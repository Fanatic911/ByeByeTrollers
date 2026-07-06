# ===============================================
# Verify Bot - Automated Installation (Windows)
# Usage: Right-click -> "Run with PowerShell"
#        or run:  powershell -ExecutionPolicy Bypass -File install.ps1
# ===============================================

function Write-Header($text) {
    Write-Host ""
    Write-Host "===== $text =====" -ForegroundColor Cyan
}
function Write-Success($text) { Write-Host "[OK] $text" -ForegroundColor Green }
function Write-Warn($text)    { Write-Host "[!] $text" -ForegroundColor Yellow }
function Write-Err($text)     { Write-Host "[X] $text" -ForegroundColor Red }

Write-Header "Verify Bot - Installation on Windows"

# 1. Check Node.js
Write-Header "1. Checking Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Err "Node.js was not found."
    Write-Host "Download and install Node.js 20 LTS from https://nodejs.org, then re-run this script."
    exit 1
}
$nodeVersion = (node -v) -replace 'v',''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Err "Node.js 18+ is required, found: v$nodeVersion"
    exit 1
}
Write-Success "Node.js v$nodeVersion detected"

# 2. Create key.env from the example file
Write-Header "2. Setting up key.env"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$keyEnvPath = Join-Path $scriptDir "key.env"
$keyEnvExamplePath = Join-Path $scriptDir "key.env.example"

if (-not (Test-Path $keyEnvPath)) {
    Copy-Item $keyEnvExamplePath $keyEnvPath
    Write-Success "key.env created from key.env.example"
    Write-Warn "You MUST edit key.env with your real Discord token and reCAPTCHA keys."
} else {
    Write-Success "key.env already exists"
}

# 3. Create data folders
Write-Header "3. Creating data folders"
$folders = @("src/commands", "src/events", "src/handlers", "src/web", "src/utils", "Database", "Temp", "Logs")
foreach ($f in $folders) {
    $full = Join-Path $scriptDir $f
    if (-not (Test-Path $full)) {
        New-Item -ItemType Directory -Path $full -Force | Out-Null
    }
}
Write-Success "Folders ready"

# 4. npm install
Write-Header "4. Installing npm dependencies"
Push-Location $scriptDir
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install failed. Check the error above."
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "npm dependencies installed"

# 5. Summary
Write-Header "Installation Complete!"
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Edit key.env (notepad key.env) and add your real:"
Write-Host "   - DISCORD_TOKEN"
Write-Host "   - RECAPTCHA_PUBLIC / RECAPTCHA_PRIVATE"
Write-Host ""
Write-Host "2. Edit settings.json and set admin_role / moderator_role to your staff role IDs."
Write-Host ""
Write-Host "3. Start the bot:"
Write-Host "   npm start"
Write-Host ""
Write-Host "4. Test it (in another terminal):"
Write-Host "   Invoke-WebRequest http://localhost:3001/health"
Write-Host ""
Write-Host "Documentation: README.md, SECURITY.md" -ForegroundColor Green
