"""文档 CRUD API"""
from fastapi import APIRouter, HTTPException
from models import CreateChapterRequest, RenameChapterRequest, SaveDocumentRequest, MoveChapterRequest

router = APIRouter()
store = None


@router.post("/{book_name}/chapters")
def create_chapter(book_name: str, req: CreateChapterRequest):
    try:
        name = store.create_chapter(book_name, req.name, req.groupId)
        return {"name": name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{book_name}/chapters/{chapter_name}/rename")
def rename_chapter(book_name: str, chapter_name: str, req: RenameChapterRequest):
    try:
        store.rename_chapter(book_name, chapter_name, req.newName)
        return {"ok": True, "newName": req.newName}
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{book_name}/chapters/{chapter_name}")
def delete_chapter(book_name: str, chapter_name: str):
    store.delete_chapter(book_name, chapter_name)
    return {"ok": True}


@router.get("/{book_name}/chapters/{chapter_name}")
def get_document(book_name: str, chapter_name: str):
    doc = store.load_document(book_name, chapter_name)
    return doc


@router.put("/{book_name}/chapters/{chapter_name}")
def save_document(book_name: str, chapter_name: str, req: SaveDocumentRequest):
    store.save_document(book_name, chapter_name, req.content)
    return {"ok": True}


@router.put("/{book_name}/chapters/{chapter_name}/move")
def move_chapter(book_name: str, chapter_name: str, req: MoveChapterRequest):
    store.move_chapter(book_name, chapter_name, req.targetGroupId)
    return {"ok": True}
