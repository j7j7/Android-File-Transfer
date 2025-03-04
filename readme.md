# Android File Transfer
Version 1.1 - 03/03/2025
Created by J7 

A cross-platform application for transferring files between your computer and Android devices without requiring cloud storage or additional software on your Android device. Works on both macOS and Windows.

## Features

- **Seamless File Transfer**: Easily transfer files between your computer and Android devices over USB
- **Cross-Platform Support**: Works on both macOS and Windows
- **Dual File Explorer**: Side-by-side browsing of local and Android file systems
- **Media Preview**: Built-in viewer for images, audio, and video files
- **File Operations**: Create folders, delete files, and navigate through directories on both systems
- **Drag-and-Drop Interface**: User-friendly interface for efficient file management
- **No Android App Required**: Works directly with Android's USB debugging

## Requirements

- macOS 10.13 or later, or Windows 10 or later
- Android device with USB debugging enabled
- USB cable to connect your Android device to your computer

## Installation

### macOS
1. Download the latest release from the [Releases](https://github.com/yourusername/androidfiletransfer/releases) page
2. Mount the DMG file
3. Drag the application to your Applications folder
4. Open the application from your Applications folder

### Windows
1. Download the latest release from the [Releases](https://github.com/yourusername/androidfiletransfer/releases) page
2. Run the installer (.exe) file
3. Follow the installation prompts
4. Launch the application from the Start Menu or desktop shortcut

## Setting Up Your Android Device

1. Enable Developer Options on your Android device:
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times until you see "You are now a developer!"

2. Enable USB Debugging:
   - Go to Settings > System > Developer Options
   - Toggle "USB Debugging" to ON

3. Connect your Android device to your computer using a USB cable

4. When prompted on your Android device, authorize USB debugging for your computer

## Using the Application

### Getting Started

1. Launch the Android File Transfer application
2. Connect your Android device via USB
3. Click "Refresh Devices" to detect your Android device
4. Select your device from the dropdown menu
5. The application will display your local files on the left and Android files on the right

### Transferring Files

1. Navigate to the source directory
2. Select files or folders you want to transfer (use Cmd/Ctrl + click for multiple selections)
3. Click the arrow button to transfer:
   - "→" to copy from computer to Android
   - "←" to copy from Android to computer

### Viewing Media Files

1. For media files (images, audio, or video), a 👁️ (eye) icon will appear next to the file
2. Click the icon to preview the file directly within the application

### Managing Files

- Click "New Folder" to create a new folder in the current directory
- Select files/folders and click "Delete" to remove them
- Use the back buttons or path field to navigate between directories

### Interface Controls

- **Path Navigation**: Enter a path directly in the path field and click "Go"
- **Swap Sides**: Click the "Swap Sides" button to switch the positions of the local and Android explorers
- **Status Bar**: View operation status and transfer progress at the bottom of the window

## Windows-Specific Features

- Drive selection dropdown for easy navigation between drives
- Windows-native path handling 
- Compatibility with Windows User Account Control (UAC)

## Troubleshooting

### Device Not Detected

1. Ensure USB debugging is enabled on your Android device
2. Try disconnecting and reconnecting the USB cable
3. Verify that your Android device is not in "Charging Only" mode (check USB notification)
4. Try using a different USB cable or port

### Transfer Issues

1. Check that you have sufficient storage space on the destination device
2. Ensure you have proper permissions for the files and directories
3. For large files, allow sufficient time for the transfer to complete

### Application Crashes

1. Verify that you're using the latest version of the application
2. Restart both your computer and Android device
3. Check system logs for error details

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/androidfiletransfer.git
cd androidfiletransfer

# Install dependencies
npm install

# Run in development mode
npm start

# Build for production
npm run build
```

### Project Structure

- `main.js` - Main Electron process, handles ADB communication
- `renderer.js` - Renderer process, handles UI and user interactions
- `index.html` - Application HTML structure
- `styles.css` - Application styling
- `modules/` - Modular components for specific functionality

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Built with [Electron](https://www.electronjs.org/)
- Uses [ADB](https://developer.android.com/studio/command-line/adb) for Android communication

## Privacy

This application does not collect or transmit any user data. All file transfers occur directly between your computer and Android device over USB.

