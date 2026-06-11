"""OpenAI-compatible streaming LLM client."""
import json
import uuid
from typing import Generator

import httpx


class LLMClient:
    def __init__(self, base_url: str, api_key: str, model: str):
        normalized = base_url.rstrip("/")
        for suffix in ("/chat/completions", "/completions"):
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
        self.base_url = normalized
        self.api_key = api_key
        self.model = model
        self._client = httpx.Client(timeout=httpx.Timeout(300.0, connect=15.0))

    def _request_payload(self, messages: list[dict], tools: list[dict] | None) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 16384,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        return payload

    @staticmethod
    def _complete_event(data: dict) -> dict:
        choices = data.get("choices") or [{}]
        choice = choices[0]
        message = choice.get("message", {}) or {}
        return {
            "type": "complete",
            "content": message.get("content", "") or "",
            "reasoning_content": message.get("reasoning_content", "") or "",
            "tool_calls": message.get("tool_calls", []) or [],
            "usage": data.get("usage", {}) or {},
        }

    def chat_stream(self, messages: list[dict], tools: list[dict] | None = None) -> Generator[dict, None, None]:
        """Yield reasoning/content deltas and one final complete event."""
        url = f"{self.base_url}/chat/completions"
        if not self.base_url or not self.model:
            raise ValueError("模型地址和模型名称不能为空")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with self._client.stream(
                "POST",
                url,
                json=self._request_payload(messages, tools),
                headers=headers,
            ) as response:
                if response.status_code != 200:
                    body = response.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"API error {response.status_code}: {body[:500]}")

                content_type = response.headers.get("content-type", "").lower()
                if "application/json" in content_type:
                    yield self._complete_event(response.json())
                    return

                content = ""
                reasoning = ""
                tool_calls: dict[int, dict] = {}
                usage = {}

                for line in response.iter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    choices = data.get("choices") or [{}]
                    delta = choices[0].get("delta", {}) or {}
                    if data.get("usage"):
                        usage = data["usage"]
                    text = delta.get("content", "") or ""
                    if text:
                        content += text
                        yield {"type": "content_delta", "content": text}

                    thought = delta.get("reasoning_content", "") or ""
                    if thought:
                        reasoning += thought
                        yield {"type": "reasoning_delta", "content": thought}

                    for tc_delta in delta.get("tool_calls", []) or []:
                        index = tc_delta.get("index", 0)
                        current = tool_calls.setdefault(index, {
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        })
                        if tc_delta.get("id"):
                            current["id"] = tc_delta["id"]
                        function = tc_delta.get("function", {}) or {}
                        if function.get("name"):
                            current["function"]["name"] = function["name"]
                        if function.get("arguments"):
                            current["function"]["arguments"] += function["arguments"]

                completed_calls = []
                for index in sorted(tool_calls):
                    call = tool_calls[index]
                    if call["function"]["name"]:
                        call["id"] = call["id"] or f"call_{uuid.uuid4().hex}"
                        completed_calls.append(call)

                yield {
                    "type": "complete",
                    "content": content,
                    "reasoning_content": reasoning,
                    "tool_calls": completed_calls,
                    "usage": usage,
                }
        except httpx.RequestError as exc:
            raise RuntimeError(f"API connection failed: {exc}") from exc

    def close(self):
        self._client.close()
