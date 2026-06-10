import React, { useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { useDocumentStore } from '../../stores/document-store';
import EditorToolbar from './EditorToolbar';

const EditorPanel: React.FC = () => {
  const {
    currentChapter, currentBook, document, wordCount, saveStatus,
    saveDocument,
  } = useDocumentStore();

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNewDoc = useRef(false);

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
      Color,
      TextAlign.configure({ types: ['paragraph'] }),
      Placeholder.configure({ placeholder: '开始写作...' }),
    ],
    content: null,
    onUpdate: ({ editor }) => {
      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDocument(editor.getJSON());
      }, 1000);
    },
  });

  // Load document when chapter changes
  useEffect(() => {
    if (editor && document) {
      isNewDoc.current = true;
      editor.commands.setContent(document);
      // Set cursor to end for new documents
      setTimeout(() => {
        editor.commands.focus('end');
        isNewDoc.current = false;
      }, 50);
    }
  }, [currentChapter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
