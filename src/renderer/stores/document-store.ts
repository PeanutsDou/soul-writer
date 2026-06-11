import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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
  documentRevision: number;
  pendingDocument: any | null;
  wordCount: number;
  saveStatus: string;
  chapterSort: 'asc' | 'desc';

  setCurrentBook: (name: string | null) => void;
  setCurrentChapter: (name: string | null) => void;
  loadMeta: (bookName: string) => Promise<void>;
  loadDocument: (bookName: string, chapterName: string) => Promise<void>;
  stageDocument: (content: any) => void;
  saveDocument: (content?: any) => Promise<void>;
  toggleChapterSort: () => void;

  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (groupName: string) => Promise<void>;
  toggleGroup: (groupName: string) => Promise<void>;

  createChapter: (name: string, groupId?: string) => Promise<void>;
  renameChapter: (oldName: string, newName: string) => Promise<void>;
  deleteChapter: (chapterName: string) => Promise<void>;
  moveChapter: (chapterName: string, targetGroupId: string | null) => Promise<void>;
}

function countWords(doc: any): number {
  let count = 0;
  function walk(node: any) {
    if (typeof node === 'object' && node !== null) {
      if (node.text && typeof node.text === 'string') count += [...node.text].length;
      for (const value of Object.values(node)) walk(value);
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
  documentRevision: 0,
  pendingDocument: null,
  wordCount: 0,
  saveStatus: '',
  chapterSort: (() => {
    try { return localStorage.getItem('soul-writer-chapter-sort') === 'desc' ? 'desc' : 'asc'; } catch { return 'asc'; }
  })(),

  setCurrentBook: (name) => {
    try { localStorage.setItem('soul-writer-last-book', name || ''); } catch {}
    set({ currentBook: name, currentChapter: null, document: null, meta: null, wordCount: 0, pendingDocument: null });
  },

  setCurrentChapter: (name) => {
    try { localStorage.setItem('soul-writer-last-chapter', name || ''); } catch {}
    set({ currentChapter: name, document: null, wordCount: 0, saveStatus: '', pendingDocument: null });
  },

  loadMeta: async (bookName) => {
    const meta = await invoke<BookMeta>('get_book_meta', { bookName });
    set({ meta });
  },

  loadDocument: async (bookName, chapterName) => {
    const doc = await invoke<any>('get_document', { bookName, chapterName });
    const count = doc?._count ?? countWords(doc);
    set(s => ({
      document: doc,
      currentChapter: chapterName,
      wordCount: count,
      saveStatus: '',
      pendingDocument: null,
      documentRevision: s.documentRevision + 1,
    }));
  },

  stageDocument: (content) => set({ pendingDocument: content, wordCount: countWords(content) }),

  saveDocument: async (content) => {
    const { currentBook, currentChapter, pendingDocument } = get();
    if (!currentBook || !currentChapter) return;
    const documentToSave = content ?? pendingDocument;
    if (!documentToSave) return;
    const { isChatBusy } = await import('./ai-store');
    if (isChatBusy) {
      set({ pendingDocument: documentToSave, saveStatus: '等待 AI 完成后保存' });
      return;
    }

    set({ saveStatus: '保存中...' });
    try {
      const result = await invoke<any>('save_document', { bookName: currentBook, chapterName: currentChapter, content: documentToSave });
      const backendCount = result?.debug_count ?? countWords(documentToSave);
      set({ document: documentToSave, pendingDocument: null, wordCount: backendCount, saveStatus: '已保存' });
    } catch {
      set({ saveStatus: '保存失败' });
    }
  },

  toggleChapterSort: () => set(state => {
    const chapterSort = state.chapterSort === 'asc' ? 'desc' : 'asc';
    try { localStorage.setItem('soul-writer-chapter-sort', chapterSort); } catch {}
    return { chapterSort };
  }),

  createGroup: async (name) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('create_group', { bookName: currentBook, name });
    await get().loadMeta(currentBook);
  },

  renameGroup: async (oldName, newName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('rename_group', { bookName: currentBook, oldName, newName });
    await get().loadMeta(currentBook);
  },

  deleteGroup: async (groupName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('delete_group', { bookName: currentBook, groupName });
    await get().loadMeta(currentBook);
  },

  toggleGroup: async (groupName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('toggle_group', { bookName: currentBook, groupName });
    await get().loadMeta(currentBook);
  },

  createChapter: async (name, groupId) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('create_chapter', { bookName: currentBook, name, groupId: groupId || null });
    await get().loadMeta(currentBook);
  },

  renameChapter: async (oldName, newName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('rename_chapter', { bookName: currentBook, oldName, newName });
    await get().loadMeta(currentBook);
    if (get().currentChapter === oldName) {
      set({ currentChapter: newName });
    }
  },

  deleteChapter: async (chapterName) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('delete_chapter', { bookName: currentBook, chapterName });
    await get().loadMeta(currentBook);
    if (get().currentChapter === chapterName) {
      set({ currentChapter: null, document: null, pendingDocument: null, wordCount: 0 });
    }
  },

  moveChapter: async (chapterName, targetGroupId) => {
    const { currentBook } = get();
    if (!currentBook) return;
    await invoke('move_chapter', { bookName: currentBook, chapterName, targetGroupId });
    await get().loadMeta(currentBook);
  },
}));
