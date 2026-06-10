import { create } from 'zustand';

const safeApi = () => (window as any).api || {};

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
  currentBook: string | null;
  currentChapter: string | null;
  meta: BookMeta | null;
  document: any | null;
  wordCount: number;
  saveStatus: string;

  setCurrentBook: (name: string | null) => void;
  setCurrentChapter: (name: string | null) => void;
  loadMeta: (bookName: string) => Promise<void>;
  loadDocument: (bookName: string, chapterName: string) => Promise<void>;
  saveDocument: (content: any) => Promise<void>;

  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (groupName: string) => Promise<void>;
  toggleGroup: (groupName: string) => Promise<void>;

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

  loadMeta: async (bookName) => {
    const meta = await safeApi().getBookMeta(bookName);
    set({ meta });
  },

  loadDocument: async (bookName, chapterName) => {
    const doc = await safeApi().getDocument(bookName, chapterName);
    set({ document: doc, currentChapter: chapterName, wordCount: countWords(doc), saveStatus: '' });
  },

  saveDocument: async (content) => {
    const { currentBook, currentChapter } = get();
    if (!currentBook || !currentChapter) return;
    set({ saveStatus: '保存中...' });
    try {
      await safeApi().saveDocument(currentBook, currentChapter, content);
      set({ document: content, wordCount: countWords(content), saveStatus: '已保存' });
    } catch {
      set({ saveStatus: '保存失败' });
    }
  },

  createGroup: async (name) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().createGroup(currentBook, name);
    await get().loadMeta(currentBook);
  },

  renameGroup: async (oldName, newName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().renameGroup(currentBook, oldName, newName);
    await get().loadMeta(currentBook);
  },

  deleteGroup: async (groupName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().deleteGroup(currentBook, groupName);
    await get().loadMeta(currentBook);
  },

  toggleGroup: async (groupName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().toggleGroup(currentBook, groupName);
    await get().loadMeta(currentBook);
  },

  createChapter: async (name, groupId) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().createChapter(currentBook, name, groupId || undefined);
    await get().loadMeta(currentBook);
  },

  renameChapter: async (oldName, newName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().renameChapter(currentBook, oldName, newName);
    await get().loadMeta(currentBook);
    if (get().currentChapter === oldName) {
      set({ currentChapter: newName });
    }
  },

  deleteChapter: async (chapterName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await safeApi().deleteChapter(currentBook, chapterName);
    await get().loadMeta(currentBook);
    if (get().currentChapter === chapterName) {
      set({ currentChapter: null, document: null, wordCount: 0 });
    }
  },
}));
