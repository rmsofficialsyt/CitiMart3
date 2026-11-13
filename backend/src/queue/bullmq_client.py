"""BullMQ producer for the API processes.

BullMQ's Python client is asyncio-only, while every route that enqueues here
is a sync `def` running in FastAPI's threadpool. Rather than spin up an
event loop per call, each process owns ONE private loop on a daemon thread
(started lazily on first enqueue) holding one bullmq.Queue per queue name;
enqueue() hands coroutines to it with run_coroutine_threadsafe.

enqueue() returns the job id, or None when BullMQ is disabled (BULLMQ_ENABLED
false / no Redis) or the enqueue failed -- callers decide their own fallback
(audit events write straight to MongoDB; report jobs answer 503).
"""
from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import Future

from config.env import env

logger = logging.getLogger(__name__)

# Default retention so `noeviction` Redis doesn't fill with finished jobs.
DEFAULT_JOB_OPTS = {
    "removeOnComplete": {"age": 3600, "count": 1000},
    "removeOnFail": {"age": 24 * 3600, "count": 1000},
    "attempts": 3,
    "backoff": {"type": "exponential", "delay": 2000},
}


class _Producer:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._queues: dict = {}

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        with self._lock:
            if self._loop is None:
                loop = asyncio.new_event_loop()
                thread = threading.Thread(target=loop.run_forever, name="bullmq-producer", daemon=True)
                thread.start()
                self._loop, self._thread = loop, thread
            return self._loop

    async def _queue(self, name: str):
        from bullmq import Queue

        q = self._queues.get(name)
        if q is None:
            q = Queue(name, {"connection": env.queue_redis_url()})
            self._queues[name] = q
        return q

    async def _add(self, queue_name: str, job_name: str, data: dict, opts: dict) -> str:
        q = await self._queue(queue_name)
        job = await q.add(job_name, data, opts)
        return str(job.id)

    def submit(self, queue_name: str, job_name: str, data: dict, opts: dict) -> Future:
        loop = self._ensure_loop()
        return asyncio.run_coroutine_threadsafe(self._add(queue_name, job_name, data, opts), loop)

    def close(self) -> None:
        with self._lock:
            loop, self._loop = self._loop, None
            queues, self._queues = self._queues, {}
        if loop is None:
            return

        async def _close_all():
            for q in queues.values():
                try:
                    await q.close()
                except Exception:  # noqa: BLE001
                    pass

        try:
            asyncio.run_coroutine_threadsafe(_close_all(), loop).result(timeout=5)
        except Exception:  # noqa: BLE001
            pass
        loop.call_soon_threadsafe(loop.stop)


_producer = _Producer()


def enqueue(
    queue_name: str,
    job_name: str,
    data: dict,
    *,
    job_id: str | None = None,
    opts: dict | None = None,
    wait: bool = True,
    timeout: float = 3.0,
) -> str | None:
    """Add one job. With wait=False this is fire-and-forget (returns
    job_id or "" immediately; failures are only logged)."""
    if not env.bullmq_active():
        return None
    final_opts = {**DEFAULT_JOB_OPTS, **(opts or {})}
    if job_id:
        final_opts["jobId"] = job_id
    try:
        future = _producer.submit(queue_name, job_name, data, final_opts)
    except Exception:  # noqa: BLE001
        logger.warning("BullMQ enqueue to %s failed to submit.", queue_name, exc_info=True)
        return None
    if not wait:
        future.add_done_callback(
            lambda f: f.exception() and logger.warning("BullMQ enqueue to %s failed: %s", queue_name, f.exception())
        )
        return job_id or ""
    try:
        return future.result(timeout=timeout)
    except Exception:  # noqa: BLE001
        logger.warning("BullMQ enqueue to %s failed.", queue_name, exc_info=True)
        return None


def close_producer() -> None:
    _producer.close()
