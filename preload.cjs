const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('minmaxOverlay', {
  platform: process.platform,
  onVisibility: (callback) => {
    const listener = (_event, cleared) => callback(cleared);
    ipcRenderer.on('overlay:visibility', listener);
    return () => ipcRenderer.removeListener('overlay:visibility', listener);
  },
  clear: () => ipcRenderer.invoke('overlay:clear'),
  status: () => ipcRenderer.invoke('overlay:status'),
  close: () => ipcRenderer.send('overlay:close'),
});

contextBridge.exposeInMainWorld('minmaxInventory', {
  onDetails: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('inventory:item-details', listener);
    return () => ipcRenderer.removeListener('inventory:item-details', listener);
  },
  details: (id) => ipcRenderer.invoke('inventory:details', id),
  transfer: (request) => ipcRenderer.invoke('inventory:transfer', request),
  onUpdate: (callback) => {
    const listener = (_event, inventory) => callback(inventory);
    ipcRenderer.on('inventory:update', listener);
    return () => ipcRenderer.removeListener('inventory:update', listener);
  },
});
