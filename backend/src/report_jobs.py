"""Asynchronous per-store report jobs (the BullMQ `reports` queue).

API side: submit_report_job() records who asked for what in
`report:meta:{job_id}` (owner, store, format, status) and enqueues the job;
GET /api/daily/report/jobs/{id} authorizes against that metadata -- never
against anything the client sends -- before returning status or bytes.

Worker side: process_report_job() renders with the exact same
src/daily_report.render_daily_report_file the synchronous endpoint uses and
parks the bytes in `report:artifact:{job_id}` for ARTIFACT_TTL_SECONDS.

Job ids are 128-bit random, so they aren't enumerable; ownership is still
checked on every read (AC-02).
"""
from __future__ import annotations

import logging
import secrets
from datetime import date

import redis

from db.redis_client import get_redis, get_redis_bytes

logger = logging.getLogger(__name__)

META_TTL_SECONDS = 3600
ARTIFACT_TTL_SECONDS = 600


class JobsUnavailable(RuntimeError):
    pass


def _meta_key(job_id: str) -> str:
    return f"report:meta:{job_id}"


def _artifact_key(job_id: str) -> str:
    return f"report:artifact:{job_id}"


def submit_report_job(*, owner_sub: str, store: str, fmt: str, start: str | None, end: str | None) -> str:
    from src.queue import REPORTS_QUEUE
    from src.queue.bullmq_client import enqueue
    from config.env import env

    client = get_redis()
    if client is None or not env.bullmq_active():
        raise JobsUnavailable()
    job_id = secrets.token_urlsafe(16)
    meta = {"owner_sub": owner_sub, "store": store, "format": fmt, "start": start or "", "end": end or "", "status": "waiting"}
    try:
        client.hset(_meta_key(job_id), mapping=meta)
        client.expire(_meta_key(job_id), META_TTL_SECONDS)
    except redis.RedisError as error:
        raise JobsUnavailable() from error
    data = {"job_id": job_id, "store": store, "format": fmt, "start": start, "end": end}
    if enqueue(REPORTS_QUEUE, "daily-report", data, job_id=job_id, opts={"attempts": 1}) is None:
        try:
            client.delete(_meta_key(job_id))
        except redis.RedisError:
            pass
        raise JobsUnavailable()
    return job_id


def get_job_meta(job_id: str) -> dict | None:
    client = get_redis()
    if client is None:
        raise JobsUnavailable()
    if not job_id or len(job_id) > 64:
        return None
    try:
        meta = client.hgetall(_meta_key(job_id))
    except redis.RedisError as error:
        raise JobsUnavailable() from error
    return meta or None


def get_artifact(job_id: str) -> bytes | None:
    client = get_redis_bytes()
    if client is None:
        return None
    try:
        return client.get(_artifact_key(job_id))
    except redis.RedisError:
        return None


def _set_status(job_id: str, **fields) -> None:
    client = get_redis()
    if client is not None:
        client.hset(_meta_key(job_id), mapping=fields)


def process_report_job(data: dict) -> dict:
    """Worker handler (sync; run in a thread by src/queue/worker.py)."""
    from db.session import session_scope
    from src.daily_report import render_daily_report_file

    job_id = data["job_id"]
    _set_status(job_id, status="active")
    start = date.fromisoformat(data["start"]) if data.get("start") else None
    end = date.fromisoformat(data["end"]) if data.get("end") else None
    try:
        with session_scope() as db:
            content, filename, media_type = render_daily_report_file(db, data["store"], data["format"], start, end)
    except ValueError as error:
        _set_status(job_id, status="failed", error=str(error)[:200])
        return {"status": "failed"}
    except Exception:
        logger.exception("Report job %s failed.", job_id)
        _set_status(job_id, status="failed", error="Report generation failed.")
        raise
    bytes_client = get_redis_bytes()
    bytes_client.set(_artifact_key(job_id), content, ex=ARTIFACT_TTL_SECONDS)
    _set_status(job_id, status="completed", filename=filename, media_type=media_type, size=len(content))
    return {"status": "completed", "size": len(content)}
