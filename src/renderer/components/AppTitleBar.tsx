import React from 'react';
import { useThemeStore } from '../stores/theme-store';
import { useDocumentStore } from '../stores/document-store';

const api = () => (window as any).api || {};

const AppTitleBar: React.FC = () => {
  const toggleTheme = useThemeStore((s) => s.toggle);
  const theme = useThemeStore((s) => s.mode);
  const currentBook = useDocumentStore((s) => s.currentBook);
  const setCurrentBook = useDocumentStore((s) => s.setCurrentBook);

  return (
    <div className="title-bar">
      <div className="title-bar-left">
        {currentBook ? (
          <button className="title-bar-btn" onClick={() => setCurrentBook(null)} title="返回书架">
            ← 书架
          </button>
        ) : null}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
          Soul Writer {currentBook ? `— ${currentBook}` : ''}
        </span>
      </div>
      <div className="title-bar-right">
        <button className="title-bar-btn" onClick={toggleTheme} title="切换主题">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <div className="window-controls">
          <button className="window-btn" onClick={() => api().minimizeWindow?.()}>─</button>
          <button className="window-btn" onClick={() => api().maximizeWindow?.()}>□</button>
          <button className="window-btn close" onClick={() => api().closeWindow?.()}>×</button>
        </div>
      </div>
    </div>
  );
};

export default AppTitleBar;
