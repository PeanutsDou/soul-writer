import React from 'react';

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
  return (
    <div className="book-card" onClick={onOpen}>
      <div className="book-card-actions">
        <button
          className="book-card-menu"
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          title="重命名"
        >✎</button>
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
    </div>
  );
};

export default BookCard;
