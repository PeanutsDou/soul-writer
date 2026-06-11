import React from 'react';
import type { ChatMessage } from '../../stores/ai-store';

interface Props {
  message: ChatMessage;
}

const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`msg-outer ${isUser ? 'msg-outer-user' : 'msg-outer-assistant'}`}>
      <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
        <div className="message-content">{message.content || ''}</div>
        {message.streaming && (
          <div className="streaming-spark" />
        )}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
