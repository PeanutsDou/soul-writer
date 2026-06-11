"""
Agent tools for document manipulation — 14 tools.
"""
import json
from typing import Optional
from store import Store

store: Optional[Store] = None

def set_store(s: Store):
    global store; store = s

# ── Tool definitions ──

TOOLS = [
    {"type":"function","function":{"name":"read_chapter","description":"读取指定章节的纯文本内容","parameters":{"type":"object","properties":{"book_name":{"type":"string","description":"书名"},"chapter_name":{"type":"string","description":"章节名"}},"required":["book_name","chapter_name"]}}},
    {"type":"function","function":{"name":"search_content","description":"在全书所有章节中搜索关键词，返回包含该词的章节名和上下文片段","parameters":{"type":"object","properties":{"book_name":{"type":"string","description":"书名"},"query":{"type":"string","description":"搜索关键词"}},"required":["book_name","query"]}}},
    {"type":"function","function":{"name":"get_chapter_stats","description":"获取某章节的字数、段落数等统计信息","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"}},"required":["book_name","chapter_name"]}}},
    {"type":"function","function":{"name":"get_book_outline","description":"获取全书目录结构（分组和章节列表）","parameters":{"type":"object","properties":{"book_name":{"type":"string"}},"required":["book_name"]}}},
    {"type":"function","function":{"name":"insert_text","description":"在章节中指定位置插入文字。position 为段落索引(从0开始)或'end'追加到章末","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"},"position":{"description":"段落索引或'end'"},"text":{"type":"string","description":"要插入的纯文本"}},"required":["book_name","chapter_name","position","text"]}}},
    {"type":"function","function":{"name":"replace_in_chapter","description":"在章节中查找并替换文本","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"},"old_text":{"type":"string"},"new_text":{"type":"string"}},"required":["book_name","chapter_name","old_text","new_text"]}}},
    {"type":"function","function":{"name":"create_chapter","description":"新建一个章节。group_name 可选，指定所属分组","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"},"group_name":{"description":"可选，所属组名"}},"required":["book_name","chapter_name"]}}},
    {"type":"function","function":{"name":"rename_chapter","description":"重命名一个章节","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"old_name":{"type":"string"},"new_name":{"type":"string"}},"required":["book_name","old_name","new_name"]}}},
    {"type":"function","function":{"name":"delete_chapter","description":"删除一个章节（不可恢复）","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"}},"required":["book_name","chapter_name"]}}},
    {"type":"function","function":{"name":"apply_style","description":"对章节中指定段落的文字应用样式：bold, italic, underline, color, fontSize, fontFamily","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"},"paragraph_index":{"type":"integer","description":"段落索引，从0开始"},"text_selection":{"type":"string","description":"要修改的文字片段"},"styles":{"type":"object","description":"样式对象，可选: bold, italic, underline, color(如#d9534f), fontSize(如18px), fontFamily(如宋体)"}},"required":["book_name","chapter_name","paragraph_index","text_selection","styles"]}}},
    {"type":"function","function":{"name":"create_group","description":"新建一个分组（卷）","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"group_name":{"type":"string"}},"required":["book_name","group_name"]}}},
    {"type":"function","function":{"name":"rename_group","description":"重命名一个分组","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"old_name":{"type":"string"},"new_name":{"type":"string"}},"required":["book_name","old_name","new_name"]}}},
    {"type":"function","function":{"name":"move_chapter_to_group","description":"将章节移动到指定分组。group_name 为 null 则移至未分组","parameters":{"type":"object","properties":{"book_name":{"type":"string"},"chapter_name":{"type":"string"},"group_name":{"description":"目标组名，或null"}},"required":["book_name","chapter_name"]}}},
]

# ── Text utilities ──

def doc_to_text(doc: dict) -> str:
    paragraphs = []
    def walk(node, depth=0):
        if isinstance(node, dict):
            if node.get("type") == "paragraph":
                texts = _extract_texts(node)
                paragraphs.append("".join(texts) if texts else "")
            for v in node.values(): walk(v, depth+1)
        elif isinstance(node, list):
            for item in node: walk(item, depth+1)
    walk(doc)
    return "\n\n".join(paragraphs)

def _extract_texts(node) -> list[str]:
    texts = []
    if isinstance(node, dict):
        if "text" in node and isinstance(node["text"], str): texts.append(node["text"])
        for v in node.values(): texts.extend(_extract_texts(v))
    elif isinstance(node, list):
        for item in node: texts.extend(_extract_texts(item))
    return texts

def text_to_paragraphs(text: str) -> list[dict]:
    return [{"type":"paragraph","content":[{"type":"text","text":line.strip()}] if line.strip() else {"type":"paragraph","content":[]}} for line in text.split("\n")]

# ── Tool execution ──

def execute_tool(name: str, args: dict) -> str:
    if store is None: return "错误：数据存储未初始化"
    try:
        if name == "read_chapter":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            return text if text else "(空章节)"

        elif name == "search_content":
            book_name, query = args["book_name"], args["query"]
            meta = store.get_book_meta(book_name)
            all_ch = list(meta.get("ungrouped",[]))
            for g in meta.get("groups",[]): all_ch.extend(g.get("chapters",[]))
            results = []
            for ch in all_ch:
                doc = store.get_document(book_name, ch)
                text = doc_to_text(doc)
                if query in text:
                    idx = text.index(query)
                    s = text[max(0,idx-20):idx+len(query)+30]
                    results.append(f"【{ch}】...{s}...")
            return "\n".join(results) if results else f"未在《{book_name}》中找到「{query}」"

        elif name == "get_chapter_stats":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            para_count = sum(1 for c in doc.get("content",[]) if c.get("type")=="paragraph")
            return json.dumps({"chapter":args["chapter_name"],"characters":len(text),"paragraphs":para_count},ensure_ascii=False)

        elif name == "get_book_outline":
            meta = store.get_book_meta(args["book_name"])
            lines = []
            for g in meta.get("groups",[]):
                lines.append(f"📁 {g['name']}（{len(g.get('chapters',[]))}章）")
                for ch in g.get("chapters",[]): lines.append(f"    📄 {ch}")
            for ch in meta.get("ungrouped",[]): lines.append(f"📄 {ch}")
            return "\n".join(lines) if lines else "(空)"

        elif name == "insert_text":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            content = doc.get("content",[])
            new_paras = text_to_paragraphs(args["text"])
            pos = args["position"]
            if pos == "end": content.extend(new_paras)
            else:
                for i, p in enumerate(new_paras): content.insert(int(pos)+1+i, p)
            doc["content"] = content
            store.save_document(args["book_name"], args["chapter_name"], doc)
            return f"已在「{args['chapter_name']}」中插入 {len(new_paras)} 个段落"

        elif name == "replace_in_chapter":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            text = doc_to_text(doc)
            if args["old_text"] not in text: return f"未找到「{args['old_text'][:50]}」"
            new_full = text.replace(args["old_text"], args["new_text"], 1)
            doc["content"] = text_to_paragraphs(new_full)
            store.save_document(args["book_name"], args["chapter_name"], doc)
            return f"已在「{args['chapter_name']}」中完成替换"

        elif name == "create_chapter":
            group_id = None
            if args.get("group_name"):
                meta = store.get_book_meta(args["book_name"])
                for g in meta.get("groups",[]):
                    if g["name"] == args["group_name"]: group_id = g["id"]; break
            store.create_chapter(args["book_name"], args["chapter_name"], group_id)
            loc = f"分组「{args['group_name']}」中" if args.get("group_name") else "未分组"
            return f"已在{loc}创建章节「{args['chapter_name']}」"

        elif name == "rename_chapter":
            store.rename_chapter(args["book_name"], args["old_name"], args["new_name"])
            return f"已重命名"

        elif name == "delete_chapter":
            store.delete_chapter(args["book_name"], args["chapter_name"])
            return f"已删除「{args['chapter_name']}」"

        elif name == "apply_style":
            doc = store.get_document(args["book_name"], args["chapter_name"])
            content = doc.get("content",[])
            pi = args["paragraph_index"]
            if pi >= len(content): return f"段落索引 {pi} 超出范围（共 {len(content)} 段）"
            para = content[pi]
            selection = args["text_selection"]
            styles = args["styles"]
            _apply_style_to_node(para, selection, styles)
            store.save_document(args["book_name"], args["chapter_name"], doc)
            style_desc = ", ".join(f"{k}={v}" for k,v in styles.items())
            return f"已在「{args['chapter_name']}」第{pi+1}段对「{selection[:20]}」应用样式：{style_desc}"

        elif name == "create_group":
            store.create_group(args["book_name"], args["group_name"])
            return f"已创建分组「{args['group_name']}」"

        elif name == "rename_group":
            store.rename_group(args["book_name"], args["old_name"], args["new_name"])
            return f"已重命名分组"

        elif name == "move_chapter_to_group":
            group_id = None
            if args.get("group_name"):
                meta = store.get_book_meta(args["book_name"])
                for g in meta.get("groups",[]):
                    if g["name"] == args["group_name"]: group_id = g["id"]; break
            store.move_chapter(args["book_name"], args["chapter_name"], group_id)
            dest = f"分组「{args['group_name']}」" if args.get("group_name") else "未分组"
            return f"已将「{args['chapter_name']}」移动到{dest}"

        else:
            return f"未知工具：{name}"
    except Exception as e:
        return f"工具执行失败：{e}"


def _apply_style_to_node(node: dict, selection: str, styles: dict):
    """Apply styles to text nodes within a paragraph that contain the selection."""
    if isinstance(node, dict):
        if "text" in node and isinstance(node["text"], str) and selection in node["text"]:
            marks = list(node.get("marks", []))
            text_style = next((m for m in marks if m.get("type") == "textStyle"), None)
            if text_style is None:
                text_style = {"type": "textStyle", "attrs": {}}
                marks.append(text_style)
            attrs = text_style.setdefault("attrs", {})
            if "bold" in styles: _set_mark(marks, "bold", styles["bold"])
            if "italic" in styles: _set_mark(marks, "italic", styles["italic"])
            if "underline" in styles: _set_mark(marks, "underline", styles["underline"])
            if "color" in styles: attrs["color"] = styles["color"]
            if "fontSize" in styles: attrs["fontSize"] = styles["fontSize"]
            if "fontFamily" in styles: attrs["fontFamily"] = styles["fontFamily"]
            node["marks"] = marks
        for v in node.values(): _apply_style_to_node(v, selection, styles)
    elif isinstance(node, list):
        for item in node: _apply_style_to_node(item, selection, styles)

def _set_mark(marks: list, mark_type: str, value: bool):
    existing = any(m.get("type") == mark_type for m in marks)
    if value and not existing:
        marks.append({"type": mark_type})
    elif not value and existing:
        marks[:] = [m for m in marks if m.get("type") != mark_type]
