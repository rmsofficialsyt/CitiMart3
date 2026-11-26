"""Google GenAI SDK Client Factory & LLM Invocation Bridge.

Uses official `google-genai` SDK with current official Gemini models (gemini-3.8-flash),
calibrated temperature, and resilient fallback handling.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from config.env import env
from src.chat import usage as llm_usage

logger = logging.getLogger(__name__)

# --- Fail fast when Gemini is down ---------------------------------------------------
# Every caller has a deterministic answer card to fall back on, so a slow failure is
# worse than no LLM at all. Measured before this: the SDK's default 4 retries with
# exponential backoff, then a REST retry of the same API, held one chat turn for up
# to ~30s on a 503/429. Now: one attempt, no REST retry of an API answer, and after
# an overload / quota / timeout the model is skipped for a cooldown, so following
# turns answer from the domain engine instantly. Process-local, which is enough:
# each replica just learns the outage on its own first failed call.
#
# The cooldown is PER MODEL: Google's "high demand" 503 hits one model at a time,
# and a single global cooldown used to switch off every LLM feature (Co-Pilot,
# intent router, WhatsApp wording) while sibling models were serving fine. A
# failed model is skipped and the next one in `env.gemini_fallback_models` tried.
_COOLDOWN_QUOTA_S = 300.0  # 429: quota resets per minute at best, often later
_COOLDOWN_OUTAGE_S = 60.0  # 5xx / timeout: "high demand" spikes are short
_cooldown_lock = threading.Lock()
_cooldown_until: dict[str, float] = {}


def _model_chain(primary: str) -> list[str]:
    chain = [primary]
    for raw in (env.gemini_fallback_models or "").split(","):
        name = MODEL_ALIASES.get(raw.strip().lower(), raw.strip())
        if name and name not in chain:
            chain.append(name)
    return chain


def _model_cooling(model: str) -> bool:
    return time.monotonic() < _cooldown_until.get(model, 0.0)


def llm_in_cooldown(model: str | None = None) -> bool:
    """True when `model` (default: every model in the configured chain) is cooling down."""
    if model is not None:
        return _model_cooling(model)
    primary = MODEL_ALIASES.get((env.gemini_model or "gemini-3.8-flash").lower(), env.gemini_model or "gemini-3.8-flash")
    return all(_model_cooling(m) for m in _model_chain(primary))


def _trip_cooldown(seconds: float, reason: str, model: str = "") -> None:
    with _cooldown_lock:
        _cooldown_until[model] = max(_cooldown_until.get(model, 0.0), time.monotonic() + seconds)
    logger.warning("Gemini model %s unavailable (%s); skipping it for the next %.0fs.", model or "?", reason, seconds)


def reset_llm_cooldown() -> None:
    """Test hook."""
    with _cooldown_lock:
        _cooldown_until.clear()


def _cooldown_for_status(code: Any) -> float | None:
    if not isinstance(code, int):
        return None
    if code == 429:
        return _COOLDOWN_QUOTA_S
    if code >= 500:
        return _COOLDOWN_OUTAGE_S
    return None


def _is_timeout(exc: BaseException) -> bool:
    return "timeout" in type(exc).__name__.lower()

# Most recent history messages sent to the model. Kept as a module constant for
# importers; build_contents reads env.chat_history_messages_sent at call time.
HISTORY_TURNS_SENT = env.chat_history_messages_sent

# Canonical model mapping to prevent legacy or non-existent model strings
MODEL_ALIASES: dict[str, str] = {
    "gemini-4-hydrogen": "gemini-3.8-flash",
    "gemini-hydrogen": "gemini-3.8-flash",
    "gemini-flash": "gemini-3.8-flash",
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


def _http_options(types: Any, timeout_sec: float) -> Any:
    """Timeout (ms) and a single attempt: the SDK's default is 4 retries with backoff."""
    kwargs: dict[str, Any] = {"timeout": int(timeout_sec * 1000)}
    retry_cls = getattr(types, "HttpRetryOptions", None)
    if retry_cls is not None:
        kwargs["retry_options"] = retry_cls(attempts=1)
    return types.HttpOptions(**kwargs)


def _thinking_budget(model: str) -> int | None:
    """Thinking budget to send, or None to leave the model default.

    Only Gemini 2.5 models accept a thinking config; 2.5 Pro cannot turn
    thinking off (minimum 128).
    """
    budget = env.llm_thinking_budget
    if budget is None or budget < 0 or "2.5" not in model:
        return None
    if "pro" in model and budget < 128:
        return 128
    return budget


def _thinking_level(model: str) -> str | None:
    """Gemini 3 controls thinking by level, not token budget.

    `llm_thinking_budget == 0` ("keep thinking out of the way") maps to LOW,
    the lowest level gemini-3.8-flash accepts (it answers 400 to MINIMAL).
    A positive budget or a non-Gemini-3 model leaves the model default.
    """
    if env.llm_thinking_budget != 0 or not model.startswith("gemini-3"):
        return None
    return "LOW"


def _is_truncated(finish_reason: Any) -> bool:
    name = getattr(finish_reason, "name", None) or str(finish_reason or "")
    return name.upper().endswith("MAX_TOKENS")


def generate_llm_response(
    prompt: str,
    system_instruction: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    temperature: float | None = None,
    model_name: str | None = None,
    response_schema: dict[str, Any] | None = None,
    max_output_tokens: int | None = None,
) -> str | None:
    """Generate LLM response via google.genai client or direct REST fallback.

    With `response_schema` (an OpenAPI-subset dict) the model is constrained to
    JSON matching it (Gemini structured output); the JSON text is returned.
    
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

    raw_model = model_name or env.gemini_model or "gemini-3.8-flash"
    primary = MODEL_ALIASES.get(raw_model.lower(), raw_model)
    kwargs = dict(
        client=client,
        api_key=api_key,
        prompt=prompt,
        system_instruction=system_instruction,
        conversation_history=conversation_history,
        temperature=temperature if temperature is not None else env.llm_temperature,
        response_schema=response_schema,
        max_tokens=max_output_tokens or env.llm_max_output_tokens,
    )
    for model in _model_chain(primary):
        if _model_cooling(model):
            continue
        text, unavailable = _generate_with_model(model=model, **kwargs)
        if not unavailable:
            return text
        # Overloaded / quota / timeout / not found: try the next model.
    return None


def _generate_with_model(
    *,
    model: str,
    client: Any,
    api_key: str,
    prompt: str,
    system_instruction: str | None,
    conversation_history: list[dict[str, Any]] | None,
    temperature: float,
    response_schema: dict[str, Any] | None,
    max_tokens: int,
) -> tuple[str | None, bool]:
    """One model's attempt. Returns (text, unavailable): `unavailable` means this
    model could not serve (cooldown tripped / not found) and the next one may."""
    temp = temperature
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

            config_kwargs: dict[str, Any] = {
                "temperature": temp,
                "max_output_tokens": max_tokens,
                "system_instruction": system_instruction,
                "http_options": _http_options(types, timeout_sec),
            }
            budget = _thinking_budget(model)
            level = _thinking_level(model)
            if hasattr(types, "ThinkingConfig"):
                if budget is not None:
                    config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=budget)
                elif level is not None:
                    config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=level)
            if response_schema is not None:
                config_kwargs["response_mime_type"] = "application/json"
                config_kwargs["response_schema"] = response_schema
            config = types.GenerateContentConfig(**config_kwargs)
            resp = client.models.generate_content(
                model=model,
                contents=build_contents(prompt, conversation_history),
                config=config,
            )
            # Before the truncation check: a cut-off reply still used tokens.
            llm_usage.record(getattr(resp, "usage_metadata", None), model)
            candidates = getattr(resp, "candidates", None) or []
            if candidates and _is_truncated(getattr(candidates[0], "finish_reason", None)):
                # A cut-off table is worse than the deterministic card: let the
                # caller fall back rather than show half an answer.
                logger.warning("LLM model %s hit max_output_tokens; using the built-in answer engine.", model)
                return None, False
            if resp and hasattr(resp, "text") and resp.text:
                return resp.text, False
            logger.warning("LLM model %s returned an empty response; using the built-in answer engine.", model)
            return None, False
        except Exception as e:
            # The API itself answered (overload / quota) or timed out: the REST path
            # would hit the same API with the same model, so skip it and let the
            # caller try the next model in the chain.
            code = getattr(e, "code", None)
            cooldown = _cooldown_for_status(code)
            if cooldown is not None:
                _trip_cooldown(cooldown, f"HTTP {code}", model)
                return None, True
            if _is_timeout(e):
                _trip_cooldown(_COOLDOWN_OUTAGE_S, "timeout", model)
                return None, True
            if code == 404:
                # Model retired / renamed: no point retrying it this process soon.
                _trip_cooldown(_COOLDOWN_QUOTA_S, "HTTP 404 model not found", model)
                return None, True
            if isinstance(code, int):
                logger.warning("LLM call to model %s failed with HTTP %s; using the built-in answer engine.", model, code)
                return None, False
            logger.warning("LLM call to model %s via SDK failed (%s); trying REST fallback.", model, type(e).__name__)

    # 2. Resilient Fallback path: Direct Google GenAI REST API via requests
    text = _call_gemini_rest(
        api_key=api_key,
        model=model,
        prompt=prompt,
        system_instruction=system_instruction,
        conversation_history=conversation_history,
        temperature=temp,
        timeout_sec=timeout_sec,
        response_schema=response_schema,
        max_output_tokens=max_tokens,
    )
    # The REST helper trips this model's cooldown itself on 429/5xx/timeout/404.
    return text, text is None and _model_cooling(model)


def _call_gemini_rest(
    api_key: str,
    model: str,
    prompt: str,
    system_instruction: str | None,
    conversation_history: list[dict[str, Any]] | None,
    temperature: float,
    timeout_sec: float,
    response_schema: dict[str, Any] | None = None,
    max_output_tokens: int | None = None,
) -> str | None:
    """Direct REST invocation to Google Generative Language API without needing google-genai SDK."""
    try:
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        }
        # Only an OAuth access token ("ya29." prefix) goes in a Bearer header. Every
        # API key -- classic "AIza..." and the newer "AQ." keys alike -- goes in
        # x-goog-api-key only; sending an API key as Bearer makes Google answer 401.
        if api_key.startswith("ya29."):
            headers.pop("x-goog-api-key")
            headers["Authorization"] = f"Bearer {api_key}"

        payload: dict[str, Any] = {
            "contents": build_contents(prompt, conversation_history),
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens or env.llm_max_output_tokens,
            },
        }
        if response_schema is not None:
            payload["generationConfig"]["responseMimeType"] = "application/json"
            payload["generationConfig"]["responseSchema"] = response_schema
        budget = _thinking_budget(model)
        level = _thinking_level(model)
        if budget is not None:
            payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": budget}
        elif level is not None:
            payload["generationConfig"]["thinkingConfig"] = {"thinkingLevel": level}
        if system_instruction:
            payload["system_instruction"] = {
                "parts": [{"text": system_instruction}],
            }

        resp = requests.post(url, headers=headers, json=payload, timeout=timeout_sec)
        if resp.status_code == 200:
            data = resp.json()
            llm_usage.record(data.get("usageMetadata"), model)
            candidates = data.get("candidates") or []
            if candidates and _is_truncated(candidates[0].get("finishReason")):
                logger.warning("Gemini REST response hit max_output_tokens; using the built-in answer engine.")
                return None
            if candidates:
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
                if text.strip():
                    return text.strip()
        else:
            cooldown = _cooldown_for_status(resp.status_code)
            if resp.status_code == 404:
                cooldown = _COOLDOWN_QUOTA_S
            if cooldown is not None:
                _trip_cooldown(cooldown, f"HTTP {resp.status_code}", model)
            else:
                logger.warning("Gemini REST API returned status %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        if _is_timeout(e):
            _trip_cooldown(_COOLDOWN_OUTAGE_S, "timeout", model)
        else:
            logger.warning("Gemini REST API invocation failed: %s; using the built-in answer engine.", type(e).__name__)

    return None



def build_contents(prompt: str, conversation_history: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Role-separated multi-turn `contents` for generate_content.

    This path used to send only `prompt` whenever a system instruction was
    set (i.e. always), silently dropping the conversation -- so follow-ups
    like "and the footfall?" lost what they referred to.
    """
    contents: list[dict[str, Any]] = []
    n_sent = max(0, int(env.chat_history_messages_sent))
    for turn in ((conversation_history or [])[-n_sent:] if n_sent else []):
        text = (turn.get("content") or "").strip()
        if not text:
            continue
        role = "model" if turn.get("role") == "assistant" else "user"
        meta = turn.get("meta") or {}
        if role == "model" and (meta.get("target_date") or meta.get("store_code")):
            # Tag old answers with what they were about, so the model does not
            # reuse another day's figures for this turn's question.
            text = (
                f"[earlier answer about store={meta.get('store_code', '?')}, "
                f"date={meta.get('target_date', '?')}]\n{text}"
            )
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"].append({"text": text})
        else:
            contents.append({"role": role, "parts": [{"text": text}]})
    if contents and contents[-1]["role"] == "user":
        contents[-1]["parts"].append({"text": prompt})
    else:
        contents.append({"role": "user", "parts": [{"text": prompt}]})
    return contents
