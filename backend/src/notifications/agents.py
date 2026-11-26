"""6 Proactive Notification & Log Handling Agents (SPEC-06).

Agents:
  1. StockOpsAgent          -- low stock, damage write-offs, pending transfers
  2. AuditGuardAgent        -- missing hourly logs, NOB > Footfall, KPI overrides
  3. WorkforceAgent         -- unlogged daily attendance, low active staff
  4. RequisitionAgent       -- urgent/high pending requisitions
  5. DirectiveFollowUpAgent -- active unacknowledged directives
  6. LogOpsAgent            -- error.log/worker.log/access.log & audit_logs triage (Admin-only)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pymongo.database import Database

from config.settings import LOGS_DIR, STORE_CODE_TO_NAME
from db.models import (
    AUDIT_LOGS,
    BILLS,
    DIRECTIVES,
    FOOTFALL,
    NOB,
    REQUISITIONS,
    STAFF_ATTENDANCE,
    STAFF_MEMBERS,
    STOCK_INVENTORY,
    STOCK_MOVEMENTS,
    STOCK_TRANSFERS,
    TARGETS,
)
from src import daily_dashboard_store

IST = ZoneInfo("Asia/Kolkata")
_LOG_TAIL_BYTES = 32 * 1024  # bounded 32 KB read per log file


@dataclass(frozen=True)
class NotificationEvent:
    agent: str
    audience: str  # "admin" | "manager"
    store_code: str  # "ALL" | "NM" | "HB" | "CHW"
    severity: str  # "urgent" | "warning" | "info"
    title: str
    message: str
    dedupe_key: str
    action_link: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def _store_slug(code: str) -> str:
    return code.lower()


class StockOpsAgent:
    """Monitors inventory reorder thresholds, damage write-offs, and transfers."""

    name = "stock_ops_agent"

    def evaluate(self, db: Database, now: datetime) -> list[NotificationEvent]:
        events: list[NotificationEvent] = []
        iso_date = now.date().isoformat()
        total_low = 0

        for code in STORE_CODE_TO_NAME:
            low_items = list(
                db[STOCK_INVENTORY].find(
                    {
                        "store_code": code,
                        "$expr": {"$lte": ["$current_stock", {"$ifNull": ["$reorder_level", 10]}]},
                    },
                    {"_id": 0, "item_name": 1, "barcode": 1, "current_stock": 1},
                ).limit(20)
            )
            if low_items:
                total_low += len(low_items)
                sample = ", ".join(str(i.get("item_name") or i.get("barcode")) for i in low_items[:3])
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="manager",
                    store_code=code,
                    severity="warning",
                    title=f"Low Stock Alert ({len(low_items)} SKUs)",
                    message=f"{len(low_items)} item(s) at {code} are at or below reorder level (e.g., {sample}).",
                    dedupe_key=f"stock_low:{code}:{iso_date}",
                    action_link=f"/app?store={_store_slug(code)}&view=stocks",
                    metadata={"count": len(low_items)},
                ))

            pending_in = db[STOCK_TRANSFERS].count_documents({"to_store": code, "status": "PENDING"})
            if pending_in > 0:
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="manager",
                    store_code=code,
                    severity="info",
                    title=f"Incoming Stock Transfer ({pending_in})",
                    message=f"{pending_in} pending stock transfer(s) awaiting receipt at {code}.",
                    dedupe_key=f"stock_transfer_in:{code}:{iso_date}:{pending_in}",
                    action_link=f"/app?store={_store_slug(code)}&view=stocks",
                ))

            dmg_count = db[STOCK_MOVEMENTS].count_documents({
                "store_code": code,
                "movement_type": "DAMAGE_WRITE_OFF",
                "created_at": {"$gte": f"{iso_date}T00:00:00"},
            })
            if dmg_count >= 3:
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="admin",
                    store_code="ALL",
                    severity="warning",
                    title=f"Damage Write-Off Spike ({code})",
                    message=f"{code} recorded {dmg_count} damage write-offs today.",
                    dedupe_key=f"stock_damage:{code}:{iso_date}",
                    action_link=f"/app?store={_store_slug(code)}&view=stocks",
                ))

        if total_low > 0:
            events.append(NotificationEvent(
                agent=self.name,
                audience="admin",
                store_code="ALL",
                severity="warning",
                title=f"Network Low Stock ({total_low} SKUs)",
                message=f"{total_low} total SKU(s) across stores are at/below reorder level.",
                dedupe_key=f"stock_low:ALL:{iso_date}:{total_low}",
                action_link="/app?store=overall&view=stocks",
            ))
        return events


class AuditGuardAgent:
    """Detects missing hourly entries, NOB > Footfall anomalies, and KPI overrides."""

    name = "audit_guard_agent"

    def evaluate(self, db: Database, now: datetime) -> list[NotificationEvent]:
        events: list[NotificationEvent] = []
        target_date = now.date()
        iso_date = target_date.isoformat()
        in_trading = 11 <= now.hour <= 23
        missing_stores: list[str] = []

        for code in STORE_CODE_TO_NAME:
            kpis = daily_dashboard_store.compute_live_kpis(db, code, target_date)
            ff = float(kpis.get("footfall") or 0)
            nob = float(kpis.get("nob") or 0)
            sales = float(kpis.get("net_sales") or 0)

            if in_trading and now.hour >= 13 and sales == 0 and ff == 0 and nob == 0:
                missing_stores.append(code)
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="manager",
                    store_code=code,
                    severity="urgent",
                    title=f"Missing Daily Entries ({code})",
                    message=f"No bills, footfall, or NOB logged yet for {iso_date} as of {now.strftime('%H:%M')} IST.",
                    dedupe_key=f"audit_missing:{code}:{iso_date}:{now.hour:02d}",
                    action_link=f"/app?store={_store_slug(code)}&view=manual",
                ))

            if ff > 0 and nob > ff:
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="manager",
                    store_code=code,
                    severity="warning",
                    title=f"Conversion Anomaly ({code})",
                    message=f"Transactions (NOB {int(nob)}) exceed Footfall ({int(ff)}) on {iso_date}. Please verify entries.",
                    dedupe_key=f"audit_nob_gt_ff:{code}:{iso_date}",
                    action_link=f"/app?store={_store_slug(code)}&view=manual",
                ))

            target_doc = db[TARGETS].find_one({"store_code": code, "entry_date": iso_date}, {"overrides": 1})
            if target_doc and target_doc.get("overrides"):
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="admin",
                    store_code="ALL",
                    severity="info",
                    title=f"Manual KPI Override Active ({code})",
                    message=f"{code} has manual KPI overrides on {iso_date}: {', '.join(sorted(target_doc['overrides'].keys()))}.",
                    dedupe_key=f"audit_override:{code}:{iso_date}:{len(target_doc['overrides'])}",
                    action_link=f"/app?store={_store_slug(code)}&view=dashboard",
                ))

        if missing_stores:
            events.append(NotificationEvent(
                agent=self.name,
                audience="admin",
                store_code="ALL",
                severity="urgent",
                title="Stores Missing Live Entries",
                message=f"No live entries logged yet today for: {', '.join(missing_stores)}.",
                dedupe_key=f"audit_missing:ALL:{iso_date}:{now.hour:02d}",
                action_link="/app?store=overall&view=dashboard",
            ))
        return events


class WorkforceAgent:
    """Monitors daily attendance logging and active staff coverage."""

    name = "workforce_agent"

    def evaluate(self, db: Database, now: datetime) -> list[NotificationEvent]:
        events: list[NotificationEvent] = []
        iso_date = now.date().isoformat()
        if now.hour < 11:
            return events

        for code in STORE_CODE_TO_NAME:
            active_staff = db[STAFF_MEMBERS].count_documents({"store_code": code, "status": "ACTIVE"})
            if active_staff == 0:
                continue
            logged = db[STAFF_ATTENDANCE].count_documents({"store_code": code, "date": iso_date})
            if logged == 0:
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="manager",
                    store_code=code,
                    severity="warning",
                    title=f"Staff Attendance Not Logged ({code})",
                    message=f"{active_staff} active staff at {code}, but today's attendance roster is still empty.",
                    dedupe_key=f"workforce_unlogged:{code}:{iso_date}",
                    action_link=f"/app?store={_store_slug(code)}&view=staff",
                ))
            else:
                present = db[STAFF_ATTENDANCE].count_documents({
                    "store_code": code,
                    "date": iso_date,
                    "status": {"$in": ["PRESENT", "HALF_DAY", "Present", "Half Day"]},
                })
                if active_staff >= 4 and present / active_staff < 0.6:
                    events.append(NotificationEvent(
                        agent=self.name,
                        audience="admin",
                        store_code="ALL",
                        severity="warning",
                        title=f"Low Staff Coverage ({code})",
                        message=f"Only {present}/{active_staff} active staff present at {code} on {iso_date}.",
                        dedupe_key=f"workforce_low:{code}:{iso_date}",
                        action_link=f"/app?store={_store_slug(code)}&view=staff",
                    ))
        return events


class RequisitionAgent:
    """Surfaces urgent/high pending product requisitions for Admin triage."""

    name = "requisition_agent"

    def evaluate(self, db: Database, now: datetime) -> list[NotificationEvent]:
        events: list[NotificationEvent] = []
        iso_date = now.date().isoformat()
        urgent_pending = db[REQUISITIONS].count_documents({
            "status": {"$in": ["pending", "Pending"]},
            "priority": {"$in": ["Urgent", "High"]},
        })
        if urgent_pending > 0:
            events.append(NotificationEvent(
                agent=self.name,
                audience="admin",
                store_code="ALL",
                severity="urgent",
                title=f"Urgent Requisitions Pending ({urgent_pending})",
                message=f"{urgent_pending} Urgent/High priority product requisition slip(s) awaiting review.",
                dedupe_key=f"req_urgent:ALL:{iso_date}:{urgent_pending}",
                action_link="/app?store=overall&view=requisition",
            ))
        return events


class DirectiveFollowUpAgent:
    """Tracks active Boss Directives awaiting store acknowledgment."""

    name = "directive_followup_agent"

    def evaluate(self, db: Database, now: datetime) -> list[NotificationEvent]:
        events: list[NotificationEvent] = []
        iso_date = now.date().isoformat()
        active_dirs = list(db[DIRECTIVES].find({"active": True}, {"_id": 0, "directive_id": 1, "title": 1, "acknowledged_by": 1}).limit(20))
        if not active_dirs:
            return events

        for code in STORE_CODE_TO_NAME:
            unack = [d for d in active_dirs if code not in (d.get("acknowledged_by") or [])]
            if unack:
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="manager",
                    store_code=code,
                    severity="info",
                    title=f"Unacknowledged Boss Directives ({len(unack)})",
                    message=f"{len(unack)} active executive directive(s) awaiting acknowledgment from {code}.",
                    dedupe_key=f"directive_unack:{code}:{iso_date}:{len(unack)}",
                    action_link=f"/app?store={_store_slug(code)}&view=dashboard",
                ))
        return events


class LogOpsAgent:
    """Log Handling Agent: inspects rotating log files & MongoDB audit_logs (Admin-only)."""

    name = "log_ops_agent"

    def __init__(self, logs_dir: Path | None = None) -> None:
        self._logs_dir = logs_dir or LOGS_DIR

    @staticmethod
    def _tail_text(path: Path) -> str:
        if not path.is_file():
            return ""
        size = path.stat().st_size
        with path.open("rb") as f:
            if size > _LOG_TAIL_BYTES:
                f.seek(size - _LOG_TAIL_BYTES)
            return f.read().decode("utf-8", errors="replace")

    def evaluate(self, db: Database, now: datetime) -> list[NotificationEvent]:
        events: list[NotificationEvent] = []
        iso_date = now.date().isoformat()
        hour_bucket = now.strftime("%Y-%m-%d-%H")

        # 1. Inspect error.log & worker.log for ERROR / CRITICAL lines today
        for fname in ("error.log", "worker.log"):
            fpath = self._logs_dir / fname
            text = self._tail_text(fpath)
            if not text:
                continue
            today_errors = [
                ln for ln in text.splitlines()
                if iso_date in ln and (" ERROR " in ln or " CRITICAL " in ln or "[ERROR]" in ln)
            ]
            if len(today_errors) >= 3:
                last_err = today_errors[-1][:140]
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="admin",
                    store_code="ALL",
                    severity="urgent",
                    title=f"Log Error Spike in {fname} ({len(today_errors)})",
                    message=f"Detected {len(today_errors)} recent ERROR/CRITICAL entries in {fname}. Latest: {last_err}",
                    dedupe_key=f"log_err:{fname}:{hour_bucket}",
                    metadata={"file": fname, "count": len(today_errors)},
                ))

            # Oversized log file guard (>25 MB)
            if fpath.is_file() and fpath.stat().st_size > 25 * 1024 * 1024:
                mb = round(fpath.stat().st_size / (1024 * 1024), 1)
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="admin",
                    store_code="ALL",
                    severity="warning",
                    title=f"Large Log File: {fname} ({mb} MB)",
                    message=f"{fname} has grown to {mb} MB; check log rotation settings.",
                    dedupe_key=f"log_size:{fname}:{iso_date}",
                ))

        # 2. Inspect access.log for HTTP 500 bursts
        access_text = self._tail_text(self._logs_dir / "access.log")
        if access_text:
            http_500s = [ln for ln in access_text.splitlines() if iso_date in ln and " 500 " in ln]
            if len(http_500s) >= 2:
                events.append(NotificationEvent(
                    agent=self.name,
                    audience="admin",
                    store_code="ALL",
                    severity="urgent",
                    title=f"API 500 Burst Detected ({len(http_500s)})",
                    message=f"Found {len(http_500s)} HTTP 500 responses in access.log on {iso_date}.",
                    dedupe_key=f"log_500:{hour_bucket}",
                ))

        # 3. Inspect MongoDB audit_logs for failed login / lockout bursts in last hour
        since_iso = (now.astimezone(timezone.utc) - timedelta(hours=1)).isoformat()
        failed_logins = db[AUDIT_LOGS].count_documents({
            "action": {"$in": ["login_failed", "login_locked"]},
            "ts": {"$gte": since_iso},
        })
        if failed_logins >= 5:
            events.append(NotificationEvent(
                agent=self.name,
                audience="admin",
                store_code="ALL",
                severity="urgent",
                title=f"Security Audit: {failed_logins} Failed Logins (1h)",
                message=f"Detected {failed_logins} failed/locked login events in audit_logs over the past hour.",
                dedupe_key=f"audit_login_burst:{hour_bucket}",
            ))

        return events


ALL_NOTIFICATION_AGENTS = (
    StockOpsAgent(),
    AuditGuardAgent(),
    WorkforceAgent(),
    RequisitionAgent(),
    DirectiveFollowUpAgent(),
    LogOpsAgent(),
)
