from __future__ import annotations

import uuid

from fastapi import APIRouter

from .. import services
from ..models import (
    AdminAccountCreate,
    AdminUserUpdate,
    InsurancePolicyCreate,
    MemoryTokenStatusUpdate,
    SettingsUpdate,
    StaffHealthRatingUpdate,
    TokenStatusUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
def overview() -> dict:
    return services.get_admin_overview()


@router.get("/users")
def users() -> dict:
    records = services.list_users()
    return {"users": records}


@router.patch("/users/{user_id}")
def update_user(user_id: uuid.UUID, payload: AdminUserUpdate) -> dict:
    record = services.admin_update_user(user_id, payload)
    return {"user": record}


@router.post("/admins")
def create_admin(payload: AdminAccountCreate) -> dict:
    record = services.create_admin_account(payload)
    return {"admin": record}


@router.get("/requests")
def requests() -> dict:
    records = services.list_requests()
    return {"requests": [r.model_dump(mode="json") for r in records]}


@router.post("/requests/{request_id}/health-rating")
def update_request_health_rating(request_id: uuid.UUID, payload: StaffHealthRatingUpdate) -> dict:
    return services.update_request_health_rating(request_id, payload.rating)


@router.get("/tokens")
def tokens() -> dict:
    records = services.list_tokens()
    return {"tokens": [r.model_dump(mode="json") for r in records]}


@router.get("/payments")
def payments() -> dict:
    records = services.list_payments()
    return {"payments": [r.model_dump(mode="json") for r in records]}


@router.get("/insurance/policies")
def insurance_policies() -> dict:
    records = services.list_insurance_policies()
    return {"policies": [policy.model_dump(mode="json") for policy in records]}


@router.post("/insurance/policies")
def create_insurance_policy(payload: InsurancePolicyCreate) -> dict:
    return services.create_insurance_policy(payload)


@router.get("/dna-tokens")
def dna_tokens() -> dict:
    records = services.list_dna_tokens()
    return {"dna_tokens": [r.model_dump(mode="json") for r in records]}


@router.get("/assessments")
def assessments() -> dict:
    records = services.list_assessments()
    return {"assessments": [r.model_dump(mode="json") for r in records]}


@router.get("/settings")
def settings() -> dict:
    return services.get_admin_settings().model_dump()


@router.patch("/settings")
def update_settings(payload: SettingsUpdate) -> dict:
    return services.update_admin_settings(payload).model_dump()


@router.post("/tokens/{token_id}/status")
def update_token_status(token_id: uuid.UUID, payload: TokenStatusUpdate) -> dict:
    record = services.update_token_status(token_id, payload.status)
    return {"token_id": str(record.id), "status": record.status}


@router.post("/memory-tokens/{token_id}/status")
def update_memory_token(token_id: uuid.UUID, payload: MemoryTokenStatusUpdate) -> dict:
    record = services.update_memory_token_status(token_id, payload.spent)
    return {"token": record.model_dump(mode="json")}
