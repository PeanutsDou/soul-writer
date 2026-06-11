import React, { useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import FontFamily from '@tiptap/extension-font-family';
import FontSize from '../../extensions/FontSize';
import { useDocumentStore } from '../../stores/document-store';
import EditorToolbar from './EditorToolbar';

const EditorPanel: React.FC = () => {
  const {
    currentChapter, currentBook, document, wordCount, saveStatus,
    saveDocument,
  } = useDocumentStore();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChapterRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      TextAlign.configure({ types: ['paragraph'] }),
      Placeholder.configure({ placeholder: '开始写作...' }),
    ],
    content: null,
    onUpdate: ({ editor }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDocument(editor.getJSON());
      }, 1000);
    },
  });

  // Load document content when a new chapter is selected
  useEffect(() => {
    if (editor && document && currentChapter && currentChapter !== lastChapterRef.current) {
      lastChapterRef.current = currentChapter;
      editor.commands.setContent(document);
      setTimeout(() => {
        editor.commands.focus('end');
      }, 50);
    }
  }, [currentChapter, document, editor]);

  // Cleanup timer and save on unmount (app close)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Flush pending save immediately before unmount
        saveDocument(editor?.getJSON());
      }
    };
  }, []);

  if (!currentChapter) {
    return (
      <div className="editor-panel">
        <div className="editor-empty">
          {currentBook ? '选择左侧章节开始写作' : '打开一本书开始写作'}
        </div>
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <EditorToolbar editor={editor} />
      <div className="editor-doc-title">
        <span className="editor-doc-title-text">{currentChapter}</span>
      </div>
      <div className="editor-content">
        <EditorContent editor={editor} />
      </div>
      <div className="status-bar">
        <span>字数：{wordCount.toLocaleString()}</span>
        <span>{saveStatus || '就绪'}</span>
      </div>
    </div>
  );
};

export default EditorPanel;
