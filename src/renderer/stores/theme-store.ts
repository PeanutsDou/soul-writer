import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('soul-writer-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return 'light';
}

function saveTheme(mode: ThemeMode) {
  try {
    localStorage.setItem('soul-writer-theme', mode);
  } catch {}
}

const initialMode = loadTheme();

// Apply theme immediately to prevent flash
document.documentElement.setAttribute('data-theme', initialMode);

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  toggle: () =>
    set((s) => {
      const next = s.mode === 'light' ? 'dark' : 'light';
      saveTheme(next);
      return { mode: next };
    }),
  setMode: (mode) => {
    saveTheme(mode);
    set({ mode });
  },
}));

export type { ThemeMode };
