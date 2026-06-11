"""
AI Agent — basic chat loop with streaming.
Tools and document integration will be added in later iterations.
"""
import json
import sys
import traceback
from typing import Generator
from ai.llm_client import LLMClient


class Agent:
    """Simple conversational agent with streaming support."""

    def __init__(self, llm: LLMClient, system_prompt: str = ""):
        self.llm = llm
        self.system_prompt = system_prompt or "你是一个专业的写作助手。简洁、准确地回答用户的问题。"
        self.messages: list[dict] = []

    def reset(self):
        """Clear conversation history."""
        self.messages = []

    def chat(self, user_message: str) -> Generator[str, None, None]:
        """
        Process a user message and yield streaming response tokens.
        """
        # Build messages array
        full_messages = [{"role": "system", "content": self.system_prompt}]
        full_messages.extend(self.messages)
        full_messages.append({"role": "user", "content": user_message})

        # Stream response
        accumulated = ""
        try:
            for token in self.llm.chat_stream(full_messages):
                accumulated += token
                yield token
        except Exception:
            raise

        # Save to history
        self.messages.append({"role": "user", "content": user_message})
        self.messages.append({"role": "assistant", "content": accumulated})

        # Trim history if too long (keep last 20 turns)
        if len(self.messages) > 40:
            self.messages = self.messages[-40:]
