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