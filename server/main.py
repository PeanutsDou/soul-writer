"""
Soul Writer Python backend — stdin/stdout JSON lines protocol.
"""
import sys
import json
import os
import traceback
from store import Store

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = os.environ.get("SOUL_WRITER_DATA", os.path.join(os.path.expanduser("~"), ".soul-writer"))
store = Store(DATA_DIR)

# ── Model configs ──
CONFIGS_PATH = os.path.join(DATA_DIR, "model_configs.json")

def load_model_configs() -> list:
    if not os.path.exists(CONFIGS_PATH): return []
    with open(CONFIGS_PATH, "r", encoding="utf-8") as f: return json.load(f)

def save_model_configs(configs: list):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIGS_PATH, "w", encoding="utf-8") as f: json.dump(configs, f, ensure_ascii=False, indent=2)

# ── AI Agent ──
import ai.tools as ai_tools
ai_tools.set_store(store)

_agents = {}

def _get_or_create_agent(config: dict, system_prompt: str = ""):
    agent_key = f"{config.get('url','')}|{config.get('api_key','')[:8]}|{config.get('model','')}"
    if agent_key in _agents: return _agents[agent_key]
    from ai.llm_client import LLMClient
    from ai.agent import Agent
    llm = LLMClient(config.get("url",""), config.get("api_key",""), config.get("model",""))
    agent = Agent(llm, system_prompt)
    _agents[agent_key] = agent
    return agent

def _build_workspace(current_book=None, current_chapter=None) -> str:
    parts = []
    try:
        books = store.list_books()
        if books:
            parts.append("## 所有书籍")
            for b in books:
                m = " ← 当前" if b["name"] == current_book else ""
                parts.append(f"- {b['name']}（{b['chapterCount']}章, {b['totalWords']}字）{m}")
    except: pass

    if current_book:
        try:
            meta = store.get_book_meta(current_book)
            parts.append(f"\n## 《{current_book}》目录")
            for g in meta.get("groups",[]):
                parts.append(f"📁 {g['name']}（{len(g.get('chapters',[]))}章）")
                for ch in g.get("chapters",[]):
                    m = " ← 当前" if ch == current_chapter else ""
                    parts.append(f"  📄 {ch}{m}")
            for ch in meta.get("ungrouped",[]):
                m = " ← 当前" if ch == current_chapter else ""
                parts.append(f"📄 {ch}{m}")
        except: pass

    if current_chapter and current_book:
        try:
            doc = store.get_document(current_book, current_chapter)
            from ai.tools import doc_to_text
            text = doc_to_text(doc)
            preview = text[:2000] + ("..." if len(text)>2000 else "")
            parts.append(f"\n## 当前章节「{current_chapter}」内容（前2000字）\n{preview}")
        except: pass

    return "\n".join(parts)


def handle(method: str, params: dict):
    # ── Books ──
    if method == "list_books": return store.list_books()
    elif method == "create_book": return store.create_book(params["name"])
    elif method == "delete_book": store.delete_book(params["name"]); return {"ok": True}
    elif method == "rename_book": store.rename_book(params["old_name"], params["new_name"]); return {"ok": True}
    elif method == "get_book_meta": return store.get_book_meta(params["book_name"])

    # ── Groups ──
    elif method == "create_group": return store.create_group(params["book_name"], params["name"])
    elif method == "rename_group": store.rename_group(params["book_name"], params["old_name"], params["new_name"]); return {"ok": True}
    elif method == "delete_group": store.delete_group(params["book_name"], params["group_name"]); return {"ok": True}
    elif method == "toggle_group": store.toggle_group(params["book_name"], params["group_name"]); return {"ok": True}

    # ── Chapters ──
    elif method == "create_chapter": return {"name": store.create_chapter(params["book_name"], params["name"], params.get("group_id"))}
    elif method == "rename_chapter": store.rename_chapter(params["book_name"], params["old_name"], params["new_name"]); return {"ok": True}
    elif method == "delete_chapter": store.delete_chapter(params["book_name"], params["chapter_name"]); return {"ok": True}
    elif method == "move_chapter": store.move_chapter(params["book_name"], params["chapter_name"], params.get("target_group_id")); return {"ok": True}

    # ── Documents ──
    elif method == "get_document":
        doc = store.get_document(params["book_name"], params["chapter_name"])
        from ai.tools import _extract_texts
        texts = _extract_texts(doc)
        doc["_count"] = sum(len(t) for t in texts)
        return doc

    elif method == "save_document":
        store.save_document(params["book_name"], params["chapter_name"], params["content"])
        from ai.tools import _extract_texts
        texts = _extract_texts(params["content"])
        return {"ok": True, "debug_count": sum(len(t) for t in texts)}

    # ── Model configs ──
    elif method == "get_model_configs": return {"configs": load_model_configs()}
    elif method == "save_model_configs": save_model_configs(params["configs"]); return {"ok": True}

    # ── AI Chat ──
    elif method == "chat":
        config = params.get("config", {})
        message = params.get("message", "")
        current_book = params.get("current_book")
        current_chapter = params.get("current_chapter")

        if not config.get("api_key"): raise ValueError("请先配置 API Key")

        agent = _get_or_create_agent(config)
        agent.set_workspace(_build_workspace(current_book, current_chapter))

        sys.stdout.write(json.dumps({"type": "stream_start"}, ensure_ascii=False) + "\n")
        sys.stdout.flush()

        try:
            for text in agent.chat(message):
                # text is the full response (not token-by-token)
                # Write as single chunk
                sys.stdout.write(json.dumps({"type": "stream_chunk", "content": text}, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"type": "stream_error", "error": str(e)}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            return {"ok": False, "error": str(e)}

        sys.stdout.write(json.dumps({"type": "stream_end"}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return {"ok": True}

    elif method == "reset_agent":
        _get_or_create_agent(params.get("config",{})).reset()
        return {"ok": True}

    else:
        raise ValueError(f"Unknown method: {method}")


def main():
    sys.stdout.write("READY\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try:
            req = json.loads(line)
            req_id, method, params = req["id"], req["method"], req.get("params", {})
        except (KeyError, json.JSONDecodeError) as e:
            sys.stdout.write(json.dumps({"id":0,"ok":False,"error":f"Invalid: {e}"}, ensure_ascii=False)+"\n")
            sys.stdout.flush()
            continue

        try:
            data = handle(method, params)
            resp = {"id": req_id, "ok": True, "data": data}
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            resp = {"id": req_id, "ok": False, "error": str(e)}

        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
