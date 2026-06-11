import React, { useState, useCallback } from 'react';
import { useDocumentStore } from '../../stores/document-store';
import DocumentTree from './DocumentTree';

const Sidebar: React.FC = () => {
  const { meta, currentBook, createGroup, createChapter } = useDocumentStore();
  const [error, setError] = useState<string | null>(null);

  const handleListContext = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.sidebar-list') || target.closest('.doc-group') || target.closest('.doc-chapter')) {
      return;
    }
    e.preventDefault();
    // Context menu handled by DocumentTree now, but keep sidebar-level context
  }, []);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-book-name">{currentBook}</span>
      </div>
      <div className="sidebar-list" onContextMenu={handleListContext}>
        {error && (
          <div style={{ padding: '4px 14px', color: 'var(--error)', fontSize: 11 }}>{error}</div>
        )}
        <DocumentTree />
      </div>
    </div>
  );
};

export default Sidebar;
