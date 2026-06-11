import React, { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';

const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];
const FONT_FAMILIES = [
  '默认',
  '宋体',
  '黑体',
  '楷体',
  '仿宋',
  '微软雅黑',
  'Arial',
  'Times New Roman',
];

const COLORS = [
  '#1a1a1a', '#555555', '#999999', '#d5d5d5',
  '#d9534f', '#f0ad4e', '#5cb85c', '#337ab7',
  '#5bc0de', '#8e44ad', '#2c3e50', '#e74c3c',
  '#f39c12', '#27ae60', '#2980b9', '#16a085',
];

interface Props {
  editor: Editor | null;
}

const EditorToolbar: React.FC<Props> = ({ editor }) => {
  const [showColor, setShowColor] = useState(false);

  const setFontFamily = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!editor) return;
    if (val === '默认') {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(val).run();
    }
  }, [editor]);

  const setFontSize = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!editor || !val) return;
    editor.chain().focus().setFontSize(val + 'px').run();
  }, [editor]);

  const setColor = useCallback((color: string) => {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setShowColor(false);
  }, [editor]);

  if (!editor) return null;

  const activeFontSize = (editor.getAttributes('textStyle').fontSize || '16').replace('px', '');

  return (
    <div className="editor-toolbar">
      {/* Font Family */}
      <div className="toolbar-group">
        <select className="toolbar-select" onChange={setFontFamily} defaultValue="默认">
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Font Size */}
      <div className="toolbar-group">
        <select className="toolbar-select" value={activeFontSize} onChange={setFontSize}>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      {/* Bold / Italic / Underline */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="加粗 (Ctrl+B)"
        >
          <b>B</b>
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体 (Ctrl+I)"
        >
          <i>I</i>
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="下划线 (Ctrl+U)"
        >
          <u>U</u>
        </button>
      </div>

      {/* Color */}
      <div className="toolbar-group">
        <div className="color-picker-wrap">
          <button
            className={`toolbar-btn ${editor.isActive('textStyle') ? 'active' : ''}`}
            onClick={() => setShowColor(!showColor)}
          >
            A <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: editor.getAttributes('textStyle').color || 'var(--text-primary)', verticalAlign: 'middle', marginLeft: 2 }} />
          </button>
          {showColor && (
            <div className="color-picker-popup">
              {COLORS.map((c) => (
                <div
                  key={c}
                  className="color-swatch"
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paragraph spacing */}
      <div className="toolbar-group">
        <select
          className="toolbar-select"
          onChange={(e) => {
            if (editor) {
              editor.chain().focus().setLineHeight(e.target.value).run();
            }
          }}
          defaultValue="1.8"
        >
          <option value="1.2">行高 1.2</option>
          <option value="1.5">行高 1.5</option>
          <option value="1.8">行高 1.8</option>
          <option value="2.0">行高 2.0</option>
          <option value="2.5">行高 2.5</option>
        </select>
      </div>
    </div>
  );
};

export default EditorToolbar;
