import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

const CHAT_INPUT_HEIGHT_KEY = 'soul-writer-chat-input-height';

function loadInputHeight(): number {
  try {
    const v = localStorage.getItem(CHAT_INPUT_HEIGHT_KEY);
    if (v) return parseInt(v, 10) || 72;
  } catch {}
  return 72;
}

function saveInputHeight(h: number) {
  try { localStorage.setItem(CHAT_INPUT_HEIGHT_KEY, String(h)); } catch {}
}

const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(loadInputHeight);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleSend = useCallback(() => {
    if (disabled || !text.trim()) return;
    onSend(text.trim());
    setText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

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
      const h = Math.max(52, Math.min(300, startHeight.current + delta));
      setInputHeight(h);
      saveInputHeight(h);
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
          placeholder="输入消息... Enter 发送，Shift+Enter 换行"
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
            title="发送"
            type="button"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
