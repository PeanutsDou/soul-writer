import React, { useState, useCallback } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    if (disabled || !text.trim()) return;
    onSend(text.trim());
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="chat-input-inline">
      <input
        className="chat-input-field"
        placeholder="输入消息..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        className="chat-send-inline"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
      >
        ↑
      </button>
    </div>
  );
};

export default ChatInput;
