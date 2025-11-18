from __future__ import annotations

from fastapi import APIRouter

from ..models import ForgotPasswordRequest, LoginRequest, ResetPasswordRequest
from .. import services

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    return services.authenticate(payload.email, payload.password)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest) -> dict:
    return services.request_password_reset(payload)


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest) -> dict:
    return services.reset_password(payload)
