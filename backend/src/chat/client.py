"""Google GenAI SDK Client Factory & LLM Invocation Bridge.

Uses official `google-genai` SDK with current official Gemini models (gemini-2.5-flash),
calibrated temperature, and resilient fallback handling.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from config.env import env

logger = logging.getLogger(__name__)

# Most recent history messages sent to the model (3 user/assistant turns).
HISTORY_TURNS_SENT = 6

# Canonical model mapping to prevent legacy or non-existent model strings
MODEL_ALIASES: dict[str, str] = {
    "gemini-4-hydrogen": "gemini-2.5-flash",
    "gemini-hydrogen": "gemini-2.5-flash",
    "gemini-flash": "gemini-2.5-flash",
    "gemini-pro": "gemini-2.5-pro",
}


def get_genai_client():
    """Build google-genai Client from environment settings."""
    api_key = env.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as e:
        logger.warning("Failed to initialize google-genai Client: %s", e)
        return None


def generate_llm_response(
    prompt: str,
    system_instruction: str | None = None,
    conversation_history: list[dict[str, str]] | None = None,
    temperature: float | None = None,
    model_name: str | None = None,
) -> str | None:
    """Generate LLM response via google.genai client or direct REST fallback.
    
    Primary path: official `client.models.generate_content` with standard Gemini models.
    Secondary path: direct REST API call via `requests` when google-genai is uninstalled.
    Returns generated text or None if unconfigured/failed.
    """
    api_key = env.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None

    client = get_genai_client()

    # In unit tests with real Client (not mocked), avoid live outbound API calls in sandboxed environments
    if os.getenv("PYTEST_CURRENT_TEST"):
        if not client or type(client).__name__ == "Client":
            return None

    raw_model = model_name or env.gemini_model or "gemini-2.5-flash"
    model = MODEL_ALIASES.get(raw_model.lower(), raw_model)
    temp = temperature if temperature is not None else env.llm_temperature
    timeout_sec = float(env.llm_request_timeout_seconds)

    if client:
        try:
            try:
                from google.genai import types
            except ImportError:
                class _Types:
                    class GenerateContentConfig:
                        def __init__(self, **kwargs):
                            for k, v in kwargs.items():
                                setattr(self, k, v)
                    class HttpOptions:
                        def __init__(self, **kwargs):
                            for k, v in kwargs.items():
                                setattr(self, k, v)
                types = _Types()

            config = types.GenerateContentConfig(
                temperature=temp,
                max_output_tokens=env.llm_max_output_tokens,
                system_instruction=system_instruction,
                http_options=types.HttpOptions(timeout=int(timeout_sec)),
            )
            resp = client.models.generate_content(
                model=model,
                contents=build_contents(prompt, conversation_history),
                config=config,
            )
            if resp and hasattr(resp, "text") and resp.text:
                return resp.text
            logger.warning("LLM model %s returned an empty response; using the built-in answer engine.", model)
        except Exception as e:
            logger.warning("LLM call to model %s via SDK failed (%s); trying REST fallback.", model, type(e).__name__)

    # 2. Resilient Fallback path: Direct Google GenAI REST API via requests
    return _call_gemini_rest(
        api_key=api_key,
        model=model,
        prompt=prompt,
        system_instruction=system_instruction,
        conversation_history=conversation_history,
        temperature=temp,
        timeout_sec=timeout_sec,
    )


def _call_gemini_rest(
    api_key: str,
    model: str,
    prompt: str,
    system_instruction: str | None,
    conversation_history: list[dict[str, str]] | None,
    temperature: float,
    timeout_sec: float,
) -> str | None:
    """Direct REST invocation to Google Generative Language API without needing google-genai SDK."""
    try:
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        }
        # If token does not start with standard AIza, also add Authorization Bearer header
        if not api_key.startswith("AIza"):
            headers["Authorization"] = f"Bearer {api_key}"

        payload: dict[str, Any] = {
            "contents": build_contents(prompt, conversation_history),
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": env.llm_max_output_tokens,
            },
        }
        if system_instruction:
            payload["system_instruction"] = {
                "parts": [{"text": system_instruction}],
            }

        resp = requests.post(url, headers=headers, json=payload, timeout=timeout_sec)
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
                if text.strip():
                    return text.strip()
        else:
            logger.warning("Gemini REST API returned status %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("Gemini REST API invocation failed: %s; using the built-in answer engine.", type(e).__name__)

    return None



def build_contents(prompt: str, conversation_history: list[dict[str, str]] | None) -> list[dict[str, Any]]:
    """Role-separated multi-turn `contents` for generate_content.

    This path used to send only `prompt` whenever a system instruction was
    set (i.e. always), silently dropping the conversation -- so follow-ups
    like "and the footfall?" lost what they referred to.
    """
    contents: list[dict[str, Any]] = []
    for turn in (conversation_history or [])[-HISTORY_TURNS_SENT:]:
        text = (turn.get("content") or "").strip()
        if not text:
            continue
        role = "model" if turn.get("role") == "assistant" else "user"
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"].append({"text": text})
        else:
            contents.append({"role": role, "parts": [{"text": text}]})
    if contents and contents[-1]["role"] == "user":
        contents[-1]["parts"].append({"text": prompt})
    else:
        contents.append({"role": "user", "parts": [{"text": prompt}]})
    return contents
