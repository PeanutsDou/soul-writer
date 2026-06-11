import React, { useEffect, useRef } from 'react';
import { useAiStore } from '../../stores/ai-store';
import { useModelConfigStore } from '../../stores/model-config-store';
import ChatMessageBubble from './ChatMessage';
import ChatInput from './ChatInput';
import ModelSwitcher from './ModelSwitcher';

interface Props {
  width?: number;
}

const ChatPanel: React.FC<Props> = ({ width }) => {
  const { messages, streaming, send, init, destroy } = useAiStore();
  const configs = useModelConfigStore((s) => s.configs);
  const loadConfigs = useModelConfigStore((s) => s.load);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConfigs(); init(); return () => destroy(); }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' });
  }, [messages, streaming]);

  const hasConfig = configs.length > 0;

  return (
    <div className="chat-panel" style={width ? { width } : undefined}>
      <div className="chat-messages">
        {!hasConfig ? (
          <div className="chat-empty"><p>请先在顶部设置里配置 API Key</p></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty"><h2>AI 助手</h2><p>开始对话，或让它读取和修改当前章节</p></div>
        ) : (
          messages.map((msg) => <ChatMessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-panel-footer">
        <ChatInput onSend={send} disabled={streaming || !hasConfig} />
        <ModelSwitcher />
      </div>
    </div>
  );
};

export default ChatPanel;
