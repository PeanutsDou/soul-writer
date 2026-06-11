import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ModelConfig {
  id: string;
  name: string;
  url: string;
  model: string;
  api_key: string;
  context_window?: number;
}

interface ModelConfigState {
  configs: ModelConfig[];
  loading: boolean;
  load: () => Promise<void>;
  save: (configs: ModelConfig[]) => Promise<void>;
  add: (cfg: Omit<ModelConfig, 'id'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (id: string, cfg: Partial<ModelConfig>) => Promise<void>;
}

let nextId = () => Math.random().toString(36).slice(2, 10);

export const useModelConfigStore = create<ModelConfigState>((set, get) => ({
  configs: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const result = await invoke<any>('get_model_configs');
      set({ configs: (result?.configs || []).map((config: ModelConfig) => ({ ...config, context_window: config.context_window || 1_000_000 })), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  save: async (configs) => {
    await invoke('save_model_configs', { configs });
    set({ configs });
  },

  add: async (cfg) => {
    const configs = [...get().configs, { ...cfg, id: nextId() }];
    await get().save(configs);
  },

  remove: async (id) => {
    const configs = get().configs.filter((c) => c.id !== id);
    await get().save(configs);
  },

  update: async (id, patch) => {
    const configs = get().configs.map((c) =>
      c.id === id ? { ...c, ...patch } : c
    );
    await get().save(configs);
  },
}));
