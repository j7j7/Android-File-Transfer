/**
 * renderer.js
 * 
 * Main renderer process script for the OSX Android File Transfer application.
 * Handles all UI interactions, file operations, and communication with the main process.
 * Uses modular architecture for better organization and maintainability.
 * 
 * Features:
 * - Android device detection and connection
 * - Local and Android file system navigation
 * - File transfers between local and Android systems
 * - File and folder operations (create, delete)
 * - Media file viewing (images, audio, video)
 * - Progress tracking for file operations
 */

const { ipcRenderer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import modules
const { state, initializeApp, clearSelections } = require('./modules/state');
const fileSystem = require('./modules/fileSystem');
const transferOps = require('./modules/transferOperations');
const deviceMgmt = require('./modules/deviceManagement');
const uiOps = require('./modules/uiOperations');
const localFS = require('./modules/localFileSystem');

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

/**
 * DOM element references
 * Cached references to UI elements for improved performance
 */
const deviceSelect = document.getElementById('device-select');
const refreshDevicesBtn = document.getElementById('refresh-devices');
const localPathInput = document.getElementById('local-path');
const androidPathInput = document.getElementById('android-path');
const localFilesList = document.getElementById('local-files');
const androidFilesList = document.getElementById('android-files');
const localBackBtn = document.getElementById('local-back');
const androidBackBtn = document.getElementById('android-back');
const localGoBtn = document.getElementById('local-go');
const androidGoBtn = document.getElementById('android-go');
const transferToAndroidBtn = document.getElementById('transfer-to-android');
const transferToLocalBtn = document.getElementById('transfer-to-local');
const swapSidesBtn = document.getElementById('swap-sides');
const localNewFolderBtn = document.getElementById('local-new-folder');
const androidNewFolderBtn = document.getElementById('android-new-folder');
const localRenameBtn = document.getElementById('local-rename');
const androidRenameBtn = document.getElementById('android-rename');
const localDeleteBtn = document.getElementById('local-delete');
const androidDeleteBtn = document.getElementById('android-delete');
const statusMessage = document.getElementById('status-message');
const progressBar = document.querySelector('.progress-fill');
const progressText = document.querySelector('.progress-text');

/**
 * Set status message helper function
 * 
 * @param {string} message - Status message to display
 * @param {'success' | 'error' | 'warning' | 'info'} type
 */
// function setStatus(message) {
//   uiOps.setStatus(message, statusMessage);
// }

function setStatus(message, type = 'info') {
  if (!statusMessage) return;

  statusMessage.textContent = message;

  // Remove todas as classes de status anteriores
  statusMessage.classList.remove('status-success', 'status-error', 'status-warning');

  // Aplica a classe correta com base no tipo
  switch (type) {
    case 'success':
      statusMessage.classList.add('status-success');
      break;
    case 'error':
      statusMessage.classList.add('status-error');
      break;
    case 'warning':
      statusMessage.classList.add('status-warning');
      break;
    default:
      // 'info' ou qualquer outro: sem cor especial
      break;
  }
}

/**
 * Helper function to ensure progress bar elements are available
 * This creates the elements if they don't exist
 * 
 * @returns {Object} Object containing progressBar and progressText elements
 */
function ensureProgressElements() {
  let progressBarElement = document.querySelector('.progress-fill');
  let progressTextElement = document.querySelector('.progress-text');
  let progressActiveElement = document.querySelector('.progress-container.acive');
  
  // If progress bar doesn't exist, create it
  if (!progressBarElement || !progressTextElement) {
    console.log('Creating missing progress bar elements');
    
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) {
      // Clear any existing progress elements
      const existingContainer = statusBar.querySelector('.progress-container');
      if (existingContainer) {
        existingContainer.remove();
      }
      
      // Create new container
      const progressContainer = document.createElement('div');
      progressContainer.className = 'progress-container';
      
      // Create progress bar structure
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      
      progressBarElement = document.createElement('div');
      progressBarElement.className = 'progress-fill';
      
      progressTextElement = document.createElement('div');
      progressTextElement.className = 'progress-text';
      
      // Assemble the structure
      progressBar.appendChild(progressBarElement);
      progressContainer.appendChild(progressBar);
      
      // Add to DOM
      statusBar.appendChild(progressContainer);
      statusBar.appendChild(progressTextElement);
    }
  }
  
  return {
    progressBar: progressBarElement,
    progressText: progressTextElement
  };
}

/**
 * Update progress bar display
 * 
 * @param {number} percent - Percentage of progress (0-100)
 * @param {string} text - Text to display in progress bar
 */
function updateProgressBar(percent, text = '') {
  const elements = ensureProgressElements();
  
  if (!elements.progressContainer) {
    // if still no container, create one
    const container = document.querySelector('.progress-container') || createProgressContainer();
    elements.progressContainer = container;
  }

  const progressFill = elements.progressBar;
  const progressTextEl = elements.progressText;
  const progressContainer = elements.progressContainer;

  if (percent > 0 && percent < 100) {
    // in progress. Show everything
    progressContainer.classList.add('active');
    progressTextEl.classList.add('active');
    
    progressFill.style.width = `${percent}%`;
    progressTextEl.textContent = text || `${Math.round(percent)}%`;
  } else if (percent >= 100) {
    // Completed: shows 100% for a second, then hides
    progressFill.style.width = '100%';
    progressTextEl.textContent = text || '100%';
    progressContainer.classList.add('active');
    progressTextEl.classList.add('active');

    setTimeout(() => {
      hideProgressBar();
    }, 1000);
  } else {
    hideProgressBar();
  }
}

function hideProgressBar() {
  const elements = ensureProgressElements();
  if (elements.progressContainer) {
    elements.progressContainer.classList.remove('active');
  }
  if (elements.progressText) {
    elements.progressText.classList.remove('active');
    elements.progressText.textContent = '';
  }
  if (elements.progressBar) {
    elements.progressBar.style.width = '0%';
  }
}

// Helper to create progress container if missing
function createProgressContainer() {
  const statusBar = document.querySelector('.status-bar');
  if (!statusBar) return null;

  const container = document.createElement('div');
  container.className = 'progress-container';

  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  
  bar.appendChild(fill);
  container.appendChild(bar);
  
  // Insert before the existing progress-text or at the end
  const existingText = document.querySelector('.progress-text');
  if (existingText) {
    statusBar.insertBefore(container, existingText);
  } else {
    statusBar.appendChild(container);
  }
  
  return container;
}

// Add debug info container to the DOM
function addDebugContainer() {
  // Check if it already exists
  if (document.getElementById('debug-container')) {
    return document.getElementById('debug-content');
  }
  
  const debugContainer = document.createElement('div');
  debugContainer.id = 'debug-container';
  debugContainer.style.display = 'none'; // Hidden by default
  debugContainer.style.padding = '10px';
  debugContainer.style.borderTop = '1px solid #ddd';
  debugContainer.style.backgroundColor = '#f5f5f5';
  debugContainer.style.maxHeight = '200px';
  debugContainer.style.overflow = 'auto';
  debugContainer.style.fontFamily = 'monospace';
  debugContainer.style.fontSize = '12px';
  
  const debugTitle = document.createElement('h3');
  debugTitle.textContent = 'Debug Information';
  debugTitle.style.marginTop = '0';
  debugTitle.style.marginBottom = '5px';
  
  const debugContent = document.createElement('div');
  debugContent.id = 'debug-content';
  
  debugContainer.appendChild(debugTitle);
  debugContainer.appendChild(debugContent);
  
  document.querySelector('main').appendChild(debugContainer);
  
  return debugContent;
}

// Add a debug log entry
function debugLog(message) {
  const debugContent = document.getElementById('debug-content') || addDebugContainer();
  const logEntry = document.createElement('div');
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  debugContent.appendChild(logEntry);
  
  // Scroll to bottom
  debugContent.scrollTop = debugContent.scrollHeight;
}

// Toggle debug panel visibility
function toggleDebugPanel() {
  const debugContainer = document.getElementById('debug-container') || addDebugContainer();
  const isVisible = debugContainer.style.display !== 'none';
  
  // Toggle visibility
  debugContainer.style.display = isVisible ? 'none' : 'block';
  
  // Save preference to localStorage
  localStorage.setItem('debugPanelVisible', !isVisible);
  
  // Tell main process to resize window accordingly
  ipcRenderer.send('resize-window', {debugPanelVisible: !isVisible});
  
  return !isVisible;
}

// Check if debug panel should be visible on startup
function initDebugPanel() {
  const shouldBeVisible = localStorage.getItem('debugPanelVisible') === 'true';
  const debugContainer = document.getElementById('debug-container') || addDebugContainer();
  
  debugContainer.style.display = shouldBeVisible ? 'block' : 'none';
  
  // Tell main process about initial state for proper sizing
  ipcRenderer.send('resize-window', {debugPanelVisible: shouldBeVisible});
}

// Add menu handlers after window loads
window.addEventListener('DOMContentLoaded', () => {
  // Setup menu event handlers
  ipcRenderer.on('toggle-debug', () => {
    const isVisible = toggleDebugPanel();
    setStatus(`Debug panel ${isVisible ? 'shown' : 'hidden'}`);
  });
  
  // Initialize debug panel state
  initDebugPanel();
});

// Listen for ADB found event
ipcRenderer.on('adb-found', (event, data) => {
  const statusElement = document.getElementById('status-message');
  if (statusElement) {
    statusElement.textContent = `ADB Found: ${data.path}`;
    statusElement.className = 'status-success';
  }
  
  // Log the found ADB path
  debugLog(`ADB Found: ${data.path}`);
  
  // Create the reset button if it doesn't exist
  const resetButtonContainer = document.getElementById('reset-adb-container');
  if (!resetButtonContainer) {
    createResetAdbButton();
  }
  
  // Show the reset button
  if (resetButtonContainer) {
    resetButtonContainer.style.display = 'block';
  }
  
  // Hide the search button
  const searchButton = document.getElementById('search-adb');
  if (searchButton) {
    searchButton.style.display = 'none';
  }
});

// Listening for transfer progress updates
ipcRenderer.on('transfer-progress', (event, data) => {
  console.log('Event transfer-progress received:', data); // Log para depurar

  const { file, transferred = 0, total = 0, percent = 0, completed } = data;

  let statusText = `Transferring: ${file}`;

  if (total > 0) {
    const formattedTransferred = formatBytes(transferred);
    const formattedTotal = formatBytes(total);
    statusText += ` (${formattedTransferred} of ${formattedTotal}) — ${percent}%`;
  } else {
    statusText += ` (${formatBytes(transferred)} transfered)`;
  }

  setStatus(statusText);
  updateProgressBar(percent, percent > 0 ? `${percent}%` : '');

  if (completed) {
    setTimeout(async () => {
      hideProgressBar();
      setStatus(`Done: ${file}`);
      // Force a small delay to ensure file system has completed
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadAndroidFiles();
      await loadLocalFiles();
      setStatus('Transfer complete - Files refreshed', 'success');
    }, 800);
  }
});

// Erro na transferência
ipcRenderer.on('transfer-error', (event, data) => {
  setStatus(`Error in transfer: ${data.error}`, 'error');
  hideProgressBar();
});

// When ADB is not found, update the UI to show a helpful message
function showAdbNotFoundMessage() {
  console.log('Showing ADB not found message in UI');
  
  // Show error message in both panels
  const errorMessage = `
    <div class="error-message">
      <h3>ADB (Android Debug Bridge) not found on your system</h3>
      <p>To use Android File Transfer, you need to install the Android Debug Bridge (ADB) tool.</p>
      
      <div class="adb-help">
        <h4>Quick Setup:</h4>
        <ol>
          <li>Download <a href="https://developer.android.com/studio/releases/platform-tools" target="_blank">Android SDK Platform Tools</a></li>
          <li>Extract the ZIP file</li>
          <li>Copy the <strong>adb.exe</strong> file to the same folder as this application</li>
          <li>Restart Android File Transfer</li>
        </ol>
        
        <button id="open-install-helper" class="btn btn-primary">Open Installation Helper</button>
      </div>
    </div>
  `;
  
  // Update both panels with the error message
  document.getElementById('android-files').innerHTML = errorMessage;
  
  // Add click handler for the installation helper
  setTimeout(() => {
    const helperButton = document.getElementById('open-install-helper');
    if (helperButton) {
      helperButton.addEventListener('click', () => {
        // Execute the helper batch file
        ipcRenderer.send('execute-helper-file');
      });
    }
  }, 100);
}

// Listen for ADB not found event
ipcRenderer.on('adb-not-found', () => {
  console.log('Received adb-not-found event');
  showAdbNotFoundMessage();
});

// Listen for config info event
ipcRenderer.on('config-info', (event, data) => {
  // Log config information
  debugLog(`Config Info: ${JSON.stringify(data)}`);
});

// Create the reset ADB configuration button
function createResetAdbButton() {
  // Get the ADB tools container or create one if it doesn't exist
  let adbToolsContainer = document.getElementById('adb-tools-container');
  if (!adbToolsContainer) {
    // If we don't have an ADB tools container yet, create it first by calling our search button function
    createSearchAdbButton();
    adbToolsContainer = document.getElementById('adb-tools-container');
  }
  
  // Create a container for the reset button
  const resetContainer = document.createElement('div');
  resetContainer.id = 'reset-adb-container';
  resetContainer.className = 'adb-button-group';
  
  // Create the reset button
  const resetButton = document.createElement('button');
  resetButton.id = 'reset-adb';
  resetButton.textContent = 'Reset ADB Configuration';
  resetButton.title = 'Clear the saved ADB path and reconfigure';
  
  // Add click event listener
  resetButton.addEventListener('click', resetAdbConfiguration);
  
  // Add the button to the container
  resetContainer.appendChild(resetButton);
  
  // Add container to the ADB tools container
  adbToolsContainer.appendChild(resetContainer);
  
  return resetButton;
}

// Function to reset ADB configuration
function resetAdbConfiguration() {
  // Confirm with the user before resetting
  if (confirm('Are you sure you want to reset the ADB configuration? This will clear the saved ADB path.')) {
    debugLog('User confirmed resetting ADB configuration');
    
    // Tell the main process to clear the saved ADB path
    ipcRenderer.send('reset-adb-config');
    
    // Update the status message
    const statusElement = document.getElementById('status-message');
    if (statusElement) {
      statusElement.textContent = 'ADB configuration has been reset. Please search for ADB again.';
      statusElement.className = 'status-warning';
    }
    
    // Show the search button
    const searchButton = document.getElementById('search-adb');
    if (searchButton) {
      searchButton.style.display = 'block';
    }
    
    // Hide the reset button
    const resetButtonContainer = document.getElementById('reset-adb-container');
    if (resetButtonContainer) {
      resetButtonContainer.style.display = 'none';
    }
    
    debugLog('ADB configuration reset complete');
  } else {
    debugLog('User cancelled resetting ADB configuration');
  }
}

/**
 * Theme Management Functions
 * Handles dark/light mode toggle
 */

function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  setStatus(`Switched to ${newTheme} mode`, 'success');
  debugLog(`Theme changed to ${newTheme}`);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  let initialTheme = 'light';
  
  if (savedTheme) {
    initialTheme = savedTheme;
  } else if (systemPrefersDark) {
    initialTheme = 'dark';
  }
  
  document.documentElement.setAttribute('data-theme', initialTheme);
  debugLog(`Theme initialized: ${initialTheme}`);
}

/**
 * Document Ready Handler
 * Set up the initial state and event listeners when the DOM content is loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  initializeTheme();
  
  // Set up theme toggle button
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
  // Update platform-specific elements 
  document.documentElement.classList.toggle('windows', isWindows);
  document.documentElement.classList.toggle('mac', isMac);
  
  // Initialize progress bar elements - make sure they exist and are properly set
  if (!progressBar) {
    console.log('Initializing progress bar elements');
    window.progressBar = document.querySelector('.progress-fill');
    window.progressText = document.querySelector('.progress-text');
  }
  
  // Initialize platform-specific UI tweaks if needed
  if (isWindows) {
    // Any Windows-specific UI adjustments can go here
    console.log('Running on Windows platform');
    
    // Make sure we have both panels visible
    const localExplorer = document.querySelector('.file-explorer.local');
    const androidExplorer = document.querySelector('.file-explorer.android');
    if (localExplorer) localExplorer.style.display = 'flex';
    if (androidExplorer) androidExplorer.style.display = 'flex';
    
    // Add a search ADB button for Windows users
    const deviceControls = document.querySelector('.device-controls');
    if (deviceControls) {
      const findAdbBtn = document.createElement('button');
      findAdbBtn.id = 'find-adb';
      findAdbBtn.textContent = 'Find ADB';
      findAdbBtn.title = 'Find ADB installation';
      deviceControls.appendChild(findAdbBtn);
      
      // Add event listener for the find ADB button
      findAdbBtn.addEventListener('click', searchForAdb);
    }
  } else if (isMac) {
    // Any Mac-specific UI adjustments can go here
    console.log('Running on macOS platform');
  }
  
  const initialPath = isWindows ? 
    localFS.getStartingDirectory() : 
    localFS.getHomeDirectory();
  
  // Initialize the application state with paths for both panels
  initializeApp(initialPath, '/sdcard');
  
  // Initialize UI
  localPathInput.value = state.localPath;
  androidPathInput.value = state.androidPath;
  
  // Load files and set up event listeners
  refreshDevices();
  loadLocalFiles();
  
  // Add platform-specific file system navigation support
  if (isWindows) {
    // Add Windows drive selection functionality
    setupWindowsDriveSelection();
  }

  // Add event listeners for device interaction buttons
  setupEventListeners();
  
  // Add refresh button event listeners
  const localRefreshBtn = document.getElementById('local-refresh');
  if (localRefreshBtn) {
    localRefreshBtn.addEventListener('click', async () => {
      try {
        console.log('Local refresh button clicked');
        debugLog('Refreshing local files');
        // Disable the button during refresh
        localRefreshBtn.disabled = true;
        
        await refreshLocalFiles();
        
        // Re-enable the button
        localRefreshBtn.disabled = false;
      } catch (err) {
        console.error('Error handling local refresh click:', err);
        debugLog(`Error refreshing local files: ${err.message}`);
        // Re-enable the button on error
        localRefreshBtn.disabled = false;
      }
    });
  }

  const androidRefreshBtn = document.getElementById('android-refresh');
  if (androidRefreshBtn) {
    androidRefreshBtn.addEventListener('click', async () => {
      try {
        console.log('Android refresh button clicked');
        debugLog('Refreshing Android files');
        // Disable the button during refresh
        androidRefreshBtn.disabled = true;
        
        await refreshAndroidFiles();
        
        // Re-enable the button
        androidRefreshBtn.disabled = false;
      } catch (err) {
        console.error('Error handling Android refresh click:', err);
        debugLog(`Error refreshing Android files: ${err.message}`);
        // Re-enable the button on error
        androidRefreshBtn.disabled = false;
      }
    });
  }

  // Update device connection to refresh file views
  document.getElementById('connect-button').addEventListener('click', async () => {
    try {
      const deviceSelect = document.getElementById('device-select');
      if (!deviceSelect || deviceSelect.value === '') {
        setStatus('Please select a device first');
        return;
      }
      
      state.selectedDevice = deviceSelect.value;
      state.androidPath = '/sdcard'; // Reset to default path
      document.getElementById('android-path').value = state.androidPath;
      
      setStatus(`Connected to device: ${state.selectedDevice}. Loading files...`);
      
      // Update UI to show file panels
      document.getElementById('file-panels').style.display = 'flex';
      
      // Refresh both file views to ensure we have the latest data
      await refreshLocalFiles();
      await refreshAndroidFiles();
      
      setStatus(`Connected to device: ${state.selectedDevice}. Files loaded successfully.`);
    } catch (err) {
      console.error('Error connecting to device:', err);
      setStatus(`Error connecting to device: ${err.message}`);
    }
  });
  
  // Create the debug container at the bottom
  addDebugContainer();
  
  // Set up drag and drop for file explorers
  setupDragAndDrop();
  
  // Request config information for debug display
  ipcRenderer.invoke('get-config-info').then(configInfo => {
    debugLog(`Config Paths: 
      - Config File: ${configInfo.configPath}
      - User Data: ${configInfo.storePath}
      - Electron Store: ${configInfo.electronStorePath}
    `);
  }).catch(err => {
    debugLog(`Error getting config info: ${err.message}`);
  });

  hideProgressBar();
});

/**
 * Setup drag and drop functionality for file explorer panels
 */
function setupDragAndDrop() {
  console.log('Setting up drag and drop functionality');
  
  const localExplorer = document.getElementById('local-explorer');
  const androidExplorer = document.getElementById('android-explorer');
  
  if (!localExplorer || !androidExplorer) {
    console.error('Could not find explorer panels for drag and drop setup');
    return;
  }
  
  // Set up drag over event for both panels
  [localExplorer, androidExplorer].forEach(explorer => {
    explorer.addEventListener('dragover', (e) => {
      e.preventDefault(); // Allow drop
      e.dataTransfer.dropEffect = 'copy';
      
      // Add visual feedback
      explorer.classList.add('drag-over');
    });
    
    explorer.addEventListener('dragleave', (e) => {
      // Remove visual feedback when dragging leaves
      explorer.classList.remove('drag-over');
    });
    
    explorer.addEventListener('drop', async (e) => {
      e.preventDefault();
      explorer.classList.remove('drag-over');
      
      // Get dropped data
      const data = e.dataTransfer.getData('text/plain');
      if (!data) {
        console.log('No data in drop event');
        return;
      }
      
      try {
        const dragData = JSON.parse(data);
        
        // Only handle file item drops
        if (!dragData.isItem) {
          console.log('Dropped data is not a file item');
          return;
        }
        
        // Determine source and destination
        const isFromLocal = dragData.isLocal;
        const isToLocal = explorer.id === 'local-explorer';
        
        // Don't allow dropping on same side
        if (isFromLocal === isToLocal) {
          setStatus('Cannot drop items on the same side');
          return;
        }
        
        console.log(`Drop: ${isFromLocal ? 'local' : 'Android'} → ${isToLocal ? 'local' : 'Android'}`);
        console.log(`Dropped item: ${dragData.name} (${dragData.isDir ? 'folder' : 'file'})`);
        
        // Handle multiple selected items if available
        const sourceSelectedItems = isFromLocal ? state.localSelectedItems : state.androidSelectedItems;
        
        if (sourceSelectedItems.size > 0) {
          // Transfer only the dragged item
          await handleDropTransfer([dragData], isFromLocal, isToLocal);
        } else {
          // Transfer all selected items
          const itemsToTransfer = [];
          
          sourceSelectedItems.forEach(itemName => {
            const itemPath = isFromLocal 
              ? path.join(state.localPath, itemName)
              : path.join(state.androidPath, itemName);
            
            // Get item metadata
            const isDir = isFromLocal 
              ? fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()
              : document.querySelector(`[data-name="${itemName}"]`)?.dataset?.isDir === 'true';
            
            const fileType = getFileType(itemName);
            
            itemsToTransfer.push({
              name: itemName,
              isDir: isDir === true,
              isLocal: isFromLocal,
              sourcePath: itemPath,
              isItem: true,
              fileType: fileType
            });
          });
          
          console.log(`Transferring ${itemsToTransfer.length} selected items`);
          await handleDropTransfer(itemsToTransfer, isFromLocal, isToLocal);
        }
      } catch (err) {
        console.error('Error handling drop:', err);
        setStatus(`Error handling drop: ${err.message}`);
      }
    });
  });
}

/**
 * Handle drop transfer for one or multiple items
 * @param {Array} items - Items to transfer
 * @param {boolean} isFromLocal - True if transferring from local
 * @param {boolean} isToLocal - True if transferring to local
 */
async function handleDropTransfer(items, isFromLocal, isToLocal) {
  if (items.length === 0) {
    return;
  }
  
  setStatus(`Copying ${items.length} item(s) ${isFromLocal ? 'from local' : 'from Android'} ${isToLocal ? 'to local' : 'to Android'}...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const item of items) {
    try {
      if (isFromLocal && !isToLocal) {
        // Local to Android
        if (item.isDir) {
          // Transfer folder
          await transferOps.transferFolderToAndroid(
            item.name,
            item.sourcePath,
            state.androidPath,
            state.selectedDevice
          );
          successCount++;
        } else {
          // Transfer file
          await transferOps.transferFileToAndroid(
            item.name,
            item.sourcePath,
            state.androidPath,
            state.selectedDevice
          );
          successCount++;
        }
      } else if (!isFromLocal && isToLocal) {
        // Android to local
        if (item.isDir) {
          // Transfer folder
          await transferOps.pullFolder(
            item.name,
            item.sourcePath,
            state.localPath,
            state.selectedDevice
          );
          successCount++;
        } else {
          // Transfer file
          await transferOps.pullFile(
            item.name,
            item.sourcePath,
            state.localPath,
            state.selectedDevice
          );
          successCount++;
        }
      }
      
      console.log(`Transferred: ${item.name} (${item.isDir ? 'folder' : 'file'})`);
    } catch (err) {
      console.error(`Error transferring ${item.name}:`, err);
      errorCount++;
    }
  }
  
  // Force small delay to ensure file system operations complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Clear selections and refresh both views
  clearSelections();
  await loadLocalFiles();
  await loadAndroidFiles();
  
  setStatus(`Copy complete. Success: ${successCount}, Errors: ${errorCount}`, 'success');
  debugLog(`Drop transfer complete. Success: ${successCount}, Errors: ${errorCount}`);
}

/**
 * Load local files from the file system
 */
function loadLocalFiles() {
  debugLog(`Loading local files from path: ${state.localPath}`);
  
  // Get the local files list element
  const localFilesList = document.getElementById('local-files');
  if (!localFilesList) {
    debugLog('Error: Local files list element not found');
    return Promise.reject(new Error('Local files list element not found'));
  }
  
  // Show loading indicator
  localFilesList.innerHTML = '<div class="loading">Loading files from local system...</div>';
  
  // Pass all required parameters to fileSystem.loadLocalFiles
  return fileSystem.loadLocalFiles(state, localFilesList, renderFileList, setStatus, pullAndroidFileToTemp, viewFile)
    .then(() => {
      // Update path input field
      const localPathInput = document.getElementById('local-path');
      if (localPathInput) {
        localPathInput.value = state.localPath;
      }
    });
}

/**
 * Load files from Android device
 */
function loadAndroidFiles() {
  debugLog(`Loading Android files from path: ${state.androidPath}`);
  
  // Get the Android files list element
  const androidFilesList = document.getElementById('android-files');
  if (!androidFilesList) {
    debugLog('Error: Android files list element not found');
    return Promise.reject(new Error('Android files list element not found'));
  }
  
  if (!state.selectedDevice) {
    setStatus('No device selected. Please select a device first.');
    androidFilesList.innerHTML = '<div class="placeholder">No device selected</div>';
    return Promise.reject(new Error('No device selected'));
  }
  
  // Show loading indicator
  androidFilesList.innerHTML = '<div class="loading">Loading files from Android device...</div>';
  
  // Ensure we have a valid path input reference
  const androidPathInput = document.getElementById('android-path');
  if (!androidPathInput) {
    return Promise.reject(new Error('Android path input not found'));
  }
  
  // Pass all required parameters to fileSystem.loadAndroidFiles
  return fileSystem.loadAndroidFiles(state, androidFilesList, androidPathInput, renderFileList, setStatus, pullAndroidFileToTemp, viewFile);
}

/**
 * Render a list of files in the specified container
 * 
 * @param {Array} items - Array of file items to render
 * @param {HTMLElement} container - DOM element to render the file list into
 * @param {boolean} isLocal - Flag indicating if this is a local file list
 */
function renderFileList(items, container, isLocal) {
  fileSystem.renderFileList(
    items, 
    container, 
    isLocal, 
    state,
    setStatus, 
    pullAndroidFileToTemp, 
    viewFile
  );
}

/**
 * Pull an Android file to a temporary location for viewing
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} androidPath - Path on the Android device
 * @param {string} filename - Name of the file
 * @returns {Promise<string>} - Path to the temporary file
 */
function pullAndroidFileToTemp(deviceId, androidPath, filename) {
  return transferOps.pullAndroidFileToTemp(deviceId, androidPath, filename);
}

/**
 * View a file in the built-in viewer
 * 
 * @param {string} filePath - Path to the file
 * @param {string} fileName - Name of the file
 * @param {string} fileType - Type of the file (image, audio, video)
 * @param {boolean} isLocal - Whether the file is local or from Android
 */
function viewFile(filePath, fileName, fileType, isLocal) {
  uiOps.viewFile(filePath, fileName, fileType, isLocal);
}

/**
 * Device refresh button click handler
 * Triggers a scan for connected Android devices
 */
refreshDevicesBtn.addEventListener('click', (e) => {
  console.log('Refresh Devices button clicked');
  refreshDevices();
});

/**
 * Refresh the Android devices list by querying ADB
 */
async function refreshDevices() {
  debugLog('Refreshing devices list...');
  
  // Update UI to show refreshing status
  const statusElement = document.getElementById('status-message');
  if (statusElement) {
    statusElement.textContent = 'Refreshing connected devices...';
    statusElement.className = '';
  }
  
  try {
    // Log that we're about to make the request
    debugLog('Requesting device list from main process...');
    
    const result = await ipcRenderer.invoke('get-devices');
    
    // Log what we got back
    debugLog(`Received result from get-devices: ${JSON.stringify(result)}`);
    
    if (result.error) {
      debugLog(`Error refreshing devices: ${result.error}`);
      
      if (statusElement) {
        statusElement.textContent = `Error refreshing devices: ${result.error}`;
        statusElement.className = 'status-error';
      }
      
      // If there's a specific message about ADB path, show the search button
      if (result.error.includes('no valid ADB path') || result.error.includes('ADB not found')) {
        const searchButton = document.getElementById('search-adb');
        if (searchButton) {
          searchButton.style.display = 'block';
        }
      }
    }
    
    // Check for warning message from fallback methods
    if (result.warning) {
      debugLog(`Warning from device refresh: ${result.warning}`);
      
      // If we have a status element, show the warning but with a success class since we did find devices
      if (statusElement && result.devices && result.devices.length > 0) {
        statusElement.textContent = `Devices found with warning: ${result.warning}`;
        statusElement.className = 'status-warning';
      }
    }
    
    // IMPORTANT: Update the device select dropdown directly
    if (deviceSelect) {
      // Log the device select element state
      debugLog(`Device select element found: ${deviceSelect.id}, current options: ${deviceSelect.options.length}`);
      
      // Clear the dropdown options but keep the placeholder
      while (deviceSelect.options.length > 1) {
        deviceSelect.remove(1);
      }
      
      const devices = result.devices || [];
      debugLog(`Found ${devices.length} device(s), updating dropdown`);
      
      // Update status message for successful device detection
      if (devices.length > 0 && statusElement && !result.error && !result.warning) {
        statusElement.textContent = `Found ${devices.length} connected device(s)`;
        statusElement.className = 'status-success';
      }
      
      if (devices.length === 0) {
        if (statusElement) {
          statusElement.textContent = 'No devices connected. Please connect your Android device via USB.';
          statusElement.className = 'status-warning';
        }
        return;
      }
      
      // Add each device to the dropdown
      devices.forEach(device => {
        debugLog(`Adding device to dropdown: ${device.id} (${device.type})`);
        
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = `${device.id} (${device.type})`;
        deviceSelect.appendChild(option);
      });
      
      // If devices were found, select the first one by default if none is selected
      if (devices.length > 0 && (!state.selectedDevice || deviceSelect.value === "")) {
        debugLog(`Selecting first device: ${devices[0].id}`);
        deviceSelect.value = devices[0].id;
        deviceSelect.dispatchEvent(new Event('change'));
      }
    } else {
      debugLog('ERROR: Device select element not found!');
    }
  } catch (error) {
    debugLog(`Failed to refresh devices: ${error.message}`);
    console.error('Error refreshing devices:', error);
  }
}

/**
 * Device selection change handler
 * Updates the selected device and loads Android files
 */
deviceSelect.addEventListener('change', async (e) => {
  console.log('Device selection changed:', e.target.value);
  state.selectedDevice = e.target.value;
  
  if (state.selectedDevice) {
    setStatus(`Selected device: ${state.selectedDevice}`);
    await loadAndroidFiles();
  } else {
    setStatus('No device selected');
    androidFilesList.innerHTML = '<div class="placeholder">Select a device to view files</div>';
  }
});

/**
 * Local back button click handler
 * Navigates up one level in the local file system
 */
localBackBtn.addEventListener('click', async (e) => {
  console.log('Local back button clicked');
  state.localPath = localFS.navigateUp(state.localPath);
  localPathInput.value = state.localPath;
  await loadLocalFiles();
  clearSelections();
});

/**
 * Android back button click handler
 * Navigates up one level in the Android file system
 */
androidBackBtn.addEventListener('click', async (e) => {
  console.log('Android back button clicked');
  
  // Get the parent directory path for Android (using / as separator)
  const parts = state.androidPath.split('/').filter(Boolean);
  if (parts.length > 0) {
    parts.pop();
    state.androidPath = parts.length > 0 ? '/' + parts.join('/') : '/sdcard';
  } else {
    state.androidPath = '/sdcard';
  }
  
  androidPathInput.value = state.androidPath;
  await loadAndroidFiles();
  clearSelections();
});

/**
 * Local path input enter key handler
 * Navigates to the entered path in the local file system
 */
localPathInput.addEventListener('keyup', async (e) => {
  if (e.key === 'Enter') {
    console.log('Local path enter pressed:', e.target.value);
    const newPath = e.target.value.trim();
    
    if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
      state.localPath = newPath;
      await loadLocalFiles();
    } else {
      setStatus(`Invalid path: ${newPath}`);
      e.target.value = state.localPath;
    }
  }
});

/**
 * Local go button click handler
 * Navigates to the entered path in the local file system
 */
localGoBtn.addEventListener('click', async (e) => {
  console.log('Local go button clicked');
  const newPath = localPathInput.value.trim();
  
  if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
    state.localPath = newPath;
    await loadLocalFiles();
  } else {
    setStatus(`Invalid path: ${newPath}`);
    localPathInput.value = state.localPath;
  }
});

/**
 * Android path input enter key handler
 * Navigates to the entered path in the Android file system
 */
androidPathInput.addEventListener('keyup', async (e) => {
  if (e.key === 'Enter') {
    console.log('Android path enter pressed:', e.target.value);
    
    if (!state.selectedDevice) {
      setStatus('No device selected');
      return;
    }
    
    const newPath = e.target.value.trim();
    state.androidPath = newPath;
    await loadAndroidFiles();
  }
});

/**
 * Android go button click handler
 * Navigates to the entered path in the Android file system
 */
androidGoBtn.addEventListener('click', (e) => {
  console.log('Android go button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected');
    return;
  }
  
  const newPath = androidPathInput.value.trim();
  state.androidPath = newPath;
  loadAndroidFiles();
});

/**
 * Transfer to Android button click handler
 * Transfers selected local files/folders to the Android device
 */
transferToAndroidBtn.addEventListener('click', async (e) => {
  console.log('Transfer to Android button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected', 'error');
    return;
  }
  
  if (state.localSelectedItems.size === 0) {
    setStatus('No items selected for transfer', 'warning');
    hideProgressBar();
    return;
  }
  
  if (state.isTransferring) {
    setStatus('Transfer already in progress', 'error');
    return;
  }
  
  state.isTransferring = true;
  setStatus('Preparing transfer to Android...');
  
  try {
    let successCount = 0;
    let errorCount = 0;
    let total = state.localSelectedItems.size;
    let current = 0;
    
    for (const itemName of state.localSelectedItems) {
      current++;
      try {
        // Try to safely get the local file path
        const localItemPath = path.join(state.localPath, itemName);
        
        // Safely check if file exists and is directory
        let isDirectory = false;
        try {
          if (fs.existsSync(localItemPath)) {
            const stats = fs.statSync(localItemPath);
            isDirectory = stats.isDirectory();
          } else {
            console.error(`Local item does not exist: ${localItemPath}`);
            errorCount++;
            continue;
          }
        } catch (statErr) {
          console.error(`Error checking file stats: ${statErr.message}`, statErr);
          errorCount++;
          continue;
        }
        
        // Construct the Android target path - sanitize to ensure valid path
        const sanitizedItemName = itemName.replace(/[\\/|:&><"?*]/g, '_');
        const androidTargetPath = `${state.androidPath}/${sanitizedItemName}`.replace(/\/+/g, '/');
        
        setStatus(`Transferring (${current}/${total}): ${itemName}`);
        updateProgressBar(Math.floor((current - 1) / total * 100), `${current}/${total}`);
        
        if (isDirectory) {
          console.log('Transferring directory to Android:', localItemPath, 'to', androidTargetPath);
          const folderResult = await transferOps.transferLocalFolderToAndroid(
            state.selectedDevice, 
            localItemPath, 
            androidTargetPath, 
            setStatus
          );
          
          successCount += folderResult.success;
          errorCount += folderResult.errors;
        } else {
          console.log('Transferring file to Android:', localItemPath, 'to', androidTargetPath);
          const success = await transferOps.transferLocalFileToAndroid(
            state.selectedDevice, 
            localItemPath, 
            androidTargetPath, 
            setStatus
          );
          
          if (success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
      } catch (itemErr) {
        console.error(`Error processing item for transfer: ${itemName}`, itemErr);
        errorCount++;
      }
      
      updateProgressBar(Math.floor(current / total * 100), `${current}/${total}`);
    }
    
    updateProgressBar(100, 'Complete');
    setStatus(`Transfer complete. Success: ${successCount}, Errors: ${errorCount}`);
    hideProgressBar();
    
    // Force a small delay to ensure file system has completed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Directly refresh both views like the Go button does
    await loadLocalFiles();
    await loadAndroidFiles();
    setStatus('Transfer completed - Files refreshed', 'success');
    hideProgressBar();
  } catch (err) {
    console.error('Error during transfer to Android:', err);
    setStatus(`Transfer error: ${err.message}`);
    
    // Still try to refresh the views in case of error
    await loadLocalFiles();
    await loadAndroidFiles();
    hideProgressBar();
  } finally {
    state.isTransferring = false;
    clearSelections();
    hideProgressBar();
  }
});

/**
 * Transfer to Local button click handler
 * Transfers selected Android files/folders to the local file system
 */
transferToLocalBtn.addEventListener('click', async (e) => {
  console.log('Transfer to Local button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected');
    return;
  }
  
  if (state.androidSelectedItems.size === 0) {
    setStatus('No items selected for transfer');
    return;
  }
  
  if (state.isTransferring) {
    setStatus('Transfer already in progress');
    return;
  }
  
  state.isTransferring = true;
  setStatus('Preparing transfer to local...');
  
  try {
    let successCount = 0;
    let errorCount = 0;
    let total = state.androidSelectedItems.size;
    let current = 0;
    
    for (const itemName of state.androidSelectedItems) {
      current++;
      try {
        // For Android paths, we need to use forward slashes
        const androidItemPath = path.join(state.androidPath, itemName).replace(/\\/g, '/');
        
        // Sanitize the local path to avoid invalid characters
        const sanitizedItemName = itemName.replace(/[\\/:*?"<>|]/g, '_');
        const localTargetPath = path.join(state.localPath, sanitizedItemName);
        
        // Check if this is a directory in the Android file system
        const isDirectory = (() => {
          try {
            // Escape special characters in itemName for use in CSS selector
            const escapedName = itemName.replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
            // Use a more specific and reliable selector
            const item = document.querySelector(`#android-files .file-item[data-name="${escapedName}"]`);
            
            // Add more careful null checking
            if (item && item.dataset && typeof item.dataset.isDir === 'string') {
              return item.dataset.isDir === 'true';
            }
            
            // If we can't determine from DOM, make a guess based on lack of file extension
            if (!item) {
              console.log(`Warning: Could not find element for ${itemName}, guessing if directory`);
              // If no extension, assume it's a directory
              return !itemName.includes('.');
            }
          } catch (selectorErr) {
            console.error(`Error with selector: ${selectorErr.message}`, selectorErr);
          }
          
          return false;
        })();
        
        setStatus(`Transferring (${current}/${total}): ${itemName}`);
        updateProgressBar(Math.floor((current - 1) / total * 100), `${current}/${total}`);
        
        if (isDirectory) {
          console.log('Transferring directory from Android:', androidItemPath, 'to', localTargetPath);
          const folderResult = await transferOps.transferAndroidFolderToLocal(
            state.selectedDevice, 
            androidItemPath, 
            localTargetPath, 
            setStatus
          );
          
          successCount += folderResult.success;
          errorCount += folderResult.errors;
        } else {
          console.log('Transferring file from Android:', androidItemPath, 'to', localTargetPath);
          const success = await transferOps.transferAndroidFileToLocal(
            state.selectedDevice, 
            androidItemPath, 
            localTargetPath, 
            setStatus
          );
          
          if (success) {
            successCount++;
          } else {
            errorCount++;
          }
        }
      } catch (itemErr) {
        console.error(`Error processing item for transfer: ${itemName}`, itemErr);
        errorCount++;
      }
      
      updateProgressBar(Math.floor(current / total * 100), `${current}/${total}`);
    }
    
    updateProgressBar(100, 'Complete');
    setStatus(`Transfer complete. Success: ${successCount}, Errors: ${errorCount}`);
    
    // Force a small delay to ensure file system has completed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Directly refresh both views like the Go button does
    await loadLocalFiles();
    await loadAndroidFiles();
    setStatus('Transfer completed - Files refreshed', 'success');
    hideProgressBar();
  } catch (err) {
    console.error('Error during transfer to local:', err);
    setStatus(`Transfer error: ${err.message}`);
    
    // Still try to refresh the views in case of error
    await loadLocalFiles();
    await loadAndroidFiles();
    hideProgressBar();
  } finally {
    state.isTransferring = false;
    clearSelections();
  }
});

/**
 * Swap sides button click handler
 * Swaps the position of the local and Android file explorers
 */
swapSidesBtn.addEventListener('click', (e) => {
  console.log('Swap sides button clicked');
  
  const localPanel = document.getElementById('local-explorer');
  const androidPanel = document.getElementById('android-explorer');
  
  if (!localPanel || !androidPanel) {
    console.error('Could not find the file explorer panels');
    setStatus('Error: Could not swap panels');
    return;
  }
  
  const container = document.querySelector('.file-explorer-container');
  const transferControls = document.querySelector('.transfer-controls');
  
  // Toggle the swapped state
  state.isSwapped = !state.isSwapped;
  
  if (state.isSwapped) {
    // Move Android panel before local panel
    container.insertBefore(androidPanel, localPanel);
    // Make sure transfer controls stay in the middle
    container.insertBefore(transferControls, localPanel);
    
    // Update UI to reflect the swap
    document.body.classList.add('swapped');
    
    // Update transfer button directions
    const toAndroidBtn = document.getElementById('transfer-to-android');
    const toLocalBtn = document.getElementById('transfer-to-local');
    if (toAndroidBtn) toAndroidBtn.innerHTML = '←';
    if (toLocalBtn) toLocalBtn.innerHTML = '→';
  } else {
    // Restore original order
    container.insertBefore(localPanel, androidPanel);
    container.insertBefore(transferControls, androidPanel);
    
    // Update UI to reflect the original order
    document.body.classList.remove('swapped');
    
    // Restore transfer button directions
    const toAndroidBtn = document.getElementById('transfer-to-android');
    const toLocalBtn = document.getElementById('transfer-to-local');
    if (toAndroidBtn) toAndroidBtn.innerHTML = '→';
    if (toLocalBtn) toLocalBtn.innerHTML = '←';
  }
  
  console.log(`Panels ${state.isSwapped ? 'swapped' : 'restored'}`);
  setStatus(`Panel positions ${state.isSwapped ? 'swapped' : 'restored'}`);
});

/**
 * Local new folder button click handler
 * Creates a new folder in the local file system
 */
localNewFolderBtn.addEventListener('click', async (e) => {
  console.log('Local new folder button clicked');
  
  const success = await uiOps.createNewFolder(
    state.localPath, 
    false, 
    null, 
    loadLocalFiles, 
    null
  );
  
  if (success) {
    setStatus('Local folder created');
  }
});

/**
 * Android new folder button click handler
 * Creates a new folder in the Android file system
 */
androidNewFolderBtn.addEventListener('click', async (e) => {
  console.log('Android new folder button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected');
    return;
  }
  
  const success = await uiOps.createNewFolder(
    state.androidPath, 
    true, 
    state.selectedDevice, 
    loadAndroidFiles, 
    deviceMgmt.createAndroidDirectory
  );
  
  if (success) {
    setStatus('Android folder created');
  }
});

/**
 * Local rename button click handler
 * Renames selected local file/folder
 */
localRenameBtn.addEventListener('click', async (e) => {
  console.log('Local rename button clicked');
  
  if (state.localSelectedItems.size === 0) {
    setStatus('No item selected for renaming', 'warning');
    return;
  }
  
  if (state.localSelectedItems.size > 1) {
    setStatus('Please select only one item to rename', 'warning');
    return;
  }
  
  const itemName = Array.from(state.localSelectedItems)[0];
  const result = await uiOps.renameItem(itemName, state.localPath, false);
  
  if (result) {
    await performLocalRename(result.oldName, result.newName, state.localPath);
  }
});

/**
 * Android rename button click handler
 * Renames selected Android file/folder
 */
androidRenameBtn.addEventListener('click', async (e) => {
  console.log('Android rename button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected');
    return;
  }
  
  if (state.androidSelectedItems.size === 0) {
    setStatus('No item selected for renaming', 'warning');
    return;
  }
  
  if (state.androidSelectedItems.size > 1) {
    setStatus('Please select only one item to rename', 'warning');
    return;
  }
  
  const itemName = Array.from(state.androidSelectedItems)[0];
  const result = await uiOps.renameItem(itemName, state.androidPath, true);
  
  if (result) {
    await performAndroidRename(result.oldName, result.newName, state.androidPath);
  }
});

/**
 * Perform local file/folder rename
 * @param {string} oldName - Current name
 * @param {string} newName - New name
 * @param {string} currentPath - Current path
 */
async function performLocalRename(oldName, newName, currentPath) {
  const oldPath = path.join(currentPath, oldName);
  const newPath = path.join(currentPath, newName);
  
  setStatus(`Renaming "${oldName}" to "${newName}"...`);
  
  // Check if new name already exists
  if (fs.existsSync(newPath)) {
    throw new Error('An item with this name already exists');
  }
  
  // Perform rename
  fs.renameSync(oldPath, newPath);
  
  setStatus(`Renamed "${oldName}" to "${newName}"`, 'success');
  debugLog(`Renamed ${oldPath} to ${newPath}`);
  
  // Clear selections
  clearSelections();
  
  // Force a small delay to ensure file system has completed to operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Refresh file list with a fresh read
  await loadLocalFiles();
  
  setStatus(`Renamed "${oldName}" to "${newName}" - Files refreshed`, 'success');
}

/**
 * Perform Android file/folder rename
 * @param {string} oldName - Current name
 * @param {string} newName - New name
 * @param {string} currentPath - Current path
 */
async function performAndroidRename(oldName, newName, currentPath) {
  if (!state.selectedDevice) {
    throw new Error('No device selected');
  }
  
  const oldPath = path.join(currentPath, oldName).replace(/\\/g, '/');
  const newPath = path.join(currentPath, newName).replace(/\\/g, '/');
  
  setStatus(`Renaming "${oldName}" to "${newName}"...`);
  
  try {
    // Use ADB to rename to file/folder
    const result = await ipcRenderer.invoke('rename-android-item', {
      deviceId: state.selectedDevice,
      oldPath: oldPath,
      newPath: newPath
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to rename item');
    }
    
    setStatus(`Renamed "${oldName}" to "${newName}"`, 'success');
    debugLog(`Renamed Android ${oldPath} to ${newPath}`);
    
    // Clear selections
    clearSelections();
    
    // Force a small delay to ensure ADB has completed to operation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Refresh file list with a fresh read
    await loadAndroidFiles();
    
    setStatus(`Renamed "${oldName}" to "${newName}" - Files refreshed`, 'success');
  } catch (err) {
    console.error('Error renaming Android item:', err);
    throw new Error(err.message || 'Failed to rename item');
  }
}

/**
 * Local delete button click handler
 * Deletes selected items from the local file system
 */
androidRenameBtn.addEventListener('click', async (e) => {
  console.log('Android rename button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected');
    return;
  }
  
  if (state.androidSelectedItems.size === 0) {
    setStatus('No item selected for renaming', 'warning');
    return;
  }
  
  if (state.androidSelectedItems.size > 1) {
    setStatus('Please select only one item to rename', 'warning');
    return;
  }
  
  const itemName = Array.from(state.androidSelectedItems)[0];
  showRenameDialog(itemName, state.androidPath, true);
});

/**
 * Show rename dialog
 * @param {string} itemName - Current name of the item
 * @param {string} currentPath - Current path of the item
 * @param {boolean} isAndroid - Whether this is an Android item
 */
function showRenameDialog(itemName, currentPath, isAndroid) {
  const renameModal = document.getElementById('rename-modal-container');
  const renameInput = document.getElementById('rename-input');
  const renamePathDisplay = document.getElementById('rename-path-display');
  const renameError = document.getElementById('rename-error');
  
  // Set up the dialog
  renamePathDisplay.textContent = `${isAndroid ? 'Android' : 'Local'}: ${path.join(currentPath, itemName)}`;
  renameInput.value = itemName;
  renameError.textContent = '';
  renameError.style.display = 'none';
  
  // Show the modal
  renameModal.style.display = 'flex';
  renameInput.focus();
  renameInput.select();
  
  // Remove old event listeners
  const newConfirmBtn = document.getElementById('rename-confirm');
  const newConfirm = newConfirmBtn.cloneNode(true);
  newConfirmBtn.parentNode.replaceChild(newConfirm, newConfirmBtn);
  
  const newCancelBtn = document.getElementById('rename-cancel');
  const newCancel = newCancelBtn.cloneNode(true);
  newCancelBtn.parentNode.replaceChild(newCancel, newCancelBtn);
  
  // Add new event listeners
  newConfirm.addEventListener('click', async () => {
    const newName = renameInput.value.trim();
    
    if (!newName) {
      renameError.textContent = 'Name cannot be empty';
      renameError.style.display = 'block';
      return;
    }
    
    if (newName === itemName) {
      renameError.textContent = 'New name must be different from current name';
      renameError.style.display = 'block';
      return;
    }
    
    try {
      if (isAndroid) {
        await performAndroidRename(itemName, newName, currentPath);
      } else {
        await performLocalRename(itemName, newName, currentPath);
      }
      
      // Hide the modal
      renameModal.style.display = 'none';
    } catch (err) {
      renameError.textContent = `Error: ${err.message}`;
      renameError.style.display = 'block';
    }
  });
  
  newCancel.addEventListener('click', () => {
    renameModal.style.display = 'none';
  });
  
  // Handle Enter key
  renameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      newConfirm.click();
    }
  });
  
  // Handle Escape key
  renameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      newCancel.click();
    }
  });
}

/**
 * Perform local file/folder rename
 * @param {string} oldName - Current name
 * @param {string} newName - New name
 * @param {string} currentPath - Current path
 */
async function performLocalRename(oldName, newName, currentPath) {
  const oldPath = path.join(currentPath, oldName);
  const newPath = path.join(currentPath, newName);
  
  setStatus(`Renaming "${oldName}" to "${newName}"...`);
  
  // Check if new name already exists
  if (fs.existsSync(newPath)) {
    throw new Error('An item with this name already exists');
  }
  
  // Perform the rename
  fs.renameSync(oldPath, newPath);
  
  setStatus(`Renamed "${oldName}" to "${newName}"`, 'success');
  debugLog(`Renamed ${oldPath} to ${newPath}`);
  
  // Clear selections
  clearSelections();
  
  // Force a small delay to ensure file system has completed the operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Refresh the file list with a fresh read
  await loadLocalFiles();
  
  setStatus(`Renamed "${oldName}" to "${newName}" - Files refreshed`, 'success');
}

/**
 * Perform Android file/folder rename
 * @param {string} oldName - Current name
 * @param {string} newName - New name
 * @param {string} currentPath - Current path
 */
async function performAndroidRename(oldName, newName, currentPath) {
  if (!state.selectedDevice) {
    throw new Error('No device selected');
  }
  
  const oldPath = path.join(currentPath, oldName).replace(/\\/g, '/');
  const newPath = path.join(currentPath, newName).replace(/\\/g, '/');
  
  setStatus(`Renaming "${oldName}" to "${newName}"...`);
  
  try {
    // Use ADB to rename the file/folder
    const result = await ipcRenderer.invoke('rename-android-item', {
      deviceId: state.selectedDevice,
      oldPath: oldPath,
      newPath: newPath
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to rename item');
    }
    
    setStatus(`Renamed "${oldName}" to "${newName}"`, 'success');
    debugLog(`Renamed Android ${oldPath} to ${newPath}`);
    
    // Clear selections
    clearSelections();
    
    // Force a small delay to ensure ADB has completed the operation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Refresh the file list with a fresh read
    await loadAndroidFiles();
    
    setStatus(`Renamed "${oldName}" to "${newName}" - Files refreshed`, 'success');
  } catch (err) {
    console.error('Error renaming Android item:', err);
    throw new Error(err.message || 'Failed to rename item');
  }
}

/**
 * Local delete button click handler
 * Deletes selected items from the local file system
 */
localDeleteBtn.addEventListener('click', async (e) => {
  console.log('Local delete button clicked');
  
  if (state.localSelectedItems.size === 0) {
    setStatus('No items selected for deletion');
    return;
  }
  
  if (!uiOps.showConfirmationDialog(`Delete ${state.localSelectedItems.size} selected item(s)?`)) {
    return;
  }
  
  setStatus(`Deleting ${state.localSelectedItems.size} local item(s)...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const itemName of state.localSelectedItems) {
    const itemPath = path.join(state.localPath, itemName);
    const isDirectory = fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory();
    
    try {
      await localFS.deleteLocalItem(itemPath, isDirectory);
      successCount++;
      console.log(`Deleted local ${isDirectory ? 'directory' : 'file'}: ${itemPath}`);
    } catch (err) {
      errorCount++;
      console.error(`Error deleting local item: ${itemPath}`, err);
    }
  }
  
  // Clear the selections
  clearSelections();
  
  // Provide feedback
  setStatus(`Deleted ${successCount} item(s). Errors: ${errorCount}.`);
  
  // Force a small delay to ensure file system has completed the deletions
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Directly call loadLocalFiles for immediate refresh
  await loadLocalFiles();
  setStatus('Local files refreshed', 'success');
});

/**
 * Android delete button click handler
 * Deletes selected items from the Android file system
 */
androidDeleteBtn.addEventListener('click', async (e) => {
  console.log('Android delete button clicked');
  
  if (!state.selectedDevice) {
    setStatus('No device selected');
    return;
  }
  
  if (state.androidSelectedItems.size === 0) {
    setStatus('No items selected for deletion');
    return;
  }
  
  if (!uiOps.showConfirmationDialog(`Delete ${state.androidSelectedItems.size} selected item(s)?`)) {
    return;
  }
  
  setStatus(`Deleting ${state.androidSelectedItems.size} Android item(s)...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const itemName of state.androidSelectedItems) {
    // For Android paths, we need to ensure forward slashes
    const itemPath = path.join(state.androidPath, itemName).replace(/\\/g, '/');
    
    // Check if this is a directory in the Android file system
    const isDirectory = (() => {
      try {
        // Escape special characters in itemName for use in CSS selector
        const escapedName = itemName.replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
        // Use a more specific and reliable selector
        const item = document.querySelector(`#android-files .file-item[data-name="${escapedName}"]`);
        
        // Add more careful null checking
        if (item && item.dataset && typeof item.dataset.isDir === 'string') {
          return item.dataset.isDir === 'true';
        }
        
        // If we can't determine from DOM, make a guess based on lack of file extension
        if (!item) {
          console.log(`Warning: Could not find element for ${itemName}, guessing if directory`);
          // If no extension, assume it's a directory
          return !itemName.includes('.');
        }
      } catch (selectorErr) {
        console.error(`Error with selector: ${selectorErr.message}`, selectorErr);
      }
      
      return false;
    })();
    
    try {
      await deviceMgmt.deleteAndroidItem(state.selectedDevice, itemPath, isDirectory);
      successCount++;
      console.log(`Deleted Android ${isDirectory ? 'directory' : 'file'}: ${itemPath}`);
    } catch (err) {
      errorCount++;
      console.error(`Error deleting Android item: ${itemPath}`, err);
    }
  }
  
  // Clear the selections
  clearSelections();
  
  // Provide feedback
  setStatus(`Deleted ${successCount} item(s). Errors: ${errorCount}.`);
  
  // Force a small delay to ensure ADB has completed the deletions
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Directly call loadAndroidFiles for immediate refresh
  await loadAndroidFiles();
  setStatus('Android files refreshed', 'success');
});

// Set up event listeners for buttons
function setupEventListeners() {
  // Create ADB search button
  createSearchAdbButton();
  
  // Create debugging console
  addDebugContainer();
  
  debugLog('Application initialized. Waiting for ADB status...');
}

// Create ADB search button
function createSearchAdbButton() {
  // First check if we already have an ADB tools container
  let adbToolsContainer = document.getElementById('adb-tools-container');
  
  // If not, create a new container for all ADB-related controls
  if (!adbToolsContainer) {
    adbToolsContainer = document.createElement('div');
    adbToolsContainer.id = 'adb-tools-container';
    adbToolsContainer.className = 'adb-tools-container';
    
    // Create a header for the ADB tools section
    const toolsHeader = document.createElement('h3');
    toolsHeader.textContent = 'ADB Tools';
    toolsHeader.className = 'tools-header';
    adbToolsContainer.appendChild(toolsHeader);
    
    // Insert the container in a better location - inside the file preview section
    const filePreview = document.querySelector('.file-preview') || document.querySelector('.android');
    if (filePreview) {
      // If file preview exists, add it there
      filePreview.appendChild(adbToolsContainer);
    } else {
      // Fallback to adding after status message
      const statusElement = document.getElementById('status-message');
      if (statusElement && statusElement.parentNode) {
        statusElement.parentNode.appendChild(adbToolsContainer);
      }
    }
  }
  
  // Create a specific container for search controls
  const searchContainer = document.createElement('div');
  searchContainer.id = 'search-adb-container';
  searchContainer.className = 'adb-button-group';
  
  // Create search button
  const searchButton = document.createElement('button');
  searchButton.id = 'search-adb';
  searchButton.textContent = 'Auto-detect ADB';
  searchButton.title = 'Automatically search common locations for ADB';
  searchButton.className = 'action-button';
  
  // Create browse button
  const browseButton = document.createElement('button');
  browseButton.id = 'browse-adb';
  browseButton.textContent = 'Browse for ADB';
  browseButton.title = 'Manually select ADB executable';
  browseButton.className = 'action-button';
  
  // Add click event listeners
  searchButton.addEventListener('click', searchForAdb);
  browseButton.addEventListener('click', browseForAdb);
  
  // Add the buttons to the search container
  searchContainer.appendChild(searchButton);
  searchContainer.appendChild(browseButton);
  
  // Add search container to the main ADB tools container
  adbToolsContainer.appendChild(searchContainer);
  
  // Return the search button for reference elsewhere
  return searchButton;
}

// Search for ADB automatically
function searchForAdb() {
  debugLog('Searching for ADB...');
  const statusElement = document.getElementById('status-message');
  if (statusElement) {
    statusElement.textContent = 'Searching for ADB...';
    statusElement.className = 'status-message';
  }
  
  ipcRenderer.invoke('search-adb').then(result => {
    if (result.success) {
      debugLog(`ADB found automatically: ${result.path}`);
    } else {
      debugLog('ADB not found automatically');
      if (statusElement) {
        statusElement.textContent = 'ADB not found automatically. Try browsing for it instead.';
        statusElement.className = 'status-warning';
      }
    }
  }).catch(err => {
    debugLog(`Error searching for ADB: ${err.message}`);
    if (statusElement) {
      statusElement.textContent = `Error searching for ADB: ${err.message}`;
      statusElement.className = 'status-error';
    }
  });
}

// Browse for ADB manually
function browseForAdb() {
  debugLog('Opening file browser to locate ADB...');
  const statusElement = document.getElementById('status-message');
  if (statusElement) {
    statusElement.textContent = 'Please select the ADB executable...';
    statusElement.className = 'status-message';
  }
  
  ipcRenderer.invoke('browse-adb').then(result => {
    if (result.success) {
      debugLog(`ADB selected manually: ${result.path}`);
    } else {
      debugLog('No ADB file selected');
      if (statusElement) {
        statusElement.textContent = 'No ADB file selected.';
        statusElement.className = 'status-warning';
      }
    }
  }).catch(err => {
    debugLog(`Error selecting ADB: ${err.message}`);
    if (statusElement) {
      statusElement.textContent = `Error selecting ADB: ${err.message}`;
      statusElement.className = 'status-error';
    }
  });
}

// Add dedicated refresh functions
async function refreshLocalFiles() {
  clearSelectedItems();
  console.log('Directly calling loadLocalFiles for refresh');
  debugLog('Refreshing local files using direct loadLocalFiles call');
  setStatus('Refreshing local files...');
  
  // Force a small delay to ensure any pending file system operations complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Call loadLocalFiles directly, just like the Go button does (await to ensure refresh completes)
  await loadLocalFiles();
  
  setStatus('Local files refreshed');
}

async function refreshAndroidFiles() {
  clearSelectedItems();
  
  if (!state.selectedDevice) {
    setStatus('No device selected. Please select a device first.');
    return;
  }
  
  console.log('Directly calling loadAndroidFiles for refresh');
  debugLog('Refreshing Android files using direct loadAndroidFiles call');
  setStatus('Refreshing Android files...');
  
  // Force a small delay to ensure any pending ADB operations complete
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Call loadAndroidFiles directly, just like the Go button does (await to ensure refresh completes)
  await loadAndroidFiles();
  
  setStatus('Android files refreshed');
} 