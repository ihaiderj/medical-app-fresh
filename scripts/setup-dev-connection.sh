#!/bin/bash

# Development Connection Setup Script
# This script helps set up connections between development builds and dev server

echo "🔧 Setting up development connection..."

# Check if adb is available (Android)
if command -v adb &> /dev/null; then
    echo "📱 Android Debug Bridge detected"
    
    # Reverse port forwarding for Metro bundler
    echo "🔄 Setting up port forwarding for Metro bundler (port 8081)..."
    adb reverse tcp:8081 tcp:8081
    
    # Reverse port forwarding for Supabase (if needed)
    echo "🔄 Setting up port forwarding for Supabase (port 54321)..."
    adb reverse tcp:54321 tcp:54321
    
    # Check connected devices
    echo "📋 Connected Android devices:"
    adb devices
    
    echo "✅ Android connection setup complete!"
    echo ""
    echo "📝 On your Android device/emulator, use:"
    echo "   - Metro: localhost:8081"
    echo "   - Supabase: localhost:54321 (if running locally)"
else
    echo "⚠️  Android Debug Bridge not found. Skipping Android setup."
fi

# Get local IP address for WiFi connection
echo ""
echo "🌐 Network Information:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "Not found")
    echo "   Your Mac IP address: $LOCAL_IP"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "Not found")
    echo "   Your Linux IP address: $LOCAL_IP"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    LOCAL_IP=$(ipconfig | findstr /i "IPv4" | findstr /v "127.0.0.1" | awk '{print $NF}' | head -1 2>/dev/null || echo "Not found")
    echo "   Your Windows IP address: $LOCAL_IP"
fi

if [ "$LOCAL_IP" != "Not found" ]; then
    echo ""
    echo "📝 On your device (WiFi connection), use:"
    echo "   - Metro: http://$LOCAL_IP:8081"
    echo "   - Supabase: http://$LOCAL_IP:54321 (if running locally)"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "💡 Tips:"
echo "   - For USB/Emulator: Use localhost or 10.0.2.2 (Android emulator)"
echo "   - For WiFi: Use your laptop's IP address ($LOCAL_IP)"
echo "   - Make sure both devices are on the same network"


