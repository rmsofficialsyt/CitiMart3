"""Live internet search and market intelligence tools."""
from __future__ import annotations

import logging
import threading
import time
from typing import Any

from config.env import env

logger = logging.getLogger(__name__)

# The agents only ever search a few fixed Kolkata queries (weather / festivals /
# market), and a live search measured ~9s. Results barely change within the hour,
# so successful searches are reused for 30 min. The offline fallback is never
# cached, so a recovered network is used on the next call.
_SEARCH_TTL_S = 1800.0
_search_cache: dict[tuple[str, int], tuple[float, list[dict[str, str]]]] = {}
_search_lock = threading.Lock()


def clear_search_cache() -> None:
    """Test hook."""
    with _search_lock:
        _search_cache.clear()


def live_web_search(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """Live internet search (Tavily if configured, else DuckDuckGo), cached for 30 min."""
    key = (query, max_results)
    with _search_lock:
        hit = _search_cache.get(key)
    if hit and time.monotonic() - hit[0] < _SEARCH_TTL_S:
        return [dict(r) for r in hit[1]]
    results = _search_uncached(query, max_results)
    if results and not any("citimart.internal" in r.get("url", "") for r in results):
        with _search_lock:
            _search_cache[key] = (time.monotonic(), results)
    return [dict(r) for r in results]


def _search_uncached(query: str, max_results: int) -> list[dict[str, str]]:
    # 1. Try Tavily if configured
    if env.tavily_api_key:
        try:
            import requests
            resp = requests.post(
                "https://api.tavily.com/search",
                json={"query": query, "api_key": env.tavily_api_key, "max_results": max_results},
                timeout=5,
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                return [{"title": r.get("title", ""), "snippet": r.get("content", ""), "url": r.get("url", "")} for r in results]
        except Exception as e:
            logger.debug("Tavily search attempt failed: %s", e)

    # 2. Use DuckDuckGo Search (zero API key required)
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS(timeout=5) as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "snippet": r.get("body", "") or r.get("snippet", ""),
                    "url": r.get("href", ""),
                })
        return results
    except Exception as e:
        logger.debug("DuckDuckGo search attempt failed: %s", e)
        # Fallback to domain retail knowledge if internet is completely unreachable
        return [{
            "title": "Kolkata Retail Footfall Baseline",
            "snippet": "Kolkata retail footfall peaks during evening hours (5 PM - 8 PM), weekends, and festivals (Durga Puja, Poila Boishakh, Diwali). Heavy rainfall typically reduces footfall by 25-40%.",
            "url": "https://citimart.internal/market-intelligence",
        }]


def get_kolkata_market_signals(topic: str = "retail footfall") -> dict[str, Any]:
    """Retrieve live market intelligence for Kolkata retail."""
    query = f"Kolkata department store {topic} trends retail"
    search_data = live_web_search(query, max_results=2)
    return {
        "topic": topic,
        "query": query,
        "signals": search_data,
    }
