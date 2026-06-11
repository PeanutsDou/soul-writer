import React, { useState, useCallback } from 'react';

interface Book {
  id: string;
  name: string;
  chapterCount: number;
  totalWords: number;
  updatedAt: string;
}

interface Props {
  book: Book;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  formatTime: (ts: string) => string;
}

const BookCard: React.FC<Props> = ({ book, onOpen, onRename, onDelete, formatTime }) => {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenuPos(null), []);

  return (
    <div className="book-card" onClick={onOpen}>
      <div className="book-card-actions">
        <button className="book-card-menu" onClick={handleMenu} title="更多">⋯</button>
        <button
          className="book-card-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="删除书籍"
        >×</button>
      </div>
      <div className="book-card-icon">📖</div>
      <div className="book-card-name">{book.name}</div>
      <div className="book-card-meta">
        <span>{book.chapterCount} 章</span>
        <span>{book.totalWords.toLocaleString()} 字</span>
      </div>
      <div className="book-card-time">{formatTime(book.updatedAt)}</div>

      {menuPos && (
        <div className="ctx-menu-overlay" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}>
          <div className="ctx-menu" style={{ left: menuPos.x, top: menuPos.y }}>
            <button className="ctx-menu-item" onClick={() => { closeMenu(); onRename(); }}>重命名</button>
            <button className="ctx-menu-item danger" onClick={() => { closeMenu(); onDelete(); }}>删除</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookCard;
