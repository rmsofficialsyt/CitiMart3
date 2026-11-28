"""Required Product Requisition Slip API Routes.

Handles category hierarchy lookups from 'Unique Division,Section, Department.xlsx',
requisition creation by Store Managers / Operational Head, Admin List View queries,
status lifecycle updates, and Excel exports.

Access rules (docs/specs/ops-modules-hardening/spec.md):
  * list / export scope comes from resolve_store_scope -- fails closed (US-0)
  * status changes are admin-only and follow requisitions_store.STATUS_TRANSITIONS;
    a disallowed or raced change is 409 (US-R1)
  * a manager may delete only their own slip, and only while Pending (US-R2)
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_admin, require_store_access, resolve_store_scope
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src import product_hierarchy, requisitions_store
from src.audit import audit_event
from src.rate_limiter import get_client_ip
from src.time_utils import ist_today

router = APIRouter(prefix="/api/daily/requisitions", tags=["requisitions"])


class RequisitionItemPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sl_no: Optional[int] = Field(default=None, ge=1, le=500)
    division: str = Field(..., max_length=120, description="Division name or custom entry")
    section: str = Field(..., max_length=120, description="Section name or custom entry")
    department: str = Field(..., max_length=120, description="Department name or custom entry")
    product_required: Optional[str] = Field(default=None, max_length=400)
    barcode_details: str = Field(default="", max_length=200, description="Barcode details / descriptions")
    brand: str = Field(default="", max_length=80, description="Brand name")
    mrp: Optional[str] = Field(default="", max_length=20, description="MRP value or string")
    time_required: str = Field(default="1 day", max_length=40, description="Time required (e.g. 1 day, 2 days...)")
    remarks: Optional[str] = Field(default="", max_length=300, description="Item-specific remarks")


class CreateRequisitionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_code: Literal["NM", "HB", "CHW"]
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date in YYYY-MM-DD format")
    items: List[RequisitionItemPayload] = Field(..., min_length=1, max_length=200, description="List of requisition items")
    priority: Literal["Urgent", "High", "Normal"] = "Normal"
    remarks_general: Optional[str] = Field(default="", max_length=300, description="General slip remarks")


class UpdateRequisitionStatusPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["Pending", "In Review", "Approved", "In Transit", "Fulfilled", "Rejected"]
    admin_remarks: Optional[str] = Field(default="", max_length=500, description="Admin notes or resolution remarks")


@router.get("/categories")
def get_categories(db: Database = Depends(get_db)):
    """Fetch cascading Division -> Section -> Department hierarchy tree with custom additions."""
    return product_hierarchy.get_merged_hierarchy(db)


@router.get("")
def list_requisitions(
    store_code: Optional[str] = Query(None, max_length=8, description="Filter by store code (NM, HB, CHW, or ALL)"),
    start_date: Optional[str] = Query(None, max_length=10, description="Filter start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, max_length=10, description="Filter end date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, max_length=20, description="Filter by status"),
    search: Optional[str] = Query(None, max_length=100, description="Search term across barcode, brand, dept, etc."),
    limit: int = Query(500, ge=1, le=2000),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve product requisitions. Managers see their own store requisitions, Admin sees all."""
    requisitions = requisitions_store.list_requisitions(
        db=db,
        store_code=resolve_store_scope(user, store_code),
        start_date=start_date,
        end_date=end_date,
        status=status,
        search=search,
        limit=limit,
    )

    return {
        "status": "ok",
        "count": len(requisitions),
        "requisitions": requisitions,
    }


@router.post("")
def create_requisition_slip(
    payload: CreateRequisitionPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Submit a new Required Product Requisition Slip."""
    target_store = payload.store_code.upper()
    # Was `user.store_code and ...`, which waved through a manager token
    # with no store at all.
    require_store_access(target_store, user)

    date_str = payload.date or ist_today().isoformat()
    if date_str > ist_today().isoformat():
        raise HTTPException(status_code=400, detail="A requisition can't be dated in the future.")
    creator_name = (
        f"Operational Head ({user.username})"
        if user.is_admin
        else f"{STORE_CODE_TO_NAME.get(target_store, target_store)} Manager ({user.username})"
    )
    creator_role = "admin" if user.is_admin else "manager"

    created = requisitions_store.create_requisition(
        db=db,
        store_code=target_store,
        date_str=date_str,
        items=[item.model_dump() for item in payload.items],
        created_by_user=user.username,
        created_by_name=creator_name,
        created_by_role=creator_role,
        priority=payload.priority,
        remarks_general=payload.remarks_general or "",
        register_categories=user.is_admin,
    )

    return {"status": "ok", "requisition": created}


@router.get("/export/xlsx")
def export_requisitions_xlsx(
    store_code: Optional[str] = Query(None, max_length=8),
    start_date: Optional[str] = Query(None, max_length=10),
    end_date: Optional[str] = Query(None, max_length=10),
    status: Optional[str] = Query(None, max_length=20),
    search: Optional[str] = Query(None, max_length=100),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Download an Excel (.xlsx) report containing all filtered requisition logs."""
    requisitions = requisitions_store.list_requisitions(
        db=db,
        store_code=resolve_store_scope(user, store_code),
        start_date=start_date,
        end_date=end_date,
        status=status,
        search=search,
        limit=2000,
    )

    excel_bytes = requisitions_store.generate_requisitions_excel(requisitions)
    filename = f"CITIMART_Requisitions_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _load_for(user: CurrentUser, db: Database, req_id: int) -> dict:
    doc = requisitions_store.get_requisition_by_id(db, req_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Requisition slip not found")
    # A manager sees only their store's slips; a manager with no store sees none.
    if not user.is_admin and doc.get("store_code") != user.store_code:
        raise HTTPException(status_code=403, detail="Unauthorized to view this requisition")
    return doc


@router.get("/{req_id}")
def get_requisition(
    req_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Get single requisition slip details."""
    return {"status": "ok", "requisition": _load_for(user, db, req_id)}


@router.put("/{req_id}/status")
def update_status(
    req_id: int,
    payload: UpdateRequisitionStatusPayload,
    request: Request,
    user: CurrentUser = Depends(require_admin),
    db: Database = Depends(get_db),
):
    """Update status of a requisition slip (Admin or Operational Head action)."""
    try:
        updated = requisitions_store.update_requisition_status(
            db=db,
            req_id=req_id,
            status=payload.status,
            admin_remarks=payload.admin_remarks or "",
            actioned_by=f"Operational Head ({user.username})",
        )
    except requisitions_store.RequisitionNotFound:
        raise HTTPException(status_code=404, detail="Requisition slip not found")
    except requisitions_store.RequisitionConflict as e:
        raise HTTPException(status_code=409, detail=str(e))

    audit_event(
        "requisition.status", db=db, username=user.username, ip=get_client_ip(request),
        target=f"{updated.get('store_code')}:{updated.get('req_code')}",
        details={"status": payload.status},
    )
    return {"status": "ok", "requisition": updated}


@router.delete("/{req_id}")
def delete_requisition_slip(
    req_id: int,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a requisition slip. Managers: own slip, Pending only. Admin: any (audited)."""
    existing = _load_for(user, db, req_id)

    if user.is_admin:
        deleted = requisitions_store.delete_requisition(db, req_id)
    else:
        if existing.get("created_by_user") != user.username:
            raise HTTPException(status_code=403, detail="Unauthorized to delete this requisition")
        deleted = requisitions_store.delete_requisition(db, req_id, only_if_status="Pending")
        if not deleted:
            raise HTTPException(
                status_code=409,
                detail="Only a Pending slip can be withdrawn. Ask Central Admin to cancel it.",
            )

    audit_event(
        "requisition.delete", db=db, username=user.username, ip=get_client_ip(request),
        target=f"{existing.get('store_code')}:{existing.get('req_code')}",
        details={"status_at_delete": existing.get("status")},
    )
    return {"status": "ok", "deleted": deleted}
