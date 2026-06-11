"""
AI Agent — function calling loop with streaming output + tool events.
"""
import json
from typing import Generator
from ai.llm_client import LLMClient
from ai.tools import TOOLS, execute_tool

MAX_TOOL_ROUNDS = 5


class Agent:
    def __init__(self, llm: LLMClient, system_prompt: str = ""):
        self.llm = llm
        self.base_system_prompt = system_prompt or "你是一个专业的写作助手。"
        self.messages: list[dict] = []
        self.workspace_context = ""

    def set_workspace(self, context: str):
        self.workspace_context = context

    def reset(self):
        self.messages = []

    def _build_system(self) -> str:
        parts = [self.base_system_prompt]
        if self.workspace_context:
            parts.append(f"\n## 当前工作区\n{self.workspace_context}")
        parts.append("\n你有工具可以操作文档。先确认信息再操作，不要凭空编造。")
        parts.append("修改文档后，简要告诉用户你做了什么。")
        return "\n".join(parts)

    def chat(self, user_message: str) -> Generator[dict, None, None]:
        """
        Yield events:
          {"type": "tool_start", "name": "...", "args": {...}}
          {"type": "tool_end", "name": "...", "result": "..."}
          {"type": "chunk", "content": "..."}
          {"type": "done"}
        """
        self.messages.append({"role": "user", "content": user_message})
        full_messages = [{"role": "system", "content": self._build_system()}] + self.messages

        for _ in range(MAX_TOOL_ROUNDS):
            response = self.llm.chat(full_messages, tools=TOOLS)
            tool_calls = response.get("tool_calls", [])

            if tool_calls:
                for tc in tool_calls:
                    func = tc.get("function", {})
                    name = func.get("name", "")
                    args_str = func.get("arguments", "{}")
                    try:
                        args = json.loads(args_str)
                    except json.JSONDecodeError:
                        args = {}

                    yield {"type": "tool_start", "name": name, "args": args}
                    result = execute_tool(name, args)
                    yield {"type": "tool_end", "name": name, "result": result}

                    full_messages.append({"role": "assistant", "content": None, "tool_calls": [tc]})
                    full_messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})
                continue

            # No tool calls — stream the text response
            content = response.get("content", "") or ""
            if content:
                yield {"type": "chunk", "content": content}
            self.messages.append({"role": "assistant", "content": content})

            if len(self.messages) > 40:
                self.messages = self.messages[-40:]

            yield {"type": "done"}
            return

        yield {"type": "done"}
