"""
Soul Writer Python backend: stdin/stdout JSON-lines protocol.
"""
import json
import os
import sys
import traceback
import hashlib

from store import Store

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = os.environ.get("SOUL_WRITER_DATA", os.path.join(os.path.expanduser("~"), ".soul-writer"))
store = Store(DATA_DIR)

CONFIGS_PATH = os.path.join(DATA_DIR, "model_configs.json")


def load_model_configs() -> list:
    if not os.path.exists(CONFIGS_PATH):
        return []
    with open(CONFIGS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_model_configs(configs: list):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIGS_PATH, "w", encoding="utf-8") as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)


import ai.tools as ai_tools

ai_tools.set_store(store)
_agents = {}


def _get_or_create_agent(config: dict, system_prompt: str = ""):
    identity = json.dumps({
        "url": config.get("url", ""),
        "api_key": config.get("api_key", ""),
        "model": config.get("model", ""),
        "system_prompt": system_prompt,
    }, ensure_ascii=False, sort_keys=True)
    agent_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    if agent_key in _agents:
        return _agents[agent_key]
    from ai.agent import Agent
    from ai.llm_client import LLMClient

    llm = LLMClient(config.get("url", ""), config.get("api_key", ""), config.get("model", ""))
    agent = Agent(llm, system_prompt)
    _agents[agent_key] = agent
    return agent


def _build_workspace(current_book=None, current_chapter=None) -> str:
    parts = []
    try:
        books = store.list_books()
        if books:
            parts.append("## 所有书籍")
            for book in books:
                marker = " -> 当前" if book["name"] == current_book else ""
                parts.append(f"- {book['name']}（{book['chapterCount']}章，{book['totalWords']}字）{marker}")
    except Exception:
        pass

    if current_book:
        try:
            meta = store.get_book_meta(current_book)
            parts.append(f"\n## 《{current_book}》目录")
            for group in meta.get("groups", []):
                parts.append(f"[分组] {group['name']}（{len(group.get('chapters', []))}章）")
                for chapter in group.get("chapters", []):
                    marker = " -> 当前" if chapter == current_chapter else ""
                    parts.append(f"  - {chapter}{marker}")
            for chapter in meta.get("ungrouped", []):
                marker = " -> 当前" if chapter == current_chapter else ""
                parts.append(f"- {chapter}{marker}")
        except Exception:
            pass

    return "\n".join(parts)


def handle(method: str, params: dict):
    if method == "list_books":
        return store.list_books()
    if method == "create_book":
        return store.create_book(params["name"])
    if method == "delete_book":
        store.delete_book(params["name"])
        return {"ok": True}
    if method == "rename_book":
        store.rename_book(params["old_name"], params["new_name"])
        return {"ok": True}
    if method == "get_book_meta":
        return store.get_book_meta(params["book_name"])

    if method == "create_group":
        return store.create_group(params["book_name"], params["name"])
    if method == "rename_group":
        store.rename_group(params["book_name"], params["old_name"], params["new_name"])
        return {"ok": True}
    if method == "delete_group":
        store.delete_group(params["book_name"], params["group_name"])
        return {"ok": True}
    if method == "toggle_group":
        store.toggle_group(params["book_name"], params["group_name"])
        return {"ok": True}

    if method == "create_chapter":
        return {"name": store.create_chapter(params["book_name"], params["name"], params.get("group_id"))}
    if method == "rename_chapter":
        store.rename_chapter(params["book_name"], params["old_name"], params["new_name"])
        return {"ok": True}
    if method == "delete_chapter":
        store.delete_chapter(params["book_name"], params["chapter_name"])
        return {"ok": True}
    if method == "move_chapter":
        store.move_chapter(params["book_name"], params["chapter_name"], params.get("target_group_id"))
        return {"ok": True}

    if method == "get_document":
        doc = store.get_document(params["book_name"], params["chapter_name"])
        from ai.tools import _extract_texts

        doc["_count"] = sum(len(t) for t in _extract_texts(doc))
        return doc

    if method == "save_document":
        store.save_document(params["book_name"], params["chapter_name"], params["content"])
        from ai.tools import _extract_texts

        return {"ok": True, "debug_count": sum(len(t) for t in _extract_texts(params["content"]))}

    if method == "get_model_configs":
        return {"configs": load_model_configs()}
    if method == "save_model_configs":
        save_model_configs(params["configs"])
        return {"ok": True}

    if method == "chat":
        config = params.get("config", {})
        message = params.get("message", "")
        current_book = params.get("current_book")
        current_chapter = params.get("current_chapter")

        if not config.get("api_key"):
            raise ValueError("请先配置 API Key")

        agent = _get_or_create_agent(config)
        agent.set_workspace(_build_workspace(current_book, current_chapter))

        sys.stdout.write(json.dumps({"type": "stream_start"}, ensure_ascii=False) + "\n")
        sys.stdout.flush()

        try:
            for event in agent.chat(message):
                sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"type": "stream_error", "error": str(e)}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            return {"ok": False, "error": str(e)}

        sys.stdout.write(json.dumps({"type": "stream_end"}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return {"ok": True}

    if method == "reset_agent":
        config = params.get("config", {})
        if config:
            _get_or_create_agent(config).reset()
        else:
            for agent in _agents.values():
                agent.reset()
        return {"ok": True}

    raise ValueError(f"Unknown method: {method}")


def main():
    sys.stdout.write("READY\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id, method, params = req["id"], req["method"], req.get("params", {})
        except (KeyError, json.JSONDecodeError) as e:
            sys.stdout.write(json.dumps({"id": 0, "ok": False, "error": f"Invalid: {e}"}, ensure_ascii=False) + "\n")
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
