/**
 * fileSystem.js
 * Handles file system operations, directory navigation, and file listing
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const uiOps = require('./uiOperations');

// File type definitions for media file handling
const FILE_TYPES = {
  IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
  AUDIO: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
  VIDEO: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'm4v', '3gp']
};

/**
 * Gets the appropriate icon for a file based on its type
 * 
 * @param {string} fileType - Type of file (image, audio, video, etc.)
 * @returns {string} - Icon representation
 */
function getFileIcon(fileType) {
  switch (fileType) {
    case 'image':
      return '🖼️';
    case 'audio':
      return '🎵';
    case 'video':
      return '🎬';
    default:
      return '📄';
  }
}

/**
 * Determines the file type based on extension
 * 
 * @param {string} filename - Name of the file
 * @returns {string|null} - Type of file or null if not a recognized type
 */
function getFileType(filename) {
  // Extract the extension and convert to lowercase
  const ext = filename.split('.').pop().toLowerCase();
  
  if (FILE_TYPES.IMAGE.includes(ext)) return 'image';
  if (FILE_TYPES.AUDIO.includes(ext)) return 'audio';
  if (FILE_TYPES.VIDEO.includes(ext)) return 'video';
  
  return null;
}

/**
 * Formats file size to human readable format
 * 
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size (e.g., "1.5 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Normalizes file paths to work on both Windows and macOS
 * 
 * @param {string} filePath - Path to normalize
 * @returns {string} - Normalized path
 */
function normalizePath(filePath) {
  // Replace backslashes with forward slashes for consistency across platforms
  let normalizedPath = filePath.replace(/\\/g, '/');
  
  // For Windows drives like C:/, ensure they are properly formatted
  if (process.platform === 'win32' && /^[A-Z]:/i.test(normalizedPath)) {
    // Format drive letters consistently
    const driveLetter = normalizedPath.charAt(0).toUpperCase();
    normalizedPath = `${driveLetter}:${normalizedPath.slice(2)}`;
    
    // Ensure trailing slash for root drives
    if (normalizedPath.length === 2 && normalizedPath.endsWith(':')) {
      normalizedPath += '/';
    } else if (normalizedPath.length === 3 && normalizedPath.endsWith(':\\')) {
      normalizedPath = normalizedPath.replace('\\', '/');
    }
  }
  
  return normalizedPath;
}

/**
 * Adapts path handling to the current operating system
 * 
 * @param {string} inputPath - Path to adapt
 * @param {boolean} isLocalPath - Whether this is a local path (vs Android path)
 * @returns {string} - OS-appropriate path
 */
function adaptPathToOS(inputPath, isLocalPath) {
  if (!isLocalPath) {
    // Android paths always use forward slashes regardless of host OS
    return inputPath.replace(/\\/g, '/');
  }
  
  if (process.platform === 'win32' && isLocalPath) {
    // Use proper Windows path separators for display in the UI
    // But revert to using backslashes for Windows file operations
    return path.normalize(inputPath);
  }
  
  // For macOS and other Unix-like systems, use forward slashes
  return inputPath.replace(/\\/g, '/');
}

/**
 * Loads files from the local file system
 * 
 * @param {Object} state - Application state
 * @param {HTMLElement} localFilesList - DOM element to render files
 * @param {Function} renderFileList - Function to render files
 * @param {Function} setStatus - Function to set status
 */
async function loadLocalFiles(state, localFilesList, renderFileList, setStatus, pullAndroidFileToTemp, viewFile) {
  localFilesList.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    const files = await fs.promises.readdir(state.localPath, { withFileTypes: true });
    renderFileList(files, localFilesList, true, state, setStatus, pullAndroidFileToTemp, viewFile);
  } catch (err) {
    console.error('Error loading local files:', err);
    localFilesList.innerHTML = `<div class="error">Error: ${err.message}</div>`;
    setStatus(`Error loading local files: ${err.message}`);
  }
}

/**
 * Loads files from the Android device
 * 
 * @param {Object} state - Application state
 * @param {HTMLElement} androidFilesList - DOM element to render files
 * @param {HTMLElement} androidPathInput - DOM element for path input
 * @param {Function} renderFileList - Function to render files
 * @param {Function} setStatus - Function to set status
 */
async function loadAndroidFiles(state, androidFilesList, androidPathInput, renderFileList, setStatus, pullAndroidFileToTemp, viewFile) {
  if (!state.selectedDevice) {
    androidFilesList.innerHTML = '<div class="placeholder">No device selected</div>';
    return;
  }
  
  androidFilesList.innerHTML = '<div class="loading">Loading files from Android device...</div>';
  androidPathInput.value = state.androidPath;
  
  try {
    console.log('Requesting Android files from path:', state.androidPath);
    console.log('Using device ID:', state.selectedDevice);
    
    console.log('About to invoke IPC call list-files with params:', {
      deviceId: state.selectedDevice,
      path: state.androidPath
    });
    
    // Add a timestamp to force a fresh request
    const timestamp = Date.now();
    const files = await ipcRenderer.invoke('list-files', {
      deviceId: state.selectedDevice,
      path: state.androidPath,
      noCache: timestamp // This parameter ensures we're not getting cached data
    });
    
    console.log('Received files from Android:', files && files.length ? files.length : 'none');
    
    if (!files || !Array.isArray(files)) {
      throw new Error('Failed to retrieve files or invalid response');
    }
    
    // Make sure we pass all required parameters to renderFileList
    // isLocal = false for Android files
    renderFileList(files, androidFilesList, false, state, setStatus, pullAndroidFileToTemp, viewFile);
    
    // Log file count to console instead of showing in status bar
    console.log(`Loaded ${files.length} items from ${state.androidPath} on ${state.selectedDevice}`);
    
    // Create a status element at the top of the Android files list
    const statusBar = document.createElement('div');
    statusBar.className = 'android-status';
    statusBar.textContent = `Loaded ${files.length} items from ${state.androidPath}`;
    
    // Insert the status bar at the top of the list
    if (androidFilesList.firstChild) {
      androidFilesList.insertBefore(statusBar, androidFilesList.firstChild);
    } else {
      androidFilesList.appendChild(statusBar);
    }
  } catch (err) {
    console.error('Error loading Android files:', err);
    androidFilesList.innerHTML = `<div class="error">Error: ${err.message}</div>`;
    setStatus(`Error loading Android files: ${err.message}`);
  }
}

/**
 * Handle double-click on file items for navigation
 */
async function handleItemDoubleClick(e, item, isLocal, state, renderFileList, setStatus, pullAndroidFileToTemp, viewFile) {
  // Skip handling if view button was clicked
  if (e.target.classList.contains('view-btn')) {
    return;
  }
  
  const name = item.dataset.name;
  const isDir = item.dataset.isDir === 'true';
  
  if (!isDir) {
    return; // Only folders can be navigated into
  }
  
  console.log(`Double-clicked on folder: ${name}, isLocal: ${isLocal}`);
  
  // Clear selections when navigating to a new folder
  if (state.localSelectedItems) state.localSelectedItems.clear();
  if (state.androidSelectedItems) state.androidSelectedItems.clear();
  
  if (isLocal) {
    // Navigate into local folder
    state.localPath = path.join(state.localPath, name);
    console.log(`Navigating to local path: ${state.localPath}`);
    
    // Update path input element if available
    const localPathInput = document.getElementById('local-path');
    if (localPathInput) {
      localPathInput.value = state.localPath;
    }
    
    // Reload files for the new path
    try {
      const localFilesList = document.getElementById('local-files');
      if (localFilesList) {
        await loadLocalFiles(state, localFilesList, renderFileList, setStatus, pullAndroidFileToTemp, viewFile);
        setStatus(`Navigated to: ${state.localPath}`);
      }
    } catch (err) {
      console.error('Error navigating to folder:', err);
      setStatus(`Error navigating to folder: ${err.message}`);
    }
  } else {
    // Navigate into Android folder
    const newPath = path.join(state.androidPath, name).replace(/\\/g, '/');
    state.androidPath = newPath;
    console.log(`Navigating to Android path: ${state.androidPath}`);
    
    // Update path input element if available
    const androidPathInput = document.getElementById('android-path');
    if (androidPathInput) {
      androidPathInput.value = state.androidPath;
    }
    
    // Reload files for the new path
    try {
      const androidFilesList = document.getElementById('android-files');
      const androidPathInput = document.getElementById('android-path');
      if (androidFilesList && androidPathInput) {
        await loadAndroidFiles(state, androidFilesList, androidPathInput, renderFileList, setStatus, pullAndroidFileToTemp, viewFile);
        setStatus(`Navigated to: ${state.androidPath}`);
      }
    } catch (err) {
      console.error('Error navigating to Android folder:', err);
      setStatus(`Error navigating to Android folder: ${err.message}`);
    }
  }
}

/**
 * Renders a list of files in the specified container
 * 
 * @param {Array} items - Array of file items to render
 * @param {HTMLElement} container - DOM element to render the file list into
 * @param {boolean} isLocal - Flag indicating if this is a local file list
 * @param {Object} state - Application state
 * @param {Function} setStatus - Function to set status message
 * @param {Function} pullAndroidFileToTemp - Function to pull Android files to temp
 * @param {Function} viewFile - Function to view files
 */
function renderFileList(items, container, isLocal, state, setStatus, pullAndroidFileToTemp, viewFile) {
  container.innerHTML = '';
  
  // Ensure selected items collections exist
  if (!state.localSelectedItems) state.localSelectedItems = new Set();
  if (!state.androidSelectedItems) state.androidSelectedItems = new Set();
  
  const selectedItems = isLocal ? state.localSelectedItems : state.androidSelectedItems;
  
  // Sort: directories first, then files, alphabetically
  const sortedItems = [...items].sort((a, b) => {
    // For Android, use mode to check if directory (mode & 0x4000 for directories in Unix)
    const aIsDir = isLocal ? a.isDirectory() : ((a.mode & 0x4000) === 0x4000);
    const bIsDir = isLocal ? b.isDirectory() : ((b.mode & 0x4000) === 0x4000);
    
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    
    const aName = isLocal ? a.name : a.name;
    const bName = isLocal ? b.name : b.name;
    return aName.localeCompare(bName);
  });
  
  // Add a CSS class to the container that marks it as a file list
  container.classList.add('file-list-container');
  
  sortedItems.forEach(item => {
    // For Android, use mode to check if directory (mode & 0x4000 for directories in Unix)
    const isDir = isLocal ? item.isDirectory() : ((item.mode & 0x4000) === 0x4000);
    const name = isLocal ? item.name : item.name;
    const size = isLocal ? (isDir ? '-' : formatFileSize(fs.statSync(path.join(state.localPath, name)).size)) 
                          : (isDir ? '-' : formatFileSize(item.size));
    
    // Check file type
    const fileType = getFileType(name);
    
    const itemElem = document.createElement('div');
    itemElem.className = `file-item ${isDir ? 'folder-item' : 'file-item'} ${selectedItems.has(name) ? 'selected' : ''}`;
    itemElem.dataset.name = name;
    itemElem.dataset.isDir = isDir ? 'true' : 'false'; // Add a data attribute to store directory status
    if (fileType) {
      itemElem.dataset.fileType = fileType;
    }
    
    let viewButton = '';
    if (!isDir && fileType) {
      viewButton = `<button class="view-btn" title="View/Play this file">👁️</button>`;
    }
    
    itemElem.innerHTML = `
      <div class="file-icon">${isDir ? '📁' : getFileIcon(fileType)}</div>
      <div class="file-name">${name}</div>
      <div class="file-size">${size}</div>
      ${viewButton}
    `;
    
    /**
     * Handle click events on file items:
     * - Single-click: Select items (folders or files)
     * - Ctrl/Cmd+click: Toggle selection (multi-select)
     * - Shift+click: Select range of items
     * - Double-click: Navigate into folders
     */
    itemElem.addEventListener('click', (e) => {
      // Skip click handling if view button was clicked
      if (e.target.classList.contains('view-btn')) {
        return;
      }
      
      // Store the name for reference
      const name = itemElem.dataset.name;
      const isDir = itemElem.dataset.isDir === 'true';
      
      // Mark the last clicked item for shift selection
      if (!e.shiftKey) {
        container.dataset.lastClicked = name;
      }
      
      if (e.ctrlKey || e.metaKey) {
        // Toggle selection with Ctrl/Cmd
        if (selectedItems.has(name)) {
          selectedItems.delete(name);
          itemElem.classList.remove('selected');
        } else {
          selectedItems.add(name);
          itemElem.classList.add('selected');
        }
      } else if (e.shiftKey && container.dataset.lastClicked) {
        // Shift+click for range selection
        const lastClicked = container.dataset.lastClicked;
        
        // Find all items between last clicked and current
        const fileItems = Array.from(container.querySelectorAll('.file-item'));
        const startIdx = fileItems.findIndex(item => item.dataset.name === lastClicked);
        const endIdx = fileItems.findIndex(item => item.dataset.name === name);
        
        if (startIdx !== -1 && endIdx !== -1) {
          // Clear current selection
          if (!e.ctrlKey && !e.metaKey) {
            selectedItems.clear();
            fileItems.forEach(item => item.classList.remove('selected'));
          }
          
          // Determine range start and end
          const rangeStart = Math.min(startIdx, endIdx);
          const rangeEnd = Math.max(startIdx, endIdx);
          
          // Select all items in the range
          for (let i = rangeStart; i <= rangeEnd; i++) {
            const rangeItem = fileItems[i];
            selectedItems.add(rangeItem.dataset.name);
            rangeItem.classList.add('selected');
          }
        }
      } else {
        // Single click selection (not navigating into folders anymore)
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          // Clear selection and select this item
          selectedItems.clear();
          container.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('selected');
          });
        }
        
        selectedItems.add(name);
        itemElem.classList.add('selected');
      }
    });

    /**
     * Handle double-click for folder navigation
     */
    itemElem.addEventListener('dblclick', (e) => handleItemDoubleClick(e, itemElem, isLocal, state, renderFileList, setStatus, pullAndroidFileToTemp, viewFile));
    
    /**
     * Handle view button click for media files
     * Opens the file viewer overlay
     */
    if (!isDir && fileType) {
      const viewBtn = itemElem.querySelector('.view-btn');
      if (viewBtn) {
        viewBtn.addEventListener('click', async () => {
          console.log(`View button clicked for ${isLocal ? 'local' : 'Android'} file:`, name);
          if (isLocal) {
            const filePath = path.join(state.localPath, name);
            // Use the directly imported viewFile if available, or the passed one as fallback
            if (typeof viewFile === 'function') {
              viewFile(filePath, name, fileType, true);
            } else if (uiOps && typeof uiOps.viewFile === 'function') {
              uiOps.viewFile(filePath, name, fileType, true);
            } else {
              console.error('viewFile function not available');
            }
          } else {
            // For Android files, we need to pull the file to a temporary location first
            console.log('Pulling Android file for viewing:', name);
            setStatus(`Preparing ${name} for viewing...`);
            
            try {
              const tempFile = await pullAndroidFileToTemp(state.selectedDevice, 
                                                         path.join(state.androidPath, name).replace(/\\/g, '/'),
                                                         name);
              // Use the directly imported viewFile if available, or the passed one as fallback
              if (typeof viewFile === 'function') {
                viewFile(tempFile, name, fileType, false);
              } else if (uiOps && typeof uiOps.viewFile === 'function') {
                uiOps.viewFile(tempFile, name, fileType, false);
              } else {
                console.error('viewFile function not available');
              }
              setStatus(`Viewing: ${name}`);
            } catch (err) {
              console.error('Error preparing file for viewing:', err);
              setStatus(`Error: ${err.message}`);
            }
          }
        });
      }
    }
    
    container.appendChild(itemElem);
  });
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-folder">This folder is empty</div>';
  }
}

// Export functions
module.exports = {
  loadLocalFiles,
  loadAndroidFiles,
  renderFileList,
  getFileIcon,
  getFileType,
  formatFileSize,
  normalizePath,
  adaptPathToOS
}; 