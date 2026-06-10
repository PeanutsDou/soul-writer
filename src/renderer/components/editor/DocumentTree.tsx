import React, { useState, useCallback } from 'react';
import { useDocumentStore } from '../../stores/document-store';

interface ContextMenu {
  x: number;
  y: number;
  items: { label: string; danger?: boolean; action: () => void }[];
}

const DocumentTree: React.FC = () => {
  const {
    meta, currentChapter, setCurrentChapter,
    loadDocument, currentBook,
    toggleGroup, renameGroup, deleteGroup,
    createChapter, renameChapter, deleteChapter,
  } = useDocumentStore();

  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // "group:name" or "chapter:name"
  const [editValue, setEditValue] = useState('');

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const handleChapterClick = useCallback(async (chapterName: string) => {
    if (!currentBook) return;
    setCurrentChapter(chapterName);
    await loadDocument(currentBook, chapterName);
  }, [currentBook, setCurrentChapter, loadDocument]);

  const handleGroupContext = useCallback((e: React.MouseEvent, groupName: string) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '重命名', action: () => { setEditing(`group:${groupName}`); setEditValue(groupName); } },
        { label: '删除组', danger: true, action: () => deleteGroup(groupName) },
      ],
    });
  }, [deleteGroup]);

  const handleChapterContext = useCallback((e: React.MouseEvent, chapterName: string) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '重命名', action: () => { setEditing(`chapter:${chapterName}`); setEditValue(chapterName); } },
        { label: '删除', danger: true, action: () => deleteChapter(chapterName) },
      ],
    });
  }, [deleteChapter]);

  const handleEditDone = useCallback(async () => {
    if (!editing || !editValue.trim()) {
      setEditing(null);
      return;
    }
    const [type, oldName] = editing.split(':');
    if (type === 'group' && oldName !== editValue.trim()) {
      await renameGroup(oldName, editValue.trim());
    } else if (type === 'chapter' && oldName !== editValue.trim()) {
      await renameChapter(oldName, editValue.trim());
    }
    setEditing(null);
  }, [editing, editValue, renameGroup, renameChapter]);

  if (!meta) return null;

  return (
    <div>
      {/* Groups */}
      {meta.groups.map((group) => (
        <div key={group.id} className="doc-group">
          <div
            className="doc-group-header"
            onClick={() => toggleGroup(group.name)}
            onContextMenu={(e) => handleGroupContext(e, group.name)}
          >
            <span className="doc-group-toggle">{group.expanded ? '▾' : '▸'}</span>
            {editing === `group:${group.name}` ? (
              <input
                className="inline-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleEditDone}
                onKeyDown={(e) => e.key === 'Enter' && handleEditDone()}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1 }}
              />
            ) : (
              <span className="doc-group-name" onDoubleClick={() => { setEditing(`group:${group.name}`); setEditValue(group.name); }}>
                {group.name}
              </span>
            )}
          </div>
          {group.expanded && group.chapters.map((ch) => (
            <div
              key={ch}
              className={`doc-chapter ${currentChapter === ch ? 'active' : ''}`}
              onClick={() => handleChapterClick(ch)}
              onContextMenu={(e) => handleChapterContext(e, ch)}
            >
              <span className="doc-chapter-icon">📄</span>
              {editing === `chapter:${ch}` ? (
                <input
                  className="inline-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleEditDone}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditDone()}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
              ) : (
                <span
                  className="doc-chapter-name"
                  onDoubleClick={() => { setEditing(`chapter:${ch}`); setEditValue(ch); }}
                >
                  {ch}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Ungrouped chapters */}
      {meta.ungrouped.map((ch) => (
        <div
          key={ch}
          className={`doc-chapter ${currentChapter === ch ? 'active' : ''}`}
          style={{ paddingLeft: 14 }}
          onClick={() => handleChapterClick(ch)}
          onContextMenu={(e) => handleChapterContext(e, ch)}
        >
          <span className="doc-chapter-icon">📄</span>
          {editing === `chapter:${ch}` ? (
            <input
              className="inline-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditDone}
              onKeyDown={(e) => e.key === 'Enter' && handleEditDone()}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1 }}
            />
          ) : (
            <span
              className="doc-chapter-name"
              onDoubleClick={() => { setEditing(`chapter:${ch}`); setEditValue(ch); }}
            >
              {ch}
            </span>
          )}
        </div>
      ))}

      {/* Context Menu */}
      {ctxMenu && (
        <div className="ctx-menu-overlay" onClick={closeCtxMenu}>
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            {ctxMenu.items.map((item, i) => (
              <button
                key={i}
                className={`ctx-menu-item ${item.danger ? 'danger' : ''}`}
                onClick={() => { item.action(); closeCtxMenu(); }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentTree;
