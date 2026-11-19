"""Extensible Model Context Protocol (MCP) tool adapter."""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Registry for dynamic MCP tools
_MCP_REGISTRY: dict[str, Callable[..., Any]] = {}


def register_mcp_tool(name: str, handler: Callable[..., Any]) -> None:
    """Register an MCP tool into the sub-agent tool ecosystem."""
    _MCP_REGISTRY[name] = handler
    logger.info("Registered MCP tool: %s", name)


def call_mcp_tool(name: str, **kwargs) -> Any:
    """Invoke a registered MCP tool."""
    handler = _MCP_REGISTRY.get(name)
    if not handler:
        return {"error": "MCP_TOOL_NOT_FOUND", "tool_name": name}
    try:
        return handler(**kwargs)
    except Exception as e:
        logger.error("Error executing MCP tool %s: %s", name, e)
        return {"error": str(e), "tool_name": name}
