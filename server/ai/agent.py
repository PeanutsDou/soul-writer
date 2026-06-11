"""AI agent with streaming reasoning, output, and tool execution events."""
import json
from typing import Generator

from ai.llm_client import LLMClient
from ai.tools import TOOLS, execute_tool


SYSTEM_SUFFIX = """
## 工具使用规则（重要）
1. 工具只用于读取或修改当前写作工程中的书籍、章节和文本，不要滥用工具。
2. 对于问候、闲聊、写作建议、解释概念等普通问题，禁止调用工具，直接用自然语言回复。
3. 只有当用户明确要求查看、搜索、创建、删除、移动、插入、替换或修改文档内容时，才调用工具。
4. 调用工具后，必须用自然语言总结结果回复用户，不要只调用工具不说话。
5. 不要重复执行参数完全相同的工具调用；先检查已有工具结果。
"""


class Agent:
    def __init__(self, llm: LLMClient, system_prompt: str = ""):
        self.llm = llm
        self.base_system_prompt = (system_prompt or "你是一个专业的小说写作助手。") + SYSTEM_SUFFIX
        self.messages: list[dict] = []
        self.workspace_context = ""
        self.context_tokens = 0

    def set_workspace(self, context: str):
        self.workspace_context = context

    def reset(self):
        self.messages = []
        self.context_tokens = 0

    @staticmethod
    def _estimate_tokens(messages: list[dict], content: str = "") -> int:
        serialized = json.dumps(messages, ensure_ascii=False)
        return max(1, (len(serialized) + len(content) + 3) // 4)

    def _build_system(self) -> str:
        parts = [self.base_system_prompt]
        if self.workspace_context:
            parts.append(f"\n## 当前工作区\n{self.workspace_context}")
        return "\n".join(parts)

    @staticmethod
    def _tool_fingerprint(tool_calls: list[dict]) -> str:
        compact = []
        for call in tool_calls:
            function = call.get("function", {}) or {}
            compact.append((function.get("name", ""), function.get("arguments", "{}")))
        return json.dumps(compact, ensure_ascii=False, sort_keys=True)

    def chat(self, user_message: str) -> Generator[dict, None, None]:
        self.messages.append({"role": "user", "content": user_message})
        full_messages = [{"role": "system", "content": self._build_system()}] + list(self.messages)
        previous_fingerprint = ""
        repeated_rounds = 0
        visible_content = ""

        while True:
            completed = None
            round_content = ""
            for event in self.llm.chat_stream(full_messages, tools=TOOLS):
                if event["type"] == "reasoning_delta":
                    yield {"type": "thinking_chunk", "content": event["content"]}
                elif event["type"] == "content_delta":
                    round_content += event["content"]
                    visible_content += event["content"]
                    yield {"type": "stream_chunk", "content": event["content"]}
                elif event["type"] == "complete":
                    completed = event

            if completed is None:
                raise RuntimeError("模型流式响应意外结束")

            content = completed.get("content", "") or ""
            reasoning = completed.get("reasoning_content", "") or ""
            tool_calls = completed.get("tool_calls", []) or []
            usage = completed.get("usage", {}) or {}
            prompt_tokens = usage.get("prompt_tokens", usage.get("input_tokens", 0)) or 0
            completion_tokens = usage.get("completion_tokens", usage.get("output_tokens", 0)) or 0
            self.context_tokens = int(prompt_tokens + completion_tokens) or self._estimate_tokens(full_messages, content)
            yield {"type": "token_usage", "tokens": self.context_tokens}
            if content and not round_content:
                visible_content += content
                yield {"type": "stream_chunk", "content": content}

            assistant_message = {"role": "assistant", "content": content or None}
            if reasoning:
                assistant_message["reasoning_content"] = reasoning
            if tool_calls:
                assistant_message["tool_calls"] = tool_calls
            full_messages.append(assistant_message)

            if not tool_calls:
                final_content = visible_content or content
                if not final_content:
                    final_content = "模型完成了推理，但没有返回可显示的正文。请重试或切换模型。"
                    yield {"type": "stream_chunk", "content": final_content}
                self.messages.append({"role": "assistant", "content": final_content})
                if len(self.messages) > 40:
                    self.messages = self.messages[-40:]
                yield {"type": "done"}
                return

            fingerprint = self._tool_fingerprint(tool_calls)
            repeated_rounds = repeated_rounds + 1 if fingerprint == previous_fingerprint else 0
            previous_fingerprint = fingerprint
            if repeated_rounds >= 2:
                warning = "检测到模型连续重复相同的工具调用，已停止本次循环以避免重复修改。"
                yield {"type": "stream_chunk", "content": warning}
                self.messages.append({"role": "assistant", "content": warning})
                yield {"type": "done"}
                return

            for call in tool_calls:
                function = call.get("function", {}) or {}
                name = function.get("name", "")
                raw_args = function.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError as exc:
                    args = {}
                    result = f"工具参数不是有效 JSON：{exc}"
                else:
                    result = None

                args = args if isinstance(args, dict) else {}
                yield {"type": "tool_start", "id": call.get("id", ""), "name": name, "args": args}
                if result is None:
                    result = execute_tool(name, args)
                yield {"type": "tool_end", "id": call.get("id", ""), "name": name, "result": result}
                full_messages.append({
                    "role": "tool",
                    "tool_call_id": call.get("id", ""),
                    "name": name,
                    "content": result,
                })
