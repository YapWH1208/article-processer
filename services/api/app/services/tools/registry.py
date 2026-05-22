"""Tool registry — extensible registry for internal tools (MCP-ready design)."""

from dataclasses import dataclass, field
from typing import Any, Callable
import logging

logger = logging.getLogger(__name__)


@dataclass
class Tool:
    """A registered tool with schema and handler."""
    name: str
    description: str
    input_schema: dict
    output_schema: dict
    handler: Callable


class ToolRegistry:
    """Registry for internal tools that can be called by name."""

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            logger.warning(f"Tool '{tool.name}' already registered, overwriting")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list_all(self) -> list[Tool]:
        return list(self._tools.values())

    def execute(self, name: str, **kwargs) -> Any:
        tool = self._tools.get(name)
        if not tool:
            raise ValueError(f"Tool '{name}' not found")
        return tool.handler(**kwargs)
