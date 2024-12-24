const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');

console.log('Preload script starting...');

// Expose protected methods that allow the renderer process to use
// specific electron APIs without exposing the entire API
contextBridge.exposeInMainWorld(
  'electron',
  {
    // Get device information
    getDeviceInfo: () => ({
      deviceName: os.hostname(),
      platform: os.platform(),
      type: 'desktop'
    }),

    // IPC listeners
    onRoomKey: (callback) => ipcRenderer.on('room-key', (_, value) => callback(value)),

    // File system operations
    saveFile: async (options) => {
      try {
        const result = await ipcRenderer.invoke('save-file', options);
        return result;
      } catch (error) {
        console.error('Save file error:', error);
        throw error;
      }
    }
  }
);

// Expose a limited version of console for debugging
contextBridge.exposeInMainWorld(
  'console',
  {
    log: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
    warn: (...args) => console.warn(...args)
  }
);