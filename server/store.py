"""
Soul Writer storage layer — SQLite.
Replaces the old JSON file_store.py.
"""
import sqlite3
import uuid
import os
from datetime import datetime, timezone
from typing import Optional


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _uid() -> str:
    return str(uuid.uuid4())[:8]


class Store:
    def __init__(self, data_dir: str):
        os.makedirs(data_dir, exist_ok=True)
        db_path = os.path.join(data_dir, "soul.db")
        self.db = sqlite3.connect(db_path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self._init_tables()

    def _init_tables(self):
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT '',
                updated_at TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                expanded INTEGER DEFAULT 1,
                UNIQUE(book_id, name)
            );

            CREATE TABLE IF NOT EXISTS chapters (
                name TEXT NOT NULL,
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
                content TEXT DEFAULT '{"type":"doc","content":[]}',
                sort_order INTEGER DEFAULT 0,
                PRIMARY KEY (book_id, name)
            );
        """)
        self.db.commit()

    def _count_chars(self, content_json: str) -> int:
        """Count text characters in TipTap JSON content."""
        if not content_json:
            return 0
        try:
            import json
            doc = json.loads(content_json)
            return self._walk_text(doc)
        except (json.JSONDecodeError, TypeError):
            return 0

    def _walk_text(self, node) -> int:
        """Recursively sum lengths of all 'text' fields."""
        count = 0
        if isinstance(node, dict):
            if 'text' in node and isinstance(node['text'], str):
                count += len(node['text'])
            for v in node.values():
                count += self._walk_text(v)
        elif isinstance(node, list):
            for item in node:
                count += self._walk_text(item)
        return count

    # ── Books ──

    def list_books(self) -> list:
        rows = self.db.execute("""
            SELECT b.*,
                   COUNT(c.name) AS chapter_count
            FROM books b
            LEFT JOIN chapters c ON c.book_id = b.id
            GROUP BY b.id
            ORDER BY b.updated_at DESC
        """).fetchall()
        result = []
        for r in rows:
            book = self._book_row(r)
            # Compute total words from chapter contents
            ch_rows = self.db.execute(
                "SELECT content FROM chapters WHERE book_id = ?",
                (r["id"],),
            ).fetchall()
            total_words = sum(self._count_chars(ch["content"]) for ch in ch_rows)
            book["totalWords"] = total_words
            result.append(book)
        return result

    def create_book(self, name: str) -> dict:
        bid = _uid()
        now = _now()
        try:
            self.db.execute(
                "INSERT INTO books (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (bid, name, now, now),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"书籍 '{name}' 已存在")
        return self._book_info(bid)

    def delete_book(self, name: str):
        self.db.execute("DELETE FROM books WHERE name = ?", (name,))
        self.db.commit()

    def rename_book(self, old_name: str, new_name: str):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (old_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{old_name}' 不存在")
        try:
            self.db.execute(
                "UPDATE books SET name = ?, updated_at = ? WHERE id = ?",
                (new_name, _now(), row["id"]),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"书籍 '{new_name}' 已存在")

    def get_book_meta(self, book_name: str) -> dict:
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        groups = self.db.execute(
            "SELECT id, name, sort_order, expanded FROM groups WHERE book_id = ? ORDER BY sort_order",
            (bid,),
        ).fetchall()
        group_list = []
        for g in groups:
            ch_rows = self.db.execute(
                "SELECT name FROM chapters WHERE book_id = ? AND group_id = ? ORDER BY sort_order",
                (bid, g["id"]),
            ).fetchall()
            group_list.append({
                "id": g["id"],
                "name": g["name"],
                "order": g["sort_order"],
                "expanded": bool(g["expanded"]),
                "chapters": [c["name"] for c in ch_rows],
            })
        ungrouped_rows = self.db.execute(
            "SELECT name FROM chapters WHERE book_id = ? AND group_id IS NULL ORDER BY sort_order",
            (bid,),
        ).fetchall()
        return {
            "version": 1,
            "groups": group_list,
            "ungrouped": [c["name"] for c in ungrouped_rows],
        }

    def _book_info(self, bid: str) -> dict:
        row = self.db.execute("""
            SELECT b.*,
                   COUNT(c.name) AS chapter_count
            FROM books b
            LEFT JOIN chapters c ON c.book_id = b.id
            WHERE b.id = ?
            GROUP BY b.id
        """, (bid,)).fetchone()
        ch_rows = self.db.execute(
            "SELECT content FROM chapters WHERE book_id = ?", (bid,)
        ).fetchall()
        total_words = sum(self._count_chars(ch["content"]) for ch in ch_rows)
        return {
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "chapterCount": row["chapter_count"] or 0,
            "totalWords": total_words,
        }

    def _book_row(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "chapterCount": row["chapter_count"] or 0,
            "totalWords": 0,  # filled by caller
        }

    # ── Groups ──

    def create_group(self, book_name: str, name: str) -> dict:
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise ValueError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        gid = _uid()
        max_order = self.db.execute(
            "SELECT MAX(sort_order) FROM groups WHERE book_id = ?", (bid,)
        ).fetchone()[0] or 0
        try:
            self.db.execute(
                "INSERT INTO groups (id, book_id, name, sort_order) VALUES (?, ?, ?, ?)",
                (gid, bid, name, max_order + 1),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"组 '{name}' 已存在")
        return {"id": gid, "name": name, "order": max_order + 1, "expanded": True, "chapters": []}

    def rename_group(self, book_name: str, old_name: str, new_name: str):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        try:
            self.db.execute(
                "UPDATE groups SET name = ? WHERE book_id = ? AND name = ?",
                (new_name, bid, old_name),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"组 '{new_name}' 已存在")

    def delete_group(self, book_name: str, group_name: str):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            return
        bid = row["id"]
        self.db.execute(
            "DELETE FROM groups WHERE book_id = ? AND name = ?", (bid, group_name)
        )
        self.db.commit()

    def toggle_group(self, book_name: str, group_name: str):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            return
        bid = row["id"]
        self.db.execute(
            "UPDATE groups SET expanded = 1 - expanded WHERE book_id = ? AND name = ?",
            (bid, group_name),
        )
        self.db.commit()

    # ── Chapters ──

    def create_chapter(self, book_name: str, name: str, group_id: Optional[str] = None) -> str:
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise ValueError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        try:
            max_order = self.db.execute(
                "SELECT MAX(sort_order) FROM chapters WHERE book_id = ? AND (group_id = ? OR (? IS NULL AND group_id IS NULL))",
                (bid, group_id, group_id),
            ).fetchone()[0] or 0
            self.db.execute(
                "INSERT INTO chapters (name, book_id, group_id, sort_order) VALUES (?, ?, ?, ?)",
                (name, bid, group_id, max_order + 1),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"章节 '{name}' 已存在")
        return name

    def rename_chapter(self, book_name: str, old_name: str, new_name: str):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        try:
            self.db.execute(
                "UPDATE chapters SET name = ? WHERE book_id = ? AND name = ?",
                (new_name, bid, old_name),
            )
            self.db.commit()
        except sqlite3.IntegrityError:
            raise ValueError(f"章节 '{new_name}' 已存在")

    def delete_chapter(self, book_name: str, chapter_name: str):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            return
        bid = row["id"]
        self.db.execute(
            "DELETE FROM chapters WHERE book_id = ? AND name = ?",
            (bid, chapter_name),
        )
        self.db.commit()

    def move_chapter(self, book_name: str, chapter_name: str, target_group_id: Optional[str]):
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        max_order = self.db.execute(
            "SELECT MAX(sort_order) FROM chapters WHERE book_id = ? AND (group_id = ? OR (? IS NULL AND group_id IS NULL))",
            (bid, target_group_id, target_group_id),
        ).fetchone()[0] or 0
        self.db.execute(
            "UPDATE chapters SET group_id = ?, sort_order = ? WHERE book_id = ? AND name = ?",
            (target_group_id, max_order + 1, bid, chapter_name),
        )
        self.db.commit()

    # ── Documents ──

    def get_document(self, book_name: str, chapter_name: str) -> dict:
        import json
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        ch = self.db.execute(
            "SELECT content FROM chapters WHERE book_id = ? AND name = ?",
            (bid, chapter_name),
        ).fetchone()
        if not ch:
            raise FileNotFoundError(f"章节 '{chapter_name}' 不存在")
        return json.loads(ch["content"]) if ch["content"] else {"type": "doc", "content": []}

    def save_document(self, book_name: str, chapter_name: str, content: dict):
        import json
        row = self.db.execute("SELECT id FROM books WHERE name = ?", (book_name,)).fetchone()
        if not row:
            raise FileNotFoundError(f"书籍 '{book_name}' 不存在")
        bid = row["id"]
        self.db.execute(
            "UPDATE chapters SET content = ? WHERE book_id = ? AND name = ?",
            (json.dumps(content, ensure_ascii=False), bid, chapter_name),
        )
        self.db.commit()
