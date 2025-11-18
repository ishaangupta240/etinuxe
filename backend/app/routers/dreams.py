from __future__ import annotations

from fastapi import APIRouter

from .. import services
from ..models import DreamGenerationRequest, SleepCycleRequest

router = APIRouter(prefix="/dreams", tags=["dreams"])


@router.get("")
def list_dreams() -> dict:
    records = services.list_dreams()
    return {"dreams": [record.model_dump(mode="json") for record in records]}


@router.get("/sleep-cycles")
def list_sleep_cycles(limit: int = 30) -> dict:
    records = services.list_sleep_cycles(limit=limit)
    return {"sleep_cycles": [record.model_dump(mode="json") for record in records]}


@router.post("/generate")
def generate_dream(payload: DreamGenerationRequest | None = None) -> dict:
    record = services.generate_dream(payload)
    return {"dream": record.model_dump(mode="json")}


@router.post("/sleep-cycle")
def run_sleep_cycle(payload: SleepCycleRequest | None = None) -> dict:
    state, nodes = services.run_sleep_cycle(payload)
    return {
        "organism_state": state.model_dump(mode="json"),
        "nodes": [node.model_dump(mode="json") for node in nodes],
    }
