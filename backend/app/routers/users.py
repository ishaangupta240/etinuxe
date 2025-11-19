from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from .. import services
from ..models import (
    HealthProfileUpdate,
    InsurancePolicyCreate,
    InsuranceTier,
    MiniaturizationRequestInput,
    OTPVerification,
    PaymentInput,
    PersonalityAssessment,
    TokenIssueInput,
    UserCreate,
)

router = APIRouter(prefix="/users", tags=["users"])


class InsuranceSelection(BaseModel):
    request_id: uuid.UUID
    tier: InsuranceTier = InsuranceTier.basic


@router.post("/signup")
def signup(user: UserCreate) -> dict:
    record = services.create_user(user)
    return {
        "user_id": str(record.id),
        "message": "OTP sent to registered email.",
    }


@router.post("/verify")
def verify(payload: OTPVerification) -> dict:
    record = services.verify_user(payload)
    return {"user_id": str(record.id), "status": record.status, "stage": record.current_stage}


@router.post("/{user_id}/health-profile")
def update_health(user_id: uuid.UUID, payload: HealthProfileUpdate) -> dict:
    user, profile = services.update_health_profile(user_id, payload)
    bucket = user.health_bucket.value if hasattr(user.health_bucket, "value") else str(user.health_bucket)
    return {
        "user_id": str(user.id),
        "health_score": user.health_score,
        "health_bucket": bucket,
        "profile_id": str(profile.id),
        "updated_at": profile.updated_at.isoformat(),
        "health_summary": profile.health_summary,
        "health_risks": profile.health_risks,
    }


@router.post("/{user_id}/otp/resend")
def resend_otp(user_id: uuid.UUID) -> dict:
    record = services.resend_signup_otp(user_id)
    return {"status": "sent", "expires_at": record.expires_at.isoformat()}


@router.post("/{user_id}/miniaturization")
def submit_request(user_id: uuid.UUID, payload: MiniaturizationRequestInput) -> dict:
    request = services.submit_miniaturization_request(user_id, payload)
    return {
        "request_id": str(request.id),
        "status": request.status,
        "cost_usd": request.cost_usd,
    }


@router.post("/{user_id}/personality")
def personality(user_id: uuid.UUID, payload: PersonalityAssessment) -> dict:
    if payload.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload user_id mismatch")
    _, token = services.record_personality(payload)
    return {"dna_token_id": str(token.id), "checksum": token.payload_checksum}


@router.post("/{user_id}/payment")
def payment(user_id: uuid.UUID, payload: PaymentInput) -> dict:
    record = services.record_payment(user_id, payload.request_id, payload.amount_usd)
    return {"payment_id": str(record.id), "status": record.status}


@router.post("/{user_id}/token")
def create_token(user_id: uuid.UUID, payload: TokenIssueInput) -> dict:
    token = services.issue_token(user_id, payload.request_id, payload.dna_token_id)
    return {"token_id": str(token.id), "status": token.status}


@router.get("/{user_id}")
def detail(user_id: uuid.UUID) -> dict:
    return services.get_user_overview(user_id)


@router.get("/{user_id}/insurance")
def list_insurance(user_id: uuid.UUID) -> dict:
    records = services.list_insurance_policies(user_id)
    return {"policies": [policy.model_dump(mode="json") for policy in records]}


@router.post("/{user_id}/insurance/preview")
def preview_insurance(user_id: uuid.UUID, payload: InsuranceSelection) -> dict:
    selection = InsurancePolicyCreate(user_id=user_id, request_id=payload.request_id, tier=payload.tier)
    return services.preview_insurance_policy(selection)


@router.post("/{user_id}/insurance")
def create_insurance(user_id: uuid.UUID, payload: InsuranceSelection) -> dict:
    selection = InsurancePolicyCreate(user_id=user_id, request_id=payload.request_id, tier=payload.tier)
    return services.create_insurance_policy(selection)
