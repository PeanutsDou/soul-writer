"""
Agent tools for document manipulation.
"""
import json
from typing import Optional

from ai.novel_browser import SERVICE as novel_browser, read_writing_reference, search_knowledge_base
from store import Store

store: Optional[Store] = None


def set_store(s: Store):
    global store
    store = s


TOOLS = [
    {"type": "function", "function": {"name": "read_chapter", "description": "读取指定章节的纯文本内容", "parameters": {"type": "object", "properties": {"book_name": {"type": "string", "description": "书名"}, "chapter_name": {"type": "string", "description": "章节名"}}, "required": ["book_name", "chapter_name"]}}},
    {"type": "function", "function": {"name": "search_content", "description": "在全书章节中搜索关键词，返回章节名和上下文片段", "parameters": {"type": "object", "properties": {"book_name": {"type": "string", "description": "书名"}, "query": {"type": "string", "description": "搜索关键词"}}, "required": ["book_name", "query"]}}},
    {"type": "function", "function": {"name": "get_chapter_stats", "description": "获取章节字数、段落数等统计信息", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}}, "required": ["book_name", "chapter_name"]}}},
    {"type": "function", "function": {"name": "get_book_outline", "description": "获取全书目录结构，包括分组和章节列表", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}}, "required": ["book_name"]}}},
    {"type": "function", "function": {"name": "insert_text", "description": "在章节中指定位置插入文字。position 为段落索引，从 0 开始，或使用 end 追加到章末", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}, "position": {"description": "段落索引或 end"}, "text": {"type": "string", "description": "要插入的纯文本"}}, "required": ["book_name", "chapter_name", "position", "text"]}}},
    {"type": "function", "function": {"name": "replace_in_chapter", "description": "在章节中查找并替换文本", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["book_name", "chapter_name", "old_text", "new_text"]}}},
    {"type": "function", "function": {"name": "create_chapter", "description": "新建章节。group_name 可选，用于指定所属分组", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}, "group_name": {"description": "可选，所属分组名"}}, "required": ["book_name", "chapter_name"]}}},
    {"type": "function", "function": {"name": "rename_chapter", "description": "重命名章节", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "old_name": {"type": "string"}, "new_name": {"type": "string"}}, "required": ["book_name", "old_name", "new_name"]}}},
    {"type": "function", "function": {"name": "delete_chapter", "description": "删除章节，不可恢复", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}}, "required": ["book_name", "chapter_name"]}}},
    {"type": "function", "function": {"name": "apply_style", "description": "对章节中指定段落的文字应用样式：bold, italic, underline, color, fontSize, fontFamily", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}, "paragraph_index": {"type": "integer", "description": "段落索引，从 0 开始"}, "text_selection": {"type": "string", "description": "要修改的文字片段"}, "styles": {"type": "object", "description": "样式对象，例如 bold、italic、underline、color、fontSize、fontFamily"}}, "required": ["book_name", "chapter_name", "paragraph_index", "text_selection", "styles"]}}},
    {"type": "function", "function": {"name": "create_group", "description": "新建分组", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "group_name": {"type": "string"}}, "required": ["book_name", "group_name"]}}},
    {"type": "function", "function": {"name": "rename_group", "description": "重命名分组", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "old_name": {"type": "string"}, "new_name": {"type": "string"}}, "required": ["book_name", "old_name", "new_name"]}}},
    {"type": "function", "function": {"name": "move_chapter_to_group", "description": "将章节移动到指定分组。group_name 为 null 则移动到未分组", "parameters": {"type": "object", "properties": {"book_name": {"type": "string"}, "chapter_name": {"type": "string"}, "group_name": {"description": "目标分组名，或 null"}}, "required": ["book_name", "chapter_name"]}}},
    {"type": "function", "function": {"name": "novel_search", "description": "使用 Playwright 浏览器在指定小说站搜索书籍。站点不会自动降级或切换。", "parameters": {"type": "object", "properties": {"keyword": {"type": "string", "description": "书名或搜索词"}, "source": {"type": "string", "enum": ["qidian", "qidiantu", "xsdi"], "description": "数据源：起点、起点图或 xsdi"}, "limit": {"type": "integer", "minimum": 1, "maximum": 20}}, "required": ["keyword", "source"]}}},
    {"type": "function", "function": {"name": "novel_book_info", "description": "使用 Playwright 打开小说详情页，返回页面中的书籍信息。", "parameters": {"type": "object", "properties": {"source": {"type": "string", "enum": ["qidian", "qidiantu", "xsdi"]}, "book_id": {"type": "string", "description": "纯数字书籍 ID"}}, "required": ["source", "book_id"]}}},
    {"type": "function", "function": {"name": "novel_catalog", "description": "使用 Playwright 获取小说目录。起点目录同时返回免费标记。", "parameters": {"type": "object", "properties": {"source": {"type": "string", "enum": ["qidian", "xsdi"]}, "book_id": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500}, "order": {"type": "string", "enum": ["asc", "desc"]}}, "required": ["source", "book_id"]}}},
    {"type": "function", "function": {"name": "novel_read_chapter", "description": "使用 Playwright 读取章节正文。起点仅允许读取目录明确标记为免费的章节，不读取付费内容。", "parameters": {"type": "object", "properties": {"source": {"type": "string", "enum": ["qidian", "xsdi"]}, "book_id": {"type": "string"}, "chapter_id": {"type": "string"}, "max_chars": {"type": "integer", "minimum": 500, "maximum": 30000}}, "required": ["source", "book_id", "chapter_id"]}}},
    {"type": "function", "function": {"name": "qidian_rankings", "description": "使用 Playwright 查询起点图首订榜单和新书数据，可按月或按日查询。", "parameters": {"type": "object", "properties": {"period": {"type": "string", "description": "留空查最新，或填写 YYYY-MM / YYYY-MM-DD"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}}}},
    {"type": "function", "function": {"name": "novel_writing_reference", "description": "读取内置 novel-writing 指南，以及文风、爽点、剧情结构或全文检索知识。", "parameters": {"type": "object", "properties": {"topic": {"type": "string", "enum": ["guide", "style", "gratification", "plot", "fulltext"]}, "query": {"type": "string", "description": "可选关键词；填写后只返回相关章节"}, "max_chars": {"type": "integer", "minimum": 1000, "maximum": 40000}}, "required": ["topic"]}}},
    {"type": "function", "function": {"name": "novel_knowledge_search", "description": "搜索本地 better writer/knowledge_base 中已分析小说的结构化档案、章节索引和研究资料。", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "题材、书名、人物、爽点或结构关键词"}, "limit": {"type": "integer", "minimum": 1, "maximum": 30}}, "required": ["query"]}}},
]


def _require_store() -> Store:
    if store is None:
        raise RuntimeError("数据存储未初始化")
    return store


def doc_to_text(doc: dict) -> str:
    paragraphs = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "paragraph":
                texts = _extract_texts(node)
                paragraphs.append("".join(texts) if texts else "")
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(doc)
    return "\n\n".join(paragraphs)


def _extract_texts(node) -> list[str]:
    texts = []
    if isinstance(node, dict):
        if isinstance(node.get("text"), str):
            texts.append(node["text"])
        for value in node.values():
            texts.extend(_extract_texts(value))
    elif isinstance(node, list):
        for item in node:
            texts.extend(_extract_texts(item))
    return texts


def text_to_paragraphs(text: str) -> list[dict]:
    paragraphs = []
    for line in text.split("\n"):
        line = line.strip()
        paragraphs.append({
            "type": "paragraph",
            "content": [{"type": "text", "text": line}] if line else [],
        })
    return paragraphs


def execute_tool(name: str, args: dict) -> str:
    try:
        if name == "novel_search":
            return novel_browser.search(args["keyword"], args["source"], args.get("limit", 10))
        if name == "novel_book_info":
            return novel_browser.book_info(args["source"], args["book_id"])
        if name == "novel_catalog":
            return novel_browser.catalog(args["source"], args["book_id"], args.get("limit", 100), args.get("order", "asc"))
        if name == "novel_read_chapter":
            return novel_browser.read_chapter(args["source"], args["book_id"], args["chapter_id"], args.get("max_chars", 20_000))
        if name == "qidian_rankings":
            return novel_browser.rankings(args.get("period", ""), args.get("limit", 20))
        if name == "novel_writing_reference":
            return read_writing_reference(args["topic"], args.get("query", ""), args.get("max_chars", 20_000))
        if name == "novel_knowledge_search":
            return search_knowledge_base(args["query"], args.get("limit", 10))

        s = _require_store()

        if name == "read_chapter":
            doc = s.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            return text if text else "（空章节）"

        if name == "search_content":
            book_name, query = args["book_name"], args["query"]
            meta = s.get_book_meta(book_name)
            chapters = list(meta.get("ungrouped", []))
            for group in meta.get("groups", []):
                chapters.extend(group.get("chapters", []))
            results = []
            for chapter in chapters:
                text = doc_to_text(s.get_document(book_name, chapter))
                if query in text:
                    idx = text.index(query)
                    snippet = text[max(0, idx - 20):idx + len(query) + 30]
                    results.append(f"《{chapter}》...{snippet}...")
            return "\n".join(results) if results else f"未在《{book_name}》中找到「{query}」"

        if name == "get_chapter_stats":
            doc = s.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            para_count = sum(1 for c in doc.get("content", []) if c.get("type") == "paragraph")
            return json.dumps({"chapter": args["chapter_name"], "characters": len(text), "paragraphs": para_count}, ensure_ascii=False)

        if name == "get_book_outline":
            meta = s.get_book_meta(args["book_name"])
            lines = []
            for group in meta.get("groups", []):
                lines.append(f"[分组] {group['name']}（{len(group.get('chapters', []))}章）")
                for chapter in group.get("chapters", []):
                    lines.append(f"  - {chapter}")
            for chapter in meta.get("ungrouped", []):
                lines.append(f"- {chapter}")
            return "\n".join(lines) if lines else "（空）"

        if name == "insert_text":
            doc = s.get_document(args["book_name"], args["chapter_name"])
            content = doc.get("content", [])
            new_paras = text_to_paragraphs(args["text"])
            pos = args["position"]
            if pos == "end":
                content.extend(new_paras)
            else:
                insert_at = max(0, min(len(content), int(pos) + 1))
                for i, paragraph in enumerate(new_paras):
                    content.insert(insert_at + i, paragraph)
            doc["content"] = content
            s.save_document(args["book_name"], args["chapter_name"], doc)
            return f"已在《{args['chapter_name']}》中插入 {len(new_paras)} 个段落"

        if name == "replace_in_chapter":
            doc = s.get_document(args["book_name"], args["chapter_name"])
            old_text = args["old_text"]
            if not old_text:
                return "旧文本不能为空"
            if not _replace_first_text(doc, old_text, args["new_text"]):
                return f"未找到「{args['old_text'][:50]}」"
            s.save_document(args["book_name"], args["chapter_name"], doc)
            return f"已在《{args['chapter_name']}》中完成替换"

        if name == "create_chapter":
            group_id = None
            if args.get("group_name"):
                meta = s.get_book_meta(args["book_name"])
                for group in meta.get("groups", []):
                    if group["name"] == args["group_name"]:
                        group_id = group["id"]
                        break
                if group_id is None:
                    return f"分组「{args['group_name']}」不存在"
            s.create_chapter(args["book_name"], args["chapter_name"], group_id)
            loc = f"分组「{args['group_name']}」中" if args.get("group_name") else "未分组中"
            return f"已在{loc}创建章节《{args['chapter_name']}》"

        if name == "rename_chapter":
            s.rename_chapter(args["book_name"], args["old_name"], args["new_name"])
            return f"已将章节《{args['old_name']}》重命名为《{args['new_name']}》"

        if name == "delete_chapter":
            s.delete_chapter(args["book_name"], args["chapter_name"])
            return f"已删除章节《{args['chapter_name']}》"

        if name == "apply_style":
            doc = s.get_document(args["book_name"], args["chapter_name"])
            content = doc.get("content", [])
            pi = int(args["paragraph_index"])
            if pi < 0 or pi >= len(content):
                return f"段落索引 {pi} 超出范围（共 {len(content)} 段）"
            if not _apply_style_to_node(content[pi], args["text_selection"], args["styles"]):
                return f"第 {pi + 1} 段中未找到「{args['text_selection'][:30]}」"
            s.save_document(args["book_name"], args["chapter_name"], doc)
            style_desc = ", ".join(f"{k}={v}" for k, v in args["styles"].items())
            return f"已在《{args['chapter_name']}》第 {pi + 1} 段对「{args['text_selection'][:20]}」应用样式：{style_desc}"

        if name == "create_group":
            s.create_group(args["book_name"], args["group_name"])
            return f"已创建分组「{args['group_name']}」"

        if name == "rename_group":
            s.rename_group(args["book_name"], args["old_name"], args["new_name"])
            return f"已将分组「{args['old_name']}」重命名为「{args['new_name']}」"

        if name == "move_chapter_to_group":
            group_id = None
            if args.get("group_name"):
                meta = s.get_book_meta(args["book_name"])
                for group in meta.get("groups", []):
                    if group["name"] == args["group_name"]:
                        group_id = group["id"]
                        break
                if group_id is None:
                    return f"分组「{args['group_name']}」不存在"
            s.move_chapter(args["book_name"], args["chapter_name"], group_id)
            dest = f"分组「{args['group_name']}」" if args.get("group_name") else "未分组"
            return f"已将《{args['chapter_name']}》移动到{dest}"

        return f"未知工具：{name}"
    except Exception as e:
        return f"工具执行失败：{e}"


def _replace_first_text(node, old_text: str, new_text: str) -> bool:
    if isinstance(node, dict):
        if isinstance(node.get("text"), str) and old_text in node["text"]:
            node["text"] = node["text"].replace(old_text, new_text, 1)
            return True
        for value in node.values():
            if _replace_first_text(value, old_text, new_text):
                return True
    elif isinstance(node, list):
        for item in node:
            if _replace_first_text(item, old_text, new_text):
                return True
    return False


def _styled_marks(existing_marks: list, styles: dict) -> list:
    marks = [dict(mark) for mark in existing_marks]
    if "bold" in styles:
        _set_mark(marks, "bold", styles["bold"])
    if "italic" in styles:
        _set_mark(marks, "italic", styles["italic"])
    if "underline" in styles:
        _set_mark(marks, "underline", styles["underline"])

    text_attrs = {key: styles[key] for key in ("color", "fontSize", "fontFamily") if key in styles}
    if text_attrs:
        text_style = next((mark for mark in marks if mark.get("type") == "textStyle"), None)
        if text_style is None:
            text_style = {"type": "textStyle", "attrs": {}}
            marks.append(text_style)
        text_style["attrs"] = {**text_style.get("attrs", {}), **text_attrs}
    return marks


def _apply_style_to_node(node, selection: str, styles: dict) -> bool:
    if not selection:
        return False
    if isinstance(node, dict):
        for value in node.values():
            if _apply_style_to_node(value, selection, styles):
                return True
    elif isinstance(node, list):
        for index, item in enumerate(node):
            if isinstance(item, dict) and isinstance(item.get("text"), str) and selection in item["text"]:
                text = item["text"]
                start = text.index(selection)
                replacement = []
                if start:
                    replacement.append({**item, "text": text[:start]})
                styled = {**item, "text": selection, "marks": _styled_marks(item.get("marks", []), styles)}
                replacement.append(styled)
                if start + len(selection) < len(text):
                    replacement.append({**item, "text": text[start + len(selection):]})
                node[index:index + 1] = replacement
                return True
            if _apply_style_to_node(item, selection, styles):
                return True
    return False


def _set_mark(marks: list, mark_type: str, value: bool):
    existing = any(m.get("type") == mark_type for m in marks)
    if value and not existing:
        marks.append({"type": mark_type})
    elif not value and existing:
        marks[:] = [m for m in marks if m.get("type") != mark_type]
