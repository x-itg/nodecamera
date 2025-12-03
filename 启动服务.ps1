# USB Camera Recording Service Launcher
# UTF-8 with BOM encoding

$ErrorActionPreference = "Stop"

# Change to backend directory
$backendPath = Join-Path $PSScriptRoot "backend"
Set-Location -Path $backendPath

# Check if backend is built
if (-not (Test-Path "dist\index.js")) {
    Write-Host "Backend not built. Building now..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Display startup information
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   USB Camera Recording Service" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service starting..." -ForegroundColor Green
Write-Host "URL: http://localhost:3001" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the service
node dist/index.js
