import React, { useState, useCallback } from 'react';
import { useDocumentStore } from '../../stores/document-store';
import DocumentTree from './DocumentTree';

const Sidebar: React.FC = () => {
  const { currentBook, chapterSort, toggleChapterSort } = useDocumentStore();
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
        <button
          className="chapter-sort-btn"
          type="button"
          onClick={toggleChapterSort}
          title={chapterSort === 'asc' ? '当前按章节正序，点击切换倒序' : '当前按章节倒序，点击切换正序'}
        >
          {chapterSort === 'asc' ? '1→9' : '9→1'}
        </button>
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
