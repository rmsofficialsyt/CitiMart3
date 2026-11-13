# CITIMART Daily Operations -- API + BullMQ worker image (one image, two commands).
#
#   API:    default CMD (uvicorn, WEB_CONCURRENCY workers)
#   Worker: python -m src.queue.worker
#
# INFRA-06: pinned slim base, non-root user, no secrets in layers
# (.dockerignore excludes .env / CREDENTIALS.txt), healthcheck.
#
# Note: PDF reports rasterize charts with Kaleido, which needs a Chrome
# binary this slim image doesn't ship -- src/daily_report.py then falls back
# to the visual-less PDF (tables only). XLSX is unaffected.

FROM python:3.13.9-slim-bookworm AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.13.9-slim-bookworm
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    WEB_CONCURRENCY=2 \
    MALLOC_ARENA_MAX=2 \
    MALLOC_MMAP_THRESHOLD_=131072
# The two MALLOC_ settings are load-bearing. Each Argon2id verify allocates
# 19 MiB. Without a fixed mmap threshold, glibc raises it after the first
# large free and serves later 19 MiB blocks from per-thread arenas that it
# never returns to the OS -- with a 100-thread pool that measured >1 GiB per
# worker under a login burst and got every container OOM-killed. A fixed
# threshold keeps big blocks mmap'd (returned on free); 2 arenas caps the
# rest of the fragmentation.
RUN groupadd --system app && useradd --system --gid app --home /app --shell /usr/sbin/nologin appuser
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=appuser:app . .
# .cache/ holds the weather JSON fallback; the app writes it at runtime.
RUN mkdir -p .cache && chown appuser:app .cache
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"
# Never set uvicorn's forwarded-allow-ips to "all": it then takes the LEFTMOST
# X-Forwarded-For entry as the client -- the one the caller wrote, since nginx
# appends -- so anyone could pick their own login rate-limit bucket and forge
# audit IPs. Left at uvicorn's default (trust only 127.0.0.1), the socket peer
# stays nginx's address and src/rate_limiter.get_client_ip walks the chain
# right-to-left against TRUSTED_PROXY_IPS. X-Forwarded-Proto is read from the
# header directly where it matters (routes_auth._cookie_secure, app.py HSTS).
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY} --no-server-header"]
