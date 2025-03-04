/**
 * localFileSystem.js
 * Handles operations on the local file system like deletion and navigation
 */

const fs = require('fs');
const path = require('path');
const { rimraf } = require('rimraf');
const os = require('os');

/**
 * Deletes a file or folder from the local file system
 * 
 * @param {string} itemPath - Path to the file or folder
 * @param {boolean} isDirectory - Whether the item is a directory
 * @returns {Promise<boolean>} - Promise that resolves to true if deletion was successful
 */
async function deleteLocalItem(itemPath, isDirectory) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Deleting local ${isDirectory ? 'directory' : 'file'}:`, itemPath);
      
      if (isDirectory) {
        // Use rimraf for recursive directory deletion
        rimraf(itemPath)
          .then(() => resolve(true))
          .catch(err => {
            console.error('Error deleting directory:', err);
            reject(err);
          });
      } else {
        // Simple file deletion
        fs.unlinkSync(itemPath);
        resolve(true);
      }
    } catch (err) {
      console.error('Error deleting local item:', err);
      reject(err);
    }
  });
}

/**
 * Navigates up one level in the file path
 * 
 * @param {string} currentPath - Current file path
 * @returns {string} - New path one level up
 */
function navigateUp(currentPath) {
  // For Windows root drives, handle specially
  if (process.platform === 'win32' && /^[A-Z]:\\$/i.test(currentPath)) {
    // Already at the root of a drive on Windows
    return currentPath;
  }
  
  // Check if we've reached the root
  const parent = path.dirname(currentPath);
  
  if (parent === currentPath) {
    // We've reached the root, don't go further
    return currentPath;
  }
  
  return parent;
}

/**
 * Gets the list of drives on Windows systems
 * 
 * @returns {Promise<Array<string>>} - Promise that resolves to a list of drive letters
 */
async function getWindowsDrives() {
  return new Promise((resolve, reject) => {
    try {
      // Only applicable on Windows
      if (process.platform !== 'win32') {
        resolve([]);
        return;
      }
      
      // Use the 'wmic' command to get drives
      const { exec } = require('child_process');
      exec('wmic logicaldisk get caption', (err, stdout) => {
        if (err) {
          console.error('Error getting Windows drives:', err);
          // Fallback to a basic list of possible drives if wmic fails
          const possibleDrives = ['C:', 'D:', 'E:', 'F:'];
          resolve(possibleDrives);
          return;
        }
        
        // Parse the output to get drive letters
        const drives = stdout
          .split('\n')
          .filter(line => /^[A-Z]:/.test(line.trim()))
          .map(line => line.trim());
        
        if (drives.length === 0) {
          // Another fallback if parsing fails
          resolve(['C:']);
        } else {
          resolve(drives);
        }
      });
    } catch (err) {
      console.error('Exception in getWindowsDrives:', err);
      // Ultimate fallback
      resolve(['C:']);
    }
  });
}

/**
 * Gets the home directory path
 * 
 * @returns {string} - Home directory path
 */
function getHomeDirectory() {
  return process.env.HOME || process.env.USERPROFILE;
}

/**
 * Creates a temporary directory and returns its path
 * 
 * @returns {string} - Path to the temporary directory
 */
function getTempDirectory() {
  const tempDir = path.join(os.tmpdir(), 'adb-file-transfer');
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  return tempDir;
}

/**
 * Get the platform-appropriate starting directory
 * On Windows, returns C:\ or user's home directory
 * On macOS, returns user's home directory
 * 
 * @returns {string} - Starting directory path
 */
function getStartingDirectory() {
  if (process.platform === 'win32') {
    // On Windows, start with the C: drive or user's home
    return getHomeDirectory();
  } else {
    // On macOS and other platforms, start with home directory
    return getHomeDirectory();
  }
}

// Export functions
module.exports = {
  deleteLocalItem,
  navigateUp,
  getWindowsDrives,
  getHomeDirectory,
  getTempDirectory,
  getStartingDirectory
}; 