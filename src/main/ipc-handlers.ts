import { ipcMain, BrowserWindow } from 'electron';
import http from 'http';

let apiBaseUrl = 'http://127.0.0.1:8720';

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url;
}

function apiRequest(method: string, path: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, apiBaseUrl);
    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(json.detail || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  // Books
  ipcMain.handle('api:listBooks', async () => {
    const data = await apiRequest('GET', '/api/books/');
    return data.books || [];
  });

  ipcMain.handle('api:createBook', async (_e, name: string) => {
    return apiRequest('POST', '/api/books/', { name });
  });

  ipcMain.handle('api:deleteBook', async (_e, name: string) => {
    return apiRequest('DELETE', `/api/books/${encodeURIComponent(name)}`);
  });

  ipcMain.handle('api:renameBook', async (_e, oldName: string, newName: string) => {
    return apiRequest('PUT', `/api/books/${encodeURIComponent(oldName)}/rename`, { name: newName });
  });

  ipcMain.handle('api:getBookMeta', async (_e, bookName: string) => {
    return apiRequest('GET', `/api/books/${encodeURIComponent(bookName)}/meta`);
  });

  // Groups
  ipcMain.handle('api:createGroup', async (_e, bookName: string, name: string) => {
    return apiRequest('POST', `/api/groups/${encodeURIComponent(bookName)}`, { name });
  });

  ipcMain.handle('api:renameGroup', async (_e, bookName: string, oldName: string, newName: string) => {
    return apiRequest('PUT', `/api/groups/${encodeURIComponent(bookName)}/${encodeURIComponent(oldName)}/rename`, { newName });
  });

  ipcMain.handle('api:deleteGroup', async (_e, bookName: string, groupName: string) => {
    return apiRequest('DELETE', `/api/groups/${encodeURIComponent(bookName)}/${encodeURIComponent(groupName)}`);
  });

  ipcMain.handle('api:toggleGroup', async (_e, bookName: string, groupName: string) => {
    return apiRequest('PUT', `/api/groups/${encodeURIComponent(bookName)}/${encodeURIComponent(groupName)}/toggle`);
  });

  // Chapters
  ipcMain.handle('api:createChapter', async (_e, bookName: string, name: string, groupId?: string) => {
    return apiRequest('POST', `/api/documents/${encodeURIComponent(bookName)}/chapters`, { name, groupId: groupId || null });
  });

  ipcMain.handle('api:renameChapter', async (_e, bookName: string, oldName: string, newName: string) => {
    return apiRequest('PUT', `/api/documents/${encodeURIComponent(bookName)}/chapters/${encodeURIComponent(oldName)}/rename`, { newName });
  });

  ipcMain.handle('api:deleteChapter', async (_e, bookName: string, chapterName: string) => {
    return apiRequest('DELETE', `/api/documents/${encodeURIComponent(bookName)}/chapters/${encodeURIComponent(chapterName)}`);
  });

  ipcMain.handle('api:moveChapter', async (_e, bookName: string, chapterName: string, targetGroupId: string | null) => {
    return apiRequest('PUT', `/api/documents/${encodeURIComponent(bookName)}/chapters/${encodeURIComponent(chapterName)}/move`, { targetGroupId });
  });

  // Documents
  ipcMain.handle('api:getDocument', async (_e, bookName: string, chapterName: string) => {
    return apiRequest('GET', `/api/documents/${encodeURIComponent(bookName)}/chapters/${encodeURIComponent(chapterName)}`);
  });

  ipcMain.handle('api:saveDocument', async (_e, bookName: string, chapterName: string, content: any) => {
    return apiRequest('PUT', `/api/documents/${encodeURIComponent(bookName)}/chapters/${encodeURIComponent(chapterName)}`, { content });
  });

  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
}
