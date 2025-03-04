/**
 * deviceManagement.js
 * Handles Android device detection and management
 */

const { ipcRenderer } = require('electron');

/**
 * Loads available Android devices
 * 
 * @param {HTMLElement} deviceSelect - Select element to populate with devices
 * @param {Object} state - Application state
 * @param {Function} setStatus - Function to set status
 * @param {Function} loadAndroidFiles - Function to load Android files
 * @returns {Promise<void>} - Promise that resolves when devices are loaded
 */
async function loadDevices(deviceSelect, state, setStatus, loadAndroidFiles) {
  setStatus('Searching for devices...');
  
  try {
    // Clear current device options
    deviceSelect.innerHTML = '<option value="">Select a device</option>';
    
    const devices = await ipcRenderer.invoke('get-devices');
    console.log('Found devices:', devices);
    
    if (devices && devices.length > 0) {
      devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = `${device.id} (${device.type})`;
        deviceSelect.appendChild(option);
      });
      
      setStatus(`Found ${devices.length} device(s)`);
      
      // If only one device is available, select it automatically
      if (devices.length === 1) {
        deviceSelect.value = devices[0].id;
        state.selectedDevice = devices[0].id;
        loadAndroidFiles();
      }
    } else {
      setStatus('No devices found');
    }
  } catch (err) {
    console.error('Error loading devices:', err);
    setStatus(`Error: ${err.message}`);
  }
}

/**
 * Deletes a file or folder on an Android device
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} path - Path to the file or folder on the Android device
 * @param {boolean} isDirectory - Whether the item is a directory
 * @returns {Promise<boolean>} - Promise that resolves to true if deletion was successful
 */
async function deleteAndroidItem(deviceId, path, isDirectory) {
  try {
    console.log(`Deleting Android ${isDirectory ? 'directory' : 'file'}:`, path);
    
    await ipcRenderer.invoke('delete-item', {
      deviceId: deviceId,
      path: path,
      isDirectory: isDirectory
    });
    
    return true;
  } catch (err) {
    console.error('Error deleting Android item:', err);
    throw err;
  }
}

/**
 * Creates a directory on an Android device
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} path - Path to create on the Android device
 * @returns {Promise<boolean>} - Promise that resolves to true if creation was successful
 */
async function createAndroidDirectory(deviceId, path) {
  try {
    console.log('Creating directory on Android:', path);
    
    await ipcRenderer.invoke('create-directory', {
      deviceId: deviceId,
      path: path
    });
    
    return true;
  } catch (err) {
    console.error('Error creating Android directory:', err);
    throw err;
  }
}

/**
 * Opens a shell on an Android device
 * 
 * @param {string} deviceId - Android device ID
 * @param {Function} setStatus - Function to set status message
 * @returns {Promise<void>} - Promise that resolves when shell is opened
 */
async function openAndroidShell(deviceId, setStatus) {
  try {
    console.log('Opening Android shell for device:', deviceId);
    setStatus('Opening Android shell...');
    
    await ipcRenderer.invoke('open-shell', {
      deviceId: deviceId
    });
    
    setStatus('Android shell opened');
  } catch (err) {
    console.error('Error opening Android shell:', err);
    setStatus(`Error opening shell: ${err.message}`);
  }
}

// Export functions
module.exports = {
  loadDevices,
  deleteAndroidItem,
  createAndroidDirectory,
  openAndroidShell
}; 