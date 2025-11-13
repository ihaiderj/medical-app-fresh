# Development Connection Guide

This guide explains how to connect your development build to the development server in various scenarios.

## 📋 Table of Contents

1. [Connection Methods Overview](#connection-methods-overview)
2. [WiFi Connection (Current Method)](#wifi-connection-current-method)
3. [USB Connection (Android)](#usb-connection-android)
4. [Emulator Setup](#emulator-setup)
5. [Troubleshooting](#troubleshooting)

## Connection Methods Overview

| Method | Speed | Reliability | Best For |
|--------|-------|-------------|----------|
| **WiFi** | Fast | High | Physical devices on same network |
| **USB** | Very Fast | Very High | Physical Android devices |
| **Emulator** | Fast | High | Testing without physical device |

---

## WiFi Connection (Current Method)

### ✅ **Advantages:**
- No cables needed
- Works with both Android and iOS
- Can use real device while connected

### 📝 **Setup:**

1. **Get your laptop's IP address:**
   ```bash
   # Windows (PowerShell)
   ipconfig | findstr IPv4
   
   # macOS/Linux
   ifconfig | grep "inet "
   ```

2. **Start Metro bundler:**
   ```bash
   npx expo start
   ```

3. **On your device:**
   - Make sure device and laptop are on the **same WiFi network**
   - Open the Expo Go app or your development build
   - Scan QR code or enter manually: `exp://YOUR_IP:8081`

### ⚙️ **Configure for Production Builds:**

If you're using a development build (not Expo Go), you may need to configure the API endpoint:

**For Android Emulator:**
```
http://10.0.2.2:8081
```

**For iOS Simulator:**
```
http://localhost:8081
```

**For Physical Device (WiFi):**
```
http://YOUR_LAPTOP_IP:8081
```

---

## USB Connection (Android)

### ✅ **Advantages:**
- Most reliable connection
- No internet required
- Fast data transfer
- Better for debugging

### 📝 **Setup:**

1. **Enable USB Debugging:**
   - On your Android device: Settings → About Phone → Tap "Build Number" 7 times
   - Go to Settings → Developer Options → Enable "USB Debugging"

2. **Connect via USB:**
   ```bash
   # Connect your Android device via USB
   adb devices  # Should show your device
   ```

3. **Forward ports:**
   ```bash
   # Forward Metro bundler port
   adb reverse tcp:8081 tcp:8081
   
   # Forward Supabase port (if running locally)
   adb reverse tcp:54321 tcp:54321
   ```

4. **Start Metro:**
   ```bash
   npx expo start
   ```

5. **In your app:**
   - Use `localhost:8081` or `127.0.0.1:8081`

### 🔧 **Automated Setup:**

**Windows (PowerShell):**
```powershell
.\scripts\set

up-dev-connection.ps1
```

**macOS/Linux:**
```bash
chmod +x scripts/setup-dev-connection.sh
./scripts/setup-dev-connection.sh
```

---

## Emulator Setup

### 🤖 **Android Emulator**

#### **Setup:**

1. **Start Android Emulator:**
   ```bash
   # Via Android Studio
   # Or command line
   emulator -avd YOUR_AVD_NAME
   ```

2. **Set up port forwarding:**
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```

3. **In your app configuration:**
   - Use `localhost:8081` or `10.0.2.2:8081`
   - `10.0.2.2` is the emulator's special alias for your host machine's localhost

4. **Start Metro:**
   ```bash
   npx expo start
   ```

#### **Special IP Addresses:**
- `10.0.2.2` = Host machine's localhost (use this!)
- `127.0.0.1` = Emulator's own localhost (don't use)
- `localhost` = Emulator's own localhost (don't use)

### 🍎 **iOS Simulator**

#### **Setup:**

1. **Start iOS Simulator:**
   ```bash
   # Via Xcode
   # Or command line
   xcrun simctl boot "iPhone 14"
   ```

2. **Start Metro:**
   ```bash
   npx expo start
   ```

3. **In your app:**
   - Use `localhost:8081` directly
   - iOS Simulator can access your Mac's localhost directly

---

## Configuration Files

### **Update API Configuration**

If you need to change the API endpoint based on the connection method, you can create a config file:

**`src/config/api.ts`:**
```typescript
import { Platform } from 'react-native';

// Detect if running on emulator/simulator
const isEmulator = Platform.OS === 'android' 
  ? require('react-native').NativeModules?.DeviceInfo?.isEmulator 
  : false;

const isSimulator = Platform.OS === 'ios' && !Platform.isPad && !Platform.isTV;

// Determine API base URL
export const API_BASE_URL = (() => {
  if (__DEV__) {
    // Development mode
    if (Platform.OS === 'android' && isEmulator) {
      return 'http://10.0.2.2:8081'; // Android Emulator
    } else if (Platform.OS === 'ios' && isSimulator) {
      return 'http://localhost:8081'; // iOS Simulator
    } else {
      // Physical device - use WiFi IP or localhost
      return 'http://192.168.1.100:8081'; // Replace with your laptop IP
    }
  }
  
  // Production mode
  return 'https://your-production-api.com';
})();
```

---

## Troubleshooting

### ❌ **"Unable to connect to Metro"**

**Solutions:**
1. Check if Metro is running: `npx expo start`
2. Verify port forwarding: `adb reverse tcp:8081 tcp:8081`
3. Check firewall settings
4. Ensure device and laptop are on same network (WiFi)

### ❌ **"Network request failed"**

**Solutions:**
1. Verify API endpoint URL is correct
2. Check if backend server is running
3. For emulator, use `10.0.2.2` instead of `localhost`
4. Clear Metro cache: `npx expo start --clear`

### ❌ **"ADB not found"**

**Solutions:**
1. Install Android SDK Platform Tools
2. Add to PATH: `%LOCALAPPDATA%\Android\Sdk\platform-tools`
3. Restart terminal/PowerShell

### ❌ **Port already in use**

**Solutions:**
1. Find and kill the process:
   ```bash
   # Windows
   netstat -ano | findstr :8081
   taskkill /PID <PID> /F
   
   # macOS/Linux
   lsof -i :8081
   kill -9 <PID>
   ```

### ✅ **Quick Checklist**

- [ ] Metro bundler is running
- [ ] Device/emulator is connected
- [ ] Port forwarding is set up (for Android USB/emulator)
- [ ] Firewall allows connections
- [ ] Both devices on same network (WiFi)
- [ ] API endpoint URL is correct
- [ ] USB debugging enabled (Android USB)

---

## Best Practices

1. **For Development:**
   - Use **USB connection** (Android) or **Emulator** for most reliable connection
   - Use **WiFi** when you need to test on physical device without cables

2. **For Testing:**
   - Test on both **emulator/simulator** and **physical device**
   - Test with **WiFi** and **USB** connections
   - Test with **internet** and **offline** scenarios

3. **For Production:**
   - Always test on **physical devices**
   - Test with **real network conditions**
   - Test **offline-first** functionality

---

## Summary

| Scenario | Connection Method | API URL |
|----------|-------------------|---------|
| **Android Emulator** | USB/Network | `http://10.0.2.2:8081` |
| **iOS Simulator** | Network | `http://localhost:8081` |
| **Physical Device (WiFi)** | WiFi | `http://YOUR_LAPTOP_IP:8081` |
| **Physical Device (USB)** | USB + `adb reverse` | `http://localhost:8081` |

**Recommended for Development:** USB connection (Android) or Emulator for best reliability and speed.


