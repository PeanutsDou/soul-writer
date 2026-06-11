import React, { useState, useRef, useCallback } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="chat-input-area">
      <div className="chat-input-wrapper">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="输入消息..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <div className="input-controls">
          <button
            className={`send-btn ${disabled ? '' : 'active'}`}
            onClick={handleSend}
            disabled={disabled || !text.trim()}
          >
            {disabled ? '⏳' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
