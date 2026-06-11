import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type RunPhase = 'idle' | 'starting' | 'thinking' | 'tool_running' | 'streaming' | 'finishing' | 'error';

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
  phase?: RunPhase;
  error?: string;
  toolCalls?: ToolCall[];
  thinking?: string;
  startedAt?: number;
  completedAt?: number;
}

interface AiState {
  messages: ChatMessage[];
  streaming: boolean;
  selectedConfigId: string | null;
  tokenUsageByConfig: Record<string, number>;
  unlisten: UnlistenFn | null;

  init: () => Promise<void>;
  send: (text: string) => Promise<void>;
  setConfig: (id: string) => void;
  clear: () => Promise<void>;
  destroy: () => void;
}

let msgId = 0;
const nextMsgId = () => `msg_${++msgId}`;
let toolId = 0;
export let isChatBusy = false;
let listenerGeneration = 0;

async function reloadWorkspace() {
  const { useDocumentStore } = await import('./document-store');
  const { useBookStore } = await import('./book-store');
  const ds = useDocumentStore.getState();
  if (ds.currentBook && ds.currentChapter) {
    try { await ds.loadDocument(ds.currentBook, ds.currentChapter); } catch {}
    try { await ds.loadMeta(ds.currentBook); } catch {}
  }
  try { await useBookStore.getState().loadBooks(); } catch {}
}

function updateLastAssistant(messages: ChatMessage[], fn: (msg: ChatMessage) => ChatMessage): ChatMessage[] {
  for (let idx = messages.length - 1; idx >= 0; idx--) {
    if (messages[idx].role === 'assistant') {
      return [...messages.slice(0, idx), fn(messages[idx]), ...messages.slice(idx + 1)];
    }
  }
  return messages;
}

function toErrorText(err: unknown, fallback = '请求失败'): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) return String((err as any).message);
  return String(err || fallback);
}

export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  streaming: false,
  selectedConfigId: null,
  tokenUsageByConfig: {},
  unlisten: null,

  init: async () => {
    const generation = ++listenerGeneration;
    get().unlisten?.();

    const u1 = await listen<{ content: string }>('chat:chunk', (e) => {
      set(s => ({
        messages: updateLastAssistant(s.messages, m => (
          m.streaming
            ? { ...m, content: m.content + e.payload.content, phase: 'streaming' }
            : m
        )),
      }));
    });

    const uThinking = await listen<{ content: string }>('chat:thinking', (e) => {
      set(s => ({
        messages: updateLastAssistant(s.messages, m => (
          m.streaming
            ? { ...m, thinking: (m.thinking || '') + e.payload.content, phase: 'thinking' }
            : m
        )),
      }));
    });

    const uUsage = await listen<{ tokens: number }>('chat:usage', (e) => {
      const state = get();
      const configId = state.selectedConfigId;
      if (!configId) return;
      set(s => ({ tokenUsageByConfig: { ...s.tokenUsageByConfig, [configId]: Math.max(0, e.payload.tokens || 0) } }));
    });

    const u2 = await listen<{ phase: string; id?: string; name: string; args?: any; result?: string }>('chat:tool', (e) => {
      set(s => ({
        messages: updateLastAssistant(s.messages, m => {
          const tcs = m.toolCalls ? [...m.toolCalls] : [];
          if (e.payload.phase === 'start') {
            tcs.push({ id: e.payload.id || `tc_${++toolId}`, name: e.payload.name, args: e.payload.args || {}, phase: 'running' });
            return { ...m, toolCalls: tcs, phase: 'tool_running' };
          }
          const idx = tcs.findIndex(t =>
            (e.payload.id && t.id === e.payload.id) || (!e.payload.id && t.name === e.payload.name && t.phase === 'running')
          );
          if (idx >= 0) tcs[idx] = { ...tcs[idx], phase: 'done', result: e.payload.result };
          return { ...m, toolCalls: tcs, phase: 'thinking' };
        }),
      }));
    });

    const u3 = await listen<{ error: string }>('chat:error', (e) => {
      const error = e.payload?.error || '请求失败';
      set(s => ({
        messages: updateLastAssistant(s.messages, m =>
          m.streaming ? { ...m, streaming: false, phase: 'error', error, content: m.content || error, completedAt: Date.now() } : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
    });

    const u4 = await listen('chat:done', () => {
      set(s => ({
        messages: updateLastAssistant(s.messages, m =>
          m.streaming ? { ...m, streaming: false, phase: 'idle', content: m.content || '（无回复）', completedAt: Date.now() } : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
      reloadWorkspace();
    });

    const dispose = () => { u1(); uThinking(); uUsage(); u2(); u3(); u4(); };
    if (generation !== listenerGeneration) {
      dispose();
      return;
    }
    set({ unlisten: dispose });
  },

  send: async (text) => {
    const s = get();
    if (s.streaming || !text.trim()) return;

    const { useModelConfigStore } = await import('./model-config-store');
    const configs = useModelConfigStore.getState().configs;
    const config = configs.find(c => c.id === s.selectedConfigId) || configs[0];
    if (!config) return;
    if (!s.selectedConfigId) set({ selectedConfigId: config.id });

    const { useDocumentStore } = await import('./document-store');
    const ds = useDocumentStore.getState();
    await ds.saveDocument();

    const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: text };
    const aiMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'assistant',
      content: '',
      streaming: true,
      phase: 'starting',
      toolCalls: [],
      thinking: '',
      startedAt: Date.now(),
    };

    set(st => ({ messages: [...st.messages, userMsg, aiMsg], streaming: true }));
    isChatBusy = true;

    try {
      await invoke('chat', {
        message: text,
        config: { url: config.url, api_key: config.api_key, model: config.model },
        currentBook: ds.currentBook,
        currentChapter: ds.currentChapter,
      });
      set(st => ({
        messages: updateLastAssistant(st.messages, m =>
          m.streaming ? { ...m, streaming: false, phase: 'idle', content: m.content || '（无回复）', completedAt: Date.now() } : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
    } catch (err: any) {
      const error = toErrorText(err);
      set(st => ({
        messages: updateLastAssistant(st.messages, m =>
          m.streaming ? { ...m, streaming: false, phase: 'error', error, content: m.content || error, completedAt: Date.now() } : m
        ),
        streaming: false,
      }));
      isChatBusy = false;
    }
  },

  setConfig: (id) => set({ selectedConfigId: id }),
  clear: async () => {
    const state = get();
    if (state.streaming) return;
    const { useModelConfigStore } = await import('./model-config-store');
    const configs = useModelConfigStore.getState().configs;
    const config = configs.find(c => c.id === state.selectedConfigId) || configs[0];
    if (config) {
      await invoke('reset_agent', {
        config: { url: config.url, api_key: config.api_key, model: config.model },
      });
      set(s => ({
        messages: [],
        tokenUsageByConfig: { ...s.tokenUsageByConfig, [config.id]: 0 },
      }));
    } else {
      set({ messages: [], tokenUsageByConfig: {} });
    }
  },
  destroy: () => {
    listenerGeneration++;
    get().unlisten?.();
    set({ unlisten: null });
  },
}));
