const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('artistStudio', {
  getApiBase: () => ipcRenderer.invoke('artist:get-api-base'),
  openToolWindow: (hash) => ipcRenderer.invoke('artist:open-window', hash),
})

contextBridge.exposeInMainWorld('tapPilot', {
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  getProfile: (id) => ipcRenderer.invoke('profiles:get', id),
  createProfile: (payload) => ipcRenderer.invoke('profiles:create', payload),
  importProfile: (data, options) =>
    ipcRenderer.invoke('profiles:import', data, options),
  validateImport: (data) => ipcRenderer.invoke('profiles:validateImport', data),
  importConflicts: (data) => ipcRenderer.invoke('profiles:importConflicts', data),
  exportProfile: (id) => ipcRenderer.invoke('profiles:export', id),
  saveProfile: (profile) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  setPublished: (id, published) =>
    ipcRenderer.invoke('profiles:setPublished', id, published),
  listStyles: () => ipcRenderer.invoke('styles:list'),
  getStyle: (id) => ipcRenderer.invoke('styles:get', id),
  createStyle: (payload) => ipcRenderer.invoke('styles:create', payload),
  saveStyle: (style) => ipcRenderer.invoke('styles:save', style),
  deleteStyle: (id) => ipcRenderer.invoke('styles:delete', id),
  importStyle: (data) => ipcRenderer.invoke('styles:import', data),
  getServerInfo: () => ipcRenderer.invoke('server:info'),
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getServerQr: () => ipcRenderer.invoke('server:qr'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getPlatformCapabilities: () =>
    ipcRenderer.invoke('platform:capabilities'),
  openCapabilitySettings: (settingsUrl) =>
    ipcRenderer.invoke('platform:openSettings', settingsUrl),
  listLogs: () => ipcRenderer.invoke('logs:list'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  onLogEntry: (callback) => {
    const listener = (_event, entry) => callback(entry)
    ipcRenderer.on('logs:entry', listener)
    return () => ipcRenderer.removeListener('logs:entry', listener)
  },
  onServerStatus: (callback) => {
    const listener = (_event, info) => callback(info)
    ipcRenderer.on('server:status', listener)
    return () => ipcRenderer.removeListener('server:status', listener)
  },
})
