/**
 * uiOperations.js
 * Handles UI operations like status messages and file viewing
 */

const fs = require('fs');
const path = require('path');

/**
 * Sets the status message in the status bar
 * 
 * @param {string} message - Status message to display
 * @param {HTMLElement} statusBar - Status bar element
 */
function setStatus(message, statusBar) {
  // Always log to console
  console.log('Status:', message);
  
  // Check if the message is a 'Loaded X items' message
  if (message.startsWith('Loaded ') && message.includes(' items from ')) {
    // Don't display these messages in the UI, only log them
    return;
  }
  
  // For other messages, display them in the status bar
  statusBar.textContent = message;
}

/**
 * Shows a confirmation dialog with custom message
 * 
 * @param {string} message - Message to display
 * @returns {boolean} - True if confirmed, false otherwise
 */
function showConfirmationDialog(message) {
  return window.confirm(message);
}

/**
 * View a file in a separate window
 * 
 * @param {string} filePath - Path to the file
 * @param {string} fileName - Name of the file
 * @param {string} fileType - Type of file (image, audio, video)
 * @param {boolean} isLocal - Whether the file is local or from Android
 */
function viewFile(filePath, fileName, fileType, isLocal) {
  console.log('Opening viewer for file:', filePath);
  console.log('File type:', fileType);
  
  // Send the file data to the main process to create a viewer window
  ipcRenderer.invoke('view-file', {
    filePath,
    fileName,
    fileType,
    isLocal
  })
  .then(result => {
    console.log('Viewer window created:', result);
  })
  .catch(error => {
    console.error('Error creating viewer window:', error);
    
    // Fallback to the old in-page viewer if the window creation fails
    showInPageViewer(filePath, fileName, fileType, isLocal);
  });
}

/**
 * Show a file in the page (fallback method)
 * 
 * @param {string} filePath - Path to the file
 * @param {string} fileName - Name of the file
 * @param {string} fileType - Type of file (image, audio, video)
 * @param {boolean} isLocal - Whether the file is local or from Android
 */
function showInPageViewer(filePath, fileName, fileType, isLocal) {
  // Create viewer container if it doesn't exist
  let viewerContainer = document.getElementById('file-viewer');
  if (!viewerContainer) {
    viewerContainer = document.createElement('div');
    viewerContainer.id = 'file-viewer';
    document.body.appendChild(viewerContainer);
  }
  
  // Clear any existing content
  viewerContainer.innerHTML = '';
  
  // Create viewer header with file name and close button
  const viewerHeader = document.createElement('div');
  viewerHeader.className = 'viewer-header';
  viewerHeader.innerHTML = `
    <div class="viewer-title">${fileName}</div>
    <button class="viewer-close-btn">✖</button>
  `;
  
  // Create viewer content based on file type
  const viewerContent = document.createElement('div');
  viewerContent.className = 'viewer-content';
  
  switch (fileType) {
    case 'image':
      // For images, create an img element
      viewerContent.innerHTML = `<img src="file://${filePath}" alt="${fileName}" />`;
      break;
      
    case 'audio':
      // For audio, create an audio player
      viewerContent.innerHTML = `
        <audio controls>
          <source src="file://${filePath}" type="audio/${path.extname(fileName).substring(1)}">
          Your browser does not support this audio format.
        </audio>
      `;
      break;
      
    case 'video':
      // For video, create a video player
      viewerContent.innerHTML = `
        <video controls>
          <source src="file://${filePath}" type="video/${path.extname(fileName).substring(1)}">
          Your browser does not support this video format.
        </video>
      `;
      break;
      
    default:
      // For unknown file types, show a message
      viewerContent.innerHTML = `<div class="error">Cannot preview this file type</div>`;
  }
  
  // Add title for temporary files from Android
  if (!isLocal) {
    const tempFileHint = document.createElement('div');
    tempFileHint.className = 'temp-file-hint';
    tempFileHint.textContent = 'This is a temporary copy from your Android device';
    viewerContent.appendChild(tempFileHint);
  }
  
  // Add components to the viewer
  viewerContainer.appendChild(viewerHeader);
  viewerContainer.appendChild(viewerContent);
  
  // Show the viewer
  viewerContainer.classList.add('visible');
  
  // Handle close button click
  const closeBtn = viewerHeader.querySelector('.viewer-close-btn');
  closeBtn.addEventListener('click', () => {
    viewerContainer.classList.remove('visible');
    
    // If this is a temporary file from Android, we could clean it up here
    // (or let the OS handle it since it's in the temp directory)
  });
  
  // Make the viewer draggable
  makeElementDraggable(viewerContainer, viewerHeader);
}

/**
 * Makes an element draggable by dragging its header
 * 
 * @param {HTMLElement} element - Element to make draggable
 * @param {HTMLElement} handle - Element to use as drag handle
 */
function makeElementDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  handle.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e.preventDefault();
    // Get the mouse position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call a function whenever the cursor moves
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e.preventDefault();
    // Calculate the new position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    element.style.top = (element.offsetTop - pos2) + 'px';
    element.style.left = (element.offsetLeft - pos1) + 'px';
  }
  
  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

/**
 * Creates a new folder with user input
 * 
 * @param {string} currentPath - Current path where folder will be created
 * @param {boolean} isAndroid - Whether this is an Android folder creation
 * @param {string} deviceId - Android device ID (only for Android folders)
 * @param {Function} refreshFunction - Function to call after folder creation
 * @param {Function} customCreateFunction - Custom function for Android folder creation
 * @returns {Promise<boolean>} - Promise that resolves to true if folder was created
 */
async function createNewFolder(currentPath, isAndroid, deviceId, refreshFunction, customCreateFunction) {
  return new Promise((resolve) => {
    // Create the modal container if it doesn't exist
    let modalContainer = document.getElementById('custom-modal-container');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'custom-modal-container';
      document.body.appendChild(modalContainer);
    } else {
      modalContainer.innerHTML = ''; // Clear any existing content
    }

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Create title
    const title = document.createElement('h3');
    title.textContent = `Create New Folder in ${isAndroid ? 'Android' : 'Local'} Path`;

    // Create the path display
    const pathDisplay = document.createElement('div');
    pathDisplay.className = 'path-display';
    pathDisplay.textContent = `Path: ${currentPath}`;

    // Create input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group';

    // Create label
    const label = document.createElement('label');
    label.textContent = 'Folder Name:';

    // Create input
    const input = document.createElement('input');
    input.type = 'text';

    // Create button group
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'button-group';

    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'cancel-btn';
    cancelButton.textContent = 'Cancel';

    // Create create button
    const createButton = document.createElement('button');
    createButton.className = 'create-btn';
    createButton.textContent = 'Create';

    // Add elements to the DOM
    inputGroup.appendChild(label);
    inputGroup.appendChild(input);
    buttonGroup.appendChild(cancelButton);
    buttonGroup.appendChild(createButton);
    
    modalContent.appendChild(title);
    modalContent.appendChild(pathDisplay);
    modalContent.appendChild(inputGroup);
    modalContent.appendChild(buttonGroup);
    
    modalContainer.appendChild(modalContent);

    // Focus the input
    setTimeout(() => input.focus(), 0);

    // Handle cancel button click
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(modalContainer);
      resolve(false);
    });

    // Handle create button click
    createButton.addEventListener('click', async () => {
      const folderName = input.value.trim();
      
      if (!folderName) {
        // Show error message for empty name
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.textContent = 'Please enter a folder name';
        
        // Remove any existing error message
        const existingError = modalContent.querySelector('.error-message');
        if (existingError) {
          existingError.remove();
        }
        
        inputGroup.appendChild(errorMsg);
        return;
      }

      try {
        if (isAndroid) {
          // For Android, we need the device ID and a special function
          if (!deviceId) {
            throw new Error('No device selected');
          }
          
          const androidPath = path.join(currentPath, folderName).replace(/\\/g, '/');
          await customCreateFunction(deviceId, androidPath);
        } else {
          // For local file system, we can use fs
          const localPath = path.join(currentPath, folderName);
          fs.mkdirSync(localPath);
        }
        
        // Close the modal
        document.body.removeChild(modalContainer);
        
        // Refresh after creating
        if (refreshFunction) {
          refreshFunction();
        }
        
        resolve(true);
      } catch (err) {
        console.error('Error creating folder:', err);
        
        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.textContent = `Error: ${err.message}`;
        
        // Remove any existing error message
        const existingError = modalContent.querySelector('.error-message');
        if (existingError) {
          existingError.remove();
        }
        
        inputGroup.appendChild(errorMsg);
      }
    });

    // Handle Enter key in input
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        createButton.click();
      } else if (e.key === 'Escape') {
        cancelButton.click();
      }
    });
  });
}

// Export functions
module.exports = {
  setStatus,
  showConfirmationDialog,
  viewFile,
  createNewFolder
}; 