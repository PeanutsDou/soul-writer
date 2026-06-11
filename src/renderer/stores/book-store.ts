import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface Book {
  id: string;
  name: string;
  dirName?: string;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
  totalWords: number;
}

interface BookState {
  books: Book[];
  loading: boolean;
  error: string | null;
  loadBooks: () => Promise<void>;
  createBook: (name: string) => Promise<void>;
  deleteBook: (name: string) => Promise<void>;
  renameBook: (oldName: string, newName: string) => Promise<void>;
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  loading: false,
  error: null,

  loadBooks: async () => {
    set({ loading: true, error: null });
    try {
      const books = await invoke<Book[]>('list_books');
      set({ books, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.toString() || '加载失败' });
    }
  },

  createBook: async (name: string) => {
    await invoke('create_book', { name });
    await get().loadBooks();
  },

  deleteBook: async (name: string) => {
    await invoke('delete_book', { name });
    await get().loadBooks();
  },

  renameBook: async (oldName: string, newName: string) => {
    await invoke('rename_book', { oldName, newName });
    await get().loadBooks();
  },
}));
