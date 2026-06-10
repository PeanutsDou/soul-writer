"""书籍 CRUD API"""
from fastapi import APIRouter, HTTPException
from models import CreateBookRequest, RenameBookRequest

router = APIRouter()
store = None


@router.get("/")
def list_books():
    idx = store.load_index()
    return {"books": [b.model_dump() for b in idx.books]}


@router.post("/")
def create_book(req: CreateBookRequest):
    try:
        book = store.create_book(req.name)
        return book.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{book_name}")
def delete_book(book_name: str):
    store.delete_book(book_name)
    return {"ok": True}


@router.put("/{book_name}/rename")
def rename_book(book_name: str, req: RenameBookRequest):
    try:
        store.rename_book(book_name, req.name)
        return {"ok": True, "newName": req.name}
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{book_name}/meta")
def get_book_meta(book_name: str):
    meta = store.load_meta(book_name)
    return meta.model_dump()
