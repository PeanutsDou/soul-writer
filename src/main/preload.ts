import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Books
  listBooks: () => ipcRenderer.invoke('api:listBooks'),
  createBook: (name: string) => ipcRenderer.invoke('api:createBook', name),
  deleteBook: (name: string) => ipcRenderer.invoke('api:deleteBook', name),
  renameBook: (oldName: string, newName: string) => ipcRenderer.invoke('api:renameBook', oldName, newName),
  getBookMeta: (bookName: string) => ipcRenderer.invoke('api:getBookMeta', bookName),

  // Groups
  createGroup: (bookName: string, name: string) => ipcRenderer.invoke('api:createGroup', bookName, name),
  renameGroup: (bookName: string, oldName: string, newName: string) => ipcRenderer.invoke('api:renameGroup', bookName, oldName, newName),
  deleteGroup: (bookName: string, groupName: string) => ipcRenderer.invoke('api:deleteGroup', bookName, groupName),
  toggleGroup: (bookName: string, groupName: string) => ipcRenderer.invoke('api:toggleGroup', bookName, groupName),

  // Chapters
  createChapter: (bookName: string, name: string, groupId?: string) => ipcRenderer.invoke('api:createChapter', bookName, name, groupId),
  renameChapter: (bookName: string, oldName: string, newName: string) => ipcRenderer.invoke('api:renameChapter', bookName, oldName, newName),
  deleteChapter: (bookName: string, chapterName: string) => ipcRenderer.invoke('api:deleteChapter', bookName, chapterName),
  moveChapter: (bookName: string, chapterName: string, targetGroupId: string | null) => ipcRenderer.invoke('api:moveChapter', bookName, chapterName, targetGroupId),

  // Documents
  getDocument: (bookName: string, chapterName: string) => ipcRenderer.invoke('api:getDocument', bookName, chapterName),
  saveDocument: (bookName: string, chapterName: string, content: any) => ipcRenderer.invoke('api:saveDocument', bookName, chapterName, content),

  // Window
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
};

contextBridge.exposeInMainWorld('api', api);
