declare global {
  interface Window {
    api: {
      listBooks: () => Promise<any[]>;
      createBook: (name: string) => Promise<any>;
      deleteBook: (name: string) => Promise<any>;
      renameBook: (oldName: string, newName: string) => Promise<any>;
      getBookMeta: (bookName: string) => Promise<any>;
      createGroup: (bookName: string, name: string) => Promise<any>;
      renameGroup: (bookName: string, oldName: string, newName: string) => Promise<any>;
      deleteGroup: (bookName: string, groupName: string) => Promise<any>;
      toggleGroup: (bookName: string, groupName: string) => Promise<any>;
      createChapter: (bookName: string, name: string, groupId?: string) => Promise<any>;
      renameChapter: (bookName: string, oldName: string, newName: string) => Promise<any>;
      deleteChapter: (bookName: string, chapterName: string) => Promise<any>;
      moveChapter: (bookName: string, chapterName: string, targetGroupId: string | null) => Promise<any>;
      getDocument: (bookName: string, chapterName: string) => Promise<any>;
      saveDocument: (bookName: string, chapterName: string, content: any) => Promise<any>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
    };
  }
}

export {};
