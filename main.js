/**
 * main.js
 * 
 * This is the main process of the Electron application. It handles:
 * - Creating and managing the application window
 * - Communication with the Android device via ADB
 * - IPC (Inter-Process Communication) between main and renderer processes
 * - File system operations for Android devices
 */

// Import required Electron components and Node.js modules
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const adb = require('adbkit');  // Library for Android Debug Bridge communication
const fs = require('fs');
const { exec, execSync } = require('child_process');
const Store = require('electron-store');
const os = require('os');

// Set app name for consistent storage paths
app.setName('android-file-transfer');

// Initialize persistent storage with specific configuration
const store = new Store({ 
  name: 'adb-config',
  fileExtension: 'json',
  clearInvalidConfig: true
});

// Fallback storage file path for testing
const adbConfigPath = path.join(app.getPath('userData'), 'adb-config.json');

// Display where files are being stored
console.log('App data path:', app.getPath('userData'));
console.log('Store path:', store.path);

// Global variables
let mainWindow;
let viewerWindow = null;  // Add this new global variable for the viewer window
let adbPath = null; // Store the found ADB path
let client = null;

/**
 * Load the saved ADB path from storage if available
 */
function loadSavedAdbPath() {
  // Try electron-store first
  const savedPath = store.get('adbPath');
  
  if (savedPath && fs.existsSync(savedPath)) {
    console.log(`Using saved ADB path from store: ${savedPath}`);
    adbPath = savedPath;
    return true;
  }
  
  // Fallback to file-based storage
  try {
    if (fs.existsSync(adbConfigPath)) {
      const configData = JSON.parse(fs.readFileSync(adbConfigPath, 'utf8'));
      if (configData.adbPath && fs.existsSync(configData.adbPath)) {
        console.log(`Using saved ADB path from file: ${configData.adbPath}`);
        adbPath = configData.adbPath;
        return true;
      }
    }
  } catch (err) {
    console.error('Error reading ADB config file:', err);
  }
  
  return false;
}

/**
 * Save the ADB path to persistent storage
 * 
 * @param {string} path - Path to the ADB executable
 */
function saveAdbPath(path) {
  if (path) {
    console.log(`Saving ADB path: ${path}`);
    
    // Save to electron-store
    store.set('adbPath', path);
    
    // Also save to file for testing
    try {
      fs.writeFileSync(adbConfigPath, JSON.stringify({ adbPath: path }), 'utf8');
      console.log(`Saved ADB config to file: ${adbConfigPath}`);
    } catch (err) {
      console.error('Error saving ADB config to file:', err);
    }
  }
}

/**
 * Find ADB installed on system
 * @return {Array} - Array of ADB paths found
 */
function findAdbInCommonLocations() {
  console.log('Searching for ADB in common locations...');
  let installations = [];

  try {
    // Check for ADB in application directory first
    const appDir = path.dirname(app.getPath('exe'));
    
    // Platform-specific executable name
    const adbExe = process.platform === 'win32' ? 'adb.exe' : 'adb';
    
    // Check app directory and resources
    const appDirAdb = path.join(appDir, adbExe);
    const resourcesAdb = path.join(appDir, 'resources', adbExe);
    
    console.log(`Checking application directory: ${appDir}`);
    if (fs.existsSync(appDirAdb)) {
      console.log(`Found ADB in app directory: ${appDirAdb}`);
      installations.push(appDirAdb);
    }
    
    if (fs.existsSync(resourcesAdb)) {
      console.log(`Found ADB in resources directory: ${resourcesAdb}`);
      installations.push(resourcesAdb);
    }
    
    // Common installation locations - platform specific
    let locations = [];
    
    if (process.platform === 'win32') {
      // Windows locations
      locations = [
        // Application directory and nearby locations first
        path.join(appDir, '..', adbExe),
        path.join(appDir, '..', 'resources', adbExe),
        
        // Standard locations
        'C:\\Program Files\\Android\\android-sdk\\platform-tools\\adb.exe',
        'C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe',
        'C:\\Program Files\\Android\\android-sdk\\platform-tools\\adb.exe',
        'C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe',
        'C:\\Program Files\\Meta Quest Developer Hub\\resources\\bin\\adb.exe',
        'C:\\Program Files (x86)\\Meta Quest Developer Hub\\resources\\bin\\adb.exe',
        'C:\\Program Files\\Oculus\\Support\\oculus-adb.exe',
        'C:\\Program Files\\Oculus\\Support\\oculus-diagnostics\\adb.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Android\\Sdk\\platform-tools\\adb.exe'),
        path.join(process.env.USERPROFILE || '', 'AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'),
        // Add Android Studio location
        path.join(process.env.LOCALAPPDATA || '', 'Android\\sdk\\platform-tools\\adb.exe'),
        // Add Oculus locations
        path.join(process.env.LOCALAPPDATA || '', 'Oculus\\Support\\oculus-adb.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Oculus\\Support\\oculus-diagnostics\\adb.exe')
      ];
    } else {
      // macOS/Linux locations
      const homeDir = process.env.HOME || os.homedir();
      locations = [
        // Application directory and nearby locations
        path.join(appDir, '..', adbExe),
        path.join(appDir, '..', 'Resources', adbExe),
        
        // Standard macOS locations
        '/usr/local/bin/adb',
        '/usr/bin/adb',
        path.join(homeDir, 'Library/Android/sdk/platform-tools/adb'),
        path.join(homeDir, 'Android/Sdk/platform-tools/adb'),
        '/Applications/Android Studio.app/Contents/platform-tools/adb',
        '/Applications/Android Studio.app/sdk/platform-tools/adb',
        '/Applications/Unity/Hub/Editor/*/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb',
        '/Applications/Unity/Hub/Editor/*/PlaybackEngines/AndroidPlayer/platform-tools/adb'
      ];
    }

    // Check each location
    locations.forEach(location => {
      if (fs.existsSync(location)) {
        console.log(`Found ADB at: ${location}`);
        installations.push(location);
      }
    });
    
    // Also check for ADB in Unity Hub folders
    try {
      const unityHubBase = 'C:\\Program Files\\Unity\\Hub\\Editor';
      if (fs.existsSync(unityHubBase)) {
        console.log('Found Unity Hub installation, checking for ADB in version folders...');
        // Get all Unity version folders
        const unityVersions = fs.readdirSync(unityHubBase);
        console.log(`Found ${unityVersions.length} Unity version(s)`);
        
        for (const version of unityVersions) {
          // Multiple possible paths where ADB might be located in Unity installations
          const possiblePaths = [
            // Standard path as confirmed by user
            path.join(unityHubBase, version, 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer', 'SDK', 'platform-tools', 'adb.exe'),
            // Alternative paths that might exist
            path.join(unityHubBase, version, 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer', 'platform-tools', 'adb.exe'),
            path.join(unityHubBase, version, 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer', 'tools', 'adb.exe'),
            path.join(unityHubBase, version, 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer', 'AndroidPlayer', 'SDK', 'platform-tools', 'adb.exe'),
            path.join(unityHubBase, version, 'Data', 'PlaybackEngines', 'AndroidPlayer', 'SDK', 'platform-tools', 'adb.exe')
          ];
          
          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              console.log(`Found ADB in Unity ${version} installation: ${possiblePath}`);
              installations.push(possiblePath);
              
              // Test if this ADB works by running a simple command
              if (testAdbInstallation(possiblePath)) {
                console.log(`Unity ADB at ${possiblePath} is working correctly!`);
              } else {
                console.log(`Unity ADB at ${possiblePath} exists but may not be working properly.`);
              }
            }
          }
        }
      } else {
        console.log('Unity Hub folder not found at', unityHubBase);
      }
    } catch (unityError) {
      console.error('Error checking Unity Hub folders:', unityError);
    }

    console.log(`Found ADB installations: ${JSON.stringify(installations)}`);
    return installations;
  } catch (error) {
    console.error('Error searching for ADB:', error);
    return [];
  }
}

/**
 * Attempt to find ADB installation via command line
 * @return {string|null} - Path to ADB executable or null if not found
 */
function findAdbViaCommand() {
  console.log('Searching for ADB via command line...');
  try {
    let output;
    
    // Platform-specific command to find ADB
    if (process.platform === 'win32') {
      // Try to find ADB using 'where' command on Windows
      output = execSync('where adb').toString().trim();
    } else {
      // Try to find ADB using 'which' command on macOS/Linux
      output = execSync('which adb').toString().trim();
    }
    
    if (output) {
      const adbPaths = output.split('\n').map(line => line.trim());
      console.log(`Found ADB paths via command: ${adbPaths}`);
      if (adbPaths.length > 0) {
        return adbPaths[0]; // Return the first path found
      }
    }
  } catch (error) {
    console.log('ADB not found in system PATH');
  }
  return null;
}

/**
 * Test if an ADB installation works by running a simple command
 * @param {string} adbPath - Path to the ADB executable
 * @return {boolean} - Whether the ADB installation works
 */
function testAdbInstallation(adbPath) {
  try {
    console.log(`Testing ADB installation at: ${adbPath}`);
    // Run a simple command to see if ADB works
    const result = execSync(`"${adbPath}" devices`, { timeout: 5000 }).toString();
    console.log(`ADB test result: ${result}`);
    // If we get here, the command succeeded
    return true;
  } catch (error) {
    console.error(`ADB test failed for ${adbPath}:`, error.message);
    return false;
  }
}

/**
 * Search for ADB executable
 * @return {string|null} - Path to ADB executable or null if not found
 */
function searchForAdb() {
  // First check if ADB is in the system PATH
  const adbFromCommand = findAdbViaCommand();
  if (adbFromCommand && testAdbInstallation(adbFromCommand)) {
    console.log(`Found working ADB in PATH: ${adbFromCommand}`);
    return adbFromCommand;
  }

  // If not in PATH or not working, search in common locations
  const installations = findAdbInCommonLocations();
  
  // Test each installation and use the first working one
  for (const installation of installations) {
    if (testAdbInstallation(installation)) {
      console.log(`Using working ADB from found installations: ${installation}`);
      return installation;
    }
  }

  console.log('No working ADB installations found');
  return null;
}

/**
 * Initialize ADB client
 * @param {string} adbPath - Path to ADB executable
 */
function initializeAdb(adbPath) {
  try {
    console.log(`Initializing ADB client with path: ${adbPath}`);
    
    // First try to start the ADB server
    startAdbServer(adbPath);
    
    // Set the ADB binary path
    process.env.ANDROID_HOME = path.dirname(adbPath);
    
    // Create client with explicit host and port configuration
    client = adb.createClient({
      bin: adbPath,
      host: '127.0.0.1', // Use IPv4 instead of IPv6
      port: 5037         // Default ADB port
    });
    
    // Save the path for future use
    saveAdbPath(adbPath);
    
    // Verify that the client works by testing a simple command
    testAdbClient();
    
    // Notify the renderer process that ADB was found
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('adb-found', { path: adbPath });
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing ADB client:', error);
    client = null; // Reset client to null on failure
    return false;
  }
}

/**
 * Test that the ADB client can connect to the server
 */
async function testAdbClient() {
  if (!client) return false;
  
  try {
    console.log('Testing ADB client connection...');
    
    // Try a simple command that should always work
    try {
      // Try to get ADB server version
      const version = await client.version();
      console.log(`ADB server version: ${version}`);
      return true;
    } catch (versionError) {
      console.error('Failed to get ADB version, trying devices command instead:', versionError.message);
      
      // If version fails, try listing devices as a fallback
      try {
        await client.listDevices();
        console.log('Successfully listed devices, client is working');
        return true;
      } catch (listError) {
        console.error('Failed to list devices with client:', listError.message);
        throw new Error('Multiple ADB client commands failed');
      }
    }
  } catch (error) {
    console.error('ADB client connection test failed:', error.message);
    
    // The client creation succeeded but connection failed - likely a server issue
    // Try restarting the server
    if (adbPath) {
      console.log('Attempting to restart ADB server and reconnect...');
      try {
        // Kill server first to force a clean restart
        execSync(`"${adbPath}" kill-server`, { timeout: 5000 });
        console.log('ADB server killed');
        
        // Wait a moment before starting again
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Start server again
        execSync(`"${adbPath}" start-server`, { timeout: 5000 });
        console.log('ADB server restarted');
        
        // Wait a moment for the server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Create a new client with the same settings
        client = adb.createClient({
          bin: adbPath,
          host: '127.0.0.1',
          port: 5037
        });
        
        console.log('Created new ADB client after server restart');
        
        // Verify the connection by checking the version again
        try {
          const version = await client.version();
          console.log(`ADB server version after restart: ${version}`);
          return true;
        } catch (finalError) {
          console.error('Client still failing after server restart:', finalError.message);
          return false;
        }
      } catch (restartError) {
        console.error('Failed to restart ADB server:', restartError.message);
        return false;
      }
    }
    return false;
  }
}

/**
 * Start the ADB server if it's not already running
 * @param {string} adbPath - Path to ADB executable
 */
function startAdbServer(adbPath) {
  try {
    console.log('Attempting to start ADB server...');
    
    // First kill any existing ADB server to ensure a clean start
    try {
      execSync(`"${adbPath}" kill-server`, { timeout: 10000 });
      console.log('Killed existing ADB server');
    } catch (killError) {
      // It's okay if kill-server fails, it might not be running
      console.log('No existing ADB server to kill or kill failed');
    }
    
    // Now start the server
    const startResult = execSync(`"${adbPath}" start-server`, { timeout: 10000 }).toString();
    console.log('ADB server start result:', startResult);
    
    // Wait a moment for the server to be fully ready
    setTimeout(() => {
      console.log('ADB server should be ready now');
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Error starting ADB server:', error.message);
    return false;
  }
}

/**
 * Creates the main application window with proper size and configuration
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile('index.html');
  
  // Set up application menu
  createApplicationMenu();
  
  // Check for a saved ADB path first
  if (loadSavedAdbPath()) {
    console.log('Using saved ADB path:', adbPath);
    initializeAdb(adbPath);
  } else {
    // If no saved path, search for ADB
    console.log('No saved ADB path found, searching...');
    const foundAdbPath = searchForAdb();
    if (foundAdbPath) {
      initializeAdb(foundAdbPath);
    } else {
      console.log('ADB not found automatically, will need manual configuration');
      // Create an ADB helper file
      const appDir = path.dirname(app.getPath('exe'));
      const adbExe = process.platform === 'win32' ? 'adb.exe' : 'adb';
      const targetAdbPath = path.join(appDir, adbExe);
      createAdbHelperFile(targetAdbPath);
      // Notify renderer that ADB wasn't found
      mainWindow.webContents.send('adb-not-found');
    }
  }
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

/**
 * Initialize the application when Electron is ready
 */
app.whenReady().then(async () => {
  createWindow();
  setupIpcHandlers();
  
  // macOS specific behavior: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Handle application exit
 * On macOS, applications continue running until Cmd+Q is pressed
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * List connected Android devices
 * @return {Promise<Array>} - Promise resolving to array of device objects
 */
async function listDevices() {
  console.log('Attempting to list Android devices...');
  try {
    if (!client) {
      console.log('ADB client not initialized');
      
      // Try to reinitialize the client by searching for ADB
      console.log('Searching for ADB again...');
      const foundAdbPath = searchForAdb();
      
      if (foundAdbPath) {
        console.log(`Found ADB at ${foundAdbPath}, initializing client...`);
        const initialized = initializeAdb(foundAdbPath);
        if (!initialized || !client) {
          return { 
            error: 'ADB (Android Debug Bridge) not found on your system. Please install Android SDK or ADB tools separately.', 
            devices: [] 
          };
        }
      } else {
        return { 
          error: 'ADB (Android Debug Bridge) not found on your system. Please install Android SDK or ADB tools separately.', 
          devices: [] 
        };
      }
    }

    // Double-check ADB server is running
    if (!checkAdbServer()) {
      console.log('ADB server not running, trying to restart it');
      if (adbPath && fs.existsSync(adbPath)) {
        console.log(`Attempting to restart ADB server with path: ${adbPath}`);
        startAdbServer(adbPath);
      } else {
        // Try to reload saved path
        if (loadSavedAdbPath()) {
          console.log(`Reloaded saved ADB path: ${adbPath}, restarting server`);
          startAdbServer(adbPath);
        } else {
          console.error('Cannot start ADB server - no valid ADB path');
          return { error: 'ADB server not running and no path to restart it', devices: [] };
        }
      }
    }

    try {
      const devices = await client.listDevices();
      console.log('Found devices:', devices);
      return { devices };
    } catch (innerError) {
      console.error('Failed to list devices (inner error):', innerError);
      
      // Try using direct command as fallback
      if (adbPath && fs.existsSync(adbPath)) {
        try {
          console.log('Trying direct ADB command as fallback...');
          
          // Try to restart the ADB server first
          try {
            execSync(`"${adbPath}" kill-server`, { timeout: 5000 });
            console.log('Killed ADB server before direct command');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            execSync(`"${adbPath}" start-server`, { timeout: 5000 });
            console.log('Started ADB server before direct command');
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (serverError) {
            console.log('Server restart failed, trying direct command anyway:', serverError.message);
          }
          
          // Now try to list devices
          const output = execSync(`"${adbPath}" devices`, { timeout: 5000 }).toString();
          console.log('Direct ADB devices output:', output);
          
          // Parse the output to extract device info
          const lines = output.trim().split('\n');
          if (lines.length > 1) { // First line is header
            const devices = [];
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line) {
                const [id, state] = line.split(/\s+/);
                if (id && state) {
                  devices.push({ id, type: state });
                }
              }
            }
            
            // Log success with direct command
            if (devices.length > 0) {
              console.log(`Successfully found ${devices.length} device(s) with direct ADB command`);
            } else {
              console.log('No devices found with direct ADB command, but command succeeded');
            }
            
            return { devices };
          } else {
            console.log('No devices found in ADB output, but command succeeded');
            return { devices: [] };
          }
        } catch (cmdError) {
          console.error('Failed to run direct ADB command:', cmdError.message);
          
          // Try one last approach - adb get-state
          try {
            console.log('Trying adb get-state as last resort...');
            const stateOutput = execSync(`"${adbPath}" get-state`, { timeout: 3000 }).toString().trim();
            console.log('ADB get-state output:', stateOutput);
            
            if (stateOutput === 'device') {
              // If we get 'device', at least one device is connected
              console.log('Device detected via get-state command');
              return { 
                devices: [{ id: 'unknown_device', type: 'device' }],
                warning: 'Device ID could not be determined' 
              };
            }
          } catch (stateError) {
            console.log('ADB get-state also failed:', stateError.message);
          }
        }
      } else {
        console.error('Cannot run direct ADB command - no valid path');
      }
      
      return { error: innerError.message, devices: [] };
    }
  } catch (error) {
    console.error('Failed to list devices (outer error):', error);
    return { error: error.message, devices: [] };
  }
}

/**
 * Check if ADB server is running
 * @return {boolean} - Whether the ADB server is running
 */
function checkAdbServer() {
  if (!adbPath) return false;
  
  try {
    // Try to get ADB server version to check if it's running
    execSync(`"${adbPath}" version`, { timeout: 2000 });
    return true;
  } catch (error) {
    console.error('ADB server check failed:', error.message);
    return false;
  }
}

/**
 * IPC Handler: List files from Android device at specified path
 * 
 * @param {Object} event - IPC event object
 * @param {Object} params - Parameters containing deviceId and path
 * @param {string} params.deviceId - Android device ID
 * @param {string} params.path - Directory path to list files from
 * @returns {Array} List of files and directories
 */
ipcMain.handle('list-files', async (event, { deviceId, path: dirPath }) => {
  try {
    console.log('Main process: Listing files at path:', dirPath);
    console.log('Main process: For device:', deviceId);
    
    // Normalize path for Android - ensure no Windows-style backslashes
    let normalizedPath = dirPath.replace(/\\/g, '/');
    console.log('Main process: Normalized path:', normalizedPath);
    
    // Make sure we're using a valid Android path
    // If the path doesn't start with / or /sdcard, fix it
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }
    
    console.log('Main process: Final path to use:', normalizedPath);
    
    // Skip the shell command verification since it's causing issues
    // Go directly to readdir
    try {
      const files = await client.readdir(deviceId, normalizedPath);
      
      console.log('Main process: Found files:', files.length);
      // Log first few files for debugging
      if (files.length > 0) {
        console.log('Main process: Sample files:', files.slice(0, 3));
      } else {
        console.log('Main process: No files found, but no error thrown');
      }
      
      return files;
    } catch (innerErr) {
      console.error(`Main process: Error accessing path ${normalizedPath}:`, innerErr.message);
      console.error('Main process: Error stack:', innerErr.stack);
      
      // Fallback mechanism: If the original path is not /sdcard, try prepending /sdcard/
      // This helps handle different Android storage path configurations
      if (normalizedPath !== '/sdcard' && !normalizedPath.startsWith('/sdcard/')) {
        try {
          const fallbackPath = '/sdcard/' + normalizedPath.replace(/^\/+/, '');
          console.log('Main process: Trying fallback path:', fallbackPath);
          
          const files = await client.readdir(deviceId, fallbackPath);
          console.log('Main process: Fallback successful, found files:', files.length);
          return files;
        } catch (fallbackErr) {
          console.error('Main process: Fallback also failed:', fallbackErr.message);
          throw innerErr; // Re-throw the original error
        }
      }
      
      throw innerErr;
    }
  } catch (err) {
    console.error(`Failed to list files at ${dirPath}:`, err.message);
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    throw err; // Make sure the error is propagated to the renderer
  }
});

/**
 * IPC Handler: Pull (download) a file from Android device to local machine
 * 
 * @param {Object} event - IPC event object
 * @param {Object} params - Parameters for file transfer
 * @param {string} params.deviceId - Android device ID
 * @param {string} params.remotePath - File path on Android device
 * @param {string} params.localPath - Destination path on local machine
 * @returns {Object} Success status and any error message
 */
ipcMain.handle('pull-file', async (event, { deviceId, remotePath, localPath }) => {
  try {
    await client.pull(deviceId, remotePath)
      .then(transfer => {
        return new Promise((resolve, reject) => {
          transfer.pipe(require('fs').createWriteStream(localPath))
            .on('finish', resolve)
            .on('error', reject);
        });
      });
    return { success: true };
  } catch (err) {
    console.error(`Failed to pull file from ${remotePath}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Handler: Push (upload) a file from local machine to Android device
 * 
 * @param {Object} event - IPC event object
 * @param {Object} params - Parameters for file transfer
 * @param {string} params.deviceId - Android device ID
 * @param {string} params.localPath - Source file path on local machine
 * @param {string} params.remotePath - Destination path on Android device
 * @returns {Object} Success status and any error message
 */
ipcMain.handle('push-file', async (event, { deviceId, localPath, remotePath }) => {
  try {
    await client.push(deviceId, localPath, remotePath);
    return { success: true };
  } catch (err) {
    console.error(`Failed to push file to ${remotePath}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Handler: Create a new directory on Android device
 * 
 * @param {Object} event - IPC event object
 * @param {Object} params - Parameters
 * @param {string} params.deviceId - Android device ID
 * @param {string} params.path - Directory path to create
 * @returns {Object} Success status and any error message
 */
ipcMain.handle('create-directory', async (event, { deviceId, path }) => {
  try {
    await client.shell(deviceId, `mkdir -p "${path}"`);
    return { success: true };
  } catch (err) {
    console.error(`Failed to create directory ${path}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Handler: Delete a file or directory on Android device
 * 
 * @param {Object} event - IPC event object
 * @param {Object} params - Parameters
 * @param {string} params.deviceId - Android device ID
 * @param {string} params.path - Path to delete
 * @param {boolean} params.isDirectory - Whether the path is a directory
 * @returns {Object} Success status and any error message
 */
ipcMain.handle('delete-item', async (event, { deviceId, path, isDirectory }) => {
  try {
    const cmd = isDirectory ? `rm -rf "${path}"` : `rm "${path}"`;
    await client.shell(deviceId, cmd);
    return { success: true };
  } catch (err) {
    console.error(`Failed to delete ${path}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Handler: Open native file/folder selection dialog
 * 
 * @param {Object} event - IPC event object
 * @param {Object} params - Parameters
 * @param {boolean} params.isDirectory - Whether to select directory or files
 * @returns {Array} Array of selected file paths
 */
ipcMain.handle('open-file-dialog', async (event, { isDirectory }) => {
  const properties = isDirectory 
    ? ['openDirectory'] 
    : ['openFile', 'multiSelections'];
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties
  });
  
  return result.filePaths;
});

// Add IPC handler for renderer to request ADB search
ipcMain.handle('search-for-adb', async () => {
  return await checkAndPromptForAdb();
});

/**
 * Clear the saved ADB path from storage
 */
function clearSavedAdbPath() {
  console.log('Clearing saved ADB path');
  
  // Clear from electron-store
  store.delete('adbPath');
  
  // Clear from file
  try {
    if (fs.existsSync(adbConfigPath)) {
      fs.unlinkSync(adbConfigPath);
      console.log(`Deleted ADB config file: ${adbConfigPath}`);
    }
  } catch (err) {
    console.error('Error deleting ADB config file:', err);
  }
  
  adbPath = null;
}

// Add IPC handler for renderer to clear the saved ADB path
ipcMain.handle('clear-saved-adb', async () => {
  clearSavedAdbPath();
  return true;
});

/**
 * Set up all IPC handlers for communication with the renderer process
 */
function setupIpcHandlers() {
  ipcMain.handle('list-devices', async () => {
    console.log('Received request to list devices');
     
    // Make sure ADB client is initialized
    if (!client && adbPath) {
      console.log('ADB client not initialized, reinitializing with saved path:', adbPath);
      initializeAdb(adbPath);
    } else if (!client && !adbPath) {
      console.log('ADB client and path not available, attempting to load from storage');
      if (loadSavedAdbPath()) {
        console.log('Successfully loaded saved ADB path:', adbPath);
        initializeAdb(adbPath);
      } else {
        console.log('No saved ADB path found, searching again...');
        const foundAdbPath = searchForAdb();
        if (foundAdbPath) {
          initializeAdb(foundAdbPath);
        } else {
          console.log('ADB not found, devices cannot be listed');
          return {
            error: 'ADB (Android Debug Bridge) not found on your system. Please install Android SDK or ADB tools separately.',
            devices: []
          };
        }
      }
    }
     
    // Now attempt to list devices
    return await listDevices();
  });
  
  // Add back the get-devices handler for backward compatibility
  ipcMain.handle('get-devices', async () => {
    console.log('Received request to get devices (legacy handler)');
    
    // Make sure ADB client is initialized
    if (!client && adbPath) {
      console.log('ADB client not initialized, reinitializing with saved path:', adbPath);
      initializeAdb(adbPath);
    } else if (!client && !adbPath) {
      console.log('ADB client and path not available, attempting to load from storage');
      if (loadSavedAdbPath()) {
        console.log('Successfully loaded saved ADB path:', adbPath);
        initializeAdb(adbPath);
      } else {
        console.log('No saved ADB path found, searching again...');
        const foundAdbPath = searchForAdb();
        if (foundAdbPath) {
          initializeAdb(foundAdbPath);
        } else {
          console.log('ADB not found, devices cannot be listed');
          return {
            error: 'ADB (Android Debug Bridge) not found on your system. Please install Android SDK or ADB tools separately.',
            devices: []
          };
        }
      }
    }
    
    // Now attempt to list devices
    const result = await listDevices();
    
    // If there was an error, include it in the response
    if (result.error) {
      console.log(`Error listing devices: ${result.error}`);
      return {
        error: result.error,
        devices: result.devices || []
      };
    }
    
    return {
      devices: result.devices || []
    };
  });
  
  ipcMain.handle('search-adb', async () => {
    try {
      const foundAdbPath = searchForAdb();
      if (foundAdbPath) {
        const initialized = initializeAdb(foundAdbPath);
        return { success: initialized, path: foundAdbPath };
      } else {
        return { success: false, error: 'ADB not found' };
      }
    } catch (error) {
      console.error('Error in search-adb handler:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Add IPC handler for the helper file execution
  ipcMain.on('execute-helper-file', () => {
    try {
      const appDir = path.dirname(app.getPath('exe'));
      const helperPath = path.join(appDir, 'install-adb-helper.bat');
      
      if (fs.existsSync(helperPath)) {
        console.log(`Executing helper batch file: ${helperPath}`);
        // Execute the batch file
        const child = require('child_process').spawn('cmd.exe', ['/c', helperPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        
        // Detach the child process so it can run independently
        child.unref();
      } else {
        console.log(`Helper batch file not found at ${helperPath}, creating it...`);
        const targetAdbPath = path.join(appDir, 'adb.exe');
        const newHelperPath = createAdbHelperFile(targetAdbPath);
        
        if (newHelperPath && fs.existsSync(newHelperPath)) {
          console.log(`Executing newly created helper batch file: ${newHelperPath}`);
          const child = require('child_process').spawn('cmd.exe', ['/c', newHelperPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
          
          child.unref();
        } else {
          console.error('Failed to create or execute helper batch file');
        }
      }
    } catch (error) {
      console.error('Error executing helper batch file:', error);
    }
  });
  
  // Handle request to browse for ADB file
  ipcMain.handle('browse-adb', async () => {
    console.log('Received request to browse for ADB');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select ADB Executable',
      properties: ['openFile'],
      filters: [
        { name: 'Executables', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      console.log(`User selected ADB at: ${selectedPath}`);
      initializeAdb(selectedPath);
      return { success: true, path: selectedPath };
    } else {
      console.log('User canceled ADB browse dialog');
      return { success: false };
    }
  });
  
  // Handle request to reset ADB configuration
  ipcMain.on('reset-adb-config', () => {
    console.log('Received request to reset ADB configuration');
    clearSavedAdbPath();
    
    // Send configuration info to renderer for debug display
    const configPath = adbConfigPath;
    const storePath = app.getPath('userData');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-info', {
        configPath,
        storePath,
        electronStorePath: store.path
      });
    }
  });
  
  // Handle request for config information
  ipcMain.handle('get-config-info', () => {
    console.log('Received request for configuration information');
    return {
      configPath: adbConfigPath,
      storePath: app.getPath('userData'),
      electronStorePath: store.path
    };
  });
  
  // Handle window resize requests
  ipcMain.on('resize-window', (event, { debugPanelVisible }) => {
    if (!mainWindow) return;
    
    const currentSize = mainWindow.getSize();
    
    // Adjust height based on debug panel visibility
    // Base height + extra height for debug panel if visible
    const baseHeight = 700;
    const debugPanelHeight = 200;
    const newHeight = debugPanelVisible ? baseHeight + debugPanelHeight : baseHeight;
    
    // Only resize if the height would actually change
    if (currentSize[1] !== newHeight) {
      mainWindow.setSize(currentSize[0], newHeight);
    }
  });
  
  // Handler for viewing files in a separate window
  ipcMain.handle('view-file', async (event, fileData) => {
    console.log('Received request to view file:', fileData.fileName);
    createViewerWindow(fileData);
    return true;
  });
  
  // Handler for closing the viewer window
  ipcMain.on('close-viewer', () => {
    if (viewerWindow !== null && !viewerWindow.isDestroyed()) {
      viewerWindow.close();
    }
  });
}

// Create the application menu
function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Toggle Debug Panel',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-debug');
            }
          }
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            const version = app.getVersion();
            dialog.showMessageBox(mainWindow, {
              title: 'About Android File Transfer',
              message: `Android File Transfer v${version}`,
              detail: 'A simple application for transferring files between your computer and Android devices.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Create a batch file to help user install ADB
 * @param {string} targetPath - Path where to create the helper file
 */
function createAdbHelperFile(targetPath) {
  try {
    const adbHelperDir = path.dirname(targetPath);
    
    // Ensure the directory exists
    if (!fs.existsSync(adbHelperDir)) {
      fs.mkdirSync(adbHelperDir, { recursive: true });
    }
    
    if (process.platform === 'win32') {
      // Create a batch file for Windows
      const batchContent = `@echo off
echo ===================================================
echo Android File Transfer - ADB Installation Helper
echo ===================================================
echo.
echo This helper will open the Android SDK Platform Tools download page
echo to help you install ADB on your system.
echo.
echo After downloading, extract the ZIP file and copy adb.exe to:
echo %~dp0
echo.
echo Then restart Android File Transfer.
echo.
echo Press any key to open the download page...
pause > nul
start "" "https://developer.android.com/studio/releases/platform-tools"
echo.
echo Download started in your browser.
echo.
echo Press any key to exit...
pause > nul
`;

      // Write the batch file next to where adb.exe would be
      const batchPath = path.join(adbHelperDir, 'install-adb-helper.bat');
      fs.writeFileSync(batchPath, batchContent);
      console.log(`Created ADB helper batch file at: ${batchPath}`);
      
      return batchPath;
    } else {
      // Create a shell script for macOS/Linux
      const shellContent = `#!/bin/bash
echo "==================================================="
echo "Android File Transfer - ADB Installation Helper"
echo "==================================================="
echo ""
echo "This helper will open the Android SDK Platform Tools download page"
echo "to help you install ADB on your system."
echo ""
echo "After downloading, extract the ZIP file and copy adb to:"
echo "$(dirname "$0")"
echo ""
echo "Alternatively, you can install ADB with:"
echo "  - macOS: 'brew install android-platform-tools'"
echo "  - Linux: 'sudo apt install adb' (Ubuntu/Debian)"
echo ""
echo "Then restart Android File Transfer."
echo ""
echo "Press any key to open the download page..."
read -n 1 -s
open "https://developer.android.com/studio/releases/platform-tools"
echo ""
echo "Download started in your browser."
echo ""
echo "Press any key to exit..."
read -n 1 -s
`;

      // Write the shell script
      const shellPath = path.join(adbHelperDir, 'install-adb-helper.sh');
      fs.writeFileSync(shellPath, shellContent);
      // Make the shell script executable
      fs.chmodSync(shellPath, '755');
      console.log(`Created ADB helper shell script at: ${shellPath}`);
      
      return shellPath;
    }
  } catch (error) {
    console.error('Error creating ADB helper file:', error);
    return null;
  }
}

/**
 * Create a viewer window for displaying files
 * @param {Object} fileData - Data about the file to view
 */
function createViewerWindow(fileData) {
  // If there is already a viewer window, close it first
  if (viewerWindow !== null && !viewerWindow.isDestroyed()) {
    viewerWindow.close();
  }
  
  // Create a new viewer window
  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#1e1e1e',
    show: false, // Don't show until content is loaded
    frame: true, // Use default frame with minimize, maximize, close buttons
  });
  
  // Load the viewer HTML file
  viewerWindow.loadFile('viewer.html');
  
  // When the window is ready, send the file data and show the window
  viewerWindow.webContents.on('did-finish-load', () => {
    viewerWindow.webContents.send('file-data', fileData);
    viewerWindow.show();
  });
  
  // Handle window closed event
  viewerWindow.on('closed', () => {
    viewerWindow = null;
  });
} 