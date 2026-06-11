import { create } from 'zustand';

interface EditorPrefs {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
}

const STORAGE_KEY = 'soul-writer-editor-prefs';

const defaults: EditorPrefs = {
  fontFamily: '默认',
  fontSize: '16',
  lineHeight: '1.8',
};

function load(): EditorPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return { ...defaults };
}

function save(prefs: EditorPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

interface EditorPrefsState extends EditorPrefs {
  setFontFamily: (v: string) => void;
  setFontSize: (v: string) => void;
  setLineHeight: (v: string) => void;
}

export const useEditorPrefs = create<EditorPrefsState>((set, get) => ({
  ...load(),

  setFontFamily: (fontFamily) => {
    set({ fontFamily });
    save({ ...get(), fontFamily });
  },

  setFontSize: (fontSize) => {
    set({ fontSize });
    save({ ...get(), fontSize });
  },

  setLineHeight: (lineHeight) => {
    set({ lineHeight });
    save({ ...get(), lineHeight });
  },
}));
