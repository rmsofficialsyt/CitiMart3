"""Staff Management API Routes.

Handles staff profiles, directory lookups, daily shift attendance roster,
and workforce presence KPIs.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_store_access
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src import staff_store

router = APIRouter(prefix="/api/daily/staff", tags=["staff"])


class CreateStaffPayload(BaseModel):
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
    phone: str = Field(..., min_length=10, max_length=15)
    email: Optional[str] = Field(default=None, max_length=100)
    status: Literal["ACTIVE", "ON_LEAVE", "INACTIVE"] = "ACTIVE"
    joining_date: Optional[str] = Field(default=None, max_length=10)
    shift_preference: Literal["Morning", "Evening", "General"] = "General"
    notes: Optional[str] = Field(default="", max_length=300)


class UpdateStaffPayload(BaseModel):
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
    phone: Optional[str] = Field(default=None, min_length=10, max_length=15)
    email: Optional[str] = Field(default=None, max_length=100)
    status: Optional[Literal["ACTIVE", "ON_LEAVE", "INACTIVE"]] = None
    joining_date: Optional[str] = Field(default=None, max_length=10)
    shift_preference: Optional[Literal["Morning", "Evening", "General"]] = None
    notes: Optional[str] = Field(default=None, max_length=300)


class AttendanceItemPayload(BaseModel):
    staff_id: str = Field(..., min_length=3, max_length=30)
    status: Literal["PRESENT", "ABSENT", "HALF_DAY", "WEEK_OFF", "PAID_LEAVE", "ON_LEAVE"] = "PRESENT"
    shift: Literal["Morning", "Evening", "General", "Full Day", "Night"] = "General"
    check_in_time: Optional[str] = Field(default="", max_length=10)
    check_out_time: Optional[str] = Field(default="", max_length=10)
    remarks: Optional[str] = Field(default="", max_length=200)


class BatchAttendancePayload(BaseModel):
    store_code: Literal["NM", "HB", "CHW"]
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date YYYY-MM-DD")
    records: List[AttendanceItemPayload] = Field(..., min_length=1)


@router.get("/summary")
def get_staff_summary(
    store_code: Optional[str] = Query(None, description="Store code or ALL"),
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve workforce metrics (total, active, present, absent, on leave, shift counts)."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code
    if effective_store and effective_store.upper() != "ALL":
        require_store_access(effective_store, user)

    return staff_store.get_staff_summary(db, effective_store, date)


@router.get("/members")
def list_staff(
    store_code: Optional[str] = Query(None, description="Store code or ALL"),
    status: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List staff members in store with search and filters."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code
    if effective_store and effective_store.upper() != "ALL":
        require_store_access(effective_store, user)

    return staff_store.list_staff(
        db=db,
        store_code=effective_store,
        status=status,
        department=department,
        search=search,
        limit=limit,
        skip=skip,
    )


@router.post("/members")
def create_staff_member(
    payload: CreateStaffPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Add new staff member. Requires store access."""
    require_store_access(payload.store_code, user)
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
    store_code: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Get single staff member profile."""
    require_store_access(store_code, user)
    staff = staff_store.get_staff_member(db, store_code, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
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
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Save or update attendance for multiple staff members in one request."""
    require_store_access(payload.store_code, user)
    records_raw = [r.model_dump() for r in payload.records]
    saved = staff_store.save_batch_attendance(
        db=db,
        store_code=payload.store_code,
        date_str=payload.date,
        records=records_raw,
        marked_by=user.username,
    )
    return {"status": "success", "saved_count": len(saved), "records": saved}
