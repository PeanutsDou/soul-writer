import React, { useEffect } from 'react';
import { useThemeStore } from './stores/theme-store';
import { useDocumentStore } from './stores/document-store';
import AppTitleBar from './components/AppTitleBar';
import BookShelf from './components/bookshelf/BookShelf';
import EditorLayout from './components/editor/EditorLayout';

// Error boundary to prevent white screen
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: 'var(--text-primary)', background: 'var(--bg-primary)', height: '100%' }}>
          <h3>启动失败</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{this.state.error}</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 12 }}>
            请确认 Python 后端已启动 (127.0.0.1:8720)
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const theme = useThemeStore((s) => s.mode);
  const currentBook = useDocumentStore((s) => s.currentBook);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ErrorBoundary>
      <div className="app-container">
        <AppTitleBar />
        <div className="main-content">
          {currentBook ? <EditorLayout /> : <BookShelf />}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
