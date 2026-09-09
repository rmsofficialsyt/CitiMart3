"""CITIMART Daily Operations -- FastAPI entrypoint.

Run with:
    uvicorn app:app --reload          # host/port from uvicorn's own flags
    python app.py                      # host/port from HOST/PORT in backend/.env

Every route here reads and writes MongoDB. Unlike the Analytics & Forecasting
sub-project, there is no DATASET.xlsx to parse, so startup is immediate and
there is no background warm-up, no 503-while-loading window, and no
dataset_cache/ bundle to ship -- the only startup work is a best-effort
account seed so a fresh deployment can log in.

The frontend is a Vite/React SPA built to ../frontend/dist/. This app serves
that build as static files when it's present, which is how a local
single-process run works; the deployed setup instead puts the SPA on Vercel
and points it at this API (see frontend/DEPLOYMENT.md). For active frontend
development, run `npm run dev` in ../frontend (Vite dev server on :5173,
proxying /api to this server) alongside `uvicorn app:app` here.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.auth import get_current_user, require_admin
from api.routes_auth import router as auth_router
from api.routes_charts import router as charts_router
from api.routes_daily import router as daily_router
from api.routes_kpi_thresholds import router as kpi_thresholds_router
from api.routes_meta import router as meta_router
from api.routes_targets import router as targets_router
from config.env import assert_production_secrets, env
from config.settings import PROJECT_ROOT
from src.daily_midnight_job import run_midnight_finalizer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

APP_STARTED_AT = datetime.now()


def _seed_accounts_best_effort() -> None:
    """Idempotently ensure the four fixed accounts exist in MongoDB so a fresh
    deployment can log in immediately.

    Best-effort and *per account*: a missing/unreachable MONGODB_URI logs a
    warning rather than blocking startup, and one account whose
    <SUFFIX>_INITIAL_PASSWORD fails src/password_policy.py is named, skipped,
    and never blocks seeding the other three. Fix the environment and
    redeploy, or run scripts/seed_users.py, to seed whatever was skipped."""
    try:
        from config.auth_users import AUTH_USERS, ENV_PASSWORD_SUFFIX
        from db.session import session_scope
        from src.password_policy import validate_password
        from src.user_store import get_user, seed_account, seed_password_for

        created: list[str] = []
        skipped: list[tuple[str, str]] = []
        with session_scope() as db:
            for username in AUTH_USERS:
                if get_user(db, username) is not None:
                    continue  # already seeded -- never reset here
                password = seed_password_for(username)
                errors = validate_password(password, username)
                if errors:
                    skipped.append((username, "; ".join(errors)))
                    continue
                if seed_account(db, username, password):
                    created.append(username)
    except Exception as error:  # noqa: BLE001 -- startup must not hard-fail here
        logger.warning("Could not seed dashboard accounts (login will fail until fixed): %s", error)
        return

    if created:
        logger.info("Seeded dashboard account(s): %s", ", ".join(created))
    for username, reason in skipped:
        env_var = f"{ENV_PASSWORD_SUFFIX.get(username, username)}_INITIAL_PASSWORD"
        logger.warning(
            "Did NOT seed %r: its initial password fails policy (%s). Set a valid "
            "%s and redeploy, or run scripts/seed_users.py.", username, reason, env_var,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to start a real deployment (MONGODB_URI set) that's still on the
    # shipped dev JWT secret -- the public default could forge admin tokens.
    assert_production_secrets()

    app.state.background_tasks = []

    # Seeding touches the network (Atlas), so it's offloaded rather than run
    # inline: uvicorn doesn't open the listening port until lifespan startup
    # returns, and a slow/unreachable cluster would otherwise make the
    # platform's port scan time out and fail the deploy.
    async def _warmup() -> None:
        await asyncio.to_thread(_seed_accounts_best_effort)
        app.state.background_tasks.append(asyncio.create_task(run_midnight_finalizer()))

    app.state.background_tasks.append(asyncio.create_task(_warmup()))
    logger.info("Startup complete.")
    yield
    for task in app.state.background_tasks:
        task.cancel()
    for task in app.state.background_tasks:
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task


app = FastAPI(title="CITIMART Daily Operations", lifespan=lifespan)

# Cross-origin access, off unless explicitly configured (config/env.py). The
# two supported frontend deployments differ here: serving ../frontend/dist
# from this same app (the StaticFiles mount below) and Vercel's /api/* rewrite
# are both *same-origin* to the browser and need no CORS at all, so a
# deployment that leaves these env vars blank installs no middleware. Only the
# direct browser -> Render mode (frontend built with VITE_API_BASE_URL) needs it.
#
# allow_credentials stays False on purpose: auth is a bearer token in the
# Authorization header, never a cookie, so no credentialed request is ever
# made -- and keeping it False avoids the spec rule that bans a wildcard
# origin alongside credentials. Content-Disposition must be exposed or the
# report download can't read the server-supplied filename
# (frontend/src/components/DailyExportMenu.tsx).
_cors_origins = env.cors_origins()
if _cors_origins or env.cors_allow_origin_regex:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_origin_regex=env.cors_allow_origin_regex or None,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition"],
        max_age=3600,
    )
    logger.info(
        "CORS enabled for origins=%s regex=%s",
        _cors_origins or "-", env.cors_allow_origin_regex or "-",
    )


@app.get("/api/health", include_in_schema=False)
def health() -> dict[str, object]:
    """Unauthenticated liveness probe for a hosting platform's health check.
    Point Render's health check at this path, not "/" -- "/" serves the SPA
    shell only when frontend/dist happens to be built locally, and in the
    deployed split it isn't there at all."""
    return {
        "status": "ok",
        "started_at": APP_STARTED_AT.isoformat(),
    }


# Routers first: Starlette matches routes in registration order, and the
# StaticFiles mount below is a catch-all at "/" -- it must be registered
# last or it would shadow every /api/* request.
#
# Every /api/* router below is gated by Depends(get_current_user) -> 401
# without a valid bearer token. `daily`, `charts` and `meta` are shared by
# managers and admin; store scope is clamped in api/deps.py::
# parse_daily_chart_state and asserted again in api/routes_charts.py and
# api/routes_daily.py::_guard. `targets` (Sales Target entry) and
# `kpi-thresholds` (status bands) are admin-only.
_authed = [Depends(get_current_user)]
_admin_only = [Depends(get_current_user), Depends(require_admin)]

app.include_router(auth_router)  # public: POST /api/auth/login

app.include_router(daily_router, dependencies=_authed)
app.include_router(charts_router, dependencies=_authed)
app.include_router(meta_router, dependencies=_authed)
app.include_router(targets_router, dependencies=_admin_only)
app.include_router(kpi_thresholds_router, dependencies=_admin_only)

# The React SPA lives *outside* the backend package: PROJECT_ROOT is
# backend/, and frontend/ is its sibling in this sub-project.
FRONTEND_DIST = PROJECT_ROOT.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    _INDEX_HTML = FRONTEND_DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """Serve the SPA shell for any non-/api path so client-side routes
        (/login, ...) survive a hard refresh. Registered after every /api
        router (so those still win) and before the StaticFiles mount; real
        asset files are still served here directly."""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        candidate = (FRONTEND_DIST / full_path).resolve()
        if candidate.is_file() and str(candidate).startswith(str(FRONTEND_DIST.resolve())):
            return FileResponse(candidate)
        return FileResponse(_INDEX_HTML)

    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    logger.warning(
        "frontend/dist not found -- run `npm run build` in ../frontend first, or "
        "ignore this if the SPA is deployed separately (Vercel). API routes are "
        "still available under /api/*."
    )


if __name__ == "__main__":
    # `python app.py` -- the only launch path that reads HOST/PORT from
    # backend/.env (config/env.py). The uvicorn CLI never imports this block, so
    # `uvicorn app:app` keeps its own defaults/flags; this is an addition, not a
    # replacement. Passed as the import string "app:app" rather than the `app`
    # object so reload=True still works.
    import uvicorn

    uvicorn.run("app:app", host=env.host, port=env.port, reload=False)
