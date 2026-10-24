/* MT PLC Studio for Windows: the bridge the app uses to keep its project files (.mtp, .L5X) on this computer, in the
   folders the user picks in the app's own file browser. Only these calls cross over; main.js checks every path. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mtpsFS', {
  kind: 'electron',
  places: () => ipcRenderer.invoke('fs:places'),
  list: dir => ipcRenderer.invoke('fs:list', dir),
  read: file => ipcRenderer.invoke('fs:read', file),
  write: (file, text) => ipcRenderer.invoke('fs:write', file, text),
  mkdir: dir => ipcRenderer.invoke('fs:mkdir', dir),
  remove: file => ipcRenderer.invoke('fs:remove', file),
  exists: file => ipcRenderer.invoke('fs:exists', file),
});
