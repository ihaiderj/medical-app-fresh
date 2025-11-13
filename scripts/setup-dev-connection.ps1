# Development Connection Setup Script (PowerShell)
# This script helps set up connections between development builds and dev server

Write-Host "🔧 Setting up development connection..." -ForegroundColor Cyan

# Check if adb is available (Android)
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if ($adbPath) {
    Write-Host "📱 Android Debug Bridge detected" -ForegroundColor Green
    
    # Reverse port forwarding for Metro bundler
    Write-Host "🔄 Setting up port forwarding for Metro bundler (port 8081)..." -ForegroundColor Yellow
    adb reverse tcp:8081 tcp:8081
    
    # Reverse port forwarding for Supabase (if needed)
    Write-Host "🔄 Setting up port forwarding for Supabase (port 54321)..." -ForegroundColor Yellow
    adb reverse tcp:54321 tcp:54321
    
    # Check connected devices
    Write-Host "📋 Connected Android devices:" -ForegroundColor Cyan
    adb devices
    
    Write-Host "✅ Android connection setup complete!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Android Debug Bridge not found. Skipping Android setup." -ForegroundColor Yellow
}

# Get local IP address for WiFi connection
Write-Host ""
Write-Host "🌐 Network Information:" -ForegroundColor Cyan

try {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
        $_.InterfaceAlias -notlike "*Loopback*" -and 
        $_.IPAddress -notlike "169.254.*" 
    } | Select-Object -First 1).IPAddress
    
    if ($localIP) {
        Write-Host "   Your Windows IP address: $localIP" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "📝 On your device (WiFi connection), use:" -ForegroundColor Cyan
        Write-Host "   - Metro: http://$localIP:8081" -ForegroundColor Yellow
        Write-Host "   - Supabase: http://$localIP:54321 (if running locally)" -ForegroundColor Yellow
    } else {
        Write-Host "   IP address not found" -ForegroundColor Red
    }
} catch {
    Write-Host "   Error getting IP address: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Tips:" -ForegroundColor Cyan
Write-Host "   - For USB/Emulator: Use localhost or 10.0.2.2 (Android emulator)" -ForegroundColor Yellow
Write-Host "   - For WiFi: Use your laptop's IP address ($localIP)" -ForegroundColor Yellow
Write-Host "   - Make sure both devices are on the same network" -ForegroundColor Yellow


