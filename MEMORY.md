# Android File Transfer Project Memory

## Project Structure
- Root directory contains main application files (main.js, renderer.js, index.html)
- Build configuration in package.json
- Uses Electron for cross-platform desktop application
- Uses icon.png directly for application icon

## Key Files
- main.js: Main Electron process
- renderer.js: Renderer process logic
- index.html: Main application window
- viewer.html: File viewer interface
- styles.css: Application styling
- icon.png: Application icon file

## Build Information
### macOS Build (arm64)
- Built using electron-builder
- Uses icon.png directly for application icon
- Outputs:
  - DMG installer (Android File Transfer-1.0.0-arm64.dmg)
  - ZIP package (Android File Transfer-1.0.0-arm64-mac.zip)
- Note: App is currently unsigned (requires manual security approval)

### Windows Build (x64)
- Built using electron-builder
- Uses build/icon.ico for Windows icon (must be valid .ico format, not .bmp)
- Outputs:
  - NSIS installer (Android-File-Transfer-Setup-1.0.0.exe) ~84MB
  - Portable executable (Android-File-Transfer-Portable-1.0.0.exe) ~84MB
- Icon Configuration Fix (2026-02-21):
  - Fixed: Changed from iconpicture.bmp to build/icon.ico in package.json
  - Issue: electron-builder requires .ico format for Windows, not .bmp
  - build/icon.ico must be a valid icon file (not a placeholder text file)
- Note: Binaries are unsigned (may trigger Windows Defender warnings)

## Dependencies
- electron: ^28.1.0
- electron-builder: ^24.9.1
- adbkit: ^2.11.1
- electron-store: ^8.1.0
- rimraf: ^5.0.5
- temp: ^0.9.4

## Features
- USB file transfer between computer and Android devices
- File viewing capabilities
- Dark mode support on macOS
- Drag and drop: copy files/folders between local and Android panels, or from OS (Finder/Explorer) to Android
- Drop on folder copies into that folder; drop on panel area copies into current path 