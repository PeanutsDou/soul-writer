import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ModelConfig } from './model-config-store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
}

interface AiState {
  messages: ChatMessage[];
  streaming: boolean;
  selectedConfigId: string | null;
  unlisten: UnlistenFn | null;

  init: () => Promise<void>;
  send: (text: string) => Promise<void>;
  setConfig: (id: string) => void;
  clear: () => void;
  destroy: () => void;
}

let msgId = 0;
const nextMsgId = () => `msg_${++msgId}`;

export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  streaming: false,
  selectedConfigId: null,
  unlisten: null,

  init: async () => {
    // Clean up previous listener
    const prev = get().unlisten;
    if (prev) prev();

    const unlisten = await listen<{ content: string }>('chat:chunk', (event) => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          last.content += event.payload.content;
        }
        return { messages: msgs };
      });
    });

    // Listen for chat errors
    const unlistenErr = await listen<{ error: string }>('chat:error', () => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          last.streaming = false;
          last.content += '\n\n[错误] API 调用失败';
        }
        return { messages: msgs, streaming: false };
      });
    });

    // Listen for chat done
    const unlistenDone = await listen('chat:done', () => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          last.streaming = false;
        }
        return { messages: msgs, streaming: false };
      });
    });

    set({
      unlisten: () => { unlisten(); unlistenErr(); unlistenDone(); },
    });
  },

  send: async (text: string) => {
    const { streaming, selectedConfigId } = get();
    if (streaming || !text.trim()) return;

    const { useModelConfigStore } = await import('./model-config-store');
    const configs = useModelConfigStore.getState().configs;
    const config = configs.find((c) => c.id === selectedConfigId) || configs[0];
    if (!config) return;

    // Get current book/chapter from document store
    const { useDocumentStore } = await import('./document-store');
    const docState = useDocumentStore.getState();

    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'user',
      content: text,
    };
    const aiMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'assistant',
      content: '',
      streaming: true,
    };

    set((s) => ({
      messages: [...s.messages, userMsg, aiMsg],
      streaming: true,
    }));

    try {
      await invoke('chat', {
        message: text,
        config: {
          url: config.url,
          api_key: config.api_key,
          model: config.model,
        },
        currentBook: docState.currentBook,
        currentChapter: docState.currentChapter,
      });
    } catch (err: any) {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          last.streaming = false;
          last.content = `[错误] ${err?.toString?.() || '请求失败'}`;
        }
        return { messages: msgs, streaming: false };
      });
    }
  },

  setConfig: (id: string) => set({ selectedConfigId: id }),

  clear: () => set({ messages: [] }),

  destroy: () => {
    const { unlisten } = get();
    if (unlisten) unlisten();
    set({ unlisten: null });
  },
}));
