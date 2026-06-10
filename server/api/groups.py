"""分组 CRUD API"""
from fastapi import APIRouter, HTTPException
from models import CreateGroupRequest, RenameGroupRequest

router = APIRouter()
store = None


@router.post("/{book_name}")
def create_group(book_name: str, req: CreateGroupRequest):
    try:
        group = store.create_group(book_name, req.name)
        return group.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{book_name}/{group_name}/rename")
def rename_group(book_name: str, group_name: str, req: RenameGroupRequest):
    try:
        store.rename_group(book_name, group_name, req.newName)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{book_name}/{group_name}")
def delete_group(book_name: str, group_name: str):
    store.delete_group(book_name, group_name)
    return {"ok": True}


@router.put("/{book_name}/{group_name}/toggle")
def toggle_group(book_name: str, group_name: str):
    store.toggle_group_expand(book_name, group_name)
    return {"ok": True}
