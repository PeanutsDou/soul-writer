import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import FontFamily from '@tiptap/extension-font-family';
import FontSize from '../../extensions/FontSize';
import LineHeight from '../../extensions/LineHeight';
import { useDocumentStore } from '../../stores/document-store';
import { useEditorPrefs } from '../../stores/editor-prefs';
import Sidebar from './Sidebar';
import EditorToolbar from './EditorToolbar';
import ChatPanel from '../ai/ChatPanel';
import ResizeHandle from '../ResizeHandle';

const EditorLayout: React.FC = () => {
  const {
    currentChapter, currentBook, document, wordCount, saveStatus,
    saveDocument,
  } = useDocumentStore();
  const prefs = useEditorPrefs();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChapterRef = useRef<string | null>(null);

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(340);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      Underline, TextStyle, FontFamily, FontSize, LineHeight, Color,
      TextAlign.configure({ types: ['paragraph'] }),
      Placeholder.configure({ placeholder: '开始写作...' }),
    ],
    content: null,
    onCreate: ({ editor: ed }) => {
      (ed.view.dom as HTMLElement).style.setProperty('--editor-line-height', prefs.lineHeight);
    },
    onUpdate: ({ editor: ed }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveDocument(ed.getJSON()), 600);
    },
    editorProps: {
      attributes: {
        style: `font-family: ${prefs.fontFamily === '默认' ? 'var(--font-sans)' : prefs.fontFamily}`,
      },
    },
  });

  useEffect(() => {
    if (editor && document && currentChapter && currentChapter !== lastChapterRef.current) {
      lastChapterRef.current = currentChapter;
      editor.commands.setContent(document);
      (editor.view.dom as HTMLElement).style.setProperty('--editor-line-height', prefs.lineHeight);
      setTimeout(() => editor.commands.focus('end'), 50);
    }
  }, [currentChapter, document, editor, prefs.lineHeight]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
        saveDocument(editor?.getJSON());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor, saveDocument]);

  useEffect(() => {
    return () => { if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveDocument(editor?.getJSON()); } };
  }, []);

  const onResizeLeft = useCallback((d: number) => setLeftWidth((w) => Math.max(160, Math.min(500, w + d))), []);
  const onResizeRight = useCallback((d: number) => setRightWidth((w) => Math.max(240, Math.min(600, w - d))), []);

  return (
    <div className="editor-layout">
      {/* Top bar */}
      <EditorToolbar editor={editor} />

      {/* Middle: three columns */}
      <div className="editor-body">
        <div className="sidebar" style={{ width: leftWidth }}>
          <Sidebar />
        </div>
        <ResizeHandle onResize={onResizeLeft} />

        <div className="editor-panel">
          {currentChapter ? (
            <div className="editor-content">
              <EditorContent editor={editor} />
            </div>
          ) : (
            <div className="editor-empty">
              {currentBook ? '选择左侧章节开始写作' : '打开一本书开始写作'}
            </div>
          )}
        </div>

        <ResizeHandle onResize={onResizeRight} />

        <ChatPanel width={rightWidth} />
      </div>

      {/* Bottom bar: word count + save status */}
      <div className="editor-bottombar">
        <span className="bottombar-wordcount">字数：{wordCount.toLocaleString()}</span>
        <span className="bottombar-status">{saveStatus || '就绪'}</span>
      </div>
    </div>
  );
};

export default EditorLayout;
