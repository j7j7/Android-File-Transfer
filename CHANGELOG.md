# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] - 2026-02-23

### New Features
- ✨ **Dark/Light Mode Toggle**: Full dark mode support across all UI elements (headers, panels, modals, dialogs, ADB tools, status bars, file viewer)
- ✏️ **File/Folder Rename**: Dynamic popup modal for renaming files and folders on both local and Android systems
  - Modal matches "Create Folder" design
  - Enter key to confirm, Escape key to cancel
  - Validation for empty names and duplicates
- 🔄 **Auto-Refresh**: Automatic UI and data refresh after all file operations
  - Rename operations refresh file lists immediately
  - Delete operations wait for file system completion then refresh
  - Transfer operations refresh both panels after completion
  - Added delays to ensure file system operations complete before refresh
- 🎯 **Drag & Drop Support**: 
  - Drag items between local and Android panels (bidirectional)
  - Works with single or multiple selected items
  - Visual feedback during drag (opacity reduction)
  - Visual feedback during drop zone hover (highlighted border)
  - "Drop here to copy" message appears when dragging over target panel
  - Copy operation (items are not moved, source remains)
  - Prevents same-side drops (local→local or Android→Android)
  - Integrates with existing multi-select functionality
- 🎨 **Enhanced Visual Feedback**:
  - CSS variables for consistent theming (light/dark modes)
  - Dragging state visual indicator (50% opacity)
  - Drag-over zone with dashed border and drop hint
  - Improved error messages and user feedback
- 🔐 **macOS Code Signing**: Application is now code-signed with Apple Developer certificate
  - Team ID: 5K28TM7V5T (And 7 Limited)
  - Ready for distribution and bypasses Gatekeeper
  - Product name: "Android File Transfer"

### Improvements
- **File Operations**: All operations (rename, delete, transfer) now properly refresh both UI and data
- **Error Handling**: Better error messages and validation for user actions
- **Performance**: Optimized file system operations with appropriate delays
- **Code Organization**: Refactored module exports and improved code structure
- **Build Configuration**: Updated to use `productName` for consistent app naming across platforms

### Bug Fixes
- Fixed refresh issues where UI wouldn't update after file operations
- Fixed hardcoded colors that didn't respect dark mode theme
- Fixed modal dialog styling to support both light and dark themes

### Platform-Specific
- **macOS**: 
  - Added hardened runtime configuration
  - Configured dark mode support
  - Added code signing with proper entitlements
  - Fixed DMG window sizing and layout
- **Windows**: 
  - Maintained existing NSIS installer configuration
  - Ensured portable version works correctly

---

## [1.0.0] - 2025-04-03

### Initial Release
- ✨ **Core Features**:
  - File transfer between local computer and Android devices
  - Dual file explorer panels (local and Android)
  - USB ADB connectivity for Android devices
  - File selection and batch operations

- 📁 **File Management**:
  - Create folders
  - Delete files and folders
  - Navigate directories (back button, path input)
  - File/folder icons with type detection

- 🎬 **Media Preview**:
  - Built-in viewer for images, audio, and video files
  - In-app preview without external applications

- 🖥️ **Platform Support**:
  - macOS native UI integration
  - Windows drive selection
  - Cross-platform path handling

### Technology Stack
- Electron 28.3.3
- Node.js
- ADB (Android Debug Bridge) via adbkit
- Electron Builder for packaging
