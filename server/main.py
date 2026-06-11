"""
Soul Writer Python backend — stdin/stdout JSON lines protocol.

Protocol:
  ← READY (on startup)
  ← {"id": N, "method": "...", "params": {...}}
  → {"id": N, "ok": true, "data": {...}}          (normal)
  → {"type":"stream_start","id":N,...}
  → {"type":"stream_chunk","id":N,"content":"..."}
  → {"type":"stream_end","id":N}
  → {"id": N, "ok": false, "error": "..."}
"""
import sys
import json
import os
import traceback
import uuid
from store import Store

# Force UTF-8 for stdin/stdout pipes (Windows defaults to cp936)
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = os.environ.get("SOUL_WRITER_DATA", os.path.join(os.path.expanduser("~"), ".soul-writer"))
store = Store(DATA_DIR)

# ── Model configs ──
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

# ── AI Agent (lazy init, one per session) ──
_agents = {}  # stream_id -> Agent

def _get_or_create_agent(config: dict, system_prompt: str = ""):
    # Key by model identity so different models get separate conversation history
    agent_key = f"{config.get('url','')}|{config.get('api_key','')[:8]}|{config.get('model','')}"
    if agent_key in _agents:
        return _agents[agent_key]

    from ai.llm_client import LLMClient
    from ai.agent import Agent
    llm = LLMClient(
        base_url=config.get("url", "https://api.openai.com/v1"),
        api_key=config.get("api_key", ""),
        model=config.get("model", "gpt-3.5-turbo"),
    )
    agent = Agent(llm, system_prompt)
    _agents[agent_key] = agent
    return agent


def handle(method: str, params: dict):
    if method == "list_books":
        return store.list_books()
    elif method == "create_book":
        return store.create_book(params["name"])
    elif method == "delete_book":
        store.delete_book(params["name"])
        return {"ok": True}
    elif method == "rename_book":
        store.rename_book(params["old_name"], params["new_name"])
        return {"ok": True}
    elif method == "get_book_meta":
        return store.get_book_meta(params["book_name"])

    elif method == "create_group":
        return store.create_group(params["book_name"], params["name"])
    elif method == "rename_group":
        store.rename_group(params["book_name"], params["old_name"], params["new_name"])
        return {"ok": True}
    elif method == "delete_group":
        store.delete_group(params["book_name"], params["group_name"])
        return {"ok": True}
    elif method == "toggle_group":
        store.toggle_group(params["book_name"], params["group_name"])
        return {"ok": True}

    elif method == "create_chapter":
        return {"name": store.create_chapter(
            params["book_name"], params["name"],
            params.get("group_id")
        )}
    elif method == "rename_chapter":
        store.rename_chapter(params["book_name"], params["old_name"], params["new_name"])
        return {"ok": True}
    elif method == "delete_chapter":
        store.delete_chapter(params["book_name"], params["chapter_name"])
        return {"ok": True}
    elif method == "move_chapter":
        store.move_chapter(params["book_name"], params["chapter_name"], params.get("target_group_id"))
        return {"ok": True}

    elif method == "get_document":
        doc = store.get_document(params["book_name"], params["chapter_name"])
        texts = []
        def walk(n):
            if isinstance(n, dict):
                if 'text' in n and isinstance(n['text'], str) and n['text']:
                    texts.append(n['text'])
                for v in n.values():
                    walk(v)
            elif isinstance(n, list):
                for item in n:
                    walk(item)
        walk(doc)
        doc["_count"] = sum(len(t) for t in texts)
        return doc

    elif method == "save_document":
        content = params["content"]
        texts = []
        def walk(n):
            if isinstance(n, dict):
                if 'text' in n and isinstance(n['text'], str) and n['text']:
                    texts.append(n['text'])
                for v in n.values():
                    walk(v)
            elif isinstance(n, list):
                for item in n:
                    walk(item)
        walk(content)
        total = sum(len(t) for t in texts)
        store.save_document(params["book_name"], params["chapter_name"], content)
        return {"ok": True, "debug_count": total}

    # ── Model config methods ──
    elif method == "get_model_configs":
        return {"configs": load_model_configs()}

    elif method == "save_model_configs":
        save_model_configs(params["configs"])
        return {"ok": True}

    # ── AI Chat (streaming handled specially in main loop) ──
    elif method == "chat":
        # This method returns immediately — streaming happens via stdout
        # The caller (Rust) reads subsequent stream_chunk/stream_end lines
        config = params.get("config", {})
        message = params.get("message", "")
        system_prompt = params.get("system_prompt", "")

        if not config.get("api_key"):
            raise ValueError("请先在设置中配置 API Key")

        agent = _get_or_create_agent(config, system_prompt)

        # Signal stream start
        sys.stdout.write(json.dumps({"type": "stream_start"}, ensure_ascii=False) + "\n")
        sys.stdout.flush()

        try:
            for token in agent.chat(message):
                sys.stdout.write(json.dumps({
                    "type": "stream_chunk",
                    "content": token,
                }, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({
                "type": "stream_error",
                "error": str(e),
            }, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            return {"ok": False, "error": str(e)}

        # Signal stream end
        sys.stdout.write(json.dumps({"type": "stream_end"}, ensure_ascii=False) + "\n")
        sys.stdout.flush()

        # Return a final response (Rust uses this to confirm completion)
        return {"ok": True}

    elif method == "reset_agent":
        # Clear conversation history for fresh context
        config = params.get("config", {})
        agent = _get_or_create_agent(config)
        agent.reset()
        return {"ok": True}

    else:
        raise ValueError(f"Unknown method: {method}")


def main():
    # Signal ready
    sys.stdout.write("READY\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            req_id = req["id"]
            method = req["method"]
            params = req.get("params", {})
        except (KeyError, json.JSONDecodeError) as e:
            resp = {"id": 0, "ok": False, "error": f"Invalid request: {e}"}
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
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
