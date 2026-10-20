/* Windows/desktop shell: one window. It opens the built-in copy of the web app, which moves on to the hosted app
   (GitHub Pages, Stable or Beta channel). The hosted app updates itself inside the window and keeps working offline
   from its cache, so this shell almost never needs a new version. If the hosted app cannot load and has never been
   cached, the built-in copy is used. */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const PAGES = 'https://ronanski.github.io/aio-icms-tool/';
const LOCAL = path.join(__dirname, 'app', 'index.html');
const LOCAL_URL = pathToFileURL(LOCAL).href;
// the window may show the hosted app or the built-in copy's own page, nothing else
const ours = url => url.startsWith(PAGES) || url.split(/[?#]/)[0] === LOCAL_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PLC Trainer',
    icon: path.join(__dirname, 'app', 'icons', 'icon-512.png'),
    backgroundColor: '#F3F0E8',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // links to other sites open in the normal browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !ours(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // the window only shows the app (built-in or hosted); anything else opens in the normal browser
  win.webContents.on('will-redirect', (e, url) => { if (!ours(url)) e.preventDefault(); });
  win.webContents.on('will-navigate', (e, url) => {
    if (ours(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  // the hosted app failed to load and nothing is cached (first start without internet): use the built-in copy
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && url.startsWith(PAGES) && code !== -3) win.loadFile(LOCAL, { query: { local: '1' } });
  });
  // the hosted copy answered with an error page (e.g. the Beta copy is not deployed yet): use the built-in copy
  win.webContents.on('did-navigate', (e, url, code) => {
    if (url.startsWith(PAGES) && code >= 400) win.loadFile(LOCAL, { query: { local: '1' } });
  });
  win.loadFile(LOCAL);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
