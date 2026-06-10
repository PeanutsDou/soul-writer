import React, { useEffect } from 'react';
import { useThemeStore } from './stores/theme-store';
import { useDocumentStore } from './stores/document-store';
import AppTitleBar from './components/AppTitleBar';
import BookShelf from './components/bookshelf/BookShelf';
import EditorLayout from './components/editor/EditorLayout';

const App: React.FC = () => {
  const theme = useThemeStore((s) => s.mode);
  const currentBook = useDocumentStore((s) => s.currentBook);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      <AppTitleBar />
      <div className="main-content">
        {currentBook ? <EditorLayout /> : <BookShelf />}
      </div>
    </div>
  );
};

export default App;
