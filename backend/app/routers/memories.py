from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter

from .. import services
from ..models import MemoryLogInput

router = APIRouter(prefix="/memories", tags=["memories"])


@router.post("/{user_id}")
def log_memory(user_id: uuid.UUID, payload: MemoryLogInput) -> dict:
    log, token, node = services.record_memory_log(user_id, payload)
    return {
        "log": log.model_dump(mode="json"),
        "token": token.model_dump(mode="json"),
        "node": node.model_dump(mode="json"),
    }


@router.get("")
def list_logs(user_id: Optional[uuid.UUID] = None) -> dict:
    records = services.list_memory_logs(user_id)
    return {"logs": [record.model_dump(mode="json") for record in records]}


@router.get("/tokens")
def list_tokens(user_id: Optional[uuid.UUID] = None) -> dict:
    records = services.list_memory_tokens(user_id)
    return {"tokens": [record.model_dump(mode="json") for record in records]}
