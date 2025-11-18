from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter

from .. import services
from ..models import (
    SupportAdminMessageInput,
    SupportMessageInput,
    SupportSession,
    SupportSessionAdminUpdate,
    SupportSessionCreate,
)

router = APIRouter(prefix="/support", tags=["support"])


@router.get("/users/{user_id}/sessions", response_model=List[SupportSession])
def get_user_support_sessions(user_id: uuid.UUID) -> List[SupportSession]:
    return services.list_support_sessions_for_user(user_id)


@router.post("/users/{user_id}/sessions", response_model=SupportSession)
def create_user_support_session(user_id: uuid.UUID, payload: SupportSessionCreate) -> SupportSession:
    return services.create_support_session(user_id, payload)


@router.post("/users/{user_id}/sessions/{session_id}/messages", response_model=SupportSession)
def post_user_support_message(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: SupportMessageInput,
) -> SupportSession:
    return services.add_user_support_message(user_id, session_id, payload)


@router.post("/users/{user_id}/sessions/{session_id}/close", response_model=SupportSession)
def close_user_support_session(user_id: uuid.UUID, session_id: uuid.UUID) -> SupportSession:
    return services.close_support_session_by_user(user_id, session_id)


@router.get("/admin/sessions", response_model=List[SupportSession])
def get_admin_support_sessions() -> List[SupportSession]:
    return services.list_support_sessions_for_admin()


@router.post("/admin/sessions/{session_id}/messages", response_model=SupportSession)
def post_admin_support_message(session_id: uuid.UUID, payload: SupportAdminMessageInput) -> SupportSession:
    return services.add_admin_support_message(session_id, payload)


@router.patch("/admin/sessions/{session_id}", response_model=SupportSession)
def update_support_session(session_id: uuid.UUID, payload: SupportSessionAdminUpdate) -> SupportSession:
    return services.update_support_session_from_admin(session_id, payload)
