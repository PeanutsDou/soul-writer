import React from 'react';
import Sidebar from './Sidebar';
import EditorPanel from './EditorPanel';

const EditorLayout: React.FC = () => {
  return (
    <div className="editor-layout">
      <div className="editor-body">
        <Sidebar />
        <EditorPanel />
      </div>
    </div>
  );
};

export default EditorLayout;
