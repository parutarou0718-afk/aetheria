import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { prepareDesktopEnvironment } from './environment';
import { toDesktopModuleUrl } from './runtimePath';

let mainWindow: BrowserWindow | null = null;
let serverHandle: { origin: string; close(): Promise<void> } | null = null;

function safeLog(directory: string, message: string): void {
  fs.appendFileSync(path.join(directory, 'aetheria-desktop.log'), `${new Date().toISOString()} ${message}\n`);
}

export function createWindowOptions(): Electron.BrowserWindowConstructorOptions {
  return { width: 1280, height: 800, minWidth: 900, minHeight: 600, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } };
}

async function launch(): Promise<void> {
  const configPath = app.isPackaged ? path.join(process.resourcesPath, 'demo-env') : path.join(process.cwd(), 'desktop', 'generated', 'demo-env');
  const environment = prepareDesktopEnvironment(app.getPath('userData'), configPath);
  safeLog(environment.logDirectory, `Aetheria Demo ${app.getVersion()} starting; database=${environment.databasePath}`);
  // The Electron host owns the listener.  Set this before importing the server
  // module so its standalone entry point cannot bind the public default port.
  process.env.AETHERIA_EMBEDDED = 'true';
  process.env.NODE_ENV = 'production';
  const serverPath = path.join(__dirname, 'server.cjs');
  const { startAetheriaServer } = await import(toDesktopModuleUrl(serverPath)) as typeof import('../server');
  serverHandle = await startAetheriaServer({ host: '127.0.0.1', port: 0, bootstrap: true, includeFrontend: true, staticDir: path.join(__dirname) });
  mainWindow = new BrowserWindow(createWindowOptions());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(serverHandle!.origin)) event.preventDefault(); });
  await mainWindow.loadURL(serverHandle.origin);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(launch).catch((error) => {
    const logDir = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(logDir, { recursive: true }); safeLog(logDir, error instanceof Error ? error.stack ?? error.message : String(error));
    dialog.showErrorBox('Aetheria could not start', 'Your local world data has not been reset. Please contact the demo owner.'); app.quit();
  });
  app.on('before-quit', (event) => { if (!serverHandle) return; event.preventDefault(); const handle = serverHandle; serverHandle = null; void handle.close().finally(() => app.quit()); });
}
