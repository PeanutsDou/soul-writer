import { create } from 'zustand';

const api = () => (window as any).api || {};

interface Book {
  id: string;
  name: string;
  dirName: string;
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
      if (!api().listBooks) throw new Error('API not available');
      const books = await api().listBooks();
      set({ books, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message || '加载失败' });
    }
  },

  createBook: async (name: string) => {
    await api().createBook(name);
    await get().loadBooks();
  },

  deleteBook: async (name: string) => {
    await api().deleteBook(name);
    await get().loadBooks();
  },

  renameBook: async (oldName: string, newName: string) => {
    await api().renameBook(oldName, newName);
    await get().loadBooks();
  },
}));
