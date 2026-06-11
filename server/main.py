"""
Soul Writer Python backend — stdin/stdout JSON lines protocol.

Protocol:
  ← READY (on startup)
  ← {"id": N, "method": "...", "params": {...}}
  → {"id": N, "ok": true, "data": {...}}
  → {"id": N, "ok": false, "error": "..."}
"""
import sys
import json
import os
import traceback
from store import Store

# Force UTF-8 for stdin/stdout pipes (Windows defaults to cp936)
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = os.environ.get("SOUL_WRITER_DATA", os.path.join(os.path.expanduser("~"), ".soul-writer"))
store = Store(DATA_DIR)


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
        # Include authoritative character count
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
        # Debug: extract all text to stderr
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
        import sys
        total = sum(len(t) for t in texts)
        print(f"[DEBUG] texts={texts!r}, total_chars={total}", file=sys.stderr, flush=True)
        store.save_document(params["book_name"], params["chapter_name"], content)
        return {"ok": True, "debug_count": total}

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
        else:
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
