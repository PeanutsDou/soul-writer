import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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
export let isChatBusy = false;

async function reloadWorkspace() {
  const { useDocumentStore } = await import('./document-store');
  const { useBookStore } = await import('./book-store');
  const ds = useDocumentStore.getState();
  if (ds.currentBook && ds.currentChapter) {
    try {
      const doc = await invoke<any>('get_document', { bookName: ds.currentBook, chapterName: ds.currentChapter });
      useDocumentStore.setState({ document: doc, wordCount: doc?._count ?? 0 });
    } catch {}
    try { await ds.loadMeta(ds.currentBook); } catch {}
  }
  try { await useBookStore.getState().loadBooks(); } catch {}
}

function updateLastMsg(messages: ChatMessage[], fn: (msg: ChatMessage) => ChatMessage): ChatMessage[] {
  if (messages.length === 0) return messages;
  const idx = messages.length - 1;
  return [...messages.slice(0, idx), fn(messages[idx]), ...messages.slice(idx + 1)];
}

export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  streaming: false,
  selectedConfigId: null,
  unlisten: null,

  init: async () => {
    get().unlisten?.();

    const u1 = await listen<{ content: string }>('chat:chunk', (e) => {
      set(s => ({
        messages: updateLastMsg(s.messages, m => (
          m.role === 'assistant' && m.streaming
            ? { ...m, content: m.content + e.payload.content }
            : m
        )),
      }));
    });

    const u2 = await listen<{ phase: string; name: string; args?: any; result?: string }>('chat:tool', (e) => {
      set(s => ({
        messages: updateLastMsg(s.messages, m => {
          if (m.role !== 'assistant') return m;
          const tcs = m.toolCalls ? [...m.toolCalls] : [];
          if (e.payload.phase === 'start') {
            tcs.push({ id: `tc_${++toolId}`, name: e.payload.name, args: e.payload.args || {}, phase: 'running' });
          } else {
            const idx = tcs.findIndex(t => t.name === e.payload.name && t.phase === 'running');
            if (idx >= 0) tcs[idx] = { ...tcs[idx], phase: 'done', result: e.payload.result };
          }
          return { ...m, toolCalls: tcs };
        }),
      }));
    });

    const u3 = await listen<{ error: string }>('chat:error', () => {
      set(s => ({
        messages: updateLastMsg(s.messages, m =>
          m.role === 'assistant' && m.streaming
            ? { ...m, streaming: false, content: m.content + '\n\n[错误]' }
            : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
    });

    const u4 = await listen('chat:done', () => {
      set(s => ({
        messages: updateLastMsg(s.messages, m =>
          m.role === 'assistant' ? { ...m, streaming: false } : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
      reloadWorkspace();
    });

    set({ unlisten: () => { u1(); u2(); u3(); u4(); } });
  },

  send: async (text) => {
    const s = get();
    if (s.streaming || !text.trim()) return;

    const { useModelConfigStore } = await import('./model-config-store');
    const configs = useModelConfigStore.getState().configs;
    const config = configs.find(c => c.id === s.selectedConfigId) || configs[0];
    if (!config) return;

    const { useDocumentStore } = await import('./document-store');
    const ds = useDocumentStore.getState();

    const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: text };
    const aiMsg: ChatMessage = { id: nextMsgId(), role: 'assistant', content: '', streaming: true };

    set(st => ({ messages: [...st.messages, userMsg, aiMsg], streaming: true }));
    isChatBusy = true;

    try {
      await invoke('chat', {
        message: text,
        config: { url: config.url, api_key: config.api_key, model: config.model },
        currentBook: ds.currentBook,
        currentChapter: ds.currentChapter,
      });
    } catch (err: any) {
      set(st => ({
        messages: updateLastMsg(st.messages, m =>
          m.role === 'assistant' && m.streaming
            ? { ...m, streaming: false, content: `[错误] ${err?.toString?.() || '请求失败'}` }
            : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
    }
  },

  setConfig: (id) => set({ selectedConfigId: id }),
  clear: () => set({ messages: [] }),
  destroy: () => { get().unlisten?.(); set({ unlisten: null }); },
}));
