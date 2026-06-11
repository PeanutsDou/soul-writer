"""Playwright-backed research tools for Chinese web novels.

All remote access in this module goes through a real Chromium page. There is
deliberately no requests/httpx fallback: a failed site remains a visible tool
failure instead of silently changing the data source.
"""
from __future__ import annotations

import atexit
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright


MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
)
DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT_MS = 30_000
MAX_RESULT_CHARS = 120_000
SERVER_DIR = Path(__file__).resolve().parents[1]


def _skill_root() -> Path:
    candidates = [
        Path(os.environ["SOUL_WRITER_NOVEL_SKILL"]) if os.environ.get("SOUL_WRITER_NOVEL_SKILL") else None,
        SERVER_DIR / "resources" / "novel-writing",
        Path.home() / ".deepseekcode" / "skills" / "novel-writing",
    ]
    return next((path for path in candidates if path and path.is_dir()), SERVER_DIR / "resources" / "novel-writing")


SKILL_ROOT = _skill_root()
REFERENCE_DIR = SKILL_ROOT / "reference"
KNOWLEDGE_BASE = Path(
    os.environ.get(
        "SOUL_WRITER_KNOWLEDGE_BASE",
        str(SERVER_DIR / "knowledge_base"),
    )
)


def _json(data: Any) -> str:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    if len(text) <= MAX_RESULT_CHARS:
        return text
    return json.dumps(
        {"truncated": True, "serialized_preview": text[:MAX_RESULT_CHARS]},
        ensure_ascii=False,
        indent=2,
    )


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _first_line(text: str) -> str:
    return next((_clean(line) for line in (text or "").splitlines() if _clean(line)), "")


def _qidian_is_free(label: str) -> bool:
    return bool(re.search(r"(?<!App)免费(?:\s|$)", label))


def _bounded(value: Any, low: int, high: int, default: int) -> int:
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


class NovelBrowserService:
    """Lazy, process-wide Chromium session used by all novel tools."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._contexts: dict[str, BrowserContext] = {}
        self._pages: dict[str, Page] = {}
        self._cache: dict[str, tuple[float, str]] = {}

    @staticmethod
    def _find_chromium() -> str | None:
        explicit = os.environ.get("SOUL_WRITER_CHROMIUM")
        if explicit and Path(explicit).is_file():
            return explicit

        roots = []
        resources = os.environ.get("SOUL_WRITER_RESOURCES")
        if resources:
            roots.extend([Path(resources) / "chromium", Path(resources)])
        local = os.environ.get("LOCALAPPDATA")
        if local:
            roots.append(Path(local) / "ms-playwright")

        patterns = (
            "chromium-*/chrome-win64/chrome.exe",
            "chromium-*/chrome-win32/chrome.exe",
            "chrome-win64/chrome.exe",
            "chrome-win32/chrome.exe",
        )
        for root in roots:
            for pattern in patterns:
                matches = sorted(root.glob(pattern), reverse=True)
                if matches:
                    return str(matches[0])
        return None

    def _ensure_browser(self) -> None:
        if self._browser and self._browser.is_connected():
            return
        self.close()
        self._playwright = sync_playwright().start()
        executable = self._find_chromium()
        kwargs: dict[str, Any] = {"headless": True}
        if executable:
            kwargs["executable_path"] = executable
        try:
            self._browser = self._playwright.chromium.launch(**kwargs)
        except Exception as exc:
            self.close()
            raise RuntimeError(
                "无法启动 Playwright Chromium。请运行 `python -m playwright install chromium` "
                f"或设置 SOUL_WRITER_CHROMIUM。原始错误：{exc}"
            ) from exc

    def _page(self, profile: str) -> Page:
        self._ensure_browser()
        page = self._pages.get(profile)
        if page and not page.is_closed():
            return page
        assert self._browser is not None
        mobile = profile in {"qidian", "xsdi"}
        context = self._browser.new_context(
            user_agent=MOBILE_UA if mobile else DESKTOP_UA,
            viewport={"width": 430, "height": 932} if mobile else {"width": 1365, "height": 900},
            locale="zh-CN",
        )
        context.set_default_timeout(TIMEOUT_MS)
        context.set_default_navigation_timeout(TIMEOUT_MS)
        page = context.new_page()
        self._contexts[profile] = context
        self._pages[profile] = page
        return page

    def _run(self, profile: str, key: str, fn: Callable[[Page], str], ttl: int = 600) -> str:
        with self._lock:
            cached = self._cache.get(key)
            if cached and time.time() - cached[0] < ttl:
                return cached[1]
            last_error: Exception | None = None
            for attempt in range(2):
                try:
                    result = fn(self._page(profile))
                    self._cache[key] = (time.time(), result)
                    return result
                except Exception as exc:
                    last_error = exc
                    if attempt == 0 and self._browser and not self._browser.is_connected():
                        self.close()
                        continue
                    break
            raise RuntimeError(f"{profile} 页面访问失败：{last_error}") from last_error

    def close(self) -> None:
        for context in list(self._contexts.values()):
            try:
                context.close()
            except Exception:
                pass
        self._contexts.clear()
        self._pages.clear()
        if self._browser:
            try:
                self._browser.close()
            except Exception:
                pass
        self._browser = None
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception:
                pass
        self._playwright = None

    def search(self, keyword: str, source: str, limit: int = 10) -> str:
        keyword = _clean(keyword)
        if not keyword:
            raise ValueError("keyword 不能为空")
        limit = _bounded(limit, 1, 20, 10)
        if source == "qidian":
            return self._run("qidian", f"search:qidian:{keyword}:{limit}", lambda p: self._qidian_search(p, keyword, limit))
        if source == "qidiantu":
            return self._run("qidiantu", f"search:qidiantu:{keyword}:{limit}", lambda p: self._qidiantu_search(p, keyword, limit))
        if source == "xsdi":
            return self._run("xsdi", f"search:xsdi:{keyword}:{limit}", lambda p: self._xsdi_search(p, keyword, limit))
        raise ValueError("source 必须是 qidian、qidiantu 或 xsdi")

    @staticmethod
    def _qidian_search(page: Page, keyword: str, limit: int) -> str:
        page.goto(f"https://m.qidian.com/so/{quote(keyword)}.html", wait_until="domcontentloaded")
        links = page.locator('a[href*="/chapter/"]').all()
        results, seen = [], set()
        for link in links:
            href = link.get_attribute("href") or ""
            match = re.search(r"/chapter/(\d+)/", href)
            text = _clean(link.inner_text())
            if not match or not text or match.group(1) in seen:
                continue
            seen.add(match.group(1))
            results.append({"book_id": match.group(1), "summary": text, "url": href})
            if len(results) >= limit:
                break
        return _json({"source": "qidian", "keyword": keyword, "results": results})

    @staticmethod
    def _qidiantu_search(page: Page, keyword: str, limit: int) -> str:
        page.goto("https://www.qidiantu.com/search.php", wait_until="domcontentloaded")
        page.locator('#bookname, input[name="bookname"]').first.fill(keyword)
        page.locator('form button, form input[type="submit"]').first.click()
        page.wait_for_load_state("domcontentloaded")
        links = page.locator('a[href*="/info/"]').all()
        results, seen = [], set()
        for link in links:
            href = link.get_attribute("href") or ""
            match = re.search(r"/info/(\d+)", href)
            text = _clean(link.inner_text())
            if not match or not text or match.group(1) in seen:
                continue
            seen.add(match.group(1))
            results.append({"book_id": match.group(1), "title": text, "url": f"https://www.qidiantu.com/info/{match.group(1)}"})
            if len(results) >= limit:
                break
        return _json({"source": "qidiantu", "keyword": keyword, "results": results})

    @staticmethod
    def _xsdi_search(page: Page, keyword: str, limit: int) -> str:
        page.goto(f"https://m.xsdi.net/search.html?keyword={quote(keyword)}", wait_until="domcontentloaded")
        links = page.locator('a[href*="/shu/"]').all()
        results, seen = [], set()
        for link in links:
            href = link.get_attribute("href") or ""
            match = re.search(r"/shu/(\d+)/?", href)
            text = _clean(link.inner_text())
            if not match or not text or match.group(1) in seen:
                continue
            seen.add(match.group(1))
            results.append({"book_id": match.group(1), "title": text, "url": href})
            if len(results) >= limit:
                break
        return _json({"source": "xsdi", "keyword": keyword, "results": results})

    def book_info(self, source: str, book_id: str) -> str:
        book_id = self._book_id(book_id)
        if source == "qidian":
            url, profile = f"https://m.qidian.com/book/{book_id}/", "qidian"
        elif source == "qidiantu":
            url, profile = f"https://www.qidiantu.com/info/{book_id}", "qidiantu"
        elif source == "xsdi":
            url, profile = f"https://m.xsdi.net/shu/{book_id}/", "xsdi"
        else:
            raise ValueError("source 必须是 qidian、qidiantu 或 xsdi")

        def read(page: Page) -> str:
            page.goto(url, wait_until="domcontentloaded")
            title = _first_line(page.locator("h1").first.inner_text()) if page.locator("h1").count() else _clean(page.title())
            body = _clean(page.locator("body").inner_text())[:12_000]
            return _json({"source": source, "book_id": book_id, "title": title, "url": url, "page_text": body})

        return self._run(profile, f"info:{source}:{book_id}", read)

    def catalog(self, source: str, book_id: str, limit: int = 100, order: str = "asc") -> str:
        book_id = self._book_id(book_id)
        limit = _bounded(limit, 1, 500, 100)
        if order not in {"asc", "desc"}:
            raise ValueError("order 必须是 asc 或 desc")
        if source == "qidian":
            url, profile, pattern = f"https://m.qidian.com/book/{book_id}/catalog/", "qidian", rf"/chapter/{book_id}/(\d+)/"
        elif source == "xsdi":
            url, profile, pattern = f"https://m.xsdi.net/shu/{book_id}/", "xsdi", rf"/shu/{book_id}/(\d+)\.html"
        else:
            raise ValueError("目录仅支持 qidian 或 xsdi")

        def read(page: Page) -> str:
            page.goto(url, wait_until="domcontentloaded")
            chapters, seen = [], set()
            for link in page.locator("a").all():
                href = link.get_attribute("href") or ""
                match = re.search(pattern, href)
                title = _clean(link.inner_text())
                if not match or not title or match.group(1) in seen:
                    continue
                if source == "qidian" and not re.match(r"^第.{1,16}章(?:\s|$)", title):
                    continue
                seen.add(match.group(1))
                chapters.append({
                    "chapter_id": match.group(1),
                    "title": title,
                    "free": _qidian_is_free(title) if source == "qidian" else None,
                    "url": href,
                })
            if order == "desc":
                chapters.reverse()
            return _json({"source": source, "book_id": book_id, "order": order, "total_found": len(chapters), "chapters": chapters[:limit]})

        return self._run(profile, f"catalog:{source}:{book_id}:{limit}:{order}", read)

    def read_chapter(self, source: str, book_id: str, chapter_id: str, max_chars: int = 20_000) -> str:
        book_id, chapter_id = self._book_id(book_id), self._book_id(chapter_id)
        max_chars = _bounded(max_chars, 500, 30_000, 20_000)
        if source == "qidian":
            url, profile = f"https://m.qidian.com/chapter/{book_id}/{chapter_id}/", "qidian"

            def read(page: Page) -> str:
                page.goto(f"https://m.qidian.com/book/{book_id}/catalog/", wait_until="domcontentloaded")
                link = page.locator(f'a[href*="/chapter/{book_id}/{chapter_id}/"]').first
                if not link.count():
                    raise RuntimeError("目录中找不到该章节")
                label = _clean(link.inner_text())
                if not _qidian_is_free(label):
                    raise PermissionError("起点章节不是免费试读，已拒绝读取")
                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_selector("span.content-text", state="attached")
                parts = [_clean(x.inner_text()) for x in page.locator("span.content-text").all()]
                content = "\n\n".join(x for x in parts if x)
                if not content:
                    raise RuntimeError("未识别到起点章节正文")
                title = _first_line(page.locator("h1").first.inner_text()) if page.locator("h1").count() else label
                return _json({"source": source, "book_id": book_id, "chapter_id": chapter_id, "title": title, "url": url, "content": content[:max_chars], "truncated": len(content) > max_chars})

        elif source == "xsdi":
            url, profile = f"https://m.xsdi.net/shu/{book_id}/{chapter_id}.html", "xsdi"

            def read(page: Page) -> str:
                page.goto(url, wait_until="domcontentloaded")
                title = _first_line(page.locator("h1").first.inner_text()) if page.locator("h1").count() else _clean(page.title())
                locator = page.locator("#content, .content, .chapter-content, article").first
                content = _clean(locator.inner_text()) if locator.count() else ""
                if not content:
                    raise RuntimeError("未识别到章节正文")
                return _json({"source": source, "book_id": book_id, "chapter_id": chapter_id, "title": title, "url": url, "content": content[:max_chars], "truncated": len(content) > max_chars})
        else:
            raise ValueError("章节正文仅支持 qidian 或 xsdi")
        return self._run(profile, f"chapter:{source}:{book_id}:{chapter_id}:{max_chars}", read, ttl=1800)

    def rankings(self, period: str = "", limit: int = 20) -> str:
        period = _clean(period)
        if period and not re.fullmatch(r"\d{4}-\d{2}(?:-\d{2})?", period):
            raise ValueError("period 应为 YYYY-MM 或 YYYY-MM-DD")
        limit = _bounded(limit, 1, 100, 20)
        url = "https://www.qidiantu.com/shouding/" + period

        def read(page: Page) -> str:
            page.goto(url, wait_until="domcontentloaded")
            rows = []
            for row in page.locator("table tr").all():
                cells = [_clean(cell.inner_text()) for cell in row.locator("th, td").all()]
                if cells and any(cells):
                    rows.append(cells)
            if not rows:
                lines = [_clean(line) for line in page.locator("body").inner_text().splitlines() if _clean(line)]
                rows = [[line] for line in lines[:limit + 10]]
            return _json({"source": "qidiantu", "period": period or "latest", "url": url, "rows": rows[:limit + 1]})

        return self._run("qidiantu", f"rank:{period}:{limit}", read)

    @staticmethod
    def _book_id(value: str) -> str:
        value = str(value or "").strip()
        if not re.fullmatch(r"\d+", value):
            raise ValueError("book_id/chapter_id 必须是纯数字")
        return value


SERVICE = NovelBrowserService()
atexit.register(SERVICE.close)


REFERENCE_FILES = {
    "guide": "SKILL.md",
    "style": "文风参考.md",
    "gratification": "爽点类型库.md",
    "plot": "剧情结构库.md",
    "fulltext": "全文检索构建方案.md",
}


def read_writing_reference(topic: str, query: str = "", max_chars: int = 20_000) -> str:
    filename = REFERENCE_FILES.get(topic)
    if not filename:
        raise ValueError("topic 必须是 guide、style、gratification、plot 或 fulltext")
    path = SKILL_ROOT / filename if topic == "guide" else REFERENCE_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"写作参考文件不存在：{path}")
    text = path.read_text(encoding="utf-8")
    max_chars = _bounded(max_chars, 1000, 40_000, 20_000)
    query = _clean(query)
    if query:
        blocks = re.split(r"(?=^#{1,4}\s)", text, flags=re.MULTILINE)
        matched = [block for block in blocks if query.lower() in block.lower()]
        text = "\n".join(matched) if matched else f"未找到包含“{query}”的条目。"
    return _json({"topic": topic, "query": query, "source_file": str(path), "content": text[:max_chars], "truncated": len(text) > max_chars})


def search_knowledge_base(query: str, limit: int = 10) -> str:
    query = _clean(query)
    if not query:
        raise ValueError("query 不能为空")
    if not KNOWLEDGE_BASE.is_dir():
        raise FileNotFoundError(
            f"小说知识库尚未创建：{KNOWLEDGE_BASE}。创建该目录并放入 md/txt/json 文件后即可检索。"
        )
    limit = _bounded(limit, 1, 30, 10)
    results = []
    for path in KNOWLEDGE_BASE.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".md", ".txt", ".json"}:
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raw = path.read_text(encoding="gb18030", errors="replace")
        lower, needle = raw.lower(), query.lower()
        start = lower.find(needle)
        if start < 0 and needle not in path.name.lower():
            continue
        if start < 0:
            start = 0
        snippet = _clean(raw[max(0, start - 180):start + len(query) + 500])
        results.append({"file": str(path.relative_to(KNOWLEDGE_BASE)), "snippet": snippet})
        if len(results) >= limit:
            break
    return _json({"query": query, "knowledge_base": str(KNOWLEDGE_BASE), "results": results})
