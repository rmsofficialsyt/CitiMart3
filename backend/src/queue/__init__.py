"""BullMQ background jobs (Python `bullmq` client).

bullmq_client.py -- producer side, used by API processes.
worker.py        -- consumer process: `python -m src.queue.worker` (from backend/).
jobs.py          -- the job handlers themselves, plain sync functions that the
                    worker runs in a thread (pymongo/reportlab are sync).

Queue names are the constants below; producer and worker must agree on them.
"""
REPORTS_QUEUE = "reports"
AUDIT_QUEUE = "audit-events"
MIDNIGHT_QUEUE = "midnight-finalizer"

ALL_QUEUES = (REPORTS_QUEUE, AUDIT_QUEUE, MIDNIGHT_QUEUE)
