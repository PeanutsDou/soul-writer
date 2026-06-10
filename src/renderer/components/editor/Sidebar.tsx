import React, { useState, useCallback } from 'react';
import { useDocumentStore } from '../../stores/document-store';
import DocumentTree from './DocumentTree';

const Sidebar: React.FC = () => {
  const { meta, currentBook, createGroup, createChapter } = useDocumentStore();
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [name, setName] = useState('');

  const handleCreateGroup = useCallback(async () => {
    if (!name.trim()) return;
    await createGroup(name.trim());
    setShowNewGroup(false);
    setName('');
  }, [name, createGroup]);

  const handleCreateChapter = useCallback(async () => {
    if (!name.trim()) return;
    await createChapter(name.trim());
    setShowNewChapter(false);
    setName('');
  }, [name, createChapter]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-book-name">{currentBook}</span>
      </div>
      <div className="sidebar-list">
        <DocumentTree />
      </div>
      <div className="sidebar-footer">
        {showNewGroup ? (
          <div style={{ display: 'flex', gap: 4, padding: '0 8px' }}>
            <input
              className="inline-input"
              placeholder="组名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              onBlur={() => { setShowNewGroup(false); setName(''); }}
              autoFocus
            />
          </div>
        ) : showNewChapter ? (
          <div style={{ display: 'flex', gap: 4, padding: '0 8px' }}>
            <input
              className="inline-input"
              placeholder="章节名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChapter()}
              onBlur={() => { setShowNewChapter(false); setName(''); }}
              autoFocus
            />
          </div>
        ) : (
          <>
            <button className="sidebar-btn" onClick={() => setShowNewGroup(true)}>＋ 新建组</button>
            <button className="sidebar-btn" onClick={() => setShowNewChapter(true)}>＋ 新建章</button>
          </>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
