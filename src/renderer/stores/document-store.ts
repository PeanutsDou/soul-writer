import { create } from 'zustand';

interface Group {
  id: string;
  name: string;
  order: number;
  expanded: boolean;
  chapters: string[];
}

interface BookMeta {
  groups: Group[];
  ungrouped: string[];
}

interface DocumentState {
  // Current book
  currentBook: string | null;
  currentChapter: string | null;
  meta: BookMeta | null;
  document: any | null;
  wordCount: number;
  saveStatus: string;

  // Actions
  setCurrentBook: (name: string | null) => void;
  setCurrentChapter: (name: string | null) => void;
  loadMeta: (bookName: string) => Promise<void>;
  loadDocument: (bookName: string, chapterName: string) => Promise<void>;
  saveDocument: (content: any) => Promise<void>;

  // Group actions
  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (groupName: string) => Promise<void>;
  toggleGroup: (groupName: string) => Promise<void>;

  // Chapter actions
  createChapter: (name: string, groupId?: string) => Promise<void>;
  renameChapter: (oldName: string, newName: string) => Promise<void>;
  deleteChapter: (chapterName: string) => Promise<void>;
}

function countWords(doc: any): number {
  let count = 0;
  function walk(node: any) {
    if (typeof node === 'object' && node !== null) {
      if (node.text) count += node.text.length;
      for (const v of Object.values(node)) walk(v);
    }
    if (Array.isArray(node)) node.forEach(walk);
  }
  walk(doc);
  return count;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentBook: null,
  currentChapter: null,
  meta: null,
  document: null,
  wordCount: 0,
  saveStatus: '',

  setCurrentBook: (name) => set({ currentBook: name, currentChapter: null, document: null, meta: null, wordCount: 0 }),

  setCurrentChapter: (name) => set({ currentChapter: name }),

  loadMeta: async (bookName: string) => {
    const meta = await window.api.getBookMeta(bookName);
    set({ meta });
  },

  loadDocument: async (bookName: string, chapterName: string) => {
    const doc = await window.api.getDocument(bookName, chapterName);
    set({ document: doc, currentChapter: chapterName, wordCount: countWords(doc), saveStatus: '' });
  },

  saveDocument: async (content: any) => {
    const { currentBook, currentChapter } = get();
    if (!currentBook || !currentChapter) return;
    set({ saveStatus: '保存中...' });
    try {
      await window.api.saveDocument(currentBook, currentChapter, content);
      set({ document: content, wordCount: countWords(content), saveStatus: '已保存' });
    } catch {
      set({ saveStatus: '保存失败' });
    }
  },

  createGroup: async (name: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.createGroup(currentBook, name);
    await get().loadMeta(currentBook);
  },

  renameGroup: async (oldName: string, newName: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.renameGroup(currentBook, oldName, newName);
    await get().loadMeta(currentBook);
  },

  deleteGroup: async (groupName: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.deleteGroup(currentBook, groupName);
    await get().loadMeta(currentBook);
  },

  toggleGroup: async (groupName: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.toggleGroup(currentBook, groupName);
    await get().loadMeta(currentBook);
  },

  createChapter: async (name: string, groupId?: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.createChapter(currentBook, name, groupId || undefined);
    await get().loadMeta(currentBook);
  },

  renameChapter: async (oldName: string, newName: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.renameChapter(currentBook, oldName, newName);
    await get().loadMeta(currentBook);
    if (get().currentChapter === oldName) {
      set({ currentChapter: newName });
    }
  },

  deleteChapter: async (chapterName: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await window.api.deleteChapter(currentBook, chapterName);
    await get().loadMeta(currentBook);
    if (get().currentChapter === chapterName) {
      set({ currentChapter: null, document: null, wordCount: 0 });
    }
  },
}));
