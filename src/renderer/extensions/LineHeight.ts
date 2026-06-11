import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

/**
 * Line height extension — uses CSS custom property on editor DOM
 * instead of per-node attributes, because line-height is a document-level
 * layout setting, not a per-paragraph style.
 */
const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return {
      defaultLineHeight: '1.8',
    };
  },

  addCommands() {
    return {
      setLineHeight:
        (value: string) =>
        ({ editor }) => {
          const el = editor.view.dom as HTMLElement;
          el.style.setProperty('--editor-line-height', value);
          return true;
        },
      unsetLineHeight:
        () =>
        ({ editor }) => {
          const el = editor.view.dom as HTMLElement;
          el.style.removeProperty('--editor-line-height');
          return true;
        },
    };
  },
});

export default LineHeight;
