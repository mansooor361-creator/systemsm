'use strict';

const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Store } = require('./store');
const { convertToMarkdown } = require('./convert');
const { checkForKbUpdates } = require('./updater');

app.setName('DaAIx');

process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'daaix-error.log'),
      new Date().toISOString() + ' MAIN: ' + ((err && err.stack) || String(err)) + '\n');
  } catch (_) {}
  try { dialog.showErrorBox('DaAIx', String((err && err.message) || err)); } catch (_) {}
});
process.on('unhandledRejection', (err) => {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'daaix-error.log'),
      new Date().toISOString() + ' MAIN(rejection): ' + ((err && err.stack) || String(err)) + '\n');
  } catch (_) {}
});

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    scheduleUpdateCheck();
  }).catch((err) => {
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'daaix-error.log'),
        new Date().toISOString() + ' WHENREADY: ' + ((err && err.stack) || String(err)) + '\n');
    } catch (_) {}
    try { dialog.showErrorBox('DaAIx', String((err && err.message) || err)); } catch (_) {}
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

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

ipcMain.handle('skills:import', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'SKILL.md', extensions: ['md', 'markdown', 'txt'] }]
    });
    if (canceled || !filePaths.length) return { ok: false };
    const p = filePaths[0];
    return { ok: true, name: path.basename(p, path.extname(p)), markdown: fs.readFileSync(p, 'utf8') };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('skills:export', async (_e, name, markdown) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const safe = String(name || 'skill').replace(/[\\/:*?"<>|]/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: safe + '-SKILL.md',
      filters: [{ name: 'SKILL.md', extensions: ['md'] }]
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, String(markdown || ''), 'utf8');
    return { ok: true, file: filePath };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

/* ---------- AI assistant projects: one folder per project ---------- */
function projectsDir() {
  const dir = path.join(app.getPath('userData'), 'projects');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function safeProjectName(name) {
  return String(name || 'project').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'project';
}
ipcMain.handle('projects:save', (_e, name, projectMd, agentsMd) => {
  try {
    const dir = path.join(projectsDir(), safeProjectName(name));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.md'), String(projectMd || ''), 'utf8');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), String(agentsMd || ''), 'utf8');
    return { ok: true, dir };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});
ipcMain.handle('projects:list', () => {
  try {
    const dir = projectsDir();
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, dir: path.join(dir, d.name) }));
  } catch (e) {
    return [];
  }
});
ipcMain.handle('projects:load', (_e, name) => {
  try {
    const dir = path.join(projectsDir(), safeProjectName(name));
    const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_) { return ''; } };
    return { ok: true, projectMd: read('project.md'), agentsMd: read('AGENTS.md'), dir };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});
ipcMain.handle('projects:delete', (_e, name) => {
  try {
    const dir = path.join(projectsDir(), safeProjectName(name));
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('kb:saveDownloaded', (_e, kb) => {
  const dir = path.join(app.getPath('userData'), 'kb');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${kb.id}.json`);
  fs.writeFileSync(file, JSON.stringify(kb), 'utf8');
  return { ok: true, file };
});
ipcMain.handle('kb:deleteDownloaded', (_e, kbId) => {
  const dir = path.join(app.getPath('userData'), 'kb');
  const file = path.join(dir, `${kbId}.json`);
  try { if (fs.existsSync(file)) fs.rmSync(file); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err && err.message || err) }; }
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

ipcMain.handle('net:post', async (_e, url, apiKey, body) => {
  try {
    const { net } = require('electron');
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const res = await net.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

ipcMain.handle('net:getText', async (_e, url) => {
  try {
    const { net } = require('electron');
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('bad url');
    const res = await net.fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, text: await res.text() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('kb:fetchRemote', async (_e, url) => {
  try {
    const res = await netFetch(url);
    return { ok: true, data: res };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

const fsp = fs.promises;

function kbProgress(data) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win && !win.isDestroyed()) win.webContents.send('kb:progress', data);
}

async function walkFiles(dir, exts) {
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (exts.test(ent.name)) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

async function buildLocalKb(dir, fixedId) {
  kbProgress({ stage: 'scan', done: 0, total: 0, file: dir });
  const files = await walkFiles(dir, /\.(md|markdown)$/i);
  const documents = [];
  let done = 0;
  for (const f of files) {
    const raw = await fsp.readFile(f, 'utf8');
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    const name = path.basename(f).replace(/\.(md|markdown)$/i, '');
    documents.push({
      id: 'note-' + crypto.createHash('sha1').update(f).digest('hex').slice(0, 20),
      type: 'note',
      title: { ar: titleMatch ? titleMatch[1].trim() : name, en: name },
      issuer: { ar: path.basename(path.dirname(f)), en: path.basename(path.dirname(f)) },
      number: '\u2014', date: '\u2014', status: 'in_force', version: 1,
      summary: null, articles: [], relations: [], sources: [], versionHistory: [],
      body: raw
    });
    done++;
    kbProgress({ stage: 'read', done, total: files.length, file: path.basename(f) });
    await new Promise(r => setImmediate(r));
  }
  const kb = {
    id: fixedId || ('kb-local-' + Date.now()),
    name: { ar: '\u0642\u0627\u0639\u062f\u0629 \u0645\u062d\u0644\u064a\u0629 \u2014 ' + path.basename(dir), en: 'Local KB \u2014 ' + path.basename(dir) },
    icon: '\ud83d\udcc1', version: '1.0', updated: new Date().toISOString().slice(0, 10),
    sourcePath: dir,
    documents
  };
  return kb;
}

ipcMain.handle('fs:importFolder', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    if (canceled || !filePaths.length) return { ok: false };
    const kb = await buildLocalKb(filePaths[0]);
    return { ok: true, kb, count: kb.documents.length, sourcePath: filePaths[0] };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('fs:rescanFolder', async (_e, dir, kbId) => {
  try {
    const kb = await buildLocalKb(dir, kbId);
    return { ok: true, kb, count: kb.documents.length };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('fs:convertFolder', async (_e, opts) => {
  const summary = { ok: true, converted: 0, failed: [], uploaded: 0 };
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    if (canceled || !filePaths.length) return { ok: false };
    const dir = filePaths[0];
    const files = await walkFiles(dir, /\.(pdf|docx|txt|html|htm|md|markdown)$/i);
    for (const f of files) {
      try {
        const md = await convertToMarkdown(f, fs.readFileSync(f));
        const outPath = f.replace(/\.(pdf|docx|txt|html|htm|md|markdown)$/i, '') + '.md';
        fs.writeFileSync(outPath, md, 'utf8');
        summary.converted++;
        kbProgress({ stage: 'convert', done: summary.converted + summary.failed.length, total: files.length, file: path.basename(f) });
        if (opts && opts.uploadUrl) {
          try {
            const { net } = require('electron');
            const headers = { 'Content-Type': 'application/json' };
            if (opts.uploadKey) headers['Authorization'] = 'Bearer ' + opts.uploadKey;
            const res = await net.fetch(opts.uploadUrl, {
              method: 'POST', headers,
              body: JSON.stringify({ filename: path.basename(outPath), markdown: md }),
              signal: AbortSignal.timeout(30000)
            });
            if (res.ok) summary.uploaded++;
          } catch { /* upload failure keeps local file */ }
        }
      } catch (err) {
        summary.failed.push({ file: path.basename(f), error: String(err.message || err) });
      }
    }
    return summary;
  } catch (e) {
    summary.ok = false;
    summary.error = String(e.message || e);
    return summary;
  }
});

async function netFetch(url) {
  const { net } = require('electron');
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:openExternal', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
