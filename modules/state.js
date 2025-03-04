/**
 * state.js
 * Manages application state and initialization
 */

const os = require('os');
const path = require('path');

/**
 * Application state object containing all the runtime state of the application
 */
const state = {
  selectedDevice: null,        // Currently selected Android device ID
  localPath: os.homedir(),     // Current path in local file system
  androidPath: '/sdcard',      // Current path in Android file system
  localSelectedItems: new Set(),   // Set of selected items in local file explorer
  androidSelectedItems: new Set(), // Set of selected items in Android file explorer
  isTransferring: false,       // Flag indicating if a file transfer is in progress
  isSwapped: false,            // Track whether the UI is in swapped state
  currentViewerElement: null   // Track current viewer element
};

/**
 * Initialize the application state
 * 
 * @param {string} initialLocalPath - Starting path for local file system
 * @param {string} initialAndroidPath - Starting path for Android file system
 */
function initializeApp(initialLocalPath, initialAndroidPath) {
  state.localPath = initialLocalPath || os.homedir();
  state.androidPath = initialAndroidPath || '/sdcard';
}

/**
 * Clear selected items in both file explorers
 */
function clearSelections() {
  state.localSelectedItems.clear();
  state.androidSelectedItems.clear();
  document.querySelectorAll('.file-item.selected').forEach(item => {
    item.classList.remove('selected');
  });
}

/**
 * Update a path according to OS conventions
 * 
 * @param {string} inputPath - Path to normalize
 * @param {boolean} isAndroidPath - Whether this is an Android path
 * @returns {string} - Normalized path for current OS
 */
function normalizePlatformPath(inputPath, isAndroidPath) {
  // Android paths always use forward slashes
  if (isAndroidPath) {
    return inputPath.replace(/\\/g, '/');
  }
  
  // For local paths, use OS-specific format
  return process.platform === 'win32' ? 
    path.normalize(inputPath) : 
    inputPath.replace(/\\/g, '/');
}

// Export state and functions
module.exports = {
  state,
  initializeApp,
  clearSelections,
  normalizePlatformPath
}; 