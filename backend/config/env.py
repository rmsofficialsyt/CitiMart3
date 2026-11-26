"""Environment-driven settings -- distinct from config/settings.py's static
business constants (STORE_CODE_TO_NAME, TIME_SLOT_ORDER, ...), which never
vary by deployment and stay exactly as they are. Anything here *does* vary
per environment (dev machine vs. CI vs. production) and is read from
environment variables (a local ".env" file is picked up automatically for
dev; production sets real env vars, e.g. via the hosting platform's
dashboard).
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path to backend/.env rather than the bare relative ".env", which
# pydantic-settings resolves against the *current working directory*. The
# backend is normally launched from backend/ (`uvicorn app:app`), but scripts/,
# pytest and the Streamlit apps can be invoked from the repository root too --
# anchoring on this file keeps all of them reading the same .env.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

# The signing key the code ships with so a fresh clone + `pytest` works with
# zero setup. It is NOT a secret -- anyone with the source can forge a token
# signed with it -- so a real deployment MUST override JWT_SECRET. assert_
# production_secrets() (called from app.py's lifespan) refuses to start if this
# value is still in use once MONGODB_URI is configured (i.e. a real deployment).
INSECURE_JWT_SECRET_DEFAULT = "citimart-dev-only-insecure-signing-key-change-me"


class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # --- Server bind address ----------------------------------------------
    # Only read by app.py's `python app.py` entrypoint. Launching through the
    # uvicorn CLI (`uvicorn app:app --reload`) bypasses these entirely --
    # uvicorn's own --host/--port flags win there, defaulting to 127.0.0.1:8000.
    # PORT is also the variable every PaaS (Render included) injects to tell the
    # process which port to bind, so naming it `port` means a platform deploy
    # picks it up with no extra config; HOST must be 0.0.0.0 there, since a
    # container-local 127.0.0.1 bind is unreachable from outside the container.
    host: str = "127.0.0.1"
    port: int = 8000

    # MongoDB connection string, e.g. "mongodb+srv://user:pass@cluster.mongodb.net"
    # or "mongodb://localhost:27017". REQUIRED for this sub-project -- every
    # route reads or writes the database, and so does logging in. It stays
    # Optional as a *field* only so importing this module (or anything that
    # transitively imports db/engine.py) doesn't crash at import time, which
    # would make the failure land somewhere unhelpful; db/engine.py::
    # get_client() enforces it lazily instead, raising a RuntimeError that
    # names the variable the moment a connection is actually needed.
    #
    # There is no longer a fallback if this is unset. The old
    # TEST_DAILY_DASHBOARD.xlsx / db/xlsx_fallback.py scaffolding was retired
    # when the project split in two -- set a real URI (a free MongoDB Atlas
    # cluster is enough for local work).
    mongodb_uri: str | None = None
    # Database name within the MongoDB cluster/instance -- kept separate from
    # the URI since a URI (especially an Atlas SRV one) doesn't always carry
    # a path segment.
    mongodb_db_name: str = "citimart"

    # --- JWT authentication ------------------------------------------------
    # HS256 secret used to sign the tokens api/routes_auth.py::login issues
    # and to verify every incoming bearer token in api/auth.py -- no network
    # round-trip per request. A safe *insecure* default is provided so a
    # fresh clone + `pytest` works with zero setup; override in .env (and
    # always in production) with a long random value.
    jwt_secret: str = INSECURE_JWT_SECRET_DEFAULT
    # DEPRECATED: the pre-session-registry 12h access-token lifetime. Access
    # tokens now live access_token_ttl_seconds and are renewed through the
    # rotating refresh token below; this field is kept only so an existing
    # .env carrying JWT_TTL_SECONDS still parses.
    jwt_ttl_seconds: int = 12 * 3600
    # Short-lived access JWT (AUTH-05: <= 15-60 min) ...
    access_token_ttl_seconds: int = 15 * 60
    # ... renewed via a rotating, server-revocable refresh token whose
    # lifetime is also the session's ABSOLUTE expiry (one store shift).
    refresh_token_ttl_seconds: int = 12 * 3600
    # IDLE expiry: a session that hasn't refreshed for this long is revoked
    # on its next refresh attempt.
    session_idle_timeout_seconds: int = 2 * 3600
    jwt_issuer: str = "citimart-daily-ops"
    jwt_audience: str = "citimart-api"
    # Reject access tokens that carry no `sid` (session id) claim. Tokens
    # minted before the session registry existed carry none and can't be
    # revoked server-side; they expire on their own within the old 12h TTL.
    # None = on in ENVIRONMENT=production, off elsewhere (the test suite
    # signs sid-less tokens directly).
    require_session_id: bool | None = None
    # Secure flag on the HttpOnly refresh cookie. None = on unless
    # ENVIRONMENT=development *and* the request arrived over plain http.
    refresh_cookie_secure: bool | None = None

    # --- Redis (sessions, rate limits, shared cache, queues) --------------
    # Unset = single-process mode: every Redis-backed module falls back to
    # its in-process equivalent (correct for ONE worker only -- see
    # app.py's startup warning). Set it before running >1 worker/replica:
    #   REDIS_URL=redis://:<password>@redis:6379/0
    redis_url: str | None = None
    # Optional separate Redis for BullMQ (needs maxmemory-policy noeviction).
    # Defaults to redis_url.
    redis_queue_url: str | None = None
    redis_max_connections: int = 200
    # BullMQ producer (report jobs, audit events). Off by default even with
    # REDIS_URL set: enabling it without running `python -m src.queue.worker`
    # would leave jobs and audit events queued forever. docker-compose.yml
    # turns it on alongside the worker service.
    bullmq_enabled: bool = False
    # Run the midnight finalizer inside each API process. Safe with any
    # number of replicas once REDIS_URL is set (a Redis NX lock makes each
    # day's finalize run once); set false when the BullMQ worker owns it.
    run_in_process_midnight_job: bool = True
    # Render free-tier self-ping (keeps the instance from idling out). Turn
    # off behind a real load balancer.
    self_ping_enabled: bool = True
    # Threadpool size for sync route handlers (every DB route is sync, so
    # this caps in-flight requests per worker; anyio's default is 40).
    threadpool_size: int = 100
    # Max concurrent password hashes per process (each Argon2id verify holds
    # 19 MiB). None = min(4, cpu_count). See src/user_store.py.
    password_hash_concurrency: int | None = None

    # --- Rate limits (API-02) ---------------------------------------------
    # Every login attempt from one client IP, success or not -- a burst cap
    # sized so a whole store network behind one NAT can still log in. Also
    # bounds how much Argon2id CPU one IP can burn (see user_store).
    login_rate_limit_per_ip: int = 300
    # FAILED attempts for one (IP, username) pair -- the brute-force guard.
    login_rate_limit_per_account: int = 25
    # FAILED attempts against one account from ALL IPs combined, per
    # login_account_lockout_window_seconds (API-02 "per account"): stops
    # guessing spread across many IPs. A soft lockout -- it lifts on its own
    # once failures stop -- because the four usernames are known, so a hard
    # one would let anyone keep the admin locked out indefinitely for free.
    login_failure_limit_per_account_global: int = 50
    login_account_lockout_window_seconds: int = 15 * 60
    chat_rate_limit: int = 40
    # Proxies whose X-Forwarded-For we believe (comma-separated IPs/CIDRs).
    # A request arriving from anywhere else has XFF ignored, so a client
    # can't spoof its way into a fresh rate-limit bucket.
    trusted_proxy_ips: str = "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

    # --- MongoDB pool -------------------------------------------------------
    # Per process. Mind the cluster's connection cap: Atlas M0 allows 500, and
    # replicas x workers x maxPoolSize can exceed that quickly.
    mongo_min_pool_size: int = 10
    mongo_max_pool_size: int = 100

    # --- CORS (cross-origin frontend) --------------------------------------
    # Only needed when the SPA is served from a *different* origin than this
    # API -- i.e. the frontend deployed to Vercel with VITE_API_BASE_URL
    # pointing straight at this backend. The default Vercel setup instead
    # proxies /api/* through vercel.json's rewrite, which is same-origin to
    # the browser and needs none of this; hence both fields default to empty
    # (no CORSMiddleware installed at all -- see app.py).
    #
    # Comma-separated exact origins, scheme included, no trailing slash:
    #   CORS_ALLOW_ORIGINS=https://citimart.vercel.app,http://localhost:5173
    cors_allow_origins: str = ""
    # Regex alternative for origins that aren't fixed -- Vercel gives every
    # preview deployment its own hostname, so pinning them one by one is
    # impractical. Anchored by Starlette with fullmatch:
    #   CORS_ALLOW_ORIGIN_REGEX=https://citimart-3-frontend-.*\.vercel\.app
    # Leave blank in a deployment that only serves its one production domain.
    cors_allow_origin_regex: str = ""

    # --- Logging Configuration --------------------------------------------
    log_level: str = "INFO"
    log_dir: str | None = None
    log_to_file: bool = True
    log_max_bytes: int = 10 * 1024 * 1024  # 10 MiB per file
    log_backup_count: int = 5
    log_format_json: bool = False

    # --- Environment & Security Hardening ---------------------------------
    # Environment name: "development", "staging", "production"
    environment: str = "development"
    # Swagger/ReDoc docs toggle. If None, automatically enabled in dev/staging and disabled in production.
    enable_docs: bool | None = None

    # --- AI Chatbot & Google GenAI Multi-Agent Engine --------------------
    # Read strictly from environment / .env, never hardcoded.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    # Comma-separated models tried, in order, when the primary answers 503/504/429,
    # times out or is not found. Google's "high demand" 503s are per model, so a
    # sibling model usually still serves; each model has its own cooldown
    # (src/chat/client.py). Empty = primary only, the old behaviour.
    gemini_fallback_models: str = "gemini-3.6-flash,gemini-3.5-flash"
    llm_temperature: float = 0.2
    # Per-turn overrides used by the Co-Pilot coordinator: data answers copy
    # figures and should be deterministic; advice answers may vary a little.
    llm_temperature_data: float = 0.0
    llm_temperature_advice: float = 0.4
    # Gemini 2.5 "thinking" tokens count against max_output_tokens, so a long
    # table could be cut off. 0 disables thinking on Flash (Pro's floor is 128,
    # applied in src/chat/client.py); a negative value leaves the model default.
    llm_thinking_budget: int = 0
    # Ask the LLM to classify a chat question when no regex intent rule matched
    # (src/chat/intent_router.py). One extra short model call on those turns only.
    chat_llm_intent_fallback: bool = True
    # Output caps. The long tier (and generic callers such as the WhatsApp agent)
    # uses llm_max_output_tokens; the Co-Pilot's short / medium answer tiers use
    # their own caps (src/chat/coordinator.py::_resolve_response_tier). A cap is a
    # backstop, not the length control: a MAX_TOKENS cut-off falls back to the
    # deterministic card, so each leaves headroom above what the prompt asks for.
    llm_max_output_tokens: int = 4096
    llm_max_output_tokens_short: int = 512
    llm_max_output_tokens_medium: int = 1536
    # Display only (Co-Pilot usage window): the model's input context capacity.
    # Nothing is enforced against it -- Gemini exposes no remaining-quota API.
    llm_context_window_tokens: int = 1_048_576
    llm_request_timeout_seconds: int = 15
    tavily_api_key: str | None = None
    chat_session_ttl_days: int = 30
    chat_max_history_turns: int = 10
    # Longest chat message accepted (api/routes_chat.py::ChatRequest).
    chat_max_input_chars: int = 8000
    # Most recent history messages sent to the model per turn (user + assistant
    # messages, so 10 = 5 turns). get_history fetches chat_max_history_turns * 2.
    chat_history_messages_sent: int = 10

    # --- WhatsApp Sales Alerts & Reporting Agent (SPEC-05) ------------------
    # Defaults to "dry_run" until Meta Cloud API or Twilio credentials are set.
    whatsapp_provider: str = "dry_run"  # "dry_run" | "meta" | "twilio"
    whatsapp_alerts_enabled: bool = False
    whatsapp_access_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_api_version: str = "v21.0"
    whatsapp_template_name: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str | None = None
    whatsapp_admin_recipients: str = ""  # comma-separated Indian mobile numbers

    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def session_id_required(self) -> bool:
        if self.require_session_id is not None:
            return self.require_session_id
        return self.is_production()

    def queue_redis_url(self) -> str | None:
        return self.redis_queue_url or self.redis_url

    def bullmq_active(self) -> bool:
        return bool(self.bullmq_enabled and self.queue_redis_url())

    def is_docs_enabled(self) -> bool:
        if self.enable_docs is not None:
            return self.enable_docs
        return self.environment.lower() != "production"

    def cors_origins(self) -> list[str]:
        """`cors_allow_origins` split into the list CORSMiddleware wants.
        Kept as a plain `str` field + this splitter rather than a `list[str]`
        because pydantic-settings parses complex-typed fields as JSON, which
        would make the env var `["https://..."]` instead of a readable
        comma-separated line."""
        return [origin.strip().rstrip("/") for origin in self.cors_allow_origins.split(",") if origin.strip()]

    def resolved_log_dir(self) -> Path:
        if self.log_dir:
            path = Path(self.log_dir).resolve()
            path.mkdir(parents=True, exist_ok=True)
            return path
        from config.settings import LOGS_DIR
        return LOGS_DIR


env = EnvSettings()


def assert_production_secrets() -> None:
    """Fail fast when a real deployment is left with the shipped dev secrets.

    "Real deployment" is inferred from MONGODB_URI being set -- login and Daily
    Operations both require it, and a real deployment only ever runs the app
    with it configured. In that case JWT_SECRET must be a genuine random value:
    keeping the code default would let anyone with the (public) source string
    mint a valid admin token. The test suite (which uses mongomock and sets no
    MONGODB_URI) is unaffected and still runs with the default.
    """
    if env.mongodb_uri and env.jwt_secret == INSECURE_JWT_SECRET_DEFAULT:
        raise RuntimeError(
            "JWT_SECRET is still the insecure code default while MONGODB_URI is "
            "configured. Set JWT_SECRET to a long random value (e.g. "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"`) "
            "in the environment before starting the app."
        )
