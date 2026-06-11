"""
AI Agent — function calling loop with streaming output.
"""
import json
from typing import Generator
from ai.llm_client import LLMClient
from ai.tools import TOOLS, execute_tool


MAX_TOOL_ROUNDS = 5  # Prevent infinite loops


class Agent:
    """Conversational agent with tool-calling capability."""

    def __init__(self, llm: LLMClient, system_prompt: str = ""):
        self.llm = llm
        self.base_system_prompt = system_prompt or "你是一个专业的写作助手。简洁、准确地回答用户的问题。"
        self.messages: list[dict] = []
        self.workspace_context = ""

    def set_workspace(self, context: str):
        """Update workspace context (book info, chapter tree, etc.)."""
        self.workspace_context = context

    def reset(self):
        self.messages = []

    def _build_system(self) -> str:
        parts = [self.base_system_prompt]
        if self.workspace_context:
            parts.append(f"\n## 当前工作区\n{self.workspace_context}")
        parts.append("\n你拥有以下工具，可以在需要时调用它们来操作文档。")
        parts.append("调用工具后你会收到执行结果，请根据结果回应用户。")
        parts.append("不要凭空编造章节名或内容——先用 read_chapter 或 get_book_outline 确认。")
        return "\n".join(parts)

    def chat(self, user_message: str) -> Generator[str, None, None]:
        """
        Process user message with function calling loop.
        Yields streaming text tokens (only from final text response).
        Tool calls happen silently before streaming begins.
        """
        # Add user message to history
        self.messages.append({"role": "user", "content": user_message})

        # Build messages with system prompt
        full_messages = [{"role": "system", "content": self._build_system()}]
        full_messages.extend(self.messages)

        # Tool calling loop
        for round_num in range(MAX_TOOL_ROUNDS):
            response = self.llm.chat(full_messages, tools=TOOLS)

            # Check for tool calls
            tool_calls = response.get("tool_calls", [])
            if tool_calls:
                # Execute tools
                for tc in tool_calls:
                    func = tc.get("function", {})
                    name = func.get("name", "")
                    args_str = func.get("arguments", "{}")
                    try:
                        args = json.loads(args_str)
                    except json.JSONDecodeError:
                        args = {}

                    result = execute_tool(name, args)

                    # Add to messages
                    full_messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [tc],
                    })
                    full_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "content": result,
                    })

                continue  # Another round for LLM to process tool results

            # No tool calls — get text content
            content = response.get("content", "") or ""

            # Save to history
            self.messages.append({"role": "assistant", "content": content})

            # Trim history
            if len(self.messages) > 40:
                self.messages = self.messages[-40:]

            # Stream the text
            yield content
            return

        # Max rounds reached
        yield "(已达到工具调用上限)"
