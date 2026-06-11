import React, { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(68);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

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

  // Resize handle
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = inputHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [inputHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      setInputHeight(Math.max(44, Math.min(300, startHeight.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="chat-input-area">
      <div className="input-resize-handle" onMouseDown={onResizeMouseDown} />
      <div className="chat-input-wrapper">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          style={{ height: inputHeight }}
        />
        <div className="input-controls">
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
