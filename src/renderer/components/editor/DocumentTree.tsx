import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDocumentStore } from '../../stores/document-store';

interface ContextMenu {
  x: number;
  y: number;
  items: { label: string; danger?: boolean; action: () => void }[];
}

interface PendingItem {
  type: 'group' | 'chapter';
  groupId?: string | null;
}

const UNGROUPED_ID = '__ungrouped__';

interface DragState {
  chapterName: string;
  ghost: HTMLDivElement;
}

function em(err: any, fallback: string): string {
  return typeof err === 'string' ? err : (err?.message || fallback);
}

const DocumentTree: React.FC = () => {
  const {
    meta, currentChapter, setCurrentChapter,
    loadDocument, currentBook,
    toggleGroup, renameGroup, deleteGroup,
    renameChapter, deleteChapter, moveChapter,
    createGroup, createChapter,
  } = useDocumentStore();

  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ groupName: string; chapterNames: string[] } | null>(null);
  const pendingInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const safeAction = useCallback(async (fn: () => Promise<void>) => {
    try { await fn(); setError(null); } catch (err: any) { setError(em(err, '操作失败')); }
  }, []);

  const handleChapterClick = useCallback(async (chapterName: string) => {
    if (!currentBook) return;
    setCurrentChapter(chapterName);
    try {
      await loadDocument(currentBook, chapterName);
    } catch (err: any) {
      setError(em(err, '加载文档失败'));
    }
  }, [currentBook, setCurrentChapter, loadDocument]);

  const handleGroupContext = useCallback((e: React.MouseEvent, groupId: string, groupName: string) => {
    e.preventDefault();
    const group = meta?.groups.find(g => g.id === groupId);
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '重命名', action: () => { setEditing(`group:${groupName}`); setEditValue(groupName); } },
        { label: '新建章节', action: () => { setPending({ type: 'chapter', groupId }); setPendingName(''); setTimeout(() => pendingInputRef.current?.focus(), 50); } },
        { label: '删除组', danger: true, action: () => {
          setDeleteConfirm({ groupName, chapterNames: group?.chapters || [] });
        }},
      ],
    });
  }, [meta, safeAction]);

  const handleChapterContext = useCallback((e: React.MouseEvent, chapterName: string) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '重命名', action: () => { setEditing(`chapter:${chapterName}`); setEditValue(chapterName); } },
        { label: '删除', danger: true, action: () => safeAction(() => deleteChapter(chapterName)) },
      ],
    });
  }, [deleteChapter, safeAction]);

  const handleEditDone = useCallback(async () => {
    if (!editing || !editValue.trim()) { setEditing(null); return; }
    try {
      const [type, oldName] = editing.split(':');
      if (type === 'group' && oldName !== editValue.trim()) await renameGroup(oldName, editValue.trim());
      else if (type === 'chapter' && oldName !== editValue.trim()) await renameChapter(oldName, editValue.trim());
      setError(null);
    } catch (err: any) {
      setError(em(err, '重命名失败'));
    } finally {
      setEditing(null);
    }
  }, [editing, editValue, renameGroup, renameChapter]);

  // ── Pending item creation ──
  const confirmPending = useCallback(async () => {
    if (!pending || !pendingName.trim()) { setPending(null); return; }
    try {
      if (pending.type === 'group') await createGroup(pendingName.trim());
      else await createChapter(pendingName.trim(), pending.groupId || undefined);
      setError(null);
    } catch (err: any) {
      setError(em(err, '创建失败'));
    }
    setPending(null); setPendingName('');
  }, [pending, pendingName, createGroup, createChapter]);

  const cancelPending = useCallback(() => { setPending(null); setPendingName(''); }, []);

  // ── Custom Drag & Drop (mouse-based, reliable in WebView2) ──
  const findDropTarget = useCallback((clientX: number, clientY: number): string | null => {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const header = (el as HTMLElement).closest?.('.doc-group-header') as HTMLElement | null;
      if (header) {
        const groupId = header.dataset.groupId;
        if (groupId) return groupId;
      }
      // Check if we're in the ungrouped area
      if ((el as HTMLElement).classList?.contains('sidebar-list')) return null;
    }
    // Check ungrouped drop zone
    const ungrouped = document.querySelector('.drop-zone-ungrouped');
    if (ungrouped) {
      const r = ungrouped.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return null;
    }
    return null;
  }, []);

  const onChapterMouseDown = useCallback((e: React.MouseEvent, chapterName: string) => {
    // Only handle left button
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost: HTMLDivElement | null = null;
    let dragging = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // 5px threshold — only start drag after real movement
      if (!dragging && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      if (!dragging) {
        dragging = true;
        ghost = document.createElement('div');
        ghost.className = 'doc-chapter drag-ghost';
        ghost.innerHTML = '<span class="doc-chapter-icon">📄</span><span class="doc-chapter-name">' + chapterName + '</span>';
        ghost.style.position = 'fixed';
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.style.width = target.offsetWidth + 'px';
        ghost.style.opacity = '0.85';
        ghost.style.background = 'var(--bg-primary)';
        ghost.style.border = '1px solid var(--border)';
        ghost.style.borderRadius = '4px';
        ghost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        document.body.appendChild(ghost);
        target.classList.add('dragging');
        setDragOverGroup(null);
        dragRef.current = { chapterName, ghost };
      }

      if (ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = (ev.clientY - 20) + 'px';
      }
      const tg = findDropTarget(ev.clientX, ev.clientY);
      setDragOverGroup(tg);
    };

    const onUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      target.classList.remove('dragging');
      const d = dragRef.current;
      if (d && d.ghost) {
        document.body.removeChild(d.ghost);
      }
      dragRef.current = null;
      setDragOverGroup(null);

      // Only execute move if we actually dragged
      if (dragging && currentBook) {
        const tg = findDropTarget(ev.clientX, ev.clientY);
        if (tg !== undefined && tg !== null) {
          const targetId = tg === UNGROUPED_ID ? null : tg;
          try {
            await moveChapter(chapterName, targetId);
            setError(null);
          } catch (err: any) {
            setError(em(err, '移动失败'));
          }
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [currentBook, moveChapter, findDropTarget]);

  // ── Delete group with optional chapters ──
  const handleDeleteGroupKeep = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await deleteGroup(deleteConfirm.groupName);
      setError(null);
    } catch (err: any) {
      setError(em(err, '删除失败'));
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteGroup]);

  const handleDeleteGroupWithChapters = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      for (const ch of deleteConfirm.chapterNames) {
        await deleteChapter(ch);
      }
      await deleteGroup(deleteConfirm.groupName);
      setError(null);
    } catch (err: any) {
      setError(em(err, '删除失败'));
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteChapter, deleteGroup]);

  // Cleanup drag on unmount
  useEffect(() => {
    return () => {
      if (dragRef.current) {
        document.body.removeChild(dragRef.current.ghost);
        dragRef.current = null;
      }
    };
  }, []);

  if (!meta) return null;

  const hasAnyGroups = meta.groups.length > 0 || pending?.type === 'group';

  return (
    <div>
      {error && (
        <div style={{ padding: '4px 14px', color: 'var(--error)', fontSize: 11 }}>{error}</div>
      )}

      {/* Groups */}
      {meta.groups.map((group) => (
        <div key={group.id} className="doc-group">
          <div
            className={`doc-group-header${dragOverGroup === group.id ? ' drag-over' : ''}`}
            data-group-id={group.id}
            onClick={() => toggleGroup(group.name)}
            onContextMenu={(e) => handleGroupContext(e, group.id, group.name)}
          >
            <span className="doc-group-toggle">{group.expanded ? '▾' : '▸'}</span>
            {editing === `group:${group.name}` ? (
              <input className="inline-input" value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleEditDone}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEditDone(); if (e.key === 'Escape') setEditing(null); }}
                autoFocus onClick={(e) => e.stopPropagation()} style={{ flex: 1 }}
              />
            ) : (
              <span className="doc-group-name" onDoubleClick={() => { setEditing(`group:${group.name}`); setEditValue(group.name); }}>
                {group.name} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({group.chapters.length})</span>
              </span>
            )}
          </div>
          {group.expanded && group.chapters.map((ch) => (
            <div key={ch}
              className={`doc-chapter${currentChapter === ch ? ' active' : ''}`}
              onMouseDown={(e) => onChapterMouseDown(e, ch)}
              onClick={() => handleChapterClick(ch)}
              onContextMenu={(e) => handleChapterContext(e, ch)}
            >
              <span className="doc-chapter-icon">📄</span>
              {editing === `chapter:${ch}` ? (
                <input className="inline-input" value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleEditDone}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEditDone(); if (e.key === 'Escape') setEditing(null); }}
                  autoFocus onClick={(e) => e.stopPropagation()} style={{ flex: 1 }}
                />
              ) : (
                <span className="doc-chapter-name" onDoubleClick={() => { setEditing(`chapter:${ch}`); setEditValue(ch); }}>{ch}</span>
              )}
            </div>
          ))}
          {/* Pending chapter within group */}
          {pending && pending.type === 'chapter' && pending.groupId === group.id && (
            <div className="doc-chapter" style={{ opacity: 0.7 }}>
              <span className="doc-chapter-icon">📄</span>
              <input ref={pendingInputRef} className="inline-input" placeholder="章节名" value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmPending(); if (e.key === 'Escape') cancelPending(); }}
                onBlur={() => setTimeout(cancelPending, 150)} autoFocus style={{ flex: 1 }}
              />
            </div>
          )}
        </div>
      ))}

      {/* Pending new group */}
      {pending && pending.type === 'group' && (
        <div className="doc-group">
          <div className="doc-group-header" style={{ opacity: 0.7 }}>
            <span className="doc-group-toggle">▸</span>
            <input ref={pendingInputRef} className="inline-input" placeholder="组名" value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmPending(); if (e.key === 'Escape') cancelPending(); }}
              onBlur={() => setTimeout(cancelPending, 150)} autoFocus style={{ flex: 1 }}
            />
          </div>
        </div>
      )}

      {/* Ungrouped section */}
      <div
        className={`doc-group drop-zone-ungrouped${dragOverGroup === null && dragOverGroup !== undefined ? '' : ''}`}
        style={{ marginTop: hasAnyGroups ? 8 : 0 }}
      >
        {hasAnyGroups && (
          <div
            className={`doc-group-header${dragOverGroup === UNGROUPED_ID ? ' drag-over' : ''}`}
            data-group-id={UNGROUPED_ID}
            style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 14px', cursor: 'default' }}
          >
            <span>未分组 ({meta.ungrouped.length})</span>
          </div>
        )}
        {meta.ungrouped.map((ch) => (
          <div key={ch}
            className={`doc-chapter${currentChapter === ch ? ' active' : ''}`}
            onMouseDown={(e) => onChapterMouseDown(e, ch)}
            style={{ paddingLeft: 14 }}
            onClick={() => handleChapterClick(ch)}
            onContextMenu={(e) => handleChapterContext(e, ch)}
          >
            <span className="doc-chapter-icon">📄</span>
            {editing === `chapter:${ch}` ? (
              <input className="inline-input" value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleEditDone}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEditDone(); if (e.key === 'Escape') setEditing(null); }}
                autoFocus onClick={(e) => e.stopPropagation()} style={{ flex: 1 }}
              />
            ) : (
              <span className="doc-chapter-name" onDoubleClick={() => { setEditing(`chapter:${ch}`); setEditValue(ch); }}>{ch}</span>
            )}
          </div>
        ))}
        {/* Pending ungrouped chapter */}
        {pending && pending.type === 'chapter' && !pending.groupId && (
          <div className="doc-chapter" style={{ opacity: 0.7, paddingLeft: 14 }}>
            <span className="doc-chapter-icon">📄</span>
            <input ref={pendingInputRef} className="inline-input" placeholder="章节名" value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmPending(); if (e.key === 'Escape') cancelPending(); }}
              onBlur={() => setTimeout(cancelPending, 150)} autoFocus style={{ flex: 1 }}
            />
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="sidebar-footer">
        <button className="sidebar-btn" onClick={() => { setPending({ type: 'group' }); setPendingName(''); setTimeout(() => pendingInputRef.current?.focus(), 50); }}>
          ＋ 新建组
        </button>
        <button className="sidebar-btn" onClick={() => { setPending({ type: 'chapter' }); setPendingName(''); setTimeout(() => pendingInputRef.current?.focus(), 50); }}>
          ＋ 新建章
        </button>
      </div>

      {/* Delete Group Confirmation */}
      {deleteConfirm && (
        <div className="dialog-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 360 }}>
            <h3>删除组「{deleteConfirm.groupName}」</h3>
            {deleteConfirm.chapterNames.length > 0 ? (
              <p>组内有 {deleteConfirm.chapterNames.length} 个章节，要如何处理？</p>
            ) : (
              <p>组内没有章节，确认删除？</p>
            )}
            <div className="dialog-actions">
              <button className="dialog-btn" onClick={() => setDeleteConfirm(null)}>取消</button>
              {deleteConfirm.chapterNames.length > 0 && (
                <button className="dialog-btn" onClick={handleDeleteGroupKeep}>保留章节</button>
              )}
              <button className="dialog-btn danger" onClick={handleDeleteGroupWithChapters}>
                {deleteConfirm.chapterNames.length > 0 ? '一并删除' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <div className="ctx-menu-overlay" onClick={closeCtxMenu} onContextMenu={(e) => { e.preventDefault(); closeCtxMenu(); }}>
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            {ctxMenu.items.map((item, i) => (
              <button key={i} className={`ctx-menu-item ${item.danger ? 'danger' : ''}`}
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
