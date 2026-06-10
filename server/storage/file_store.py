"""文件存储层 — 书籍/文档/分组的 JSON 文件读写"""
import json
import os
import uuid
import shutil
from datetime import datetime, timezone
from typing import Optional
from models import BookInfo, BookIndex, BookMeta, GroupInfo


class FileStore:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.books_dir = os.path.join(data_dir, "books")
        os.makedirs(self.books_dir, exist_ok=True)

    def _now(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _load_json(self, path: str, default: dict = None):
        if not os.path.exists(path):
            return default if default is not None else {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_json(self, path: str, data):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ── 书籍索引 ──
    def _index_path(self) -> str:
        return os.path.join(self.books_dir, "_index.json")

    def load_index(self) -> BookIndex:
        raw = self._load_json(self._index_path(), {"version": 1, "books": []})
        books = [BookInfo(**b) for b in raw.get("books", [])]
        return BookIndex(version=raw.get("version", 1), books=books)

    def save_index(self, idx: BookIndex):
        self._save_json(self._index_path(), idx.model_dump())

    # ── 书籍 CRUD ──
    def create_book(self, name: str) -> BookInfo:
        idx = self.load_index()
        # 检查重名
        for b in idx.books:
            if b.name == name:
                raise ValueError(f"书籍 '{name}' 已存在")
        book_id = str(uuid.uuid4())[:8]
        dir_name = name
        book_dir = os.path.join(self.books_dir, dir_name)
        os.makedirs(book_dir, exist_ok=True)
        # 初始化 _meta.json
        meta = BookMeta()
        self._save_json(os.path.join(book_dir, "_meta.json"), meta.model_dump())
        now = self._now()
        book = BookInfo(
            id=book_id,
            name=name,
            dirName=dir_name,
            createdAt=now,
            updatedAt=now,
            chapterCount=0,
            totalWords=0,
        )
        idx.books.append(book)
        self.save_index(idx)
        return book

    def delete_book(self, book_name: str):
        idx = self.load_index()
        idx.books = [b for b in idx.books if b.name != book_name]
        self.save_index(idx)
        book_dir = os.path.join(self.books_dir, book_name)
        if os.path.exists(book_dir):
            shutil.rmtree(book_dir)

    def rename_book(self, old_name: str, new_name: str):
        idx = self.load_index()
        for b in idx.books:
            if b.name == new_name:
                raise ValueError(f"书籍 '{new_name}' 已存在")
        old_dir = os.path.join(self.books_dir, old_name)
        new_dir = os.path.join(self.books_dir, new_name)
        if not os.path.exists(old_dir):
            raise FileNotFoundError(f"书籍目录 '{old_name}' 不存在")
        if os.path.exists(new_dir):
            raise ValueError(f"目录 '{new_name}' 已存在")
        os.rename(old_dir, new_dir)
        for b in idx.books:
            if b.name == old_name:
                b.name = new_name
                b.dirName = new_name
                b.updatedAt = self._now()
        self.save_index(idx)

    def get_book_dir(self, book_name: str) -> str:
        return os.path.join(self.books_dir, book_name)

    # ── 分组 CRUD ──
    def _meta_path(self, book_name: str) -> str:
        return os.path.join(self.books_dir, book_name, "_meta.json")

    def load_meta(self, book_name: str) -> BookMeta:
        raw = self._load_json(self._meta_path(book_name), {"version": 1, "groups": [], "ungrouped": []})
        groups = [GroupInfo(**g) for g in raw.get("groups", [])]
        return BookMeta(version=raw.get("version", 1), groups=groups, ungrouped=raw.get("ungrouped", []))

    def save_meta(self, book_name: str, meta: BookMeta):
        self._save_json(self._meta_path(book_name), meta.model_dump())

    def create_group(self, book_name: str, name: str) -> GroupInfo:
        meta = self.load_meta(book_name)
        group = GroupInfo(
            id=str(uuid.uuid4())[:8],
            name=name,
            order=len(meta.groups),
            expanded=True,
            chapters=[],
        )
        meta.groups.append(group)
        self.save_meta(book_name, meta)
        return group

    def rename_group(self, book_name: str, old_name: str, new_name: str):
        meta = self.load_meta(book_name)
        for g in meta.groups:
            if g.name == old_name:
                g.name = new_name
                break
        self.save_meta(book_name, meta)

    def delete_group(self, book_name: str, group_name: str):
        meta = self.load_meta(book_name)
        for g in meta.groups:
            if g.name == group_name:
                # 组内章节移至未分组
                meta.ungrouped.extend(g.chapters)
                meta.groups.remove(g)
                break
        self.save_meta(book_name, meta)

    def toggle_group_expand(self, book_name: str, group_name: str):
        meta = self.load_meta(book_name)
        for g in meta.groups:
            if g.name == group_name:
                g.expanded = not g.expanded
                break
        self.save_meta(book_name, meta)

    # ── 章节 CRUD ──
    def create_chapter(self, book_name: str, name: str, group_id: Optional[str] = None) -> str:
        """创建章节文件，返回章节名"""
        meta = self.load_meta(book_name)
        # 检查是否已存在同名章节
        all_names = set(meta.ungrouped)
        for g in meta.groups:
            all_names.update(g.chapters)
        if name in all_names:
            raise ValueError(f"章节 '{name}' 已存在")
        # 创建文件
        chapter_path = os.path.join(self.books_dir, book_name, name)
        if os.path.exists(chapter_path):
            raise ValueError(f"章节文件 '{name}' 已存在")
        self._save_json(chapter_path, {"type": "doc", "content": []})
        # 更新 meta
        if group_id:
            for g in meta.groups:
                if g.id == group_id:
                    g.chapters.append(name)
                    break
        else:
            meta.ungrouped.append(name)
        self.save_meta(book_name, meta)
        self._update_book_stats(book_name)
        return name

    def rename_chapter(self, book_name: str, old_name: str, new_name: str):
        meta = self.load_meta(book_name)
        all_names = set(meta.ungrouped)
        for g in meta.groups:
            all_names.update(g.chapters)
        if new_name in all_names:
            raise ValueError(f"章节 '{new_name}' 已存在")
        old_path = os.path.join(self.books_dir, book_name, old_name)
        new_path = os.path.join(self.books_dir, book_name, new_name)
        os.rename(old_path, new_path)
        # 更新 meta
        for g in meta.groups:
            if old_name in g.chapters:
                g.chapters[g.chapters.index(old_name)] = new_name
                break
        if old_name in meta.ungrouped:
            meta.ungrouped[meta.ungrouped.index(old_name)] = new_name
        self.save_meta(book_name, meta)

    def delete_chapter(self, book_name: str, name: str):
        chapter_path = os.path.join(self.books_dir, book_name, name)
        if os.path.exists(chapter_path):
            os.remove(chapter_path)
        meta = self.load_meta(book_name)
        for g in meta.groups:
            if name in g.chapters:
                g.chapters.remove(name)
                break
        if name in meta.ungrouped:
            meta.ungrouped.remove(name)
        self.save_meta(book_name, meta)
        self._update_book_stats(book_name)

    def move_chapter(self, book_name: str, chapter_name: str, target_group_id: Optional[str]):
        """移动章节到指定组，target_group_id=None 则移至未分组"""
        meta = self.load_meta(book_name)
        # 从当前位置移除
        for g in meta.groups:
            if chapter_name in g.chapters:
                g.chapters.remove(chapter_name)
                break
        if chapter_name in meta.ungrouped:
            meta.ungrouped.remove(chapter_name)
        # 添加到目标位置
        if target_group_id:
            for g in meta.groups:
                if g.id == target_group_id:
                    g.chapters.append(chapter_name)
                    break
        else:
            meta.ungrouped.append(chapter_name)
        self.save_meta(book_name, meta)

    # ── 文档读写 ──
    def load_document(self, book_name: str, chapter_name: str) -> dict:
        path = os.path.join(self.books_dir, book_name, chapter_name)
        return self._load_json(path, {"type": "doc", "content": []})

    def save_document(self, book_name: str, chapter_name: str, content: dict):
        path = os.path.join(self.books_dir, book_name, chapter_name)
        self._save_json(path, content)
        self._update_book_stats(book_name)

    # ── 辅助 ──
    def _update_book_stats(self, book_name: str):
        idx = self.load_index()
        meta = self.load_meta(book_name)
        total_chapters = len(meta.ungrouped)
        for g in meta.groups:
            total_chapters += len(g.chapters)
        total_words = 0
        for ch_name in meta.ungrouped:
            doc = self.load_document(book_name, ch_name)
            total_words += self._count_words(doc)
        for g in meta.groups:
            for ch_name in g.chapters:
                doc = self.load_document(book_name, ch_name)
                total_words += self._count_words(doc)
        for b in idx.books:
            if b.name == book_name:
                b.chapterCount = total_chapters
                b.totalWords = total_words
                b.updatedAt = self._now()
        self.save_index(idx)

    def _count_words(self, doc: dict) -> int:
        """递归计算文档字数"""
        count = 0

        def walk(node):
            nonlocal count
            if isinstance(node, dict):
                if node.get("text"):
                    count += len(node["text"])
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(doc)
        return count
