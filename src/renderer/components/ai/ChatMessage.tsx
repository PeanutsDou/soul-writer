import React from 'react';
import type { ChatMessage } from '../../stores/ai-store';

interface Props {
  message: ChatMessage;
}

const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const isStreaming = message.streaming;

  return (
    <div className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-ai'}`}>
      <div className="chat-msg-role">{isUser ? '你' : 'AI'}</div>
      <div className="chat-msg-content">
        {message.content || (isStreaming ? <span className="chat-cursor">▊</span> : '')}
        {isStreaming && message.content ? <span className="chat-cursor">▊</span> : null}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
