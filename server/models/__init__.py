"""数据模型"""
from pydantic import BaseModel
from typing import Optional


class BookInfo(BaseModel):
    id: str
    name: str
    dirName: str
    createdAt: str
    updatedAt: str
    chapterCount: int
    totalWords: int


class BookIndex(BaseModel):
    version: int = 1
    books: list[BookInfo] = []


class GroupInfo(BaseModel):
    id: str
    name: str
    order: int
    expanded: bool = True
    chapters: list[str] = []


class BookMeta(BaseModel):
    version: int = 1
    groups: list[GroupInfo] = []
    ungrouped: list[str] = []


class CreateBookRequest(BaseModel):
    name: str


class RenameBookRequest(BaseModel):
    name: str


class CreateChapterRequest(BaseModel):
    name: str
    groupId: Optional[str] = None


class RenameChapterRequest(BaseModel):
    oldName: str
    newName: str


class SaveDocumentRequest(BaseModel):
    content: dict  # TipTap JSON


class CreateGroupRequest(BaseModel):
    name: str


class RenameGroupRequest(BaseModel):
    oldName: str
    newName: str


class MoveChapterRequest(BaseModel):
    chapterName: str
    targetGroupId: Optional[str] = None
