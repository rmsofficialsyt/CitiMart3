"""Required Product Requisition Slip API Routes.

Handles category hierarchy lookups from 'Unique Division,Section, Department.xlsx',
requisition creation by Store Managers / Operational Head, Admin List View queries,
status lifecycle updates, and Excel exports.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src import product_hierarchy, requisitions_store

router = APIRouter(prefix="/api/daily/requisitions", tags=["requisitions"])


class RequisitionItemPayload(BaseModel):
    sl_no: Optional[int] = None
    division: str = Field(..., description="Division name or custom entry")
    section: str = Field(..., description="Section name or custom entry")
    department: str = Field(..., description="Department name or custom entry")
    product_required: Optional[str] = None
    barcode_details: str = Field(default="", description="Barcode details / descriptions")
    brand: str = Field(default="", description="Brand name")
    mrp: Optional[str] = Field(default="", description="MRP value or string")
    time_required: str = Field(default="1 day", description="Time required (e.g. 1 day, 2 days...)")
    remarks: Optional[str] = Field(default="", description="Item-specific remarks")


class CreateRequisitionPayload(BaseModel):
    store_code: Literal["NM", "HB", "CHW"]
    date: Optional[str] = Field(default=None, description="Date in YYYY-MM-DD format")
    items: List[RequisitionItemPayload] = Field(..., min_length=1, description="List of requisition items")
    priority: Literal["Urgent", "High", "Normal"] = "Normal"
    remarks_general: Optional[str] = Field(default="", description="General slip remarks")


class UpdateRequisitionStatusPayload(BaseModel):
    status: Literal["Pending", "In Review", "Approved", "In Transit", "Fulfilled", "Rejected"]
    admin_remarks: Optional[str] = Field(default="", description="Admin notes or resolution remarks")


@router.get("/categories")
def get_categories(db: Database = Depends(get_db)):
    """Fetch cascading Division -> Section -> Department hierarchy tree with custom additions."""
    return product_hierarchy.get_merged_hierarchy(db)


@router.get("")
def list_requisitions(
    store_code: Optional[str] = Query(None, description="Filter by store code (NM, HB, CHW, or ALL)"),
    start_date: Optional[str] = Query(None, description="Filter start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter end date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search term across barcode, brand, dept, etc."),
    limit: int = Query(500, ge=1, le=2000),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve product requisitions. Managers see their own store requisitions, Admin sees all."""
    effective_store = store_code
    if not user.is_admin:
        # Enforce store manager scoping
        effective_store = user.store_code or store_code

    requisitions = requisitions_store.list_requisitions(
        db=db,
        store_code=effective_store,
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
    if not user.is_admin and user.store_code and user.store_code != target_store:
        raise HTTPException(status_code=403, detail=f"Cannot submit requisition for store {target_store}")

    date_str = payload.date or datetime.now().strftime("%Y-%m-%d")
    creator_name = f"{STORE_CODE_TO_NAME.get(target_store, target_store)} Manager ({user.username})" if not user.is_admin else f"Operational Head ({user.username})"
    creator_role = "manager" if not user.is_admin else "admin"

    items_dict = [item.model_dump() for item in payload.items]

    created = requisitions_store.create_requisition(
        db=db,
        store_code=target_store,
        date_str=date_str,
        items=items_dict,
        created_by_user=user.username,
        created_by_name=creator_name,
        created_by_role=creator_role,
        priority=payload.priority,
        remarks_general=payload.remarks_general or "",
    )

    return {"status": "ok", "requisition": created}


@router.get("/{req_id}")
def get_requisition(
    req_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Get single requisition slip details."""
    doc = requisitions_store.get_requisition_by_id(db, req_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Requisition slip not found")

    if not user.is_admin and user.store_code and doc.get("store_code") != user.store_code:
        raise HTTPException(status_code=403, detail="Unauthorized to view this requisition")

    return {"status": "ok", "requisition": doc}


@router.put("/{req_id}/status")
def update_status(
    req_id: int,
    payload: UpdateRequisitionStatusPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update status of a requisition slip (Admin or Operational Head action)."""
    existing = requisitions_store.get_requisition_by_id(db, req_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Requisition slip not found")

    actioned_by = f"Admin ({user.username})" if user.is_admin else f"Manager ({user.username})"

    updated = requisitions_store.update_requisition_status(
        db=db,
        req_id=req_id,
        status=payload.status,
        admin_remarks=payload.admin_remarks or "",
        actioned_by=actioned_by,
    )

    return {"status": "ok", "requisition": updated}


@router.delete("/{req_id}")
def delete_requisition_slip(
    req_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a requisition slip."""
    existing = requisitions_store.get_requisition_by_id(db, req_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Requisition slip not found")

    if not user.is_admin and existing.get("created_by_user") != user.username:
        raise HTTPException(status_code=403, detail="Unauthorized to delete this requisition")

    deleted = requisitions_store.delete_requisition(db, req_id)
    return {"status": "ok", "deleted": deleted}


@router.get("/export/xlsx")
def export_requisitions_xlsx(
    store_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Download an Excel (.xlsx) report containing all filtered requisition logs."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code

    requisitions = requisitions_store.list_requisitions(
        db=db,
        store_code=effective_store,
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
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
