import json
import logging
import threading
from typing import Any, Dict

from .config import DB_FILES, DATA_DIR, DEFAULT_ORGANISM_STATE, DEFAULT_SETTINGS, LEGACY_DB_PATH

_lock = threading.Lock()
_logger = logging.getLogger(__name__)


def _default_for(key: str) -> Any:
    if key == "settings":
        return dict(DEFAULT_SETTINGS)
    if key == "organism_state":
        return dict(DEFAULT_ORGANISM_STATE)
    if key == "organism_telemetry":
        return []
    if key == "insurance_policies":
        return []
    return []


def _ensure_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _purge_legacy_db()
    _migrate_legacy_db()
    for key, path in DB_FILES.items():
        if path.exists():
            continue
        default_payload = _default_for(key)
        path.write_text(json.dumps(default_payload, indent=2))
    _purge_legacy_db()


def _migrate_legacy_db() -> None:
    if not LEGACY_DB_PATH.exists():
        return
    try:
        with LEGACY_DB_PATH.open("r", encoding="utf-8") as handle:
            legacy_payload = json.load(handle)
    except json.JSONDecodeError:
        _purge_legacy_db()
        return

    for key, path in DB_FILES.items():
        if path.exists():
            continue
        if key in {"settings", "organism_state"}:
            default_value = _default_for(key)
        else:
            default_value = []
        value = legacy_payload.get(key, default_value)
        path.write_text(json.dumps(value, indent=2))
    _purge_legacy_db()


def _purge_legacy_db() -> None:
    try:
        LEGACY_DB_PATH.unlink()
    except FileNotFoundError:
        return
    except OSError as err:
        _logger.warning("Unable to remove legacy db.json: %s", err)


def read_db() -> Dict[str, Any]:
    _ensure_files()
    _purge_legacy_db()
    with _lock:
        snapshot: Dict[str, Any] = {}
        for key, path in DB_FILES.items():
            try:
                with path.open("r", encoding="utf-8") as handle:
                    snapshot[key] = json.load(handle)
            except json.JSONDecodeError:
                snapshot[key] = _default_for(key)
        _purge_legacy_db()
        return snapshot


def write_db(payload: Dict[str, Any]) -> None:
    _ensure_files()
    _purge_legacy_db()
    with _lock:
        for key, path in DB_FILES.items():
            value = payload.get(key, _default_for(key))
            with path.open("w", encoding="utf-8") as handle:
                json.dump(value, handle, indent=2)
        _purge_legacy_db()
