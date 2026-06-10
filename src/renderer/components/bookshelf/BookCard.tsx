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
      <button
        className="book-card-menu"
        onClick={(e) => {
          e.stopPropagation();
          // Show context menu
          const menu = document.createElement('div');
          menu.className = 'ctx-menu';
          menu.style.left = e.clientX + 'px';
          menu.style.top = e.clientY + 'px';
          menu.innerHTML = `
            <button class="ctx-menu-item">重命名</button>
            <button class="ctx-menu-item danger">删除</button>
          `;
          document.body.appendChild(menu);
          const close = () => { menu.remove(); document.removeEventListener('click', close); };
          menu.querySelector('.ctx-menu-item')?.addEventListener('click', () => { close(); onRename(); });
          menu.querySelector('.ctx-menu-item.danger')?.addEventListener('click', () => { close(); onDelete(); });
          setTimeout(() => document.addEventListener('click', close), 0);
        }}
      >
        ⋯
      </button>
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
