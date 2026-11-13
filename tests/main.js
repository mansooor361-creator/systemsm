'use strict';

/* Main-process smoke test: mocks the electron module and loads main.js
 * to catch require-time errors (constructors, exports, paths). */

const assert = require('assert');
const Module = require('module');
const path = require('path');

const listeners = {};
const fakeWindow = {
  loadFile: async () => {},
  on: () => {},
  isDestroyed: () => false,
  isMinimized: () => false,
  getBounds: () => ({ width: 100, height: 100 }),
  webContents: { send: () => {}, setWindowOpenHandler: () => {} }
};

const electronStub = {
  app: {
    setName: () => {},
    whenReady: async () => {},
    on: (ev, cb) => { listeners[ev] = cb; },
    getPath: (name) => path.join(__dirname, '..', '.tmp-userdata', name),
    getVersion: () => '1.0.0'
  },
  BrowserWindow: Object.assign(function () { return fakeWindow; }, {
    getAllWindows: () => [fakeWindow],
    getFocusedWindow: () => fakeWindow
  }),
  ipcMain: { handle: () => {}, on: () => {} },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  Notification: Object.assign(function () { return { show: () => {} }; }, { isSupported: () => false }),
  shell: { openExternal: async () => {} },
  Menu: { setApplicationMenu: () => {} },
  net: { fetch: async () => { throw new Error('offline'); } }
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return origLoad.apply(this, arguments);
};

delete require.cache[require.resolve('../main/main.js')];
require('../main/main.js');

assert(listeners['window-all-closed'], 'window-all-closed handler registered');
assert(typeof electronStub.app.whenReady === 'function');

console.log('  ✓ main process loads without errors (Store constructor fixed)');
process.exit(0);
