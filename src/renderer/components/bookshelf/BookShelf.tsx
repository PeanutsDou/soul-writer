import React, { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/book-store';
import { useDocumentStore } from '../../stores/document-store';
import BookCard from './BookCard';
import Dialog from '../Dialog';

function em(err: any, fallback: string): string {
  return typeof err === 'string' ? err : (err?.message || fallback);
}

const BookShelf: React.FC = () => {
  const { books, loading, loadBooks, createBook, deleteBook, renameBook } = useBookStore();
  const setCurrentBook = useDocumentStore((s) => s.setCurrentBook);
  const loadMeta = useDocumentStore((s) => s.loadMeta);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [showRename, setShowRename] = useState<{ old: string } | null>(null);
  const [name, setName] = useState('');

  useEffect(() => { loadBooks(); }, []);

  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpen = async (bookName: string) => {
    setCurrentBook(bookName);
    try {
      await loadMeta(bookName);
    } catch {
      // Book meta not available yet — it'll be created on first use
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createBook(name.trim());
      setShowCreate(false);
      setName('');
      setActionError(null);
    } catch (err: any) {
      setActionError(em(err, '创建失败'));
    }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    try {
      await deleteBook(showDelete);
      setShowDelete(null);
      setActionError(null);
    } catch (err: any) {
      setActionError(em(err, '删除失败'));
    }
  };

  const handleRename = async () => {
    if (!showRename || !name.trim()) return;
    try {
      await renameBook(showRename.old, name.trim());
      setShowRename(null);
      setName('');
      setActionError(null);
    } catch (err: any) {
      setActionError(em(err, '重命名失败'));
    }
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 3600000) return '刚刚';
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
      return d.toLocaleDateString('zh-CN');
    } catch { return ''; }
  };

  return (
    <div className="bookshelf-container">
      <div className="bookshelf-header">
        <h2 className="bookshelf-title">我的书架</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {actionError && (
            <span style={{ color: 'var(--error)', fontSize: 12 }}>{actionError}</span>
          )}
          <button
            className="toolbar-btn"
            onClick={() => setShowCreate(true)}
            style={{ fontSize: 13, padding: '6px 16px' }}
          >
            ＋ 新建书籍
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bookshelf-empty">
          <span>加载中...</span>
        </div>
      ) : books.length === 0 ? (
        <div className="bookshelf-empty">
          <div className="bookshelf-empty-icon">📖</div>
          <div className="bookshelf-empty-text">还没有书籍，点击上方按钮创建第一本书</div>
        </div>
      ) : (
        <div className="bookshelf-grid">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpen={() => handleOpen(book.name)}
              onRename={() => { setShowRename({ old: book.name }); setName(book.name); }}
              onDelete={() => setShowDelete(book.name)}
              formatTime={formatTime}
            />
          ))}
          <div className="book-card book-card-add" onClick={() => setShowCreate(true)}>
            ＋
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <Dialog title="新建书籍" onClose={() => setShowCreate(false)}>
          <input
            className="dialog-input"
            placeholder="输入书名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreate()}
            autoFocus
          />
          <div className="dialog-actions">
            <button className="dialog-btn" onClick={() => setShowCreate(false)}>取消</button>
            <button className="dialog-btn primary" onClick={handleCreate}>创建</button>
          </div>
        </Dialog>
      )}

      {/* Delete Dialog — centered on main area */}
      {showDelete !== null && (
        <Dialog title="删除书籍" onClose={() => setShowDelete(null)}>
          <p>确定要删除「{showDelete}」吗？此操作不可撤销。</p>
          <div className="dialog-actions">
            <button className="dialog-btn" onClick={() => setShowDelete(null)}>取消</button>
            <button className="dialog-btn danger" onClick={handleDelete}>删除</button>
          </div>
        </Dialog>
      )}

      {/* Rename Dialog */}
      {showRename !== null && (
        <Dialog title="重命名书籍" onClose={() => setShowRename(null)}>
          <input
            className="dialog-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleRename()}
            autoFocus
          />
          <div className="dialog-actions">
            <button className="dialog-btn" onClick={() => setShowRename(null)}>取消</button>
            <button className="dialog-btn primary" onClick={handleRename}>确定</button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default BookShelf;
