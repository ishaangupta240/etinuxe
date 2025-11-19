from __future__ import annotations

from fastapi import APIRouter, Query

from .. import services
from ..models import FeedRequest, AutoSleepToggleRequest

router = APIRouter(prefix="/organism", tags=["organism"])


@router.get("/state")
def state() -> dict:
    record = services.get_organism_state()
    return record.model_dump(mode="json")


@router.post("/feed")
def feed(payload: FeedRequest) -> dict:
    record = services.feed_organism(payload)
    return record.model_dump(mode="json")


@router.get("/telemetry")
def telemetry(limit: int = Query(120, ge=1, le=services.TELEMETRY_LIMIT)) -> dict:
    return services.get_organism_telemetry(limit)


@router.post("/auto-sleep")
def auto_sleep(payload: AutoSleepToggleRequest) -> dict:
    record = services.set_auto_sleep_mode(payload.enabled)
    return record.model_dump(mode="json")
