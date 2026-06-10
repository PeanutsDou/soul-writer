import { create } from 'zustand';

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
  loadBooks: () => Promise<void>;
  createBook: (name: string) => Promise<void>;
  deleteBook: (name: string) => Promise<void>;
  renameBook: (oldName: string, newName: string) => Promise<void>;
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  loading: false,

  loadBooks: async () => {
    set({ loading: true });
    try {
      const books = await window.api.listBooks();
      set({ books, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createBook: async (name: string) => {
    await window.api.createBook(name);
    await get().loadBooks();
  },

  deleteBook: async (name: string) => {
    await window.api.deleteBook(name);
    await get().loadBooks();
  },

  renameBook: async (oldName: string, newName: string) => {
    await window.api.renameBook(oldName, newName);
    await get().loadBooks();
  },
}));
