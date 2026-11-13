'use strict';

const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { convertToMarkdown } = require('./convert');
const { checkForKbUpdates } = require('./updater');

app.setName('DaAIx');

const store = new Store();
let mainWindow = null;

function createWindow() {
  const bounds = store.get('windowBounds', { width: 1440, height: 900 });
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 700,
    title: 'DaAIx',
    backgroundColor: '#0f1420',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isMinimized()) store.set('windowBounds', mainWindow.getBounds());
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  scheduleUpdateCheck();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function scheduleUpdateCheck() {
  const interval = store.get('updateIntervalMinutes', 60) * 60 * 1000;
  const run = async () => {
    try {
      const result = await checkForKbUpdates(store);
      if (result && result.updates.length && mainWindow) {
        mainWindow.webContents.send('kb:update-available', result);
        if (Notification.isSupported()) {
          new Notification({
            title: 'DaAIx — تحديثات قواعد المعرفة',
            body: `توفر ${result.updates.length} تحديثًا جديدًا لقواعد المعرفة.`
          }).show();
        }
      }
    } catch (e) { /* offline: silent */ }
  };
  setTimeout(run, 15000);
  setInterval(run, Math.max(interval, 5 * 60 * 1000));
}

/* ------------------------------ IPC ------------------------------ */

ipcMain.handle('settings:get', () => store.getAll());
ipcMain.handle('settings:set', (_e, patch) => { store.setMany(patch || {}); return store.getAll(); });

ipcMain.handle('fs:readLocalFile', async (_e, filterName, extensions) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: filterName || 'Files', extensions: extensions || ['*'] }]
  });
  if (canceled || !filePaths.length) return null;
  const p = filePaths[0];
  return { path: p, name: path.basename(p), data: fs.readFileSync(p).toString('base64') };
});

ipcMain.handle('convert:toMarkdown', async (_e, payload) => {
  try {
    const md = await convertToMarkdown(payload.path, Buffer.from(payload.data, 'base64'));
    return { ok: true, markdown: md };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('notes:save', (_e, note) => {
  const dir = path.join(app.getPath('userData'), 'notes');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${note.id}.md`);
  fs.writeFileSync(file, note.markdown, 'utf8');
  return { ok: true, file };
});
ipcMain.handle('notes:load', () => {
  const dir = path.join(app.getPath('userData'), 'notes');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const stat = fs.statSync(path.join(dir, f));
    return { id: f.replace(/\.md$/, ''), markdown: fs.readFileSync(path.join(dir, f), 'utf8'), modified: stat.mtimeMs };
  });
});
ipcMain.handle('notes:delete', (_e, id) => {
  const file = path.join(app.getPath('userData'), 'notes', `${id}.md`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true };
});

ipcMain.handle('kb:saveDownloaded', (_e, kb) => {
  const dir = path.join(app.getPath('userData'), 'kb');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${kb.id}.json`);
  fs.writeFileSync(file, JSON.stringify(kb), 'utf8');
  return { ok: true, file };
});
ipcMain.handle('kb:loadDownloaded', () => {
  const dir = path.join(app.getPath('userData'), 'kb');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
    .filter(Boolean);
});

ipcMain.handle('kb:checkUpdates', async () => {
  try { return await checkForKbUpdates(store); } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('kb:fetchRemote', async (_e, url) => {
  try {
    const res = await netFetch(url);
    return { ok: true, data: res };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

async function netFetch(url) {
  const { net } = require('electron');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:openExternal', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
