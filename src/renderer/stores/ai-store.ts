import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ModelConfig } from './model-config-store';

export interface ToolCall {
  id: string;
  name: string;
  args: any;
  result?: string;
  phase: 'running' | 'done';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  toolCalls?: ToolCall[];
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
let toolId = 0;

// Expose chat-busy state so document store can skip saves
export let isChatBusy = false;

async function reloadWorkspace() {
  const { useDocumentStore } = await import('./document-store');
  const { useBookStore } = await import('./book-store');
  const docState = useDocumentStore.getState();
  const bookState = useBookStore.getState();

  if (docState.currentBook && docState.currentChapter) {
    try {
      const doc = await invoke<any>('get_document', {
        bookName: docState.currentBook,
        chapterName: docState.currentChapter,
      });
      const count = doc?._count ?? 0;
      useDocumentStore.setState({ document: doc, wordCount: count });
    } catch {}
    try { await docState.loadMeta(docState.currentBook); } catch {}
  }
  try { await bookState.loadBooks(); } catch {}
}

export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  streaming: false,
  selectedConfigId: null,
  unlisten: null,

  init: async () => {
    const prev = get().unlisten;
    if (prev) prev();

    const unlistenChunk = await listen<{ content: string }>('chat:chunk', (event) => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          last.content += event.payload.content;
        }
        return { messages: msgs };
      });
    });

    const unlistenTool = await listen<{ phase: string; name: string; args?: any; result?: string }>('chat:tool', (event) => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (!last || last.role !== 'assistant') return { messages: msgs };

        if (!last.toolCalls) last.toolCalls = [];

        if (event.payload.phase === 'start') {
          last.toolCalls.push({
            id: `tc_${++toolId}`,
            name: event.payload.name,
            args: event.payload.args || {},
            phase: 'running',
          });
        } else if (event.payload.phase === 'end') {
          const running = last.toolCalls.find(t => t.name === event.payload.name && t.phase === 'running');
          if (running) {
            running.phase = 'done';
            running.result = event.payload.result;
          }
        }
        return { messages: msgs };
      });
    });

    const unlistenErr = await listen<{ error: string }>('chat:error', () => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          last.streaming = false;
          last.content += '\n\n[错误] 请求失败';
        }
        return { messages: msgs, streaming: false };
      });
      isChatBusy = false;
    });

    const unlistenDone = await listen('chat:done', () => {
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          last.streaming = false;
        }
        return { messages: msgs, streaming: false };
      });
      isChatBusy = false;
      // Refresh workspace after AI modifications
      reloadWorkspace();
    });

    set({
      unlisten: () => { unlistenChunk(); unlistenTool(); unlistenErr(); unlistenDone(); },
    });
  },

  send: async (text: string) => {
    const { streaming, selectedConfigId } = get();
    if (streaming || !text.trim()) return;

    const { useModelConfigStore } = await import('./model-config-store');
    const configs = useModelConfigStore.getState().configs;
    const config = configs.find((c) => c.id === selectedConfigId) || configs[0];
    if (!config) return;

    const { useDocumentStore } = await import('./document-store');
    const docState = useDocumentStore.getState();

    const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: text };
    const aiMsg: ChatMessage = { id: nextMsgId(), role: 'assistant', content: '', streaming: true };

    set((s) => ({ messages: [...s.messages, userMsg, aiMsg], streaming: true }));
    isChatBusy = true;

    try {
      await invoke('chat', {
        message: text,
        config: { url: config.url, api_key: config.api_key, model: config.model },
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
      isChatBusy = false;
    }
  },

  setConfig: (id) => set({ selectedConfigId: id }),
  clear: () => set({ messages: [] }),
  destroy: () => { const u = get().unlisten; if (u) u(); set({ unlisten: null }); },
}));
