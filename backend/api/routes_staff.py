"""Staff Management API Routes.

Handles staff profiles, directory lookups, daily shift attendance roster,
and workforce presence KPIs.

Access rules (docs/specs/ops-modules-hardening/spec.md):
  * list / summary scope via resolve_store_scope -- fails closed (US-0)
  * list responses mask phone & omit email for managers; single-profile GET
    returns full contact details and audits the read (US-T4)
  * Store Manager role assignment/removal is admin-only (US-T4)
  * attendance batches require all staff_ids to belong to the store (US-T1)
    and respect ATTENDANCE_EDIT_WINDOW_DAYS for managers (US-T2)
"""
from __future__ import annotations

from datetime import date as date_type, timedelta
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_store_access, resolve_store_scope
from config.settings import ATTENDANCE_EDIT_WINDOW_DAYS
from db.session import get_db
from src import staff_store
from src.audit import audit_event
from src.rate_limiter import get_client_ip
from src.time_utils import ist_today

router = APIRouter(prefix="/api/daily/staff", tags=["staff"])


class CreateStaffPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_code: Literal["NM", "HB", "CHW"]
    name: str = Field(..., min_length=2, max_length=100)
    role: Literal[
        "Cashier",
        "Floor Associate",
        "Department Supervisor",
        "Inventory Clerk",
        "Security",
        "Housekeeping",
        "Store Manager",
    ] = "Floor Associate"
    department: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=10, max_length=15, pattern=r"^\+?\d{10,13}$")
    email: Optional[str] = Field(default=None, max_length=100)
    status: Literal["ACTIVE", "ON_LEAVE", "INACTIVE"] = "ACTIVE"
    joining_date: Optional[str] = Field(default=None, max_length=10)
    shift_preference: Literal["Morning", "Evening", "General"] = "General"
    notes: Optional[str] = Field(default="", max_length=300)


class UpdateStaffPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    role: Optional[
        Literal[
            "Cashier",
            "Floor Associate",
            "Department Supervisor",
            "Inventory Clerk",
            "Security",
            "Housekeeping",
            "Store Manager",
        ]
    ] = None
    department: Optional[str] = Field(default=None, min_length=2, max_length=80)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15, pattern=r"^\+?\d{10,13}$")
    email: Optional[str] = Field(default=None, max_length=100)
    status: Optional[Literal["ACTIVE", "ON_LEAVE", "INACTIVE"]] = None
    joining_date: Optional[str] = Field(default=None, max_length=10)
    shift_preference: Optional[Literal["Morning", "Evening", "General"]] = None
    notes: Optional[str] = Field(default=None, max_length=300)


class AttendanceItemPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_id: str = Field(..., min_length=3, max_length=30)
    status: Literal["PRESENT", "ABSENT", "HALF_DAY", "WEEK_OFF", "PAID_LEAVE", "ON_LEAVE"] = "PRESENT"
    shift: Literal["Morning", "Evening", "General", "Full Day", "Night"] = "General"
    check_in_time: Optional[str] = Field(default="", max_length=10)
    check_out_time: Optional[str] = Field(default="", max_length=10)
    remarks: Optional[str] = Field(default="", max_length=200)


class BatchAttendancePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_code: Literal["NM", "HB", "CHW"]
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date YYYY-MM-DD")
    records: List[AttendanceItemPayload] = Field(..., min_length=1, max_length=500)


@router.get("/summary")
def get_staff_summary(
    store_code: Optional[str] = Query(None, max_length=8, description="Store code or ALL"),
    date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date YYYY-MM-DD"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve workforce metrics (total, active, present, absent, on leave, shift counts)."""
    return staff_store.get_staff_summary(db, resolve_store_scope(user, store_code), date)


@router.get("/members")
def list_staff(
    store_code: Optional[str] = Query(None, max_length=8, description="Store code or ALL"),
    status: Optional[str] = Query(None, max_length=20),
    department: Optional[str] = Query(None, max_length=80),
    search: Optional[str] = Query(None, max_length=80),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List staff members in store with search and filters."""
    result = staff_store.list_staff(
        db=db,
        store_code=resolve_store_scope(user, store_code),
        status=status,
        department=department,
        search=search,
        limit=limit,
        skip=skip,
    )
    if not user.is_admin:
        result["items"] = [staff_store.mask_contact(item) for item in result["items"]]
    return result


@router.post("/members")
def create_staff_member(
    payload: CreateStaffPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Add new staff member. Requires store access."""
    require_store_access(payload.store_code, user)
    if not user.is_admin and payload.role in staff_store.PRIVILEGED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only an administrator can assign the Store Manager role.",
        )
    try:
        data = payload.model_dump()
        created = staff_store.create_staff_member(
            db=db,
            store_code=payload.store_code,
            data=data,
            created_by=user.username,
        )
        return {"status": "success", "staff": created}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/members/{staff_id}")
def get_staff_member(
    staff_id: str,
    request: Request,
    store_code: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Get single staff member profile."""
    require_store_access(store_code, user)
    staff = staff_store.get_staff_member(db, store_code, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    audit_event(
        "staff.contact.view",
        db=db,
        username=user.username,
        ip=get_client_ip(request),
        target=staff_id,
        details={"store_code": store_code.upper()},
    )
    return staff


@router.put("/members/{staff_id}")
def update_staff_member(
    staff_id: str,
    payload: UpdateStaffPayload,
    store_code: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update staff profile details."""
    require_store_access(store_code, user)
    if payload.role is not None and not user.is_admin:
        if payload.role in staff_store.PRIVILEGED_ROLES:
            raise HTTPException(
                status_code=403,
                detail="Only an administrator can assign the Store Manager role.",
            )
        existing = staff_store.get_staff_member(db, store_code, staff_id)
        if existing and existing.get("role") in staff_store.PRIVILEGED_ROLES and payload.role != existing.get("role"):
            raise HTTPException(
                status_code=403,
                detail="Only an administrator can change a Store Manager's role.",
            )
    try:
        updated = staff_store.update_staff_member(
            db=db,
            store_code=store_code,
            staff_id=staff_id,
            updates=payload.model_dump(exclude_unset=True),
            updated_by=user.username,
        )
        return {"status": "success", "staff": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/attendance")
def get_daily_attendance(
    store_code: str = Query(..., description="Store code NM, HB, CHW"),
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date YYYY-MM-DD"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve full attendance list for date, merging active staff."""
    require_store_access(store_code, user)
    return staff_store.get_daily_attendance(db, store_code, date)


@router.post("/attendance/batch")
def save_batch_attendance(
    payload: BatchAttendancePayload,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Save or update attendance for multiple staff members in one request."""
    require_store_access(payload.store_code, user)

    try:
        att_date = date_type.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date.")

    today_ist = ist_today()
    if att_date > today_ist:
        raise HTTPException(status_code=400, detail="Cannot record attendance for a future date.")

    oldest_allowed = today_ist - timedelta(days=ATTENDANCE_EDIT_WINDOW_DAYS)
    if not user.is_admin and att_date < oldest_allowed:
        raise HTTPException(status_code=403, detail=f"attendance for {payload.date} is locked")

    records_raw = [r.model_dump() for r in payload.records]
    try:
        saved = staff_store.save_batch_attendance(
            db=db,
            store_code=payload.store_code,
            date_str=payload.date,
            records=records_raw,
            marked_by=user.username,
        )
    except staff_store.UnknownStaffError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if user.is_admin and att_date < oldest_allowed:
        audit_event(
            "staff.attendance.override",
            db=db,
            username=user.username,
            ip=get_client_ip(request),
            target=payload.store_code,
            details={"date": payload.date, "count": len(saved)},
        )

    return {"status": "success", "saved_count": len(saved), "records": saved}
