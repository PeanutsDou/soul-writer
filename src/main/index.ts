import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { startPythonBackend, stopPythonBackend, getApiBaseUrl } from './python-bridge';
import { setupIpcHandlers, setApiBaseUrl } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, Math.floor(sw * 0.85)),
    height: Math.min(900, Math.floor(sh * 0.85)),
    minWidth: 900,
    minHeight: 600,
    title: 'Soul Writer',
    show: false,
    frame: false,
    backgroundColor: '#fbfbf9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load renderer
  if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5175');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Start Python backend
  try {
    await startPythonBackend();
    setApiBaseUrl(getApiBaseUrl());
  } catch (err) {
    console.error('Failed to start Python backend:', err);
  }

  setupIpcHandlers(mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});
