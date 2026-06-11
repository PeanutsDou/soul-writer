import React from 'react';
import Sidebar from './Sidebar';
import EditorPanel from './EditorPanel';
import ChatPanel from '../ai/ChatPanel';

const EditorLayout: React.FC = () => {
  return (
    <div className="editor-layout">
      <div className="editor-body">
        <Sidebar />
        <EditorPanel />
        <ChatPanel />
      </div>
    </div>
  );
};

export default EditorLayout;
