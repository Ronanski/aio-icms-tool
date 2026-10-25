/* MT PLC Studio for Windows: one resizable window. It opens the built-in copy of the app; the in-app updater moves to
   the hosted copy (GitHub Pages /mtps/, Stable or Beta) when a newer version is there, and that copy is cached for
   offline use. If the hosted copy cannot load and was never cached, the built-in copy is used.
   The window can be resized and maximized (minimum 800 × 600); its size, position and maximized state are kept. */
const { app, BrowserWindow, shell, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const PAGES = 'https://ronanski.github.io/aio-icms-tool/mtps/';
const LOCAL = path.join(__dirname, 'app', 'index.html');
const LOCAL_URL = pathToFileURL(LOCAL).href;
const ours = url => url.startsWith(PAGES) || url.split(/[?#]/)[0] === LOCAL_URL;
const STATE = () => path.join(app.getPath('userData'), 'window.json');

function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(STATE(), 'utf8'));
    // only a position that is still on one of the screens
    const onScreen = screen.getAllDisplays().some(d => b.x >= d.bounds.x - 50 && b.y >= d.bounds.y - 50 && b.x < d.bounds.x + d.bounds.width - 100 && b.y < d.bounds.y + d.bounds.height - 100);
    return onScreen ? b : { width: b.width, height: b.height, maximized: b.maximized };
  } catch (e) { return { width: 1440, height: 900, maximized: false }; }
}

function createWindow() {
  const b = loadBounds();
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: Math.max(800, b.width || 1440), height: Math.max(600, b.height || 900),
    minWidth: 800, minHeight: 600, resizable: true, maximizable: true,
    title: 'MT PLC Studio',
    icon: path.join(__dirname, 'app', 'icons', 'icon-512.png'),
    backgroundColor: '#E9EDF1',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  if (b.maximized) win.maximize();
  const save = () => {
    try {
      const n = win.getNormalBounds();
      fs.writeFileSync(STATE(), JSON.stringify({ ...n, maximized: win.isMaximized() }));
    } catch (e) { /* ignore */ }
  };
  win.on('close', save);
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // the Chassis Monitor opens as a blank window of its own that the app writes and draws
    if (frameName === 'mtps-chassis' && (url === '' || url === 'about:blank')) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 640, minWidth: 480, minHeight: 360, title: 'MT PLC Studio - Chassis Monitor', autoHideMenuBar: true, backgroundColor: '#E9EDF1', icon: path.join(__dirname, 'app', 'icons', 'icon-512.png') } };
    }
    if (/^https?:/.test(url) && !ours(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-redirect', (e, url) => { if (!ours(url)) e.preventDefault(); });
  win.webContents.on('will-navigate', (e, url) => {
    if (ours(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && url.startsWith(PAGES) && code !== -3) win.loadFile(LOCAL, { query: { local: '1' } });
  });
  win.webContents.on('did-navigate', (e, url, code) => {
    if (url.startsWith(PAGES) && code >= 400) win.loadFile(LOCAL, { query: { local: '1' } });
  });
  // Export: save the project file where the user picks, not silently in Downloads
  win.webContents.session.on('will-download', item => { item.setSaveDialogOptions({ title: 'Export project', defaultPath: item.getFilename() }); });
  win.loadFile(LOCAL);
}

/* Project files: the app's own file browser lists folders and reads and writes .mtp and .L5X files through
   preload.js. Calls are taken only from the app's own pages; files written or removed must be .mtp or .L5X. */
const fsp = fs.promises;
const PROJ_EXT = /\.(mtp|l5x)$/i;
const fromApp = e => { try { return ours(e.senderFrame.url); } catch (x) { return false; } };
const checked = (e, p) => { if (!fromApp(e)) throw new Error('not allowed'); if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('bad path'); return path.normalize(p); };
function registerFiles() {
  ipcMain.handle('fs:places', async e => {
    if (!fromApp(e)) throw new Error('not allowed');
    const docs = app.getPath('documents'), proj = path.join(docs, 'MT PLC Studio Projects');
    await fsp.mkdir(proj, { recursive: true });
    const list = [['MT PLC Studio Projects', proj], ['Documents', docs], ['Desktop', app.getPath('desktop')], ['Downloads', app.getPath('downloads')], ['Home', app.getPath('home')]];
    // the drives of this computer
    for (const d of 'CDEFGHIJ') { const r = d + ':\\'; try { await fsp.access(r); list.push([d + ': drive', r]); } catch (x) { /* none */ } }
    return list.map(([label, p]) => ({ label, path: p }));
  });
  ipcMain.handle('fs:list', async (e, dir) => {
    const d = checked(e, dir);
    const ents = await fsp.readdir(d, { withFileTypes: true });
    const out = [];
    for (const x of ents) {
      if (x.name.startsWith('.') || x.name.startsWith('$')) continue;
      const p = path.join(d, x.name), isDir = x.isDirectory();
      if (!isDir && !/\.(mtp|l5x|json)$/i.test(x.name)) continue;
      let st = null; try { st = await fsp.stat(p); } catch (y) { continue; }
      out.push({ name: x.name, path: p, dir: isDir, size: st.size, mtime: st.mtimeMs });
    }
    return { dir: d, parent: path.dirname(d) === d ? null : path.dirname(d), sep: path.sep, items: out };
  });
  ipcMain.handle('fs:read', async (e, f) => fsp.readFile(checked(e, f), 'utf8'));
  ipcMain.handle('fs:write', async (e, f, text) => { const p = checked(e, f); if (!PROJ_EXT.test(p)) throw new Error('only .mtp or .L5X files'); await fsp.writeFile(p, String(text), 'utf8'); return p; });
  ipcMain.handle('fs:mkdir', async (e, d) => { const p = checked(e, d); await fsp.mkdir(p, { recursive: true }); return p; });
  ipcMain.handle('fs:remove', async (e, f) => { const p = checked(e, f); if (!PROJ_EXT.test(p)) throw new Error('only .mtp or .L5X files'); await fsp.unlink(p); return true; });
  ipcMain.handle('fs:exists', async (e, f) => { try { await fsp.access(checked(e, f)); return true; } catch (x) { return false; } });
}

app.whenReady().then(() => {
  // no built-in menu: its shortcuts (Ctrl+W closes the window, Ctrl+R reloads) would take the app's own keys
  Menu.setApplicationMenu(null);
  registerFiles();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
