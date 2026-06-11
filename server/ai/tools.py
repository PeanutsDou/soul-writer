"""
Agent tools for document manipulation.
Each tool has: name, description, parameters (JSON Schema), and an execute function.
"""
import json
from typing import Optional
from store import Store

# Global store instance (set by main.py)
store: Optional[Store] = None


def set_store(s: Store):
    global store
    store = s


# ── Tool definitions (OpenAI function calling format) ──

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_chapter",
            "description": "读取指定章节的纯文本内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "chapter_name": {"type": "string", "description": "章节名"},
                },
                "required": ["book_name", "chapter_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_content",
            "description": "在全书所有章节中搜索关键词，返回包含该词的章节名和上下文片段",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "query": {"type": "string", "description": "搜索关键词"},
                },
                "required": ["book_name", "query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chapter_stats",
            "description": "获取某章节的字数、段落数等统计信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "chapter_name": {"type": "string", "description": "章节名"},
                },
                "required": ["book_name", "chapter_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_book_outline",
            "description": "获取全书目录结构（分组和章节列表）",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                },
                "required": ["book_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "insert_text",
            "description": "在章节中指定位置插入文字。position 为段落索引（从 0 开始），text 为要插入的纯文本，会自动转为段落。如果 position 为 'end'，追加到章末",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "chapter_name": {"type": "string", "description": "章节名"},
                    "position": {"description": "插入位置：段落索引数字 或 'end'"},
                    "text": {"type": "string", "description": "要插入的纯文本"},
                },
                "required": ["book_name", "chapter_name", "position", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "replace_in_chapter",
            "description": "在章节中查找并替换文本。将 old_text 替换为 new_text",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "chapter_name": {"type": "string", "description": "章节名"},
                    "old_text": {"type": "string", "description": "要替换的原文本"},
                    "new_text": {"type": "string", "description": "替换后的新文本"},
                },
                "required": ["book_name", "chapter_name", "old_text", "new_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_chapter",
            "description": "新建一个章节",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "chapter_name": {"type": "string", "description": "新章节名"},
                },
                "required": ["book_name", "chapter_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rename_chapter",
            "description": "重命名一个章节",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "old_name": {"type": "string", "description": "原章节名"},
                    "new_name": {"type": "string", "description": "新章节名"},
                },
                "required": ["book_name", "old_name", "new_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_chapter",
            "description": "删除一个章节（不可恢复，请谨慎使用）",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_name": {"type": "string", "description": "书名"},
                    "chapter_name": {"type": "string", "description": "要删除的章节名"},
                },
                "required": ["book_name", "chapter_name"],
            },
        },
    },
]


# ── Text extraction utilities ──

def doc_to_text(doc: dict) -> str:
    """Convert TipTap JSON to plain text with paragraph breaks."""
    paragraphs = []
    def walk(node, depth=0):
        if isinstance(node, dict):
            if node.get("type") == "paragraph":
                texts = _extract_texts(node)
                if texts:
                    paragraphs.append("".join(texts))
                else:
                    paragraphs.append("")  # empty paragraph = blank line
            for v in node.values():
                walk(v, depth + 1)
        elif isinstance(node, list):
            for item in node:
                walk(item, depth + 1)
    walk(doc)
    return "\n\n".join(paragraphs)


def _extract_texts(node: dict) -> list[str]:
    """Recursively extract text strings from a node."""
    texts = []
    if isinstance(node, dict):
        if "text" in node and isinstance(node["text"], str):
            texts.append(node["text"])
        for v in node.values():
            texts.extend(_extract_texts(v))
    elif isinstance(node, list):
        for item in node:
            texts.extend(_extract_texts(item))
    return texts


def text_to_paragraphs(text: str) -> list[dict]:
    """Convert plain text to TipTap paragraph JSON nodes."""
    paragraphs = []
    for line in text.split("\n"):
        line = line.strip()
        if line:
            paragraphs.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": line}],
            })
        else:
            paragraphs.append({
                "type": "paragraph",
                "content": [],
            })
    return paragraphs


# ── Tool execution ──

def execute_tool(name: str, args: dict) -> str:
    """Execute a tool and return the result as a string."""
    if store is None:
        return "错误：数据存储未初始化"

    try:
        if name == "read_chapter":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            return text if text else "(空章节)"

        elif name == "search_content":
            book_name = args["book_name"]
            query = args["query"]
            meta = store.get_book_meta(book_name)
            results = []
            all_chapters = list(meta.get("ungrouped", []))
            for g in meta.get("groups", []):
                all_chapters.extend(g.get("chapters", []))
            for ch_name in all_chapters:
                doc = store.get_document(book_name, ch_name)
                text = doc_to_text(doc)
                if query in text:
                    idx = text.index(query)
                    start = max(0, idx - 20)
                    end = min(len(text), idx + len(query) + 30)
                    snippet = text[start:end]
                    results.append(f"【{ch_name}】...{snippet}...")
            if results:
                return "\n".join(results)
            return f"未在《{book_name}》中找到「{query}」"

        elif name == "get_chapter_stats":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            chars = len(text)
            paras = text.count("\n\n") + 1 if text else 0
            # Count paragraphs from JSON
            para_count = sum(1 for c in doc.get("content", []) if c.get("type") == "paragraph")
            return json.dumps({
                "chapter": args["chapter_name"],
                "characters": chars,
                "paragraphs": para_count,
            }, ensure_ascii=False)

        elif name == "get_book_outline":
            meta = store.get_book_meta(args["book_name"])
            lines = []
            for g in meta.get("groups", []):
                lines.append(f"📁 {g['name']} ({len(g.get('chapters', []))}章)")
                for ch in g.get("chapters", []):
                    lines.append(f"    📄 {ch}")
            for ch in meta.get("ungrouped", []):
                lines.append(f"📄 {ch}")
            return "\n".join(lines) if lines else "(空)"

        elif name == "insert_text":
            book_name = args["book_name"]
            chapter_name = args["chapter_name"]
            position = args["position"]
            text = args["text"]
            doc = store.get_document(book_name, chapter_name)
            content = doc.get("content", [])
            new_paras = text_to_paragraphs(text)

            if position == "end":
                content.extend(new_paras)
            else:
                pos = int(position)
                # Insert after the specified paragraph index
                for i, para in enumerate(new_paras):
                    content.insert(pos + 1 + i, para)

            doc["content"] = content
            store.save_document(book_name, chapter_name, doc)
            return f"已在《{book_name}》的「{chapter_name}」中插入 {len(new_paras)} 个段落"

        elif name == "replace_in_chapter":
            book_name = args["book_name"]
            chapter_name = args["chapter_name"]
            old_text = args["old_text"]
            new_text = args["new_text"]
            doc = store.get_document(book_name, chapter_name)
            text = doc_to_text(doc)
            if old_text not in text:
                return f"未找到要替换的文本「{old_text[:50]}...」"
            new_full = text.replace(old_text, new_text, 1)
            doc["content"] = text_to_paragraphs(new_full)
            store.save_document(book_name, chapter_name, doc)
            return f"已在《{book_name}》的「{chapter_name}」中完成替换"

        elif name == "create_chapter":
            store.create_chapter(args["book_name"], args["chapter_name"])
            return f"已创建章节「{args['chapter_name']}」"

        elif name == "rename_chapter":
            store.rename_chapter(args["book_name"], args["old_name"], args["new_name"])
            return f"已将「{args['old_name']}」重命名为「{args['new_name']}」"

        elif name == "delete_chapter":
            store.delete_chapter(args["book_name"], args["chapter_name"])
            return f"已删除章节「{args['chapter_name']}」"

        else:
            return f"未知工具：{name}"

    except Exception as e:
        return f"工具执行失败：{e}"
