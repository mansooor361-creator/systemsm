'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daaix', {
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFile: (name, exts) => ipcRenderer.invoke('fs:readLocalFile', name, exts),
  convertToMarkdown: (payload) => ipcRenderer.invoke('convert:toMarkdown', payload),
  notesSave: (note) => ipcRenderer.invoke('notes:save', note),
  notesLoad: () => ipcRenderer.invoke('notes:load'),
  notesDelete: (id) => ipcRenderer.invoke('notes:delete', id),
  kbSaveDownloaded: (kb) => ipcRenderer.invoke('kb:saveDownloaded', kb),
  kbLoadDownloaded: () => ipcRenderer.invoke('kb:loadDownloaded'),
  kbCheckUpdates: () => ipcRenderer.invoke('kb:checkUpdates'),
  kbFetchRemote: (url) => ipcRenderer.invoke('kb:fetchRemote', url),
  netPost: (url, apiKey, body) => ipcRenderer.invoke('net:post', url, apiKey, body),
  importFolder: () => ipcRenderer.invoke('fs:importFolder'),
  convertFolder: (opts) => ipcRenderer.invoke('fs:convertFolder', opts),
  appVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  onUpdateAvailable: (cb) => ipcRenderer.on('kb:update-available', (_e, data) => cb(data))
});
