/**
 * transferOperations.js
 * Handles file and folder transfers between local system and Android device
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Transfers a file from the local file system to an Android device
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} localPath - Path to the local file
 * @param {string} androidPath - Path on the Android device
 * @param {Function} setStatus - Function to set status message
 * @returns {Promise<boolean>} - Promise that resolves to true if transfer was successful
 */
async function transferLocalFileToAndroid(deviceId, localPath, androidPath, setStatus) {
  try {
    console.log('Pushing local file to Android:', localPath, 'to', androidPath);
    console.log('Using device ID:', deviceId);
    
    await ipcRenderer.invoke('push-file', {
      deviceId: deviceId,
      localPath: localPath,
      remotePath: androidPath
    });
    
    return true;
  } catch (err) {
    console.error('Error pushing file to Android:', err);
    setStatus(`Error: ${err.message}`);
    return false;
  }
}

/**
 * Recursively transfers a folder from the local file system to an Android device
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} localFolderPath - Path to the local folder
 * @param {string} androidFolderPath - Path on the Android device
 * @param {Function} setStatus - Function to set status message
 * @returns {Promise<{success: number, errors: number}>} - Counts of successful and failed transfers
 */
async function transferLocalFolderToAndroid(deviceId, localFolderPath, androidFolderPath, setStatus) {
  let totalFiles = 0;
  let processedFiles = 0;
  let successCount = 0;
  let errorCount = 0;
  
  // Count all files in the folder structure for progress reporting
  function countFiles(dirPath) {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    items.forEach(item => {
      if (item.isDirectory()) {
        countFiles(path.join(dirPath, item.name));
      } else {
        totalFiles++;
      }
    });
  }
  
  // Attempt to count total files first
  try {
    countFiles(localFolderPath);
    setStatus(`Preparing to transfer ${totalFiles} files from ${path.basename(localFolderPath)}...`);
  } catch (err) {
    console.error('Error counting files:', err);
    setStatus(`Error counting files: ${err.message}`);
    return { success: 0, errors: 1 };
  }
  
  // Create the base folder on Android first
  try {
    console.log('Creating base folder on Android:', androidFolderPath);
    await ipcRenderer.invoke('create-directory', {
      deviceId: deviceId,
      path: androidFolderPath
    });
  } catch (err) {
    console.error('Error creating base folder on Android:', err);
    setStatus(`Error creating folder on Android: ${err.message}`);
    return { success: 0, errors: 1 };
  }
  
  // Function to process a directory recursively
  async function processDirectory(localDir, androidDir) {
    const items = fs.readdirSync(localDir, { withFileTypes: true });
    
    for (const item of items) {
      const localItemPath = path.join(localDir, item.name);
      // Use forward slashes for Android paths
      const androidItemPath = androidDir + '/' + item.name;
      
      if (item.isDirectory()) {
        // Create directory on Android
        try {
          console.log('Creating directory on Android:', androidItemPath);
          await ipcRenderer.invoke('create-directory', {
            deviceId: deviceId,
            path: androidItemPath
          });
          
          // Process subdirectory recursively
          const subDirResult = await processDirectory(localItemPath, androidItemPath);
          successCount += subDirResult.success;
          errorCount += subDirResult.errors;
        } catch (err) {
          console.error('Error creating directory on Android:', err);
          errorCount++;
        }
      } else {
        // Transfer file
        try {
          console.log('Transferring file to Android:', localItemPath, 'to', androidItemPath);
          await ipcRenderer.invoke('push-file', {
            deviceId: deviceId,
            localPath: localItemPath,
            remotePath: androidItemPath
          });
          
          processedFiles++;
          successCount++;
          setStatus(`Transferring ${processedFiles}/${totalFiles}: ${item.name}`);
        } catch (err) {
          console.error('Error transferring file to Android:', err);
          processedFiles++;
          errorCount++;
          setStatus(`Error (${processedFiles}/${totalFiles}): ${item.name} - ${err.message}`);
        }
      }
    }
    
    return { success: successCount, errors: errorCount };
  }
  
  // Start the recursive process
  return processDirectory(localFolderPath, androidFolderPath);
}

/**
 * Transfers a file from an Android device to the local file system
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} androidPath - Path on the Android device
 * @param {string} localPath - Path to the local file
 * @param {Function} setStatus - Function to set status message
 * @returns {Promise<boolean>} - Promise that resolves to true if transfer was successful
 */
async function transferAndroidFileToLocal(deviceId, androidPath, localPath, setStatus) {
  try {
    console.log('Pulling Android file to local:', androidPath, 'to', localPath);
    console.log('Using device ID:', deviceId);
    
    await ipcRenderer.invoke('pull-file', {
      deviceId: deviceId,
      remotePath: androidPath,
      localPath: localPath
    });
    
    return true;
  } catch (err) {
    console.error('Error pulling file from Android:', err);
    setStatus(`Error: ${err.message}`);
    return false;
  }
}

/**
 * Recursively transfers a folder from an Android device to the local file system
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} androidFolderPath - Path on the Android device
 * @param {string} localFolderPath - Path to the local folder
 * @param {Function} setStatus - Function to set status message
 * @returns {Promise<{success: number, errors: number}>} - Counts of successful and failed transfers
 */
async function transferAndroidFolderToLocal(deviceId, androidFolderPath, localFolderPath, setStatus) {
  let successCount = 0;
  let errorCount = 0;
  let totalFiles = 0;
  let processedFiles = 0;
  
  // Create the base folder locally first
  try {
    console.log('Creating base folder locally:', localFolderPath);
    if (!fs.existsSync(localFolderPath)) {
      fs.mkdirSync(localFolderPath, { recursive: true });
    }
  } catch (err) {
    console.error('Error creating base folder locally:', err);
    setStatus(`Error creating folder locally: ${err.message}`);
    return { success: 0, errors: 1 };
  }
  
  // Function to get all files in a directory on Android recursively
  async function listAndroidFilesRecursively(path) {
    const results = {
      files: [],
      directories: []
    };
    
    try {
      console.log('Listing Android directory:', path);
      const items = await ipcRenderer.invoke('list-files', {
        deviceId: deviceId,
        path: path,
        noCache: Date.now() // Force fresh request
      });
      
      for (const item of items) {
        const isDir = (item.mode & 0x4000) === 0x4000;
        const itemPath = path.endsWith('/') ? `${path}${item.name}` : `${path}/${item.name}`;
        
        if (isDir) {
          results.directories.push({
            path: itemPath,
            name: item.name
          });
          
          // Recursively list files in subdirectory
          const subResults = await listAndroidFilesRecursively(itemPath);
          results.files.push(...subResults.files);
          results.directories.push(...subResults.directories);
        } else {
          results.files.push({
            path: itemPath,
            name: item.name,
            size: item.size
          });
        }
      }
      
      return results;
    } catch (err) {
      console.error('Error listing Android directory:', err);
      throw err;
    }
  }
  
  try {
    // First, list all files and directories recursively to get the total
    setStatus('Scanning Android folder structure...');
    const fileList = await listAndroidFilesRecursively(androidFolderPath);
    totalFiles = fileList.files.length;
    
    setStatus(`Preparing to transfer ${totalFiles} files from Android...`);
    
    // Create all directories first
    for (const dir of fileList.directories) {
      const relativePath = dir.path.substring(androidFolderPath.length);
      const targetPath = path.join(localFolderPath, relativePath);
      
      console.log('Creating local directory:', targetPath);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
    }
    
    // Then transfer all files
    for (const file of fileList.files) {
      const relativePath = file.path.substring(androidFolderPath.length);
      const targetPath = path.join(localFolderPath, relativePath);
      
      try {
        console.log('Transferring file from Android:', file.path, 'to', targetPath);
        await ipcRenderer.invoke('pull-file', {
          deviceId: deviceId,
          remotePath: file.path,
          localPath: targetPath
        });
        
        processedFiles++;
        successCount++;
        setStatus(`Transferring ${processedFiles}/${totalFiles}: ${file.name}`);
      } catch (err) {
        console.error('Error transferring file from Android:', err);
        processedFiles++;
        errorCount++;
        setStatus(`Error (${processedFiles}/${totalFiles}): ${file.name} - ${err.message}`);
      }
    }
    
    return { success: successCount, errors: errorCount };
  } catch (err) {
    console.error('Error in folder transfer from Android:', err);
    setStatus(`Error: ${err.message}`);
    return { success: successCount, errors: errorCount + 1 };
  }
}

/**
 * Pulls a file from Android device to a temporary location for viewing
 * 
 * @param {string} deviceId - Android device ID
 * @param {string} androidPath - Path on the Android device
 * @param {string} filename - Name of the file
 * @returns {Promise<string>} - Path to the temporary file
 */
async function pullAndroidFileToTemp(deviceId, androidPath, filename) {
  // Create a temp directory if it doesn't exist
  const tempDir = path.join(os.tmpdir(), 'adb-file-transfer');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFile = path.join(tempDir, filename);
  
  try {
    console.log('Pulling Android file to temp:', androidPath, 'to', tempFile);
    await ipcRenderer.invoke('pull-file', {
      deviceId: deviceId,
      remotePath: androidPath,
      localPath: tempFile
    });
    
    return tempFile;
  } catch (err) {
    console.error('Error pulling file to temp:', err);
    throw err;
  }
}

// Export functions
module.exports = {
  transferLocalFileToAndroid,
  transferLocalFolderToAndroid,
  transferAndroidFileToLocal,
  transferAndroidFolderToLocal,
  pullAndroidFileToTemp
}; 