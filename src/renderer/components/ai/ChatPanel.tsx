import React, { useEffect, useRef } from 'react';
import { useAiStore } from '../../stores/ai-store';
import { useModelConfigStore } from '../../stores/model-config-store';
import ChatMessageBubble from './ChatMessage';
import ChatInput from './ChatInput';
import ModelSwitcher from './ModelSwitcher';

const ChatPanel: React.FC = () => {
  const { messages, streaming, send, init, destroy } = useAiStore();
  const configs = useModelConfigStore((s) => s.configs);
  const loadConfigs = useModelConfigStore((s) => s.load);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConfigs();
    init();
    return () => destroy();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasConfig = configs.length > 0;

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span>AI 助手</span>
      </div>

      <div className="chat-messages">
        {!hasConfig ? (
          <div className="chat-empty">
            <p>点击顶部 ⚙ 设置 API Key</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <p>开始与 AI 对话</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <ModelSwitcher />
      <ChatInput
        onSend={send}
        disabled={streaming || !hasConfig}
      />
    </div>
  );
};

export default ChatPanel;
