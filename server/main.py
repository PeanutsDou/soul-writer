"""FastAPI 入口"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from storage.file_store import FileStore
from api import books, documents, groups

app = FastAPI(title="Soul Writer API", version="0.1.0")

# 数据目录：从环境变量或默认路径
DATA_DIR = os.environ.get("SOUL_WRITER_DATA", os.path.join(os.path.expanduser("~"), ".soul-writer"))
store = FileStore(DATA_DIR)

# 将 store 注入各路由模块
books.store = store
documents.store = store
groups.store = store

app.include_router(books.router, prefix="/api/books", tags=["books"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])


@app.get("/api/health")
def health():
    return {"status": "ok", "data_dir": DATA_DIR}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8720)))
