"""
AI Agent — function calling loop with streaming output.
"""
import json
from typing import Generator
from ai.llm_client import LLMClient
from ai.tools import TOOLS, execute_tool

MAX_TOOL_ROUNDS = 5

SYSTEM_SUFFIX = """
## 工具使用规则（重要）
1. 工具仅用于读取或修改文档。**不要滥用工具。**
2. 对于简单问候、闲聊、一般性问题，**禁止调用任何工具**，直接文字回复。
3. 只有当用户明确要求操作文档（如"帮我看一下""帮我改""搜索"等）时才使用工具。
4. 调用工具后，必须用自然语言总结结果回复用户，不要只调工具不说话。
"""


class Agent:
    def __init__(self, llm: LLMClient, system_prompt: str = ""):
        self.llm = llm
        self.base_system_prompt = (system_prompt or "你是一个专业的写作助手。") + SYSTEM_SUFFIX
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
        return "\n".join(parts)

    def chat(self, user_message: str) -> Generator[dict, None, None]:
        self.messages.append({"role": "user", "content": user_message})
        full_messages = [{"role": "system", "content": self._build_system()}] + list(self.messages)

        tool_count = 0

        for _ in range(MAX_TOOL_ROUNDS):
            response = self.llm.chat(full_messages, tools=TOOLS)
            tool_calls = response.get("tool_calls", [])
            content = response.get("content", "") or ""

            # If LLM sends both tool_calls AND content, save content for later
            if tool_calls:
                for tc in tool_calls:
                    func = tc.get("function", {})
                    name = func.get("name", "")
                    args_str = func.get("arguments", "{}")
                    try: args = json.loads(args_str)
                    except json.JSONDecodeError: args = {}

                    yield {"type": "tool_start", "name": name, "args": args}
                    result = execute_tool(name, args)
                    yield {"type": "tool_end", "name": name, "result": result}
                    tool_count += 1

                    full_messages.append({"role": "assistant", "content": None, "tool_calls": [tc]})
                    full_messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})

                # If there was also text content with the tool call, add it
                if content:
                    full_messages.append({"role": "assistant", "content": content})
                continue

            # No tool calls — this is the final response
            if not content:
                content = "（无回复）"

            yield {"type": "chunk", "content": content}
            self.messages.append({"role": "assistant", "content": content})

            if len(self.messages) > 40:
                self.messages = self.messages[-40:]

            yield {"type": "done"}
            return

        # Max rounds reached
        yield {"type": "chunk", "content": "（已达到工具调用上限，请重新提问）"}
        yield {"type": "done"}
