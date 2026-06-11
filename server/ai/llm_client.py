"""
OpenAI-compatible streaming LLM client.
Supports OpenAI, DeepSeek, local servers, and any OpenAI-compatible API.
"""
import json
import sys
import httpx
from typing import Generator


class LLMClient:
    """Streaming LLM client for OpenAI-compatible APIs."""

    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self._client = httpx.Client(timeout=httpx.Timeout(120.0, connect=10.0))

    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            payload["tools"] = tools

        # DeepSeek: disable thinking mode when using tools (not compatible)
        if "deepseek" in self.model.lower():
            payload["thinking"] = {"type": "disabled"}

        try:
            response = self._client.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                error_body = response.text[:300]
                raise RuntimeError(f"API error {response.status_code}: {error_body}")
            data = response.json()
            choice = data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            return {
                "content": msg.get("content", ""),
                "tool_calls": msg.get("tool_calls", []),
            }
        except httpx.RequestError as e:
            raise RuntimeError(f"API connection failed: {e}")

    def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Generator[str, None, None]:
        """
        Stream chat completion tokens.
        Yields content strings as they arrive.
        """
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        try:
            with self._client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    error_body = response.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"API error {response.status_code}: {error_body[:300]}")

                for line in response.iter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]  # Remove "data: " prefix
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
        except httpx.RequestError as e:
            raise RuntimeError(f"API connection failed: {e}")

    def close(self):
        self._client.close()
