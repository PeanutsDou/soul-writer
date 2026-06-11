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
import LineHeight from '../../extensions/LineHeight';
import { useDocumentStore } from '../../stores/document-store';
import { useEditorPrefs } from '../../stores/editor-prefs';
import EditorToolbar from './EditorToolbar';

function countWords(doc: any): number {
  let count = 0;
  function walk(node: any) {
    if (typeof node === 'object' && node !== null) {
      if (node.text && typeof node.text === 'string') count += [...node.text].length;
      for (const v of Object.values(node)) walk(v);
    }
    if (Array.isArray(node)) node.forEach(walk);
  }
  walk(doc);
  return count;
}

const EditorPanel: React.FC = () => {
  const {
    currentChapter, currentBook, document, wordCount, saveStatus,
    saveDocument,
  } = useDocumentStore();

  const prefs = useEditorPrefs();
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
      LineHeight,
      Color,
      TextAlign.configure({ types: ['paragraph'] }),
      Placeholder.configure({ placeholder: '开始写作...' }),
    ],
    content: null,
    onCreate: ({ editor: ed }) => {
      // Apply saved line-height to editor DOM
      (ed.view.dom as HTMLElement).style.setProperty('--editor-line-height', prefs.lineHeight);
    },
    onUpdate: ({ editor: ed }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = ed.getJSON();
        saveDocument(json);
      }, 1000);
    },
    editorProps: {
      attributes: {
        // Default font for new text — set via CSS on the editor
        style: `font-family: ${prefs.fontFamily === '默认' ? 'var(--font-sans)' : prefs.fontFamily}`,
      },
    },
  });

  // Load document content when a new chapter is selected
  useEffect(() => {
    if (editor && document && currentChapter && currentChapter !== lastChapterRef.current) {
      lastChapterRef.current = currentChapter;
      editor.commands.setContent(document);
      // Re-apply line-height after content load
      (editor.view.dom as HTMLElement).style.setProperty('--editor-line-height', prefs.lineHeight);
      setTimeout(() => {
        editor.commands.focus('end');
      }, 50);
    }
  }, [currentChapter, document, editor, prefs.lineHeight]);

  // Cleanup timer and save on unmount (app close)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
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
