import React, { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import EditorPanel from './EditorPanel';
import ChatPanel from '../ai/ChatPanel';
import ResizeHandle from '../ResizeHandle';

const EditorLayout: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(340);

  const onResizeLeft = useCallback((delta: number) => {
    setLeftWidth((w) => Math.max(160, Math.min(500, w + delta)));
  }, []);

  const onResizeRight = useCallback((delta: number) => {
    setRightWidth((w) => Math.max(240, Math.min(600, w - delta)));
  }, []);

  return (
    <div className="editor-layout">
      <div className="editor-body">
        <div className="sidebar" style={{ width: leftWidth }}>
          <Sidebar />
        </div>
        <ResizeHandle onResize={onResizeLeft} />
        <EditorPanel />
        <ResizeHandle onResize={onResizeRight} />
        <ChatPanel width={rightWidth} />
      </div>
    </div>
  );
};

export default EditorLayout;
